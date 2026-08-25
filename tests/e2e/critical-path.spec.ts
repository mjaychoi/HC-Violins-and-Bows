import { expect, test, type APIResponse, type Page } from '@playwright/test';
import * as fs from 'fs';

import {
  ADMIN_AUTH_STATE_PATH,
  MEMBER_AUTH_STATE_PATH,
  getE2EAdminIdentity,
} from './e2e-identities';
import {
  assertCookieBackedAuth,
  waitForPageLoad,
  waitForStable,
} from './test-helpers';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function clientCreatePayload(options: {
  firstName: string;
  lastName: string;
  email: string;
  note: string;
}) {
  return {
    first_name: options.firstName,
    last_name: options.lastName,
    email: options.email,
    contact_number: null,
    tags: ['E2E-CRITICAL'],
    interest: 'Critical path',
    note: options.note,
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function expectOkJson(response: APIResponse) {
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body);
}

async function cleanup(page: Page, paths: string[]) {
  for (const requestPath of paths.reverse()) {
    await page.request.delete(requestPath).catch(() => undefined);
  }
}

test.describe('Critical path', () => {
  test.describe('unauthenticated session', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test(
      'redirects unauthenticated users away from protected pages',
      {
        tag: '@critical',
      },
      async ({ page }) => {
        await page.goto('/dashboard', {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await waitForPageLoad(page, 15000, { skipNetworkIdle: true });

        const url = new URL(page.url());
        expect(url.pathname).toBe('/');
        expect(url.searchParams.get('next')).toBeTruthy();
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(
          page.getByRole('button', { name: /sign in/i })
        ).toBeVisible();
      }
    );

    test(
      'rejects unauthenticated API access',
      {
        tag: '@critical',
      },
      async ({ page }) => {
        const response = await page.request.get('/api/clients?limit=1');
        expect(response.status()).toBe(401);
      }
    );

    test(
      'logs in with valid credentials and keeps the session',
      {
        tag: '@critical',
      },
      async ({ page }) => {
        const identity = getE2EAdminIdentity();

        await page.goto('/', {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await waitForPageLoad(page, 15000, { skipNetworkIdle: true });

        await page.getByLabel(/email/i).fill(identity.email);
        await page.getByLabel(/password/i).fill(identity.password);
        await page.getByRole('button', { name: /sign in/i }).click();

        await page.waitForURL(/\/dashboard/, { timeout: 20000 });
        await expect(
          page.getByRole('heading', { name: /dashboard/i }).first()
        ).toBeVisible();
        await assertCookieBackedAuth(page);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 15000, { skipNetworkIdle: true });
        await expect(page).toHaveURL(/\/dashboard/);
        await assertCookieBackedAuth(page);
        expect((await page.request.get('/api/clients?limit=1')).status()).toBe(
          200
        );
      }
    );
  });

  test.describe('authenticated admin', () => {
    test.use({ storageState: ADMIN_AUTH_STATE_PATH });

    test(
      'creates, reads, updates, and deletes a client',
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
        const firstName = `Crit ${suffix}`;
        const createResponse = await page.request.post('/api/clients', {
          data: clientCreatePayload({
            firstName,
            lastName: 'Path',
            email: `crit-${suffix}@example.com`,
            note: suffix,
          }),
        });
        const created = await expectOkJson(createResponse);
        const client = created.data as {
          id: string;
          first_name: string;
          last_name: string;
          updated_at: string;
        };
        expect(client.id).toBeTruthy();
        const cleanupPaths = [`/api/clients?id=${client.id}`];

        try {
          const readResponse = await page.request.get(
            `/api/clients?search=${encodeURIComponent(suffix)}`
          );
          const readJson = await expectOkJson(readResponse);
          const persisted = (readJson.data as Array<{ id: string }>).find(
            row => row.id === client.id
          );
          expect(persisted).toBeTruthy();

          await page.goto('/clients', { waitUntil: 'domcontentloaded' });
          await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
          await expect(page.getByText(firstName).first()).toBeVisible();

          const updatedName = `Updated ${suffix}`;
          const patchResponse = await page.request.patch('/api/clients', {
            data: {
              id: client.id,
              first_name: updatedName,
              expected_updated_at: client.updated_at,
            },
          });
          const patched = await expectOkJson(patchResponse);
          expect(patched.data.first_name).toBe(updatedName);

          await page.reload({ waitUntil: 'domcontentloaded' });
          await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
          await expect(page.getByText(updatedName).first()).toBeVisible();

          const deleteResponse = await page.request.delete(
            `/api/clients?id=${client.id}`
          );
          expect(deleteResponse.ok(), await deleteResponse.text()).toBe(true);
          cleanupPaths.length = 0;

          const afterDelete = await expectOkJson(
            await page.request.get(
              `/api/clients?search=${encodeURIComponent(suffix)}`
            )
          );
          expect(
            (afterDelete.data as Array<{ id: string }>).some(
              row => row.id === client.id
            )
          ).toBe(false);
        } finally {
          await cleanup(page, cleanupPaths);
        }
      }
    );

    test(
      'creates a sale and invoice, then updates and opens the invoice',
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
        const saleDate = todayIsoDate();
        const cleanupPaths: string[] = [];

        try {
          const clientJson = await expectOkJson(
            await page.request.post('/api/clients', {
              data: clientCreatePayload({
                firstName: `Sale ${suffix}`,
                lastName: 'Client',
                email: `sale-${suffix}@example.com`,
                note: suffix,
              }),
            })
          );
          const clientId = clientJson.data.id as string;
          cleanupPaths.push(`/api/clients?id=${clientId}`);

          const instrumentJson = await expectOkJson(
            await page.request.post('/api/instruments', {
              data: {
                type: 'Violin',
                maker: `Critical Path ${suffix}`,
                year: 2026,
                price: 1500,
                status: 'Available',
                ownership: 'owned',
                note: suffix,
              },
            })
          );
          const instrumentId = instrumentJson.data.id as string;
          cleanupPaths.push(`/api/instruments?id=${instrumentId}`);

          const saleResponse = await page.request.post('/api/sales', {
            headers: { 'Idempotency-Key': `e2e-sale-${suffix}` },
            data: {
              instrument_id: instrumentId,
              client_id: clientId,
              sale_price: 1500,
              sale_date: saleDate,
              notes: `critical sale ${suffix}`,
            },
          });
          const saleJson = await expectOkJson(saleResponse);
          expect(saleResponse.status()).toBe(201);
          const saleId = saleJson.data.id as string;
          expect(saleId).toBeTruthy();

          const salesList = await expectOkJson(
            await page.request.get('/api/sales?pageSize=50')
          );
          expect(
            (salesList.data as Array<{ id: string }>).some(
              row => row.id === saleId
            )
          ).toBe(true);

          await page.goto('/sales', { waitUntil: 'domcontentloaded' });
          await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
          await expect(
            page.getByRole('heading', { name: 'Sales', exact: true }).first()
          ).toBeVisible();

          const invoiceResponse = await page.request.post('/api/invoices', {
            headers: { 'Idempotency-Key': `e2e-invoice-${suffix}` },
            data: {
              client_id: clientId,
              invoice_date: saleDate,
              due_date: saleDate,
              subtotal: 1500,
              tax: 0,
              total: 1500,
              currency: 'USD',
              status: 'draft',
              notes: `critical invoice ${suffix}`,
              items: [
                {
                  instrument_id: instrumentId,
                  description: `Critical violin ${suffix}`,
                  qty: 1,
                  rate: 1500,
                  amount: 1500,
                  image_url: null,
                  display_order: 0,
                },
              ],
            },
          });
          const invoiceCreated = await expectOkJson(invoiceResponse);
          expect(invoiceResponse.status()).toBe(201);
          const invoiceId = invoiceCreated.data.id as string;
          cleanupPaths.push(`/api/invoices/${invoiceId}`);

          const invoiceGet = await expectOkJson(
            await page.request.get(`/api/invoices/${invoiceId}`)
          );
          expect(invoiceGet.data.id).toBe(invoiceId);
          expect(invoiceGet.data.notes).toContain(suffix);

          await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
          await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
          await waitForStable(page, 500);
          const invoiceNumber = invoiceGet.data.invoice_number as
            | string
            | undefined;
          if (invoiceNumber) {
            await expect(page.getByText(invoiceNumber).first()).toBeVisible();
          }

          const updatedNotes = `updated invoice ${suffix}`;
          const invoicePut = await expectOkJson(
            await page.request.put(`/api/invoices/${invoiceId}`, {
              headers: { 'Idempotency-Key': `e2e-invoice-update-${suffix}` },
              data: {
                notes: updatedNotes,
                updated_at: invoiceGet.data.updated_at,
              },
            })
          );
          expect(invoicePut.data.notes).toBe(updatedNotes);

          const pdfResponse = await page.request.get(
            `/api/invoices/${invoiceId}/pdf`,
            { timeout: 30000 }
          );
          expect(
            pdfResponse.status(),
            await pdfResponse.text().catch(() => '')
          ).toBe(200);
          const contentType = pdfResponse.headers()['content-type'] || '';
          expect(contentType).toMatch(/pdf|octet-stream/i);
        } finally {
          await cleanup(page, cleanupPaths);
        }
      }
    );

    // Must stay after admin API tests: default signOut() is global and
    // revokes the shared admin storageState session.
    test(
      'persists the authenticated dashboard session and can log out',
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
        await expect(
          page.getByRole('heading', { name: /dashboard/i }).first()
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: /sign out/i })
        ).toBeVisible();

        await page.getByRole('button', { name: /sign out/i }).click();
        await page.waitForURL(url => new URL(url).pathname === '/', {
          timeout: 20000,
        });
        await expect(page.getByLabel(/email/i)).toBeVisible();
        expect((await page.request.get('/api/clients?limit=1')).status()).toBe(
          401
        );
      }
    );
  });

  test.describe('member authorization', () => {
    test.use({ storageState: MEMBER_AUTH_STATE_PATH });

    test(
      'denies a member from creating a sale',
      {
        tag: '@critical',
      },
      async ({ page }) => {
        expect(
          fs.existsSync(MEMBER_AUTH_STATE_PATH),
          `Missing member auth state at ${MEMBER_AUTH_STATE_PATH}. Critical E2E requires a seeded member user.`
        ).toBe(true);
        await assertCookieBackedAuth(page);

        const response = await page.request.post('/api/sales', {
          headers: { 'Idempotency-Key': `e2e-member-denied-${uniqueSuffix()}` },
          data: {
            instrument_id: '00000000-0000-4000-8000-000000000001',
            sale_price: 100,
            sale_date: todayIsoDate(),
          },
        });
        const body = await response.text();
        expect(response.status(), body).toBe(403);
        expect(body).toMatch(/ADMIN_REQUIRED|Admin role required/i);
      }
    );
  });
});
