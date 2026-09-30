import { chromium, type Browser, type Page } from 'playwright';

import type { HostedActor } from '../auth-matrix/hosted-session';
import {
  assertItemAdminCsv,
  assertMemberExportBlocked,
  assertSalesAdminCsv,
} from './assertions';
import type { ExportCaseResult, ExportFixtureMarkers } from './constants';
import { EXPORT_E2E_KEEP_SALE_DATE } from './constants';

export type BrowserExportInput = {
  appBaseUrl: string;
  orgAAdmin: HostedActor;
  orgAMember: HostedActor;
  orgBAdmin: HostedActor;
  markers: ExportFixtureMarkers;
  reservedUserId: string;
  reservedConnectionId: string;
  keepSaleId: string;
};

function cookiePairs(
  cookieHeader: string
): Array<{ name: string; value: string }> {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        throw new Error('Synthetic session cookie is malformed.');
      }
      return {
        name: part.slice(0, separator),
        value: part.slice(separator + 1),
      };
    });
}

async function openSession(
  browser: Browser,
  appBaseUrl: string,
  actor: HostedActor,
  path: string
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'en-US',
  });
  const origin = new URL(appBaseUrl).origin;
  await context.addCookies(
    cookiePairs(actor.cookieHeader).map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      url: origin,
      secure: true,
      sameSite: 'Lax' as const,
    }))
  );
  const page = await context.newPage();
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login') || page.url().includes('/onboarding')) {
    throw new Error(
      `Synthetic ${actor.label} session did not reach ${path}. Landed on ${new URL(page.url()).pathname}.`
    );
  }
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

async function exportButton(page: Page) {
  return page.getByRole('button', { name: 'Export CSV' });
}

function itemSearch(page: Page) {
  return page.getByPlaceholder('Search items by maker, type, serial...');
}

function salesInstrumentLink(page: Page, maker: string) {
  return page.getByRole('link', { name: maker, exact: true });
}

async function readDownload(
  page: Page
): Promise<{ filename: string; text: string }> {
  const button = await exportButton(page);
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await button.click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error('Browser download did not produce a file stream.');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { filename, text: Buffer.concat(chunks).toString('utf8') };
}

export async function runBrowserExportCases(
  input: BrowserExportInput
): Promise<ExportCaseResult[]> {
  const browser = await chromium.launch({ headless: true });
  const results: ExportCaseResult[] = [];
  try {
    results.push(await itemAdmin(browser, input));
    results.push(await itemMember(browser, input));
    results.push(...(await salesAdminOrgA(browser, input)));
    results.push(await salesMember(browser, input));
    results.push(await salesAdminOrgB(browser, input));
  } finally {
    await browser.close();
  }
  return results;
}

async function itemAdmin(
  browser: Browser,
  input: BrowserExportInput
): Promise<ExportCaseResult> {
  const id = 'item-admin-ui';
  const session = await openSession(
    browser,
    input.appBaseUrl,
    input.orgAAdmin,
    '/dashboard'
  );
  try {
    await session.page.getByText(input.markers.keepSerial).waitFor({
      timeout: 45000,
    });
    await session.page.getByText(input.markers.dropSerial).waitFor({
      timeout: 45000,
    });
    if (await session.page.getByText(input.markers.orgBSerial).count()) {
      throw new Error('Org A dashboard rendered an Org B item.');
    }
    await itemSearch(session.page).fill(input.markers.searchToken);
    await session.page.getByText(input.markers.dropSerial).waitFor({
      state: 'hidden',
      timeout: 15000,
    });
    await session.page.getByText(input.markers.keepSerial).waitFor();
    const button = await exportButton(session.page);
    await button.waitFor();
    if (await button.isDisabled()) {
      throw new Error('Admin item export control stayed disabled.');
    }
    const artifact = await readDownload(session.page);
    assertItemAdminCsv({
      filename: artifact.filename,
      csv: artifact.text,
      markers: input.markers,
      reservedUserId: input.reservedUserId,
      reservedConnectionId: input.reservedConnectionId,
    });
    return {
      id,
      ok: true,
      detail: `downloaded ${artifact.filename}; filtered to the kept item`,
    };
  } catch (error) {
    return { id, ok: false, detail: errorMessage(error) };
  } finally {
    await session.close();
  }
}

async function itemMember(
  browser: Browser,
  input: BrowserExportInput
): Promise<ExportCaseResult> {
  const id = 'item-member-ui';
  const session = await openSession(
    browser,
    input.appBaseUrl,
    input.orgAMember,
    '/dashboard'
  );
  try {
    await session.page.getByText(input.markers.keepSerial).waitFor({
      timeout: 45000,
    });
    const button = await exportButton(session.page);
    const buttonCount = await button.count();
    const disabled = buttonCount === 1 ? await button.isDisabled() : null;
    const title = buttonCount === 1 ? await button.getAttribute('title') : null;
    const behavior = assertMemberExportBlocked({
      surface: 'item',
      buttonCount,
      disabled,
      title,
    });
    return {
      id,
      ok: true,
      detail: `item export control is ${behavior}`,
    };
  } catch (error) {
    return { id, ok: false, detail: errorMessage(error) };
  } finally {
    await session.close();
  }
}

