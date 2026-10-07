import { randomUUID } from 'crypto';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

import { MEMBER_AUTH_STATE_PATH, getE2EAdminIdentity } from './e2e-identities';
// Fails any test whose page hits a same-origin /api 5xx or a pageerror,
// even when the test body never asserts that background request.
import { expect, test } from './critical-test';
import { freshSessionStorageState } from './fresh-session-state';
import { assertCookieBackedAuth } from './test-helpers';

/**
 * Hosted member authorization matrix.
 *
 * Every admin-only handler below checks, in this order (proved from the
 * route source, cited per case): withAuthRoute session (401) →
 * requireOrgContext (403 "Organization context required") → requireAdmin
 * (403 "Admin role required") → body/id validation (400) → rate limit (429)
 * → entity lookup (404). The ids sent are fresh random UUIDs that exist in
 * no org, and every body is otherwise valid-shaped, so a member can only
 * ever see the role denial: a 400 would mean validation moved ahead of the
 * role check, and a 404 would mean the handler looked the entity up first.
 *
 * Only the instrument confidentiality test creates data (one instrument,
 * created and deleted by a freshly signed-in run-scoped admin).
 */

const ADMIN_REQUIRED_MESSAGE = 'Admin role required';

const adminState = freshSessionStorageState(getE2EAdminIdentity());

