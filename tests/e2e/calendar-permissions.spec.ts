import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  createNonAdminPage,
  getSupabaseEnv,
} from './calendar-permission-helpers';
import { waitForPageLoad } from './test-helpers';

/**
 * Calendar member (non-admin) permission coverage.
 *
 * Source of truth for the expected matrix:
 * - src/app/api/maintenance-tasks/route.ts: GET is open to all org members;
 *   POST/PATCH/DELETE call requireAdmin() and return 403 "Admin role required".
 * - src/hooks/usePermissions.ts: canCreateTask / canManageTasks are true only
 *   for role === 'admin', driving the disabled Add Task button and the
 *   presence of the per-task action menu in GroupedTaskList.
 *
 * Each test seeds its own instrument/task fixtures via the default
 * (admin) `page` fixture and cleans them up in a finally block, matching the
 * convention in tests/e2e/schema-hardening.spec.ts. The shared `memberPage`
 * is a throwaway non-admin session created once for the whole file.
 */

async function createInstrument(page: Page, suffix: string): Promise<string> {
  const res = await page.request.post('/api/instruments', {
    data: {
      type: 'Violin',
      maker: `Calendar Permissions ${suffix}`,
      year: 2024,
      price: 1000,
      status: 'Available',
      ownership: 'owned',
      note: suffix,
    },
  });
  const body = await res.json();
  expect(res.ok(), JSON.stringify(body)).toBe(true);
  return body.data.id as string;
}

function taskPayload(instrumentId: string, suffix: string) {
  return {
    instrument_id: instrumentId,
    client_id: null,
    task_type: 'repair',
    title: `Calendar Permissions ${suffix}`,
    description: null,
    status: 'pending',
    received_date: new Date().toISOString().slice(0, 10),
    due_date: null,
    personal_due_date: null,
    scheduled_date: null,
    completed_date: null,
    priority: 'medium',
    estimated_hours: null,
    actual_hours: null,
    cost: null,
    notes: null,
  };
}

async function createTask(
  page: Page,
  instrumentId: string,
  suffix: string
): Promise<string> {
  const res = await page.request.post('/api/maintenance-tasks', {
    data: taskPayload(instrumentId, suffix),
  });
  const body = await res.json();
  expect(res.ok(), JSON.stringify(body)).toBe(true);
  return body.data.id as string;
}

async function cleanup(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.request.delete(path).catch(() => undefined);
  }
}

