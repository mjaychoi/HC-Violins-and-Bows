import type { APIRequestContext, APIResponse } from '@playwright/test';
import * as fs from 'fs';

// Fails any test whose page hits a same-origin /api 5xx or a pageerror,
// even when the test body never asserts that background request.
import { expect, test } from './critical-test';
import { MEMBER_AUTH_STATE_PATH, getE2EAdminIdentity } from './e2e-identities';
import { freshSessionStorageState } from './fresh-session-state';

/**
 * Critical coverage for /api/connections (src/app/api/connections/route.ts).
 *
 * Regression target: once `instruments.reserved_connection_id` added a second
 * FK path between client_instruments and instruments, the unqualified
 * `instrument:instruments(...)` embed became ambiguous and PostgREST rejected
 * every connections read with PGRST201 (HTTP 500) — fixed by PR #151 with the
 * `!client_instruments_instrument_id_fkey` hint. These tests hit the real
 * hosted database, so they fail if that ambiguity ever comes back, and they
 * also check that the embed resolves to the many-to-one path (a single
 * instrument object, not the reverse one-to-many array).
 *
 * Every row is created through the API as the run-scoped admin, so it lives
 * in this run's org. Route-level cleanup runs in `finally`; failures are
 * reported, never swallowed. Run-scoped org teardown remains the backstop.
 */

// Fresh admin session per file: critical-path.spec.ts signs out globally,
// which revokes the session global-setup saved for the admin.
const adminState = freshSessionStorageState(getE2EAdminIdentity());

type EmbeddedClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  note: string | null;
  interest: string | null;
};

type EmbeddedInstrument = {
  id: string;
  maker: string | null;
  type: string | null;
  note?: unknown;
  status?: unknown;
};

type ConnectionRow = {
  id: string;
  client_id: string;
  instrument_id: string;
  relationship_type: string;
  notes: string | null;
  display_order?: number;
  created_at: string;
  client: EmbeddedClient | null;
  instrument: EmbeddedInstrument | null;
};

type ConnectionListBody = {
  data: ConnectionRow[];
  count: number;
  pagination: { page: number; pageSize: number; totalCount: number };
  scope: string;
};

type ClientFixture = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type InstrumentFixture = {
  id: string;
  maker: string;
  type: string;
};

type CleanupStep = { label: string; path: string };

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function expectStatusJson<T>(
  response: APIResponse,
  status: number
): Promise<T> {
  const body = await response.text();
  expect(
    response.status(),
    `${response.url()} -> ${response.status()}: ${body}`
  ).toBe(status);
  return JSON.parse(body) as T;
}

/**
 * Runs `body`, then every cleanup step (newest first) regardless of outcome.
 * A body failure is rethrown unchanged; cleanup failures are attached to the
 * test as annotations in that case, and otherwise fail the test on their own.
 */
async function withRouteCleanup(
  request: APIRequestContext,
  steps: CleanupStep[],
  body: () => Promise<void>
): Promise<void> {
  let bodyFailed = false;
  let bodyError: unknown;
  try {
    await body();
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }

  const cleanupFailures: string[] = [];
  for (const step of [...steps].reverse()) {
    try {
      const response = await request.delete(step.path);
      if (!response.ok()) {
        cleanupFailures.push(
          `${step.label}: DELETE ${step.path} -> ${response.status()} ${await response.text()}`
        );
      }
    } catch (error) {
      cleanupFailures.push(
        `${step.label}: DELETE ${step.path} threw ${String(error)}`
      );
    }
  }

  if (bodyFailed) {
    for (const failure of cleanupFailures) {
      test.info().annotations.push({
        type: 'cleanup-failure',
        description: failure,
      });
    }
    throw bodyError;
  }
  if (cleanupFailures.length > 0) {
    throw new Error(
      `Connections critical cleanup failed:\n${cleanupFailures.join('\n')}`
    );
  }
}

function removeStep(steps: CleanupStep[], path: string): void {
  const index = steps.findIndex(step => step.path === path);
  if (index >= 0) steps.splice(index, 1);
}

async function createClient(
  request: APIRequestContext,
  suffix: string,
  steps: CleanupStep[]
): Promise<ClientFixture> {
  const fixture = {
    firstName: `Conn ${suffix}`,
    lastName: 'Critical',
    email: `conn-${suffix}@example.com`,
  };
  const created = await expectStatusJson<{ data: { id: string } }>(
    await request.post('/api/clients', {
      data: {
        first_name: fixture.firstName,
        last_name: fixture.lastName,
        email: fixture.email,
        contact_number: null,
        tags: ['E2E-CRITICAL'],
        interest: `Connections critical interest ${suffix}`,
        note: `Connections critical private note ${suffix}`,
      },
    }),
    201
  );
  expect(created.data.id).toBeTruthy();
  steps.push({
    label: 'client',
    path: `/api/clients?id=${created.data.id}`,
  });
  return { id: created.data.id, ...fixture };
}