function uniqueSuffix(): string {
  return `${Date.now()}${Math.random().toString(16).slice(2, 10)}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type DenialCase = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Set only where the route's 403 payload carries a stable error_code. */
  errorCode?: 'ADMIN_REQUIRED';
};

async function readJson(response: APIResponse): Promise<{
  text: string;
  json: Record<string, unknown> | null;
}> {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { text, json: null };
  }
}

/**
 * Sends every case as the member and compares the full observed matrix to
 * the expected one in a single assertion, so one run reports every route
 * that drifted instead of stopping at the first.
 */
async function expectAdminRequired(page: Page, cases: DenialCase[]) {
  await assertCookieBackedAuth(page);

  const observed: Record<string, unknown>[] = [];
  const expected: Record<string, unknown>[] = [];

  for (const denial of cases) {
    const label = `${denial.method} ${denial.path}`;
    const response = await page.request.fetch(denial.path, {
      method: denial.method,
      data: denial.data,
      headers: denial.headers,
    });
    const { text, json } = await readJson(response);

    observed.push({
      label,
      status: response.status(),
      success: json?.success,
      message: json?.message,
      ...(denial.errorCode ? { error_code: json?.error_code } : {}),
      ...(json ? {} : { rawBody: text.slice(0, 300) }),
    });
    expected.push({
      label,
      status: 403,
      success: false,
      message: ADMIN_REQUIRED_MESSAGE,
      ...(denial.errorCode ? { error_code: denial.errorCode } : {}),
    });
  }

  expect(observed).toEqual(expected);
}

test.describe('Member authorization matrix', () => {
  test.use({ storageState: MEMBER_AUTH_STATE_PATH });

  test(
    'member session is an authenticated org member (positive control)',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      await assertCookieBackedAuth(page);
      // Member-readable collections answer 200, so the 403s below are role
      // denials, not a missing session (401) or missing org context.
      const clients = await page.request.get('/api/clients?limit=1');
      expect(clients.status(), await clients.text()).toBe(200);
      const instruments = await page.request.get('/api/instruments?limit=1');
      expect(instruments.status(), await instruments.text()).toBe(200);
    }
  );

  test(
    'denies member client mutations before validation and lookup',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      const suffix = uniqueSuffix();
      const missingId = randomUUID();
      // src/app/api/clients/route.ts: POST/PATCH/DELETE call requireAdmin
      // before request.json() / id checks / the clients query.
      await expectAdminRequired(page, [
        {
          method: 'POST',
          path: '/api/clients',
          data: {
            first_name: `Member ${suffix}`,
            last_name: 'Denied',
            email: `member-denied-${suffix}@example.com`,
            contact_number: null,
            tags: ['E2E-CRITICAL'],
            interest: 'Member authz',
            note: suffix,
          },
        },
        {
          method: 'PATCH',
          path: '/api/clients',
          data: {
            id: missingId,
            first_name: `Member ${suffix}`,
            expected_updated_at: new Date().toISOString(),
          },
        },
        { method: 'DELETE', path: `/api/clients?id=${missingId}` },
      ]);
    }
  );

  test(
    'denies member instrument mutations before lookup',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      const suffix = uniqueSuffix();
      const missingId = randomUUID();
      // POST/DELETE: src/app/api/instruments/route.ts requireAdmin first.
      // PATCH (collection and /[id]): the route only parses the body and
      // checks the id is a UUID, then executeInstrumentPatch()
      // (_shared/executeInstrumentPatch.ts) runs requireAdmin before it
      // reads the instrument. A valid UUID isolates the role check.
      await expectAdminRequired(page, [
        {
          method: 'POST',
          path: '/api/instruments',
          data: {
            type: 'Violin',
            maker: `Member Denied ${suffix}`,
            year: 2026,
            price: 1000,
            status: 'Available',
            ownership: 'owned',
            note: suffix,
          },
        },
        {
          method: 'PATCH',
          path: '/api/instruments',
          data: { id: missingId, note: `member ${suffix}` },
        },
        {
          method: 'PATCH',
          path: `/api/instruments/${missingId}`,
          data: { note: `member ${suffix}` },
        },
        { method: 'DELETE', path: `/api/instruments?id=${missingId}` },
      ]);
    }
  );

  test(
    'denies member connection mutations before validation and lookup',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      const suffix = uniqueSuffix();
      const missingId = randomUUID();
      // src/app/api/connections/route.ts: POST/PATCH/DELETE/PUT all call
      // requireAdmin before the rate limit, body parse, and any lookup.
      await expectAdminRequired(page, [
        {
          method: 'POST',
          path: '/api/connections',
          data: {
            client_id: randomUUID(),
            instrument_id: randomUUID(),
            relationship_type: 'Interested',
            notes: `member ${suffix}`,
          },
        },
        {
          method: 'PATCH',
          path: '/api/connections',
          data: { id: missingId, notes: `member ${suffix}` },
        },
        {
          method: 'PUT',
          path: '/api/connections',
          data: { orders: [{ id: missingId, display_order: 0 }] },
        },
        { method: 'DELETE', path: `/api/connections?id=${missingId}` },
      ]);
    }
  );

  test(
    'denies member invoice reads and mutations before lookup',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      const suffix = uniqueSuffix();
      const missingId = randomUUID();
      const today = todayIsoDate();
      // src/app/api/invoices/route.ts GET/POST and
      // src/app/api/invoices/[id]/route.ts GET/PUT/DELETE: requireAdmin runs
      // before the rate limit, id validation, Idempotency-Key check, body
      // parse, and the invoice lookup. Invoices are admin-only to read too.
      await expectAdminRequired(page, [
        { method: 'GET', path: '/api/invoices' },
        {
          method: 'POST',
          path: '/api/invoices',
          headers: { 'Idempotency-Key': `e2e-member-invoice-${suffix}` },
          data: {
            client_id: randomUUID(),
            invoice_date: today,
            due_date: today,
            subtotal: 100,
            tax: 0,
            total: 100,
            currency: 'USD',
            status: 'draft',
            notes: `member ${suffix}`,
            items: [
              {
                instrument_id: randomUUID(),
                description: `Member denied ${suffix}`,
                qty: 1,
                rate: 100,
                amount: 100,
                image_url: null,
                display_order: 0,
              },
            ],
          },
        },
        { method: 'GET', path: `/api/invoices/${missingId}` },
        {
          method: 'PUT',
          path: `/api/invoices/${missingId}`,
          headers: { 'Idempotency-Key': `e2e-member-invoice-put-${suffix}` },
          data: {
            notes: `member ${suffix}`,
            updated_at: new Date().toISOString(),
          },
        },
        { method: 'DELETE', path: `/api/invoices/${missingId}` },
      ]);
    }
  );

  test(
    'denies member invoice settings read and update with ADMIN_REQUIRED',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      // src/app/api/invoices/invoice_settings/route.ts: GET and PUT return
      // { error_code: 'ADMIN_REQUIRED' } before the body parse and before
      // getOrCreateSettingsRow().
      await expectAdminRequired(page, [
        {
          method: 'GET',
          path: '/api/invoices/invoice_settings',
          errorCode: 'ADMIN_REQUIRED',
        },
        {
          method: 'PUT',
          path: '/api/invoices/invoice_settings',
          data: { business_name: `Member Denied ${uniqueSuffix()}` },
          errorCode: 'ADMIN_REQUIRED',
        },
      ]);
    }
  );

  test(
    'denies member maintenance task mutations before validation and lookup',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      const suffix = uniqueSuffix();
      const missingId = randomUUID();
      const today = todayIsoDate();
      // src/app/api/maintenance-tasks/route.ts: POST/PATCH call
      // requireAdmin before the rate limit and body parse. DELETE checks the
      // ?id is a UUID first, then requireAdmin, then deletes; a valid UUID
      // isolates the role check.
      await expectAdminRequired(page, [
        {
          method: 'POST',
          path: '/api/maintenance-tasks',
          data: {
            instrument_id: randomUUID(),
            client_id: null,
            task_type: 'inspection',
            title: `Member denied ${suffix}`,
            description: null,
            status: 'pending',
            received_date: today,
            due_date: null,
            personal_due_date: null,
            scheduled_date: null,
            completed_date: null,
            priority: 'low',
            estimated_hours: null,
            actual_hours: null,
            cost: null,
            notes: null,
          },
        },
        {
          method: 'PATCH',
          path: '/api/maintenance-tasks',
          data: {
            id: missingId,
            title: `Member denied ${suffix}`,
            expected_updated_at: new Date().toISOString(),
          },
        },
        { method: 'DELETE', path: `/api/maintenance-tasks?id=${missingId}` },
      ]);
    }
  );

  test(
    'denies member sale updates with ADMIN_REQUIRED',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      // src/app/api/sales/route.ts PATCH: requireAdmin with
      // error_code ADMIN_REQUIRED before the rate limit, body parse, and
      // sale lookup. (Member POST /api/sales is covered by
      // critical-path.spec.ts.)
      await expectAdminRequired(page, [
        {
          method: 'PATCH',
          path: '/api/sales',
          data: { id: randomUUID(), notes: `member ${uniqueSuffix()}` },
          errorCode: 'ADMIN_REQUIRED',
        },
      ]);
    }
  );

  test(
    'hides instrument cost and consignment prices from members',
    {
      tag: '@critical',
    },
    async ({ page, browser, baseURL }) => {
      await assertCookieBackedAuth(page);

      // Financial-confidentiality contract (PR #98 / V7-003):
      // src/app/api/instruments/route.ts reads INSTRUMENT_SAFE_COLUMNS (no
      // cost_price/consignment_price; the DB revoked them from
      // `authenticated` in 20260814160000_enforce_financial_confidentiality_db_boundary.sql)
      // and toPublicInstrumentRow() re-adds them from the admin-only
      // get_instruments_financials() RPC for admins only. Retail `price`
      // stays visible to members.
      const suffix = uniqueSuffix();
      const maker = `MemberAuthz ${suffix}`;
      const price = 2500;
      const costPrice = 1137;
      const consignmentPrice = 1913;

      const adminContext = await browser.newContext({
        baseURL,
        storageState: await adminState(baseURL),
      });
      const admin: APIRequestContext = adminContext.request;
      let instrumentId: string | null = null;
      let primaryError: unknown = null;
      let cleanupError: Error | null = null;

      try {
        const createResponse = await admin.post('/api/instruments', {
          data: {
            type: 'Violin',
            maker,
            year: 2026,
            price,
            cost_price: costPrice,
            consignment_price: consignmentPrice,
            status: 'Available',
            ownership: 'consigned',
            note: suffix,
          },
        });
        const created = await readJson(createResponse);
        expect(createResponse.status(), created.text).toBe(201);
        instrumentId = (created.json?.data as { id?: string } | undefined)
          ?.id as string;
        expect(instrumentId).toBeTruthy();

        // Admin view includes the financial fields, so the member assertions
        // below are meaningful (the data really exists on this row).
        const adminRead = await readJson(
          await admin.get(`/api/instruments?id=${instrumentId}`)
        );
        const adminRow = (
          adminRead.json?.data as Record<string, unknown>[] | undefined
        )?.[0];
        expect(adminRow, adminRead.text).toBeTruthy();
        expect(adminRow?.id).toBe(instrumentId);
        expect(Number(adminRow?.cost_price)).toBe(costPrice);
        expect(Number(adminRow?.consignment_price)).toBe(consignmentPrice);
        expect(Number(adminRow?.price)).toBe(price);

        // Member exact-id read: same row, retail price visible, financial
        // fields absent (not merely null) anywhere in the payload.
        const memberByIdResponse = await page.request.get(
          `/api/instruments?id=${instrumentId}`
        );
        const memberById = await readJson(memberByIdResponse);
        expect(memberByIdResponse.status(), memberById.text).toBe(200);
        const memberRow = (
          memberById.json?.data as Record<string, unknown>[] | undefined
        )?.[0];
        expect(memberRow, memberById.text).toBeTruthy();
        expect(memberRow?.id).toBe(instrumentId);
        expect(memberRow?.maker).toBe(maker);
        expect(Number(memberRow?.price)).toBe(price);
        expect(Object.keys(memberRow ?? {})).not.toContain('cost_price');
        expect(Object.keys(memberRow ?? {})).not.toContain('consignment_price');
        expect(memberById.text).not.toContain('cost_price');
        expect(memberById.text).not.toContain('consignment_price');

        // Member list/search read: same redaction on the paged list path.
        const memberListResponse = await page.request.get(
          `/api/instruments?search=${encodeURIComponent(maker)}`
        );
        const memberList = await readJson(memberListResponse);
        expect(memberListResponse.status(), memberList.text).toBe(200);
        const listedRow = (
          memberList.json?.data as Record<string, unknown>[] | undefined
        )?.find(row => row.id === instrumentId);
        expect(listedRow, memberList.text).toBeTruthy();
        expect(Object.keys(listedRow ?? {})).not.toContain('cost_price');
        expect(Object.keys(listedRow ?? {})).not.toContain('consignment_price');
        expect(memberList.text).not.toContain('cost_price');
        expect(memberList.text).not.toContain('consignment_price');
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        const cleanupFailures: string[] = [];
        if (instrumentId) {
          try {
            const deleteResponse = await admin.delete(
              `/api/instruments?id=${instrumentId}`
            );
            if (deleteResponse.status() !== 200) {
              cleanupFailures.push(
                `DELETE /api/instruments?id=${instrumentId} -> ${deleteResponse.status()}: ${(await deleteResponse.text()).slice(0, 300)}`
              );
            }
          } catch (error) {
            cleanupFailures.push(
              `DELETE /api/instruments?id=${instrumentId} threw: ${String(error)}`
            );
          }
        }
        await adminContext.close();

        if (cleanupFailures.length > 0) {
          cleanupError = new Error(
            `Member authz cleanup failed:\n${cleanupFailures.join('\n')}`
          );
          // With a primary failure in flight, log instead of masking it.
          if (primaryError) console.error(cleanupError.message);
        }
      }

      // Reached only when the body passed: a cleanup failure fails the test.
      if (cleanupError) throw cleanupError;
    }
  );
});
