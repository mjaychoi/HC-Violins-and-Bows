import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run global setup before all tests */
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Use saved authentication state (login once, reuse for all tests) */
    storageState: 'tests/e2e/.auth/user.json',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Default timeout for actions (click, fill, etc.) */
    actionTimeout: 15000,

    /* Default timeout for navigation */
    navigationTimeout: 30000,
  },

  /* Global test timeout */
  timeout: 60000, // 60 seconds for all tests (increased from default 30s)

  /* Expect timeout */
  expect: {
    timeout: 10000, // 10 seconds for assertions (reduced from default 5s, but more reasonable)
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        /* Mobile Chrome needs longer timeouts due to mobile rendering */
        actionTimeout: 20000,
        navigationTimeout: 45000,
      },
      /* Mobile Chrome tests need more time */
      timeout: 90000, // 90 seconds for Mobile Chrome
      /* Mobile Chrome: expect timeout also increased */
      expect: {
        timeout: 15000, // 15 seconds for assertions on Mobile Chrome
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        /* Mobile Safari needs longer timeouts due to slower rendering */
        actionTimeout: 20000,
        navigationTimeout: 45000,
        /* Collect trace on failure for Mobile Safari to debug timeout issues */
        trace: 'retain-on-failure',
      },
      /* Mobile Safari tests need more time */
      timeout: 90000, // 90 seconds for Mobile Safari
      /* Mobile Safari: expect timeout also increased */
      expect: {
        timeout: 15000, // 15 seconds for assertions on Mobile Safari
      },
      /* Mobile Safari: Run only smoke tests (key functionality) to avoid timeout issues */
      /* Uncomment the testMatch line below to run only smoke tests on Mobile Safari */
      // testMatch: /smoke|critical|essential/i,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // Always reuse existing server
    timeout: 120 * 1000, // 2 minutes timeout
  },
});
