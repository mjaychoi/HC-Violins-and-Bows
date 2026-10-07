import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { randomUUID } from 'crypto';

import {
  getE2EAdminIdentity,
  getE2ESecondaryAdminIdentity,
} from './e2e-identities';
// Fails any test whose page hits a same-origin /api 5xx or a pageerror.
import { expect, test } from './critical-test';
import { freshSessionStorageState } from './fresh-session-state';
import { assertCookieBackedAuth, waitForPageLoad } from './test-helpers';

/**
 * Cross-tenant isolation, proven against the hosted app with two real,
 * run-scoped tenants: the primary org's admin (`page`) and the secondary
 * org's admin (a second browser context). Global setup seeds both orgs and
 * both admins from E2E_RUN_SCOPE; global teardown deletes both orgs.
 *
 * Every secondary-org resource is created by the secondary admin through the
 * API. The primary admin then tries to read, list, update, and delete it —
 * even with the resource's real `updated_at` version token, so a denial can
 * only come from tenancy, never from a stale-version check. Each denial must
 *   - use the route's own not-found contract (status + error), byte-for-byte
 *     the same as for an id that exists nowhere, so foreign ids are not
 *     enumerable, and
 *   - carry none of the foreign resource's data.
 * After every denied mutation the secondary admin re-reads the resource and
 * proves it is unchanged and still present.
 */

const primaryAdminState = freshSessionStorageState(getE2EAdminIdentity());

// Resolved lazily: the secondary admin only exists in run-scoped mode, and
// resolving it at import time would break `playwright --list` locally.
let secondaryAdminStateMemo: ReturnType<
  typeof freshSessionStorageState
> | null = null;
function secondaryAdminState(baseURL: string | undefined) {
  secondaryAdminStateMemo ??= freshSessionStorageState(
    getE2ESecondaryAdminIdentity()
  );
  return secondaryAdminStateMemo(baseURL);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type ParsedResponse = {
  status: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
};

async function parse(response: APIResponse): Promise<ParsedResponse> {
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status(), text, json };
}

async function expectStatus(
  response: APIResponse,
  status: number,
  label: string
): Promise<ParsedResponse> {
  const parsed = await parse(response);
  expect(parsed.status, `${label}: ${parsed.text.slice(0, 500)}`).toBe(status);
  return parsed;
}

/**
 * A denied cross-tenant request must be indistinguishable from a request for
 * an id that exists in no org, and must not echo the foreign resource.
 */
async function expectTenantSafeDenial(options: {
  label: string;
  status: number;
  error: string;
  foreign: () => Promise<APIResponse>;
  nonexistent: () => Promise<APIResponse>;
  secret: string;
}): Promise<void> {
  const foreign = await expectStatus(
    await options.foreign(),
    options.status,
    `${options.label} (secondary-org id)`
  );
  const nonexistent = await expectStatus(
    await options.nonexistent(),
    options.status,
    `${options.label} (nonexistent id)`
  );
  expect(foreign.json?.error, options.label).toBe(options.error);
  expect(nonexistent.json?.error, options.label).toBe(options.error);
  expect(foreign.json?.error_code ?? null, options.label).toBe(
    nonexistent.json?.error_code ?? null
  );
  expect(foreign.json?.data ?? null, options.label).toBeNull();
  expect(foreign.text, options.label).not.toContain(options.secret);
}

/**
 * Runs `body`, then every registered cleanup step (newest first) even if the
 * body failed. A cleanup failure never masks the body's error, and is never
 * swallowed: it fails the test on its own when the body passed.
 */
