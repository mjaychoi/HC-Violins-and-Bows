import { defineConfig, devices } from '@playwright/test';

/**
 * Self-test for the critical E2E runtime guard (tests/e2e/critical-runtime-guard.ts).
 * Fully offline: no web server, no global setup, no auth state, no Supabase.
 * All requests are fulfilled by page/context routes inside the tests.
 */
export default defineConfig({
  testDir: './tests/e2e-runtime-guard',
  testMatch: '**/*.pwtest.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  timeout: 30000,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