test.describe('Calendar member (non-admin) permissions', () => {
  let memberPage: Page | null = null;

  test.beforeAll(async ({ browser, baseURL }) => {
    memberPage = await createNonAdminPage(
      browser,
      baseURL ?? 'http://localhost:3000'
    );
  });

  test.afterAll(async () => {
    await memberPage?.context().close();
  });

  test.beforeEach(() => {
    test.skip(
      !memberPage,
      'Member E2E session unavailable (requires NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SUPABASE_SERVICE_ROLE_KEY to seed a member user) — skipping rather than failing.'
    );
  });

  test('member can open the calendar page and see an org task (read access)', async ({
    page,
  }) => {
    const suffix = `read-${Date.now()}`;
    const instrumentId = await createInstrument(page, suffix);
    const cleanupPaths = [`/api/instruments?id=${instrumentId}`];

    try {
      const taskId = await createTask(page, instrumentId, suffix);
      cleanupPaths.unshift(`/api/maintenance-tasks?id=${taskId}`);

      await memberPage!.goto('/calendar', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(memberPage!, 15000);

      await expect(
        memberPage!
          .getByRole('heading', { name: 'Calendar', exact: true })
          .first()
      ).toBeVisible();

      await expect(memberPage!.getByTestId(`task-${taskId}`)).toBeVisible({
        timeout: 15000,
      });
    } finally {
      await cleanup(page, cleanupPaths);
    }
  });

  test('member sees the Add Task control disabled with an admin-only reason', async () => {
    await memberPage!.goto('/calendar', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await waitForPageLoad(memberPage!, 15000);

    const addButton = memberPage!.getByRole('button', { name: 'Add new task' });
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeDisabled();
    await expect(addButton).toHaveAttribute('title', /admin/i);
  });

  test('member does not see the per-task action menu (edit/delete hidden, not just disabled)', async ({
    page,
  }) => {
    const suffix = `menu-${Date.now()}`;
    const instrumentId = await createInstrument(page, suffix);
    const cleanupPaths = [`/api/instruments?id=${instrumentId}`];

    try {
      const taskId = await createTask(page, instrumentId, suffix);
      cleanupPaths.unshift(`/api/maintenance-tasks?id=${taskId}`);

      await memberPage!.goto('/calendar', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(memberPage!, 15000);

      const taskRow = memberPage!.getByTestId(`task-${taskId}`);
      await expect(taskRow).toBeVisible({ timeout: 15000 });
      // GroupedTaskList only renders TaskActionMenu when canManageTask is true;
      // for a member it must be entirely absent, not merely disabled.
      await expect(
        taskRow.getByRole('button', { name: 'Task actions' })
      ).toHaveCount(0);
    } finally {
      await cleanup(page, cleanupPaths);
    }
  });

  test('member cannot create a task via the API, and no row is persisted', async ({
    page,
  }) => {
    const suffix = `create-denied-${Date.now()}`;
    const instrumentId = await createInstrument(page, suffix);

    try {
      const beforeRes = await page.request.get(
        `/api/maintenance-tasks?instrument_id=${instrumentId}`
      );
      const before = await beforeRes.json();
      const beforeCount = Array.isArray(before.data) ? before.data.length : 0;

      const memberRes = await memberPage!.request.post(
        '/api/maintenance-tasks',
        { data: taskPayload(instrumentId, suffix) }
      );

      expect(memberRes.status()).toBe(403);
      const memberBody = await memberRes.json();
      expect(memberBody.success).toBe(false);
      expect(memberBody.error).toMatch(/admin/i);

      const afterRes = await page.request.get(
        `/api/maintenance-tasks?instrument_id=${instrumentId}`
      );
      const after = await afterRes.json();
      const afterCount = Array.isArray(after.data) ? after.data.length : 0;
      expect(afterCount).toBe(beforeCount);
    } finally {
      await cleanup(page, [`/api/instruments?id=${instrumentId}`]);
    }
  });

  test('member cannot update a task via the API, and the row is unchanged', async ({
    page,
  }) => {
    const suffix = `update-denied-${Date.now()}`;
    const instrumentId = await createInstrument(page, suffix);
    const cleanupPaths = [`/api/instruments?id=${instrumentId}`];

    try {
      const taskId = await createTask(page, instrumentId, suffix);
      cleanupPaths.unshift(`/api/maintenance-tasks?id=${taskId}`);

      const memberRes = await memberPage!.request.patch(
        '/api/maintenance-tasks',
        { data: { id: taskId, status: 'completed' } }
      );

      expect(memberRes.status()).toBe(403);
      const memberBody = await memberRes.json();
      expect(memberBody.error).toMatch(/admin/i);

      const afterRes = await page.request.get(
        `/api/maintenance-tasks?id=${taskId}`
      );
      const after = await afterRes.json();
      expect(after.data?.status).toBe('pending');
    } finally {
      await cleanup(page, cleanupPaths);
    }
  });

  test('member cannot delete a task via the API, and the row still exists', async ({
    page,
  }) => {
    const suffix = `delete-denied-${Date.now()}`;
    const instrumentId = await createInstrument(page, suffix);
    const cleanupPaths = [`/api/instruments?id=${instrumentId}`];

    try {
      const taskId = await createTask(page, instrumentId, suffix);
      cleanupPaths.unshift(`/api/maintenance-tasks?id=${taskId}`);

      const memberRes = await memberPage!.request.delete(
        `/api/maintenance-tasks?id=${taskId}`
      );

      expect(memberRes.status()).toBe(403);
      const memberBody = await memberRes.json();
      expect(memberBody.error).toMatch(/admin/i);

      const afterRes = await page.request.get(
        `/api/maintenance-tasks?id=${taskId}`
      );
      expect(afterRes.ok()).toBe(true);
      const after = await afterRes.json();
      expect(after.data?.id).toBe(taskId);
    } finally {
      await cleanup(page, cleanupPaths);
    }
  });

  test('member cannot read a task that belongs to a different organization', async () => {
    // GET /api/maintenance-tasks scopes both the by-id lookup and the list
    // query with `.eq('org_id', auth.orgId)`, where auth.orgId comes from the
    // member's own session — never from client input. To prove that scoping
    // actually holds (not just that same-org reads work, which the other
    // tests already cover), seed a task in a genuinely different org via the
    // service-role client — bypassing the API, whose org scoping would
    // otherwise make it impossible to write into a foreign org — and confirm
    // the member's session cannot read it back.
    const env = getSupabaseEnv();
    test.skip(
      !env,
      'requires SUPABASE_SERVICE_ROLE_KEY to seed a foreign-org fixture'
    );

    const admin = createClient(env!.url, env!.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const foreignOrgId = randomUUID();
    const suffix = `foreign-org-${Date.now()}`;

    const { error: orgError } = await admin
      .from('organizations')
      .insert({ id: foreignOrgId, name: `E2E Foreign Org ${suffix}` });
    if (orgError) throw new Error(`Seed org failed: ${orgError.message}`);

    const { data: instrument, error: instrumentError } = await admin
      .from('instruments')
      .insert({
        org_id: foreignOrgId,
        type: 'Violin',
        serial_number: `FE2E-${suffix}`,
        status: 'Available',
      })
      .select()
      .single();
    if (instrumentError || !instrument) {
      throw new Error(
        `Seed foreign instrument failed: ${instrumentError?.message}`
      );
    }

    const { data: foreignTask, error: taskError } = await admin
      .from('maintenance_tasks')
      .insert({
        org_id: foreignOrgId,
        instrument_id: instrument.id,
        task_type: 'repair',
        title: `Foreign org task ${suffix}`,
        received_date: new Date().toISOString().slice(0, 10),
        status: 'pending',
        priority: 'medium',
      })
      .select()
      .single();
    if (taskError || !foreignTask) {
      throw new Error(`Seed foreign task failed: ${taskError?.message}`);
    }

    try {
      const memberRes = await memberPage!.request.get(
        `/api/maintenance-tasks?id=${foreignTask.id}`
      );
      // The member's org (DEFAULT_E2E_ORG_ID) does not match foreignOrgId,
      // so the org-scoped lookup must not resolve — no 200, no leaked row.
      expect(memberRes.status()).not.toBe(200);
      const memberBody = await memberRes.json().catch(() => null);
      expect(memberBody?.data?.id).not.toBe(foreignTask.id);

      const memberListRes = await memberPage!.request.get(
        `/api/maintenance-tasks?instrument_id=${instrument.id}`
      );
      const memberList = await memberListRes.json().catch(() => null);
      const leaked = Array.isArray(memberList?.data)
        ? memberList.data.some((t: { id: string }) => t.id === foreignTask.id)
        : false;
      expect(leaked).toBe(false);
    } finally {
      await admin.from('maintenance_tasks').delete().eq('id', foreignTask.id);
      await admin.from('instruments').delete().eq('id', instrument.id);
      await admin.from('organizations').delete().eq('id', foreignOrgId);
    }
  });
});
