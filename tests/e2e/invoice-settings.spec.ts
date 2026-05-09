import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated, waitForPageLoad } from './test-helpers';

const SETTINGS_PATH = '/settings/invoice';
const SETTINGS_API_PATTERN = /\/api\/invoices\/invoice_settings/;

async function openInvoiceSettings(page: Page) {
  await ensureAuthenticated(page);
  const responsePromise = page.waitForResponse(
    response => SETTINGS_API_PATTERN.test(response.url()),
    { timeout: 15000 }
  );

  await page.goto(SETTINGS_PATH, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

  return responsePromise.catch(() => null);
}

test.describe('Invoice settings E2E', () => {
  test('loads settings/default state without generic failure', async ({
    page,
  }) => {
    const response = await openInvoiceSettings(page);
    const responseBody = response ? await response.text().catch(() => '') : '';

    expect(
      response,
      responseBody || 'No invoice settings response'
    ).not.toBeNull();
    expect(response?.status(), responseBody).toBe(200);
    expect(responseBody).toContain('"data"');

    await expect(
      page.getByText('Failed to load invoice settings')
    ).not.toBeVisible();
    await expect(
      page.getByText('An error occurred. Please try again.')
    ).not.toBeVisible();
    await expect(page.getByLabel('Business name')).toBeVisible();
    await expect(page.getByLabel('Default currency')).toBeVisible();
  });

  test('saves settings and preserves them after reload', async ({ page }) => {
    await openInvoiceSettings(page);

    const uniqueBusinessName = `E2E Invoice Settings ${Date.now()}`;
    await page.getByLabel('Business name').fill(uniqueBusinessName);
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/Invoice settings saved/i)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

    await expect(page.getByLabel('Business name')).toHaveValue(
      uniqueBusinessName
    );
    await expect(
      page.getByText('Failed to load invoice settings')
    ).not.toBeVisible();
  });

  test('renders default state when settings API returns null data', async ({
    page,
  }) => {
    await ensureAuthenticated(page);
    await page.route(SETTINGS_API_PATTERN, route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, success: true }),
        });
      }

      return route.continue();
    });

    await page.goto(SETTINGS_PATH, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

    await expect(page.getByLabel('Default currency')).toHaveValue('USD');
    await expect(
      page.getByText('Failed to load invoice settings')
    ).not.toBeVisible();
  });

  test('malformed settings response shows useful inline error without crashing', async ({
    page,
  }) => {
    await ensureAuthenticated(page);
    await page.route(SETTINGS_API_PATTERN, route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: {} }),
        });
      }

      return route.continue();
    });

    await page.goto(SETTINGS_PATH, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 20000, { skipNetworkIdle: true });

    await expect(
      page.getByText('Failed to load invoice settings')
    ).toBeVisible();
    await expect(
      page.getByText(/unexpected response|expected data/i)
    ).toBeVisible();
  });

  test('unauthenticated user does not see a misleading invoice settings failure', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto(SETTINGS_PATH, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 10000, { skipNetworkIdle: true });

    await expect(
      page.getByText('Failed to load invoice settings')
    ).not.toBeVisible();
    await expect(
      page.getByText('An error occurred. Please try again.')
    ).not.toBeVisible();

    await context.close();
  });
});