async function withCleanup(
  body: (
    register: (label: string, step: () => Promise<void>) => void
  ) => Promise<void>
): Promise<void> {
  const steps: Array<{ label: string; step: () => Promise<void> }> = [];
  let bodyFailed = false;
  let bodyError: unknown;
  try {
    await body((label, step) => steps.push({ label, step }));
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }

  const failures: string[] = [];
  for (const { label, step } of steps.reverse()) {
    try {
      await step();
    } catch (error) {
      failures.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (bodyFailed) {
    if (failures.length > 0) {
      test.info().annotations.push({
        type: 'cleanup-failure',
        description: failures.join('\n'),
      });
      console.error(
        `[cross-tenant] cleanup also failed:\n${failures.join('\n')}`
      );
    }
    throw bodyError;
  }
  if (failures.length > 0) {
    throw new Error(`Cross-tenant cleanup failed:\n${failures.join('\n')}`);
  }
}

/**
 * Positive control for a list probe: the same query as the secondary admin
 * must find the resource, so an empty primary result is not vacuous.
 */
async function expectListedFor(
  request: APIRequestContext,
  path: string,
  id: string,
  label: string
): Promise<void> {
  const list = await expectStatus(await request.get(path), 200, label);
  expect(
    (list.json.data as Array<{ id: string }>).some(row => row.id === id),
    label
  ).toBe(true);
}

async function openPrimaryDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await waitForPageLoad(page, 15000, { skipNetworkIdle: true });
  await assertCookieBackedAuth(page);
}

type SecondaryClient = { id: string; first_name: string; updated_at: string };

async function createSecondaryClient(
  secondary: APIRequestContext,
  suffix: string
): Promise<SecondaryClient> {
  const created = await expectStatus(
    await secondary.post('/api/clients', {
      data: {
        first_name: `Tenant B ${suffix}`,
        last_name: 'Client',
        email: `tenant-b-${suffix}@example.com`,
        contact_number: null,
        tags: ['E2E-CROSS-TENANT'],
        interest: 'Cross-tenant',
        note: suffix,
      },
    }),
    201,
    'secondary admin creates a client'
  );
  return created.json.data as SecondaryClient;
}

async function createSecondaryInstrument(
  secondary: APIRequestContext,
  suffix: string
): Promise<string> {
  const created = await expectStatus(
    await secondary.post('/api/instruments', {
      data: {
        type: 'Violin',
        maker: `Tenant B ${suffix}`,
        year: 2026,
        price: 1500,
        status: 'Available',
        ownership: 'owned',
        note: suffix,
      },
    }),
    201,
    'secondary admin creates an instrument'
  );
  return created.json.data.id as string;
}

async function deleteAsSecondary(
  secondary: APIRequestContext,
  path: string
): Promise<void> {
  await expectStatus(
    await secondary.delete(path),
    200,
    `secondary cleanup DELETE ${path}`
  );
}

test.describe('Cross-tenant isolation', () => {
  test.use({
    storageState: async ({ baseURL }, provide) =>
      provide(await primaryAdminState(baseURL)),
  });

  test(
    'primary admin cannot read, list, update, or delete a secondary-org client',
    {
      tag: '@critical',
    },
    async ({ page, browser, baseURL }) => {
      await openPrimaryDashboard(page);
      const secondaryContext = await browser.newContext({
        baseURL,
        storageState: await secondaryAdminState(baseURL),
      });
      const secondary = secondaryContext.request;
      const primary = page.request;

      try {
        await withCleanup(async register => {
          const suffix = uniqueSuffix();
          const client = await createSecondaryClient(secondary, suffix);
          register('client', () =>
            deleteAsSecondary(secondary, `/api/clients?id=${client.id}`)
          );

          const readAsSecondary = async () =>
            (
              await expectStatus(
                await secondary.get(`/api/clients?id=${client.id}`),
                200,
                'secondary admin re-reads its client'
              )
            ).json.data as SecondaryClient;
          const missingId = randomUUID();

          await expectTenantSafeDenial({
            label: 'GET /api/clients?id',
            status: 404,
            error: 'Client not found',
            secret: suffix,
            foreign: () => primary.get(`/api/clients?id=${client.id}`),
            nonexistent: () => primary.get(`/api/clients?id=${missingId}`),
          });

          const list = await expectStatus(
            await primary.get(
              `/api/clients?search=${encodeURIComponent(suffix)}`
            ),
            200,
            'primary admin searches clients'
          );
          expect(
            (list.json.data as Array<{ id: string }>).some(
              row => row.id === client.id
            )
          ).toBe(false);
          expect(list.text).not.toContain(suffix);
          await expectListedFor(
            secondary,
            `/api/clients?search=${encodeURIComponent(suffix)}`,
            client.id,
            'secondary admin finds its client by the same search'
          );

          await expectTenantSafeDenial({
            label: 'PATCH /api/clients',
            status: 404,
            error: 'Client not found',
            secret: suffix,
            foreign: () =>
              primary.patch('/api/clients', {
                data: {
                  id: client.id,
                  first_name: `Hijacked ${suffix}`,
                  expected_updated_at: client.updated_at,
                },
              }),
            nonexistent: () =>
              primary.patch('/api/clients', {
                data: {
                  id: missingId,
                  first_name: 'Nobody',
                  expected_updated_at: client.updated_at,
                },
              }),
          });
          const afterPatch = await readAsSecondary();
          expect(afterPatch.first_name).toBe(client.first_name);
          expect(afterPatch.updated_at).toBe(client.updated_at);

          await expectTenantSafeDenial({
            label: 'DELETE /api/clients?id',
            status: 404,
            error: 'Client not found',
            secret: suffix,
            foreign: () => primary.delete(`/api/clients?id=${client.id}`),
            nonexistent: () => primary.delete(`/api/clients?id=${missingId}`),
          });
          const afterDelete = await readAsSecondary();
          expect(afterDelete.id).toBe(client.id);
          expect(afterDelete.updated_at).toBe(client.updated_at);
        });
      } finally {
        await secondaryContext.close();
      }
    }
  );

  test(
    'primary admin cannot read, list, update, or delete a secondary-org instrument',
    {
      tag: '@critical',
    },
    async ({ page, browser, baseURL }) => {
      await openPrimaryDashboard(page);
      const secondaryContext = await browser.newContext({
        baseURL,
        storageState: await secondaryAdminState(baseURL),
      });
      const secondary = secondaryContext.request;
      const primary = page.request;

      try {
        await withCleanup(async register => {
          const suffix = uniqueSuffix();
          const instrumentId = await createSecondaryInstrument(
            secondary,
            suffix
          );
          register('instrument', () =>
            deleteAsSecondary(secondary, `/api/instruments?id=${instrumentId}`)
          );

          const readAsSecondary = async () =>
            (
              await expectStatus(
                await secondary.get(`/api/instruments?id=${instrumentId}`),
                200,
                'secondary admin re-reads its instrument'
              )
            ).json.data[0] as { id: string; note: string; updated_at: string };
          const original = await readAsSecondary();
          expect(original.note).toBe(suffix);
          const missingId = randomUUID();

          await expectTenantSafeDenial({
            label: 'GET /api/instruments?id',
            status: 404,
            error: 'Instrument not found',
            secret: suffix,
            foreign: () => primary.get(`/api/instruments?id=${instrumentId}`),
            nonexistent: () => primary.get(`/api/instruments?id=${missingId}`),
          });

          const list = await expectStatus(
            await primary.get(
              `/api/instruments?search=${encodeURIComponent(suffix)}`
            ),
            200,
            'primary admin searches instruments'
          );
          expect(
            (list.json.data as Array<{ id: string }>).some(
              row => row.id === instrumentId
            )
          ).toBe(false);
          expect(list.text).not.toContain(suffix);
          await expectListedFor(
            secondary,
            `/api/instruments?search=${encodeURIComponent(suffix)}`,
            instrumentId,
            'secondary admin finds its instrument by the same search'
          );

          // Status and maker patches prefetch the org-scoped row before the
          // CAS update. A missing or foreign id is the same 404 as note-only.
          await expectTenantSafeDenial({
            label: 'PATCH /api/instruments (status)',
            status: 404,
            error: 'Instrument not found',
            secret: suffix,
            foreign: () =>
              primary.patch('/api/instruments', {
                data: {
                  id: instrumentId,
                  status: 'Maintenance',
                  updated_at: original.updated_at,
                },
              }),
            nonexistent: () =>
              primary.patch('/api/instruments', {
                data: {
                  id: missingId,
                  status: 'Maintenance',
                  updated_at: original.updated_at,
                },
              }),
          });
          await expectTenantSafeDenial({
            label: 'PATCH /api/instruments (maker)',
            status: 404,
            error: 'Instrument not found',
            secret: suffix,
            foreign: () =>
              primary.patch('/api/instruments', {
                data: {
                  id: instrumentId,
                  maker: `Hijacked ${suffix}`,
                  updated_at: original.updated_at,
                },
              }),
            nonexistent: () =>
              primary.patch('/api/instruments', {
                data: {
                  id: missingId,
                  maker: 'Nobody',
                  updated_at: original.updated_at,
                },
              }),
          });

          // Note-only patches take the CAS-update path, whose not-found
          // contract is 404 (executeInstrumentPatch.ts, update + exists
          // re-check). Both PATCH surfaces share that executor.
          await expectTenantSafeDenial({
            label: 'PATCH /api/instruments',
            status: 404,
            error: 'Instrument not found',
            secret: suffix,
            foreign: () =>
              primary.patch('/api/instruments', {
                data: {
                  id: instrumentId,
                  note: `Hijacked ${suffix}`,
                  updated_at: original.updated_at,
                },
              }),
            nonexistent: () =>
              primary.patch('/api/instruments', {
                data: {
                  id: missingId,
                  note: 'Nobody',
                  updated_at: original.updated_at,
                },
              }),
          });
          await expectTenantSafeDenial({
            label: 'PATCH /api/instruments/[id]',
            status: 404,
            error: 'Instrument not found',
            secret: suffix,
            foreign: () =>
              primary.patch(`/api/instruments/${instrumentId}`, {
                data: {
                  note: `Hijacked ${suffix}`,
                  updated_at: original.updated_at,
                },
              }),
            nonexistent: () =>
              primary.patch(`/api/instruments/${missingId}`, {
                data: { note: 'Nobody', updated_at: original.updated_at },
              }),
          });
          const afterPatch = await readAsSecondary();
          expect(afterPatch.note).toBe(original.note);
          expect(afterPatch.updated_at).toBe(original.updated_at);

          await expectTenantSafeDenial({
            label: 'DELETE /api/instruments?id',
            status: 404,
            error: 'Instrument not found',
            secret: suffix,
            foreign: () =>
              primary.delete(`/api/instruments?id=${instrumentId}`),
            nonexistent: () =>
              primary.delete(`/api/instruments?id=${missingId}`),
          });
          const afterDelete = await readAsSecondary();
          expect(afterDelete.id).toBe(instrumentId);
          expect(afterDelete.updated_at).toBe(original.updated_at);
        });
      } finally {
        await secondaryContext.close();
      }
    }
  );

  test(
    'primary admin cannot read, list, update, delete, or bill against a secondary-org invoice',
    {
      tag: '@critical',
    },
    async ({ page, browser, baseURL }) => {
      await openPrimaryDashboard(page);
      const secondaryContext = await browser.newContext({
        baseURL,
        storageState: await secondaryAdminState(baseURL),
      });
      const secondary = secondaryContext.request;
      const primary = page.request;

      try {
        await withCleanup(async register => {
          const suffix = uniqueSuffix();
          const today = todayIsoDate();
          const client = await createSecondaryClient(secondary, suffix);
          register('client', () =>
            deleteAsSecondary(secondary, `/api/clients?id=${client.id}`)
          );
          const instrumentId = await createSecondaryInstrument(
            secondary,
            suffix
          );
          register('instrument', () =>
            deleteAsSecondary(secondary, `/api/instruments?id=${instrumentId}`)
          );

          const invoicePayload = (
            clientId: string,
            itemInstrument: string
          ) => ({
            client_id: clientId,
            invoice_date: today,
            due_date: today,
            subtotal: 1500,
            tax: 0,
            total: 1500,
            currency: 'USD',
            status: 'draft',
            notes: suffix,
            items: [
              {
                instrument_id: itemInstrument,
                description: `Tenant B violin ${suffix}`,
                qty: 1,
                rate: 1500,
                amount: 1500,
                image_url: null,
                display_order: 0,
              },
            ],
          });
          const created = await expectStatus(
            await secondary.post('/api/invoices', {
              headers: { 'Idempotency-Key': `e2e-xt-invoice-${suffix}` },
              data: invoicePayload(client.id, instrumentId),
            }),
            201,
            'secondary admin creates a draft invoice'
          );
          const invoiceId = created.json.data.id as string;
          // Draft invoices are hard-deletable; registered last so it runs
          // first, before the instrument and client it references.
          register('invoice', () =>
            deleteAsSecondary(secondary, `/api/invoices/${invoiceId}`)
          );

          const readAsSecondary = async () =>
            (
              await expectStatus(
                await secondary.get(`/api/invoices/${invoiceId}`),
                200,
                'secondary admin re-reads its invoice'
              )
            ).json.data as {
              id: string;
              notes: string;
              status: string;
              updated_at: string;
            };
          const original = await readAsSecondary();
          expect(original.notes).toBe(suffix);
          expect(original.status).toBe('draft');
          const missingId = randomUUID();

          await expectTenantSafeDenial({
            label: 'GET /api/invoices/[id]',
            status: 404,
            error: 'Invoice not found',
            secret: suffix,
            foreign: () => primary.get(`/api/invoices/${invoiceId}`),
            nonexistent: () => primary.get(`/api/invoices/${missingId}`),
          });

          const list = await expectStatus(
            await primary.get(`/api/invoices?client_id=${client.id}`),
            200,
            'primary admin lists invoices by the secondary client'
          );
          expect(list.json.data).toEqual([]);
          expect(list.text).not.toContain(suffix);
          await expectListedFor(
            secondary,
            `/api/invoices?client_id=${client.id}`,
            invoiceId,
            'secondary admin lists its invoice by the same client filter'
          );

          // Notes-only edit reaches update_invoice_atomic, which raises
          // 'Invoice not found' for an id outside the caller's org.
          await expectTenantSafeDenial({
            label: 'PUT /api/invoices/[id] (notes)',
            status: 404,
            error: 'Invoice not found',
            secret: suffix,
            foreign: () =>
              primary.put(`/api/invoices/${invoiceId}`, {
                headers: { 'Idempotency-Key': `e2e-xt-put-a-${suffix}` },
                data: {
                  notes: `Hijacked ${suffix}`,
                  updated_at: original.updated_at,
                },
              }),
            nonexistent: () =>
              primary.put(`/api/invoices/${missingId}`, {
                headers: { 'Idempotency-Key': `e2e-xt-put-b-${suffix}` },
                data: { notes: 'Nobody', updated_at: original.updated_at },
              }),
          });
          // A status edit goes through the financial/status pre-read first.
          await expectTenantSafeDenial({
            label: 'PUT /api/invoices/[id] (status)',
            status: 404,
            error: 'Invoice not found',
            secret: suffix,
            foreign: () =>
              primary.put(`/api/invoices/${invoiceId}`, {
                headers: { 'Idempotency-Key': `e2e-xt-put-c-${suffix}` },
                data: { status: 'sent', updated_at: original.updated_at },
              }),
            nonexistent: () =>
              primary.put(`/api/invoices/${missingId}`, {
                headers: { 'Idempotency-Key': `e2e-xt-put-d-${suffix}` },
                data: { status: 'sent', updated_at: original.updated_at },
              }),
          });
          const afterPut = await readAsSecondary();
          expect(afterPut.notes).toBe(original.notes);
          expect(afterPut.status).toBe('draft');
          expect(afterPut.updated_at).toBe(original.updated_at);

          await expectTenantSafeDenial({
            label: 'DELETE /api/invoices/[id]',
            status: 404,
            error: 'Invoice not found',
            secret: suffix,
            foreign: () => primary.delete(`/api/invoices/${invoiceId}`),
            nonexistent: () => primary.delete(`/api/invoices/${missingId}`),
          });
          const afterDelete = await readAsSecondary();
          expect(afterDelete.id).toBe(invoiceId);
          expect(afterDelete.updated_at).toBe(original.updated_at);

          // Reference injection: the primary admin cannot bill a
          // secondary-org client (assertClientBelongsToOrg → 400).
          await expectTenantSafeDenial({
            label: 'POST /api/invoices with a secondary-org client',
            status: 400,
            error: 'Client not found in organization',
            secret: suffix,
            foreign: () =>
              primary.post('/api/invoices', {
                headers: { 'Idempotency-Key': `e2e-xt-post-a-${suffix}` },
                data: invoicePayload(client.id, instrumentId),
              }),
            nonexistent: () =>
              primary.post('/api/invoices', {
                headers: { 'Idempotency-Key': `e2e-xt-post-b-${suffix}` },
                data: invoicePayload(randomUUID(), randomUUID()),
              }),
          });
          const primaryAfterInjection = await expectStatus(
            await primary.get(`/api/invoices?client_id=${client.id}`),
            200,
            'primary admin lists invoices after the injection attempt'
          );
          expect(primaryAfterInjection.json.data).toEqual([]);
        });
      } finally {
        await secondaryContext.close();
      }
    }
  );
});
