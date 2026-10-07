import type { APIResponse, Page } from '@playwright/test';

import { getE2EAdminIdentity } from './e2e-identities';
// Fails any test whose page hits a same-origin /api 5xx or a pageerror,
// even when the test body never asserts that background request.
import { expect, test } from './critical-test';
import { freshSessionStorageState } from './fresh-session-state';
import { assertCookieBackedAuth, waitForPageLoad } from './test-helpers';

/**
 * Maintenance task CRUD against /api/maintenance-tasks
 * (src/app/api/maintenance-tasks/route.ts), as the run-scoped admin in the
 * run-scoped org. Assertions only use fields the route returns: the row is
 * `select('*')` filtered through maintenanceTaskSchema, which includes the
 * DB-generated `calendar_date`
 * (= COALESCE(due_date, personal_due_date, scheduled_date, received_date),
 * migration 20260726120000) that the calendar range query filters on.
 *
 * Contract relied on:
 *   POST   → 201 { data, success }            (admin; full create schema)
 *   GET    ?id=… → 200 { data, success }
 *   GET    ?instrument_id= | search= | start_date&end_date → { data[], count }
 *   PATCH  { id, expected_updated_at, …fields } → 200 { data, success };
 *          a stale expected_updated_at → 409 MAINTENANCE_TASK_STALE_VERSION
 *   DELETE ?id=… → 200 { success: true }; again → 404 "Task not found"
 */

// This spec explicitly owns one fresh admin session instead of depending on
// the persisted global-setup auth-state file.
const adminState = freshSessionStorageState(getE2EAdminIdentity());

type MaintenanceTaskRow = {
  id: string;
  instrument_id: string;
  client_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  status: string;
  received_date: string;
  due_date: string | null;
  personal_due_date: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  calendar_date?: string | null;
  priority: string;
  notes: string | null;
  updated_at: string;
};

