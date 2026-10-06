import { test as base, expect } from '@playwright/test';

import {
  installCriticalRuntimeGuard,
  type CriticalRuntimeGuard,
} from './critical-runtime-guard';

/**
 * Playwright `test` for critical specs: every test gets its own runtime guard
 * (see critical-runtime-guard.ts) through an auto fixture.
 *
 * Lifecycle per test: install listeners on the test's page before the body
 * runs → test body (and afterEach hooks) → assert collected failures in
 * fixture teardown, which runs before the page fixture is closed → detach
 * listeners. State lives in the fixture closure, so nothing leaks between
 * tests or retries. A failed assertion here fails that attempt; Playwright's
 * normal retry semantics apply on top.
 */
export const test = base.extend<{
  criticalRuntimeGuard: CriticalRuntimeGuard;
}>({
  criticalRuntimeGuard: [
    async ({ page, baseURL }, use, testInfo) => {
      if (!baseURL) {
        throw new Error(
          'Critical runtime guard requires a baseURL to identify same-origin /api requests.'
        );
      }
      const guard = installCriticalRuntimeGuard(page, { appOrigin: baseURL });
      try {
        await use(guard);
        await guard.assertClean();
        console.log(
          `[critical-runtime-guard] ${testInfo.title}: unexpected same-origin API 5xx: 0, pageerror: 0`
        );
      } finally {
        guard.dispose();
      }
    },
    { auto: true },
  ],
});

export { expect };
