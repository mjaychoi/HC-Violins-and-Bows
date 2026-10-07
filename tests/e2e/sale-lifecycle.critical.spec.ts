import type { APIResponse, Page, TestInfo } from '@playwright/test';

// Fails any test whose page hits a same-origin /api 5xx or a pageerror,
// even when the test body never asserts that background request.
import { expect, test } from './critical-test';
import { getE2EAdminIdentity } from './e2e-identities';
import { freshSessionStorageState } from './fresh-session-state';
import { waitForPageLoad } from './test-helpers';

/**
 * Sale lifecycle + invoice hard-delete coverage.
 *
 * Contracts relied on (read from source, not guessed):
 * - POST /api/sales (src/app/api/sales/route.ts postHandler) requires an
 *   Idempotency-Key and calls create_sale_atomic_idempotent
 *   (supabase/migrations/00000000000031_create_sale_atomic_idempotent.sql):
 *   same key + same normalized body returns the ORIGINAL sale id (route
 *   answers 201 with that sale again); same key + different body raises
 *   "Idempotency key reuse with different payload" (409). A fresh key for an
 *   already-Sold instrument raises "Instrument is already sold" (409).
 * - create_sale_atomic (20260804020000_harden_sale_lifecycle_authorization.sql)
 *   moves the instrument to Sold in the same transaction as the sale row.
 * - The refund that moves an instrument out of Sold is PATCH /api/instruments
 *   with status + sale_transition (executeInstrumentPatch.ts), which calls
 *   update_instrument_sale_transition_atomic: it records a 'refund' row
 *   (adjustment_of_sale_id = sale, sale_price = -ABS(sale)) via
 *   create_sale_adjustment_atomic and sets the requested status. A fully
 *   refunded lifecycle (net <= 0) does not block a resale.
 * - The sales-ledger refund (PATCH /api/sales with sale_price = -original)
 *   only inserts the 'refund' row (create_sale_adjustment_atomic); it never
 *   touches instruments.status. Replaying it returns the existing refund row.
 * - DELETE /api/invoices/:id hard-deletes drafts only (non-draft -> 409
 *   INVOICE_IMMUTABLE, also enforced by a DB trigger); a missing invoice is a
 *   stable 404 for both GET and a repeated DELETE.
 *
 * Cleanup: instruments and clients are deleted through their routes
 * (sales_history.instrument_id/client_id are ON DELETE SET NULL, so a sold
 * instrument stays deletable). sales_history rows have no delete API and
 * refund rows pin their source via adjustment_of_sale_id ON DELETE RESTRICT,
 * so sale history intentionally remains until the run-scoped org teardown
 * (cleanupRunScopedFixtures), which cascades it with the org.
 */

// Admin auth must come from a brand-new session: critical-path.spec.ts sorts
// before this file and its UI sign-out globally revokes the admin session
// saved by global-setup (see fresh-session-state.ts).
const adminState = freshSessionStorageState(getE2EAdminIdentity());

type SaleRow = {
  id: string;
  instrument_id: string | null;
  client_id: string | null;
  sale_price: number;
  sale_date: string;
  notes: string | null;
  entry_kind?: 'sale' | 'refund' | 'undo_refund' | 'adjustment';
  adjustment_of_sale_id?: string | null;
};