type TaskListEnvelope = {
  data: MaintenanceTaskRow[];
  count: number;
  success: boolean;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function expectStatusJson(response: APIResponse, status: number) {
  const body = await response.text();
  expect(response.status(), body).toBe(status);
  return JSON.parse(body);
}

async function listTasks(page: Page, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return (await expectStatusJson(
    await page.request.get(`/api/maintenance-tasks?${params.toString()}`),
    200
  )) as TaskListEnvelope;
}

function taskIds(envelope: TaskListEnvelope): string[] {
  return envelope.data.map(task => task.id);
}

test.describe('Maintenance tasks', () => {
  test.use({
    storageState: async ({ baseURL }, provide) =>
      provide(await adminState(baseURL)),
    // The calendar page derives its visible range from the browser's local
    // date; pin it to UTC so it matches the UTC dates this spec writes.
    timezoneId: 'UTC',
  });

  test(
    'creates, reads, updates, and deletes a maintenance task',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      await page.goto('/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(page, 15000, { skipNetworkIdle: true });
      await assertCookieBackedAuth(page);

      const suffix = uniqueSuffix();
      const today = isoDate();
      const dueDate = isoDate(3);

      // maintenance_tasks.instrument_id is ON DELETE RESTRICT: the task must
      // be gone before this instrument can be deleted.
      const instrumentJson = await expectStatusJson(
        await page.request.post('/api/instruments', {
          data: {
            type: 'Violin',
            maker: `Maintenance ${suffix}`,
            year: 2026,
            price: 1100,
            status: 'Available',
            ownership: 'owned',
            note: suffix,
          },
        }),
        201
      );
      const instrumentId = instrumentJson.data.id as string;
      expect(instrumentId).toBeTruthy();

      let pendingTaskId: string | null = null;

      try {
        const title = `Critical maintenance ${suffix}`;
        const description = `critical maintenance description ${suffix}`;
        const createJson = await expectStatusJson(
          await page.request.post('/api/maintenance-tasks', {
            headers: { 'Idempotency-Key': `e2e-maintenance-${suffix}` },
            data: {
              instrument_id: instrumentId,
              client_id: null,
              task_type: 'repair',
              title,
              description,
              status: 'pending',
              received_date: today,
              due_date: null,
              personal_due_date: null,
              scheduled_date: today,
              completed_date: null,
              priority: 'medium',
              estimated_hours: null,
              actual_hours: null,
              cost: null,
              notes: suffix,
            },
          }),
          201
        );
        expect(createJson.success).toBe(true);
        const created = createJson.data as MaintenanceTaskRow;
        expect(created.id).toBeTruthy();
        pendingTaskId = created.id;
        expect(created).toMatchObject({
          instrument_id: instrumentId,
          title,
          description,
          status: 'pending',
          received_date: today,
          scheduled_date: today,
          due_date: null,
          // No due/personal date yet, so the calendar places it on
          // scheduled_date.
          calendar_date: today,
        });

        // Read back by id and through the list filters the UI uses.
        const byIdJson = await expectStatusJson(
          await page.request.get(`/api/maintenance-tasks?id=${created.id}`),
          200
        );
        const current = byIdJson.data as MaintenanceTaskRow;
        expect(current).toMatchObject({
          id: created.id,
          instrument_id: instrumentId,
          title,
          description,
          scheduled_date: today,
          calendar_date: today,
        });
        expect(current.updated_at).toBeTruthy();

        const byInstrument = await listTasks(page, {
          instrument_id: instrumentId,
        });
        expect(taskIds(byInstrument)).toEqual([created.id]);
        expect(byInstrument.count).toBe(1);

        const bySearch = await listTasks(page, { search: suffix });
        expect(taskIds(bySearch)).toContain(created.id);

        // The calendar fetches by calendar_date range.
        const todayRange = await listTasks(page, {
          start_date: today,
          end_date: today,
        });
        const inRange = todayRange.data.find(task => task.id === created.id);
        expect(inRange?.title).toBe(title);
        expect(inRange?.calendar_date).toBe(today);

        // The calendar page's own range request returns the task.
        const [calendarRangeResponse] = await Promise.all([
          page.waitForResponse(response => {
            const url = new URL(response.url());
            return (
              response.request().method() === 'GET' &&
              url.pathname === '/api/maintenance-tasks' &&
              url.searchParams.has('start_date') &&
              url.searchParams.has('end_date') &&
              response.status() === 200
            );
          }),
          page.goto('/calendar', { waitUntil: 'domcontentloaded' }),
        ]);
        const calendarEnvelope =
          (await calendarRangeResponse.json()) as TaskListEnvelope;
        expect(taskIds(calendarEnvelope)).toContain(created.id);
        await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
        await expect(
          page.getByRole('heading', { name: 'Calendar', exact: true }).first()
        ).toBeVisible();

        // PATCH requires the current updated_at (optimistic concurrency).
        const updatedTitle = `Updated maintenance ${suffix}`;
        const patchJson = await expectStatusJson(
          await page.request.patch('/api/maintenance-tasks', {
            data: {
              id: created.id,
              expected_updated_at: current.updated_at,
              title: updatedTitle,
              status: 'in_progress',
              due_date: dueDate,
            },
          }),
          200
        );
        expect(patchJson.success).toBe(true);
        const patched = patchJson.data as MaintenanceTaskRow;
        expect(patched).toMatchObject({
          id: created.id,
          title: updatedTitle,
          status: 'in_progress',
          due_date: dueDate,
          scheduled_date: today,
          // due_date now wins the calendar placement.
          calendar_date: dueDate,
        });
        expect(patched.updated_at).not.toBe(current.updated_at);

        // Reusing the old version is rejected and changes nothing.
        const staleJson = await expectStatusJson(
          await page.request.patch('/api/maintenance-tasks', {
            data: {
              id: created.id,
              expected_updated_at: current.updated_at,
              title: `Stale ${suffix}`,
            },
          }),
          409
        );
        expect(staleJson.error_code).toBe('MAINTENANCE_TASK_STALE_VERSION');

        const persisted = (
          await expectStatusJson(
            await page.request.get(`/api/maintenance-tasks?id=${created.id}`),
            200
          )
        ).data as MaintenanceTaskRow;
        expect(persisted).toMatchObject({
          title: updatedTitle,
          status: 'in_progress',
          due_date: dueDate,
          calendar_date: dueDate,
          updated_at: patched.updated_at,
        });

        // The calendar range follows the new placement date.
        expect(
          taskIds(
            await listTasks(page, { start_date: dueDate, end_date: dueDate })
          )
        ).toContain(created.id);
        if (dueDate !== today) {
          expect(
            taskIds(
              await listTasks(page, { start_date: today, end_date: today })
            )
          ).not.toContain(created.id);
        }

        const deleteJson = await expectStatusJson(
          await page.request.delete(`/api/maintenance-tasks?id=${created.id}`),
          200
        );
        expect(deleteJson.success).toBe(true);
        pendingTaskId = null;

        const afterDelete = await listTasks(page, {
          instrument_id: instrumentId,
        });
        expect(afterDelete.data).toEqual([]);
        expect(afterDelete.count).toBe(0);
        expect(
          taskIds(await listTasks(page, { search: suffix }))
        ).not.toContain(created.id);

        const secondDelete = await expectStatusJson(
          await page.request.delete(`/api/maintenance-tasks?id=${created.id}`),
          404
        );
        expect(secondDelete.error).toBe('Task not found');
      } finally {
        // Route-level cleanup of this test's own rows only. Failures are
        // recorded as soft assertion errors: they fail the test without
        // replacing an earlier body error. Run-scoped org teardown remains
        // the backstop for anything left behind.
        const cleanupFailures: string[] = [];

        if (pendingTaskId) {
          const response = await page.request.delete(
            `/api/maintenance-tasks?id=${pendingTaskId}`
          );
          // 404 means the task is already gone, which is the goal state.
          if (response.status() !== 200 && response.status() !== 404) {
            cleanupFailures.push(
              `DELETE /api/maintenance-tasks?id=${pendingTaskId} → ${response.status()}: ${await response.text()} (the instrument delete below is then blocked by ON DELETE RESTRICT; org teardown is the backstop)`
            );
          }
        }

        // DELETE /api/instruments → 200 { success: true, id }.
        const instrumentDelete = await page.request.delete(
          `/api/instruments?id=${instrumentId}`
        );
        if (instrumentDelete.status() !== 200) {
          cleanupFailures.push(
            `DELETE /api/instruments?id=${instrumentId} → ${instrumentDelete.status()}: ${await instrumentDelete.text()}`
          );
        } else {
          const instrumentGet = await page.request.get(
            `/api/instruments?id=${instrumentId}`
          );
          if (instrumentGet.status() !== 404) {
            cleanupFailures.push(
              `GET /api/instruments?id=${instrumentId} after delete → ${instrumentGet.status()} (expected 404)`
            );
          }
        }

        expect
          .soft(cleanupFailures, 'maintenance spec cleanup failures')
          .toEqual([]);
      }
    }
  );
});
