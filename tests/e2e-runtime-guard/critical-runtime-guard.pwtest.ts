/**
 * Real-browser regression proof for the critical E2E runtime guard.
 *
 * Runs under playwright.runtime-guard.config.ts: no web server, no Supabase,
 * no auth state. Every request to the fake app origin and the fake external
 * origin is fulfilled by context.route(), so nothing leaves the runner and no
 * staging/production API is ever made to fail.
 */
import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { installCriticalRuntimeGuard } from '../e2e/critical-runtime-guard';
import { test as criticalTest } from '../e2e/critical-test';

const APP_ORIGIN = 'http://app.runtime-guard.test';
const EXTERNAL_ORIGIN = 'https://cdn.runtime-guard.test';

/**
 * /api/status/<code>  → JSON response with that status (same origin)
 * /page?bg=<urls>     → HTML page that fires background fetches on load,
 *                       mimicking RootProviders/DataInitializer
 * external origin     → always 500
 */
async function routeFakeApp(context: BrowserContext) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === EXTERNAL_ORIGIN) {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        headers: { 'access-control-allow-origin': '*' },
        body: 'external failure',
      });
      return;
    }
    if (url.origin !== APP_ORIGIN) {
      await route.abort();
      return;
    }
    const statusMatch = url.pathname.match(/^\/api\/status\/(\d{3})$/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'x-request-id': `req-${status}` },
        body: JSON.stringify({
          message: `forced ${status}`,
          error_code: 'FORCED',
        }),
      });
      return;
    }
    if (url.pathname === '/page') {
      const background = JSON.stringify(url.searchParams.getAll('bg'));
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><body><h1>Dashboard</h1>
<script>
  window.__bgDone = Promise.all(${background}.map(u => fetch(u).catch(() => null)));
</script></body></html>`,
      });
      return;
    }
    await route.fulfill({ status: 404, body: 'not found' });
  });
}

function pageUrl(background: string[]) {
  const params = new URLSearchParams();
  for (const url of background) params.append('bg', url);
  return `${APP_ORIGIN}/page?${params.toString()}`;
}

async function loadWithBackground(page: Page, background: string[]) {
  const seen: string[] = [];
  page.on('response', response => seen.push(response.url()));
  await page.goto(pageUrl(background));
  await page.evaluate(
    () => (window as unknown as { __bgDone: Promise<unknown> }).__bgDone
  );
  // Prove the browser really observed every background response, so an empty
  // failure list means "ignored", not "never seen".
  for (const url of background) {
    await expect.poll(() => seen.includes(url)).toBe(true);
  }
}

const test = base.extend({
  context: async ({ context }, runTest) => {
    await routeFakeApp(context);
    await runTest(context);
  },
});

test.describe('installCriticalRuntimeGuard in a real browser', () => {
  for (const status of [401, 403, 404, 409]) {
    test(`ignores background same-origin /api ${status}`, async ({ page }) => {
      const guard = installCriticalRuntimeGuard(page, {
        appOrigin: APP_ORIGIN,
      });
      try {
        await loadWithBackground(page, [`${APP_ORIGIN}/api/status/${status}`]);
        expect(guard.failures).toEqual([]);
        await guard.assertClean();
      } finally {
        guard.dispose();
      }
    });
  }

  test('ignores an external 500', async ({ page }) => {
    const guard = installCriticalRuntimeGuard(page, { appOrigin: APP_ORIGIN });
    try {
      await loadWithBackground(page, [`${EXTERNAL_ORIGIN}/logo.png`]);
      expect(guard.failures).toEqual([]);
      await guard.assertClean();
    } finally {
      guard.dispose();
    }
  });

  test('ignores console.error', async ({ page }) => {
    const guard = installCriticalRuntimeGuard(page, { appOrigin: APP_ORIGIN });
    try {
      await loadWithBackground(page, []);
      const logged = page.waitForEvent(
        'console',
        msg => msg.type() === 'error'
      );
      await page.evaluate(() => console.error('harmless dependency noise'));
      await logged;
      await guard.assertClean();
    } finally {
      guard.dispose();
    }
  });

  test('fails on a background same-origin /api 500 (PR #151 shape)', async ({
    page,
  }) => {
    const guard = installCriticalRuntimeGuard(page, { appOrigin: APP_ORIGIN });
    try {
      await loadWithBackground(page, [
        `${APP_ORIGIN}/api/status/401`,
        `${APP_ORIGIN}/api/status/500`,
        `${EXTERNAL_ORIGIN}/logo.png`,
      ]);
      // The page itself rendered fine — exactly the blind spot.
      await expect(
        page.getByRole('heading', { name: 'Dashboard' })
      ).toBeVisible();
      expect(guard.failures).toEqual([
        expect.objectContaining({
          type: 'api-5xx',
          status: 500,
          method: 'GET',
          url: '/api/status/500',
          requestId: 'req-500',
        }),
      ]);
      const error = await guard.assertClean().then(
        () => null,
        (e: Error) => e
      );
      expect(error?.message).toContain(
        'Unexpected same-origin API 500:\n  GET /api/status/500'
      );
      expect(error?.message).toContain('FORCED');
    } finally {
      guard.dispose();
    }
  });

  test('fails on a pageerror', async ({ page }) => {
    const guard = installCriticalRuntimeGuard(page, { appOrigin: APP_ORIGIN });
    try {
      await loadWithBackground(page, []);
      const thrown = page.waitForEvent('pageerror');
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('render exploded');
        }, 0);
      });
      await thrown;
      expect(guard.failures).toEqual([
        expect.objectContaining({
          type: 'pageerror',
          message: 'Error: render exploded',
        }),
      ]);
      await expect(guard.assertClean()).rejects.toThrow(
        /pageerror: 1[\s\S]*render exploded/
      );
    } finally {
      guard.dispose();
    }
  });
});

/**
 * End-to-end wiring: the same `test` export critical-path.spec.ts uses. Each
 * body below passes on its own (it checks the guard's recorded state), so the
 * only way the attempt can fail is the fixture's teardown assertion.
 */
const wiredTest = criticalTest.extend({
  baseURL: APP_ORIGIN,
  context: async ({ context }, runTest) => {
    await routeFakeApp(context);
    await runTest(context);
  },
});

wiredTest.describe('critical-test fixture', () => {
  wiredTest(
    'passes a test whose page only sees expected 4xx',
    async ({ page, criticalRuntimeGuard }) => {
      await loadWithBackground(page, [
        `${APP_ORIGIN}/api/status/401`,
        `${APP_ORIGIN}/api/status/403`,
        `${APP_ORIGIN}/api/status/404`,
        `${APP_ORIGIN}/api/status/409`,
        `${EXTERNAL_ORIGIN}/logo.png`,
      ]);
      expect(criticalRuntimeGuard.failures).toEqual([]);
    }
  );

  wiredTest(
    'fails a test whose assertions pass but whose page hit /api 500',
    async ({ page, criticalRuntimeGuard }) => {
      wiredTest.fail(true, 'runtime guard must fail this attempt');
      await loadWithBackground(page, [`${APP_ORIGIN}/api/status/500`]);
      await expect(
        page.getByRole('heading', { name: 'Dashboard' })
      ).toBeVisible();
      expect(criticalRuntimeGuard.failures).toHaveLength(1);
    }
  );

  wiredTest(
    'fails a test whose assertions pass but whose page threw',
    async ({ page, criticalRuntimeGuard }) => {
      wiredTest.fail(true, 'runtime guard must fail this attempt');
      await loadWithBackground(page, []);
      const thrown = page.waitForEvent('pageerror');
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('render exploded');
        }, 0);
      });
      await thrown;
      expect(criticalRuntimeGuard.failures).toHaveLength(1);
    }
  );

  wiredTest(
    'starts each test with an empty failure list',
    async ({ criticalRuntimeGuard }) => {
      // Runs after the failing tests above in the same worker; must not inherit.
      expect(criticalRuntimeGuard.failures).toEqual([]);
    }
  );
});