type InstrumentRow = {
  id: string;
  status: string;
  updated_at: string;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function expectJson(response: APIResponse, status: number) {
  const body = await response.text();
  expect(response.status(), body).toBe(status);
  return JSON.parse(body);
}

/**
 * Route-level cleanup that never hides a failure: every registered DELETE is
 * attempted (newest first) and must return 2xx. Failures fail the test when
 * the body passed; when the body already failed they are attached and logged
 * instead, so the original error stays the reported one.
 */
async function withRouteCleanup(
  page: Page,
  testInfo: TestInfo,
  body: (cleanup: {
    register: (path: string) => void;
    release: (path: string) => void;
  }) => Promise<void>
) {
  const paths: string[] = [];
  const register = (path: string) => {
    paths.push(path);
  };
  const release = (path: string) => {
    const index = paths.indexOf(path);
    if (index >= 0) paths.splice(index, 1);
  };

  let bodyError: unknown = null;
  try {
    await body({ register, release });
  } catch (error) {
    bodyError = error;
    throw error;
  } finally {
    const failures: string[] = [];
    for (const path of [...paths].reverse()) {
      try {
        const response = await page.request.delete(path);
        if (!response.ok()) {
          failures.push(
            `DELETE ${path} -> ${response.status()} ${await response.text()}`
          );
        }
      } catch (error) {
        failures.push(`DELETE ${path} threw: ${String(error)}`);
      }
    }

    if (failures.length > 0) {
      const message = `Route cleanup failed:\n${failures.join('\n')}`;
      if (bodyError) {
        console.error(message);
        await testInfo.attach('route-cleanup-failures', {
          body: message,
          contentType: 'text/plain',
        });
      } else {
        // eslint-disable-next-line no-unsafe-finally
        throw new Error(message);
      }
    }
  }
}

async function createClient(page: Page, suffix: string, label: string) {
  const json = await expectJson(
    await page.request.post('/api/clients', {
      data: {
        first_name: `${label} ${suffix}`,
        last_name: 'Lifecycle',
        email: `${label.toLowerCase()}-${suffix}@example.com`,
        contact_number: null,
        tags: ['E2E-CRITICAL'],
        interest: 'Sale lifecycle',
        note: suffix,
      },
    }),
    201
  );
  const clientId = json.data.id as string;
  expect(clientId).toBeTruthy();
  return clientId;
}

async function createInstrument(page: Page, suffix: string, price: number) {
  const json = await expectJson(
    await page.request.post('/api/instruments', {
      data: {
        type: 'Violin',
        maker: `Sale Lifecycle ${suffix}`,
        year: 2026,
        price,
        status: 'Available',
        ownership: 'owned',
        note: suffix,
      },
    }),
    201
  );
  const instrument = json.data as InstrumentRow;
  expect(instrument.id).toBeTruthy();
  expect(instrument.status).toBe('Available');
  return instrument.id;
}

async function readInstrument(
  page: Page,
  instrumentId: string
): Promise<InstrumentRow> {
  const json = await expectJson(
    await page.request.get(`/api/instruments?id=${instrumentId}`),
    200
  );
  const rows = json.data as InstrumentRow[];
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(instrumentId);
  return rows[0];
}

/** Every sales_history row for this run's instrument (org-scoped by the API). */
async function listInstrumentSales(page: Page, instrumentId: string) {
  const json = await expectJson(
    await page.request.get(
      `/api/sales?instrument_id=${instrumentId}&pageSize=100`
    ),
    200
  );
  const rows = json.data as SaleRow[];
  expect(json.pagination.totalCount).toBe(rows.length);
  for (const row of rows) {
    expect(row.instrument_id).toBe(instrumentId);
  }
  return rows;
}

function postSale(
  page: Page,
  idempotencyKey: string,
  data: Record<string, unknown>
) {
  return page.request.post('/api/sales', {
    headers: { 'Idempotency-Key': idempotencyKey },
    data,
  });
}

test.describe('Sale lifecycle (admin)', () => {
  test.use({
    storageState: async ({ baseURL }, provide) =>
      provide(await adminState(baseURL)),
  });

  test(
    'sells idempotently, refunds through the instrument sale transition, and allows resale',
    {
      tag: '@critical',
    },
    async ({ page }, testInfo) => {
      await withRouteCleanup(page, testInfo, async ({ register }) => {
        const suffix = uniqueSuffix();
        const saleDate = todayIsoDate();
        const price = 1500;

        // A. Run-scoped client + instrument.
        const clientId = await createClient(page, suffix, 'Lifecycle');
        register(`/api/clients?id=${clientId}`);
        const instrumentId = await createInstrument(page, suffix, price);
        register(`/api/instruments?id=${instrumentId}`);

        // B. Sale.
        const saleKey = `e2e-lifecycle-sale-${suffix}`;
        const saleBody = {
          instrument_id: instrumentId,
          client_id: clientId,
          sale_price: price,
          sale_date: saleDate,
          notes: `lifecycle sale ${suffix}`,
        };
        const created = await expectJson(
          await postSale(page, saleKey, saleBody),
          201
        );
        const sale = created.data as SaleRow;
        expect(sale.id).toBeTruthy();
        expect(sale.entry_kind).toBe('sale');
        expect(Number(sale.sale_price)).toBe(price);
        expect(sale.instrument_id).toBe(instrumentId);
        expect(sale.client_id).toBe(clientId);
        expect(sale.adjustment_of_sale_id ?? null).toBeNull();

        // C. The sale and the Sold transition commit together.
        expect((await readInstrument(page, instrumentId)).status).toBe('Sold');

        // F. Idempotency: the same key + same body replays the original sale.
        const replayed = await expectJson(
          await postSale(page, saleKey, saleBody),
          201
        );
        expect(replayed.data.id).toBe(sale.id);
        expect(Number(replayed.data.sale_price)).toBe(price);

        // Same key with a different body is rejected, not applied.
        const reusedKey = await postSale(page, saleKey, {
          ...saleBody,
          sale_price: price + 100,
        });
        const reusedKeyBody = await reusedKey.text();
        expect(reusedKey.status(), reusedKeyBody).toBe(409);
        expect(reusedKeyBody).toMatch(
          /Idempotency key reuse with different payload/i
        );

        // A fresh key cannot sell the already-Sold instrument a second time.
        const duplicate = await postSale(
          page,
          `e2e-lifecycle-sale-dup-${suffix}`,
          saleBody
        );
        const duplicateBody = await duplicate.text();
        expect(duplicate.status(), duplicateBody).toBe(409);
        expect(duplicateBody).toMatch(/already sold/i);

        const afterReplays = await listInstrumentSales(page, instrumentId);
        expect(afterReplays.map(row => row.id)).toEqual([sale.id]);

        // D. Refund through the supported instrument sale transition.
        const soldInstrument = await readInstrument(page, instrumentId);
        const refundNote = `lifecycle refund ${suffix}`;
        const unsold = await expectJson(
          await page.request.patch('/api/instruments', {
            data: {
              id: instrumentId,
              updated_at: soldInstrument.updated_at,
              status: 'Available',
              sale_transition: { sales_note: refundNote },
            },
          }),
          200
        );
        expect(unsold.data.id).toBe(instrumentId);
        expect(unsold.data.status).toBe('Available');

        // E. Post-refund state: instrument Available, ledger has the sale
        // plus exactly one linked refund for the full amount.
        expect((await readInstrument(page, instrumentId)).status).toBe(
          'Available'
        );
        const afterRefund = await listInstrumentSales(page, instrumentId);
        expect(afterRefund).toHaveLength(2);
        const refund = afterRefund.find(row => row.entry_kind === 'refund');
        expect(refund, JSON.stringify(afterRefund)).toBeTruthy();
        expect(refund!.adjustment_of_sale_id).toBe(sale.id);
        expect(Number(refund!.sale_price)).toBe(-price);
        expect(refund!.client_id).toBe(clientId);
        expect(refund!.notes).toBe(refundNote);
        expect(afterRefund.find(row => row.id === sale.id)?.entry_kind).toBe(
          'sale'
        );

        // A fully refunded lifecycle no longer blocks selling the
        // instrument again (net-amount guard in create_sale_atomic).
        const resale = await expectJson(
          await postSale(page, `e2e-lifecycle-resale-${suffix}`, {
            ...saleBody,
            notes: `lifecycle resale ${suffix}`,
          }),
          201
        );
        expect(resale.data.id).not.toBe(sale.id);
        expect(resale.data.entry_kind).toBe('sale');
        expect((await readInstrument(page, instrumentId)).status).toBe('Sold');
        const afterResale = await listInstrumentSales(page, instrumentId);
        expect(afterResale.map(row => row.id).sort()).toEqual(
          [sale.id, refund!.id, resale.data.id as string].sort()
        );

        // The Sales page renders this ledger (sale, refund, resale) without
        // a same-origin API 5xx or pageerror (critical runtime guard).
        await page.goto('/sales', { waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
        await expect(
          page.getByRole('heading', { name: 'Sales', exact: true }).first()
        ).toBeVisible();
      });
    }
  );

  test(
    'refunds a sale from the sales ledger exactly once and keeps the instrument Sold',
    {
      tag: '@critical',
    },
    async ({ page }, testInfo) => {
      await withRouteCleanup(page, testInfo, async ({ register }) => {
        const suffix = uniqueSuffix();
        const price = 2400;

        const clientId = await createClient(page, suffix, 'Ledger');
        register(`/api/clients?id=${clientId}`);
        const instrumentId = await createInstrument(page, suffix, price);
        register(`/api/instruments?id=${instrumentId}`);

        const created = await expectJson(
          await postSale(page, `e2e-ledger-sale-${suffix}`, {
            instrument_id: instrumentId,
            client_id: clientId,
            sale_price: price,
            sale_date: todayIsoDate(),
            notes: `ledger sale ${suffix}`,
          }),
          201
        );
        const sale = created.data as SaleRow;
        expect((await readInstrument(page, instrumentId)).status).toBe('Sold');

        // Same request the Sales page refund button sends
        // (src/app/sales/hooks/useSalesHistory.ts refundSale).
        const refundRequest = {
          id: sale.id,
          sale_price: -price,
          notes: `ledger refund ${suffix}`,
        };
        const refunded = await expectJson(
          await page.request.patch('/api/sales', { data: refundRequest }),
          200
        );
        const refund = refunded.data as SaleRow;
        expect(refund.id).not.toBe(sale.id);
        expect(refund.entry_kind).toBe('refund');
        expect(refund.adjustment_of_sale_id).toBe(sale.id);
        expect(Number(refund.sale_price)).toBe(-price);

        // Replaying the refund returns the same refund row, not a second one.
        const replayed = await expectJson(
          await page.request.patch('/api/sales', { data: refundRequest }),
          200
        );
        expect(replayed.data.id).toBe(refund.id);

        const ledger = await listInstrumentSales(page, instrumentId);
        expect(ledger.map(row => row.id).sort()).toEqual(
          [sale.id, refund.id].sort()
        );

        // Current contract: the ledger refund records money only;
        // create_sale_adjustment_atomic never changes instruments.status.
        expect((await readInstrument(page, instrumentId)).status).toBe('Sold');
      });
    }
  );

  test(
    'hard-deletes a draft invoice and then reports it as missing',
    {
      tag: '@critical',
    },
    async ({ page }, testInfo) => {
      await withRouteCleanup(page, testInfo, async ({ register, release }) => {
        const suffix = uniqueSuffix();
        const invoiceDate = todayIsoDate();
        const amount = 900;

        const clientId = await createClient(page, suffix, 'Invoice');
        register(`/api/clients?id=${clientId}`);
        const instrumentId = await createInstrument(page, suffix, amount);
        register(`/api/instruments?id=${instrumentId}`);

        const created = await expectJson(
          await page.request.post('/api/invoices', {
            headers: { 'Idempotency-Key': `e2e-draft-invoice-${suffix}` },
            data: {
              client_id: clientId,
              invoice_date: invoiceDate,
              due_date: invoiceDate,
              subtotal: amount,
              tax: 0,
              total: amount,
              currency: 'USD',
              status: 'draft',
              notes: `draft invoice ${suffix}`,
              items: [
                {
                  instrument_id: instrumentId,
                  description: `Draft violin ${suffix}`,
                  qty: 1,
                  rate: amount,
                  amount,
                  image_url: null,
                  display_order: 0,
                },
              ],
            },
          }),
          201
        );
        const invoiceId = created.data.id as string;
        expect(invoiceId).toBeTruthy();
        const invoicePath = `/api/invoices/${invoiceId}`;
        register(invoicePath);

        // Only drafts are hard-deletable; prove that is what we created.
        const before = await expectJson(
          await page.request.get(invoicePath),
          200
        );
        expect(before.data.id).toBe(invoiceId);
        expect(before.data.status).toBe('draft');

        const deleted = await expectJson(
          await page.request.delete(invoicePath),
          200
        );
        expect(deleted.data.id).toBe(invoiceId);
        release(invoicePath);

        const after = await page.request.get(invoicePath);
        expect(after.status(), await after.text()).toBe(404);

        // A repeated delete stays a stable 404 rather than an error.
        const deletedAgain = await page.request.delete(invoicePath);
        expect(deletedAgain.status(), await deletedAgain.text()).toBe(404);
      });
    }
  );
});