async function applySalesDateFilter(page: Page): Promise<void> {
  await page.getByLabel('From date').fill(EXPORT_E2E_KEEP_SALE_DATE);
  const filtered = page.waitForResponse(
    response =>
      response.url().includes('/api/sales') &&
      response.url().includes('fromDate=2020-03-15') &&
      response.url().includes('toDate=2020-03-15') &&
      response.ok(),
    { timeout: 30000 }
  );
  await page.getByLabel('To date').fill(EXPORT_E2E_KEEP_SALE_DATE);
  await filtered;
}

async function salesAdminOrgA(
  browser: Browser,
  input: BrowserExportInput
): Promise<ExportCaseResult[]> {
  const session = await openSession(
    browser,
    input.appBaseUrl,
    input.orgAAdmin,
    '/sales'
  );
  try {
    await salesInstrumentLink(session.page, input.markers.keepMaker).waitFor({
      timeout: 45000,
    });
    if (
      await salesInstrumentLink(session.page, input.markers.orgBMaker).count()
    ) {
      throw new Error('Org A sales page rendered an Org B sale.');
    }
    await applySalesDateFilter(session.page);
    await salesInstrumentLink(session.page, input.markers.dropMaker).waitFor({
      state: 'hidden',
      timeout: 15000,
    });
    await session.page.getByText('Export KeepA', { exact: true }).waitFor({
      timeout: 20000,
    });
    const button = await exportButton(session.page);
    if (await button.isDisabled()) {
      throw new Error('Admin sales export control stayed disabled.');
    }
    const artifact = await readDownload(session.page);
    assertSalesAdminCsv({
      filename: artifact.filename,
      csv: artifact.text,
      markers: input.markers,
      keepSaleId: input.keepSaleId,
    });
    return [
      {
        id: 'sales-admin-ui',
        ok: true,
        detail: `downloaded ${artifact.filename}; date filter kept one sale`,
      },
      {
        id: 'isolation-org-a-csv',
        ok: true,
        detail: 'Org A CSV has no Org B markers',
      },
    ];
  } catch (error) {
    const detail = errorMessage(error);
    return [
      { id: 'sales-admin-ui', ok: false, detail },
      { id: 'isolation-org-a-csv', ok: false, detail },
    ];
  } finally {
    await session.close();
  }
}

async function salesAdminOrgB(
  browser: Browser,
  input: BrowserExportInput
): Promise<ExportCaseResult> {
  const id = 'isolation-org-b-csv';
  const session = await openSession(
    browser,
    input.appBaseUrl,
    input.orgBAdmin,
    '/sales'
  );
  try {
    await salesInstrumentLink(session.page, input.markers.orgBMaker).waitFor({
      timeout: 45000,
    });
    if (
      await salesInstrumentLink(session.page, input.markers.keepMaker).count()
    ) {
      throw new Error('Org B sales page rendered an Org A sale.');
    }
    await applySalesDateFilter(session.page);
    const button = await exportButton(session.page);
    if (await button.isDisabled()) {
      throw new Error('Org B sales export control stayed disabled.');
    }
    const artifact = await readDownload(session.page);
    if (!artifact.filename.endsWith('.csv')) {
      throw new Error('Org B sales export did not download a csv file.');
    }
    if (
      artifact.text.includes(input.markers.keepSaleNote) ||
      artifact.text.includes(input.markers.dropSaleNote) ||
      artifact.text.includes(input.markers.keepMaker)
    ) {
      throw new Error('Org B sales CSV contains Org A markers.');
    }
    if (!artifact.text.includes(input.markers.orgBSaleNote)) {
      throw new Error('Org B sales CSV is missing its own synthetic sale.');
    }
    return {
      id,
      ok: true,
      detail: `downloaded ${artifact.filename}; no Org A markers`,
    };
  } catch (error) {
    return { id, ok: false, detail: errorMessage(error) };
  } finally {
    await session.close();
  }
}

async function salesMember(
  browser: Browser,
  input: BrowserExportInput
): Promise<ExportCaseResult> {
  const id = 'sales-member-ui';
  const session = await openSession(
    browser,
    input.appBaseUrl,
    input.orgAMember,
    '/sales'
  );
  try {
    await salesInstrumentLink(session.page, input.markers.keepMaker).waitFor({
      timeout: 45000,
    });
    const button = await exportButton(session.page);
    if ((await button.count()) === 0) {
      return { id, ok: true, detail: 'sales export control is absent' };
    }
    await button.waitFor({ timeout: 15000 });
    await session.page.waitForFunction(
      () => {
        const match = [...document.querySelectorAll('button')].find(node =>
          node.textContent?.includes('Export CSV')
        );
        return match?.getAttribute('title') === 'Admin only';
      },
      undefined,
      { timeout: 20000 }
    );
    const behavior = assertMemberExportBlocked({
      surface: 'sales',
      buttonCount: await button.count(),
      disabled: await button.isDisabled(),
      title: await button.getAttribute('title'),
    });
    return { id, ok: true, detail: `sales export control is ${behavior}` };
  } catch (error) {
    return { id, ok: false, detail: errorMessage(error) };
  } finally {
    await session.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Export browser case failed.';
}