async function createInstrument(
  request: APIRequestContext,
  maker: string,
  steps: CleanupStep[]
): Promise<InstrumentFixture> {
  const created = await expectStatusJson<{ data: { id: string } }>(
    await request.post('/api/instruments', {
      data: {
        type: 'Violin',
        maker,
        year: 2026,
        price: 1200,
        status: 'Available',
        ownership: 'owned',
        note: `Connections critical instrument note ${maker}`,
      },
    }),
    201
  );
  expect(created.data.id).toBeTruthy();
  steps.push({
    label: 'instrument',
    path: `/api/instruments?id=${created.data.id}`,
  });
  return { id: created.data.id, maker, type: 'Violin' };
}

async function createConnection(
  request: APIRequestContext,
  input: { clientId: string; instrumentId: string; notes: string },
  steps: CleanupStep[]
): Promise<ConnectionRow> {
  const created = await expectStatusJson<{ data: ConnectionRow }>(
    await request.post('/api/connections', {
      headers: { 'Idempotency-Key': `e2e-connection-${uniqueSuffix()}` },
      data: {
        client_id: input.clientId,
        instrument_id: input.instrumentId,
        relationship_type: 'Interested',
        notes: input.notes,
      },
    }),
    201
  );
  expect(created.data.id).toBeTruthy();
  steps.push({
    label: 'connection',
    path: `/api/connections?id=${created.data.id}`,
  });
  return created.data;
}

/**
 * The embed must use the many-to-one FK (one client object, one instrument
 * object). The reverse instruments.reserved_connection_id path would yield an
 * array; an ambiguous embed fails the request with PGRST201 before this runs.
 * Also pins the explicit column allowlist: private client note/interest and
 * instrument note/status are not selected, so they never reach this payload.
 */
function expectConnectionEmbeds(
  row: ConnectionRow,
  client: ClientFixture,
  instrument: InstrumentFixture
): void {
  expect(row.client_id).toBe(client.id);
  expect(row.instrument_id).toBe(instrument.id);

  expect(row.client).not.toBeNull();
  expect(Array.isArray(row.client)).toBe(false);
  expect(row.client).toMatchObject({
    id: client.id,
    first_name: client.firstName,
    last_name: client.lastName,
    email: client.email,
  });
  expect(row.client?.note).toBeNull();
  expect(row.client?.interest).toBeNull();

  expect(row.instrument).not.toBeNull();
  expect(Array.isArray(row.instrument)).toBe(false);
  expect(row.instrument).toMatchObject({
    id: instrument.id,
    maker: instrument.maker,
    type: instrument.type,
  });
  expect(row.instrument?.note).toBeUndefined();
  expect(row.instrument?.status).toBeUndefined();
}

function findRow(rows: ConnectionRow[], id: string): ConnectionRow {
  const row = rows.find(candidate => candidate.id === id);
  expect(row, `connection ${id} missing from list response`).toBeTruthy();
  return row as ConnectionRow;
}

async function listByClient(
  request: APIRequestContext,
  clientId: string,
  extra = ''
): Promise<ConnectionListBody> {
  return expectStatusJson<ConnectionListBody>(
    await request.get(`/api/connections?client_id=${clientId}${extra}`),
    200
  );
}

test.describe('Connections critical', () => {
  test.use({
    storageState: async ({ baseURL }, provide) =>
      provide(await adminState(baseURL)),
  });

  test(
    'admin creates, lists, updates, reorders, and deletes connections',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      const request = page.request;
      const suffix = uniqueSuffix();
      const steps: CleanupStep[] = [];

      await withRouteCleanup(request, steps, async () => {
        const client = await createClient(request, suffix, steps);
        // Two instruments: Interested is unique per client+instrument pair,
        // and reorder needs at least two rows for one client.
        const instrumentA = await createInstrument(
          request,
          `Conn A ${suffix}`,
          steps
        );
        const instrumentB = await createInstrument(
          request,
          `Conn B ${suffix}`,
          steps
        );

        // 1. POST: 201 with the embedded detail row.
        const notesA = `conn A notes ${suffix}`;
        const notesB = `conn B notes ${suffix}`;
        const connA = await createConnection(
          request,
          { clientId: client.id, instrumentId: instrumentA.id, notes: notesA },
          steps
        );
        expect(connA.relationship_type).toBe('Interested');
        expect(connA.notes).toBe(notesA);
        expectConnectionEmbeds(connA, client, instrumentA);

        const connB = await createConnection(
          request,
          { clientId: client.id, instrumentId: instrumentB.id, notes: notesB },
          steps
        );
        expectConnectionEmbeds(connB, client, instrumentB);

        // 2. GET filtered by client.
        const byClient = await listByClient(request, client.id);
        expect(byClient.count).toBe(2);
        expect(byClient.data.map(row => row.id).sort()).toEqual(
          [connA.id, connB.id].sort()
        );
        expectConnectionEmbeds(
          findRow(byClient.data, connA.id),
          client,
          instrumentA
        );
        expectConnectionEmbeds(
          findRow(byClient.data, connB.id),
          client,
          instrumentB
        );

        // 3. Dashboard/connections-page contract (ConnectionsContext +
        // fetchCompleteConnectionCollection): unfiltered, created_at desc,
        // page 1, pageSize 100. This is the exact read that 500'd with
        // PGRST201 before PR #151.
        const dashboardList = await expectStatusJson<ConnectionListBody>(
          await request.get(
            '/api/connections?orderBy=created_at&ascending=false&page=1&pageSize=100'
          ),
          200
        );
        expect(dashboardList.scope).toBe('paged');
        expect(dashboardList.pagination.pageSize).toBe(100);
        const dashboardIds = dashboardList.data.map(row => row.id);
        const indexA = dashboardIds.indexOf(connA.id);
        const indexB = dashboardIds.indexOf(connB.id);
        expect(indexA, 'connection A on dashboard page 1').toBeGreaterThan(-1);
        expect(indexB, 'connection B on dashboard page 1').toBeGreaterThan(-1);
        // created_at desc: B was created after A in a separate request.
        expect(indexB).toBeLessThan(indexA);
        expectConnectionEmbeds(dashboardList.data[indexA], client, instrumentA);
        expectConnectionEmbeds(dashboardList.data[indexB], client, instrumentB);

        // Same read, issued by the app itself (DataInitializer /
        // ConnectionsContext) on a real page load, so the runtime guard also
        // sees it and any other background /api call the page makes.
        const browserListResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return (
            response.request().method() === 'GET' &&
            url.pathname === '/api/connections' &&
            url.searchParams.get('orderBy') === 'created_at' &&
            url.searchParams.get('page') === '1'
          );
        });
        await page.goto('/connections', { waitUntil: 'domcontentloaded' });
        const browserList = await browserListResponse;
        const browserBody = await browserList.text();
        expect(browserList.status(), browserBody).toBe(200);
        const browserRows = (JSON.parse(browserBody) as ConnectionListBody)
          .data;
        expectConnectionEmbeds(
          findRow(browserRows, connA.id),
          client,
          instrumentA
        );
        expectConnectionEmbeds(
          findRow(browserRows, connB.id),
          client,
          instrumentB
        );

        // 4. PATCH relationship_type + notes on A; B must stay untouched.
        const patchedNotes = `conn A patched ${suffix}`;
        const patched = await expectStatusJson<{ data: ConnectionRow }>(
          await request.patch('/api/connections', {
            data: {
              id: connA.id,
              relationship_type: 'Owned',
              notes: patchedNotes,
            },
          }),
          200
        );
        expect(patched.data.id).toBe(connA.id);
        expect(patched.data.relationship_type).toBe('Owned');
        expect(patched.data.notes).toBe(patchedNotes);
        expectConnectionEmbeds(patched.data, client, instrumentA);

        const afterPatch = await listByClient(request, client.id);
        const persistedA = findRow(afterPatch.data, connA.id);
        expect(persistedA.relationship_type).toBe('Owned');
        expect(persistedA.notes).toBe(patchedNotes);
        const persistedB = findRow(afterPatch.data, connB.id);
        expect(persistedB.relationship_type).toBe('Interested');
        expect(persistedB.notes).toBe(notesB);

        // 5. PUT reorder: { orders: [{ id, display_order }] }. Response rows
        // come back sorted by display_order ascending.
        const reorder = await expectStatusJson<{ data: ConnectionRow[] }>(
          await request.put('/api/connections', {
            data: {
              orders: [
                { id: connA.id, display_order: 2 },
                { id: connB.id, display_order: 1 },
              ],
            },
          }),
          200
        );
        expect(reorder.data.map(row => [row.id, row.display_order])).toEqual([
          [connB.id, 1],
          [connA.id, 2],
        ]);
        expectConnectionEmbeds(reorder.data[0], client, instrumentB);
        expectConnectionEmbeds(reorder.data[1], client, instrumentA);

        const afterReorder = await listByClient(
          request,
          client.id,
          '&orderBy=display_order&ascending=true'
        );
        expect(
          afterReorder.data.map(row => [row.id, row.display_order])
        ).toEqual([
          [connB.id, 1],
          [connA.id, 2],
        ]);

        // 6. DELETE A; it disappears from both the filtered and dashboard
        // reads, and B is still there.
        const deletePath = `/api/connections?id=${connA.id}`;
        const deleted = await expectStatusJson<{ success: boolean }>(
          await request.delete(deletePath),
          200
        );
        expect(deleted.success).toBe(true);
        removeStep(steps, deletePath);

        const afterDelete = await listByClient(request, client.id);
        expect(afterDelete.count).toBe(1);
        expect(afterDelete.data.map(row => row.id)).toEqual([connB.id]);

        const dashboardAfterDelete = await expectStatusJson<ConnectionListBody>(
          await request.get(
            '/api/connections?orderBy=created_at&ascending=false&page=1&pageSize=100'
          ),
          200
        );
        const remainingIds = dashboardAfterDelete.data.map(row => row.id);
        expect(remainingIds).not.toContain(connA.id);
        expect(remainingIds).toContain(connB.id);
      });
    }
  );

  test(
    'member can read but cannot create, update, reorder, or delete connections',
    {
      tag: '@critical',
    },
    async ({ page, browser, baseURL }) => {
      expect(
        fs.existsSync(MEMBER_AUTH_STATE_PATH),
        `Missing member auth state at ${MEMBER_AUTH_STATE_PATH}. Critical E2E requires a seeded member user.`
      ).toBe(true);

      const adminRequest = page.request;
      const suffix = uniqueSuffix();
      const steps: CleanupStep[] = [];

      await withRouteCleanup(adminRequest, steps, async () => {
        const client = await createClient(adminRequest, suffix, steps);
        const instrument = await createInstrument(
          adminRequest,
          `Conn Member ${suffix}`,
          steps
        );
        const notes = `member guard notes ${suffix}`;
        const connection = await createConnection(
          adminRequest,
          { clientId: client.id, instrumentId: instrument.id, notes },
          steps
        );

        const memberContext = await browser.newContext({
          baseURL,
          storageState: MEMBER_AUTH_STATE_PATH,
        });
        try {
          const member = memberContext.request;

          // The member session is valid and in the same org: reads succeed,
          // so the 403s below are the role check, not a 401/org mismatch.
          const memberRead = await listByClient(member, client.id);
          expectConnectionEmbeds(
            findRow(memberRead.data, connection.id),
            client,
            instrument
          );

          // route.ts runs requireAdmin before rate limiting, body parsing,
          // validation, and any lookup/RPC, so even a fully valid request is
          // denied. The connections route's contract is
          // { error: 'Admin role required' } (no error_code).
          const expectAdminRequired = async (response: APIResponse) => {
            const body = await expectStatusJson<{
              error: string;
              success: boolean;
            }>(response, 403);
            expect(body.error).toBe('Admin role required');
            expect(body.success).toBe(false);
          };

          await expectAdminRequired(
            await member.post('/api/connections', {
              headers: {
                'Idempotency-Key': `e2e-connection-member-${uniqueSuffix()}`,
              },
              data: {
                client_id: client.id,
                instrument_id: instrument.id,
                relationship_type: 'Owned',
                notes: `member create ${suffix}`,
              },
            })
          );
          await expectAdminRequired(
            await member.patch('/api/connections', {
              data: { id: connection.id, notes: `member patch ${suffix}` },
            })
          );
          await expectAdminRequired(
            await member.put('/api/connections', {
              data: { orders: [{ id: connection.id, display_order: 7 }] },
            })
          );
          await expectAdminRequired(
            await member.delete(`/api/connections?id=${connection.id}`)
          );
        } finally {
          await memberContext.close();
        }

        // Nothing changed: still exactly the admin's connection, unmodified.
        const afterDenied = await listByClient(adminRequest, client.id);
        expect(afterDenied.count).toBe(1);
        const unchanged = findRow(afterDenied.data, connection.id);
        expect(unchanged.relationship_type).toBe('Interested');
        expect(unchanged.notes).toBe(notes);
        expect(unchanged.display_order).toBe(connection.display_order);
      });
    }
  );
});
