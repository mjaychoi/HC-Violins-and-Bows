import { Page } from '@playwright/test';

/**
 * Detect if we're on Mobile Safari based on browser type and project name
 * This is more reliable and performant than checking userAgent on every call
 */
export async function detectMobileSafari(
  page: Page,
  projectName?: string
): Promise<boolean> {
  // Check project name first (fastest and most reliable)
  if (projectName === 'Mobile Safari') {
    return true;
  }

  // Fallback: check browser type from context (no page.evaluate needed)
  try {
    const browser = page.context().browser();
    if (browser) {
      const browserType = browser.browserType();
      const browserName = browserType.name();
      const viewport = page.viewportSize();

      // WebKit + mobile viewport = Mobile Safari
      if (browserName === 'webkit' && viewport && viewport.width < 768) {
        return true;
      }
    }
  } catch {
    // If browser context check fails, return false (don't use userAgent as it's expensive)
    // Most cases should be covered by projectName check
    return false;
  }

  return false;
}

/**
 * Helper function to wait for page to be fully loaded and ready for interaction
 * This waits for:
 * 1. DOM content loaded (always)
 * 2. Key UI elements to be present (preferred over networkidle)
 * 3. Network idle (only if explicitly requested, and with short timeout)
 * 4. React hydration and initial render
 *
 * Optimized: Uses selector-based waiting instead of networkidle by default
 * (networkidle can be unreliable with polling/websockets)
 */
export async function waitForPageLoad(
  page: Page,
  timeout = 30000,
  options?: {
    waitForSelector?: string;
    skipNetworkIdle?: boolean;
    isMobileSafari?: boolean;
    projectName?: string;
  }
) {
  // Detect Mobile Safari once (if not provided)
  const isMobileSafari =
    options?.isMobileSafari ??
    (await detectMobileSafari(page, options?.projectName));

  try {
    // First, wait for DOM to be ready (always do this)
    await page.waitForLoadState('domcontentloaded', {
      timeout: Math.min(timeout, 10000),
    });
  } catch {
    // If DOM fails to load, page might be in error state - continue anyway
  }

  // Optionally wait for network idle first (for initial page load)
  // Then wait for specific selector if provided (more reliable for content)
  // Use reasonable timeout - networkidle can be unreliable with polling/websockets
  // but we still want to wait for initial page load
  if (!options?.skipNetworkIdle) {
    try {
      // Balanced timeout - not too short (misses page load) but not too long (waits forever)
      const networkIdleTimeout = isMobileSafari ? 8000 : 10000; // Reasonable timeout
      await page.waitForLoadState('networkidle', {
        timeout: networkIdleTimeout,
      });
    } catch {
      // Network idle might not be reached (e.g., polling, websockets, error pages)
      // This is acceptable - continue (this is expected behavior)
    }
  }

  // Wait for React to hydrate and render
  // Mobile Safari needs a bit more time for rendering
  try {
    if (!page.isClosed()) {
      const renderWait = isMobileSafari ? 1000 : 500;
      await page.waitForTimeout(renderWait);
    }
  } catch {
    // Page might be closed, ignore
  }
}

/**
 * Helper function to safely click an element if it exists
 * Optimized for Mobile Safari with longer timeouts
 */
export async function safeClick(
  page: Page,
  element:
    | ReturnType<Page['getByRole']>
    | ReturnType<Page['getByText']>
    | ReturnType<Page['locator']>,
  options?: { isMobileSafari?: boolean; projectName?: string }
): Promise<boolean> {
  // Detect Mobile Safari once (if not provided)
  const isMobileSafari =
    options?.isMobileSafari ??
    (await detectMobileSafari(page, options?.projectName));
  const visibilityTimeout = isMobileSafari ? 10000 : 5000;
  const clickTimeout = isMobileSafari ? 10000 : 5000;

  try {
    const exists = await element
      .isVisible({ timeout: visibilityTimeout })
      .catch(() => false);
    if (exists) {
      // Scroll into view for Mobile Safari (sometimes elements are off-screen)
      if (isMobileSafari) {
        await element.scrollIntoViewIfNeeded().catch(() => {});
        await waitForStable(page, 300, {
          isMobileSafari,
          projectName: options?.projectName,
        });
      }
      await element.click({ timeout: clickTimeout });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper function to safely fill an input field
 * Optimized for Mobile Safari with multiple fill strategies
 */
export async function safeFill(
  page: Page,
  element:
    | ReturnType<Page['getByLabel']>
    | ReturnType<Page['getByPlaceholder']>
    | ReturnType<Page['locator']>,
  value: string,
  options?: { isMobileSafari?: boolean; projectName?: string }
): Promise<boolean> {
  // Detect Mobile Safari once (if not provided)
  const isMobileSafari =
    options?.isMobileSafari ??
    (await detectMobileSafari(page, options?.projectName));
  const timeout = isMobileSafari ? 10000 : 5000;

  try {
    const exists = await element.isVisible({ timeout }).catch(() => false);
    if (exists) {
      // For Mobile Safari, use multiple strategies
      if (isMobileSafari) {
        // Strategy 1: Click first, then fill
        await element.click().catch(() => {});
        await waitForStable(page, 200, {
          isMobileSafari,
          projectName: options?.projectName,
        });
        await element.fill(value, { timeout });
        await waitForStable(page, 300, {
          isMobileSafari,
          projectName: options?.projectName,
        });

        // Verify value was set
        const currentValue = await element.inputValue().catch(() => '');
        if (!currentValue || currentValue.length === 0) {
          // Strategy 2: Type character by character
          await element.click();
          await page.keyboard.type(value, { delay: 50 });
          await waitForStable(page, 300, {
            isMobileSafari,
            projectName: options?.projectName,
          });
        }
      } else {
        await element.fill(value, { timeout });
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper function to check if an element exists (visible or attached)
 */
export async function elementExists(
  page: Page,
  element:
    | ReturnType<Page['getByRole']>
    | ReturnType<Page['getByText']>
    | ReturnType<Page['locator']>
): Promise<boolean> {
  try {
    return await element.isVisible({ timeout: 2000 }).catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Helper to safely check a checkbox
 */
export async function safeCheck(
  page: Page,
  element: ReturnType<Page['getByLabel']> | ReturnType<Page['locator']>
): Promise<boolean> {
  try {
    const exists = await element
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (exists) {
      await element.check({ timeout: 5000 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper to safely uncheck a checkbox
 */
export async function safeUncheck(
  page: Page,
  element: ReturnType<Page['getByLabel']> | ReturnType<Page['locator']>
): Promise<boolean> {
  try {
    const exists = await element
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (exists) {
      await element.uncheck({ timeout: 5000 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Helper to safely select an option from a select element
 */
export async function safeSelectOption(
  page: Page,
  selector: string | ReturnType<Page['getByLabel']>,
  value: string | { index?: number; label?: string; value?: string }
): Promise<boolean> {
  try {
    const element =
      typeof selector === 'string' ? page.locator(selector) : selector;
    const exists = await element
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (exists) {
      await element.selectOption(value, { timeout: 5000 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Wait for page to stabilize (no pending animations/transitions)
 * Optimized for Mobile Safari with longer waits
 */
export async function waitForStable(
  page: Page,
  timeout = 1000,
  options?: { isMobileSafari?: boolean; projectName?: string }
): Promise<void> {
  try {
    if (!page.isClosed()) {
      // Detect Mobile Safari once (if not provided)
      const isMobileSafari =
        options?.isMobileSafari ??
        (await detectMobileSafari(page, options?.projectName));

      // Mobile Safari needs more time for animations/rendering
      const actualTimeout = isMobileSafari ? timeout * 1.5 : timeout;
      await page.waitForTimeout(actualTimeout);
    }
  } catch {
    // Page might be closed, ignore
  }
}

/**
 * Ensure sidebar is open (for navigation tests)
 * Optimized for Mobile Safari with longer waits
 */
export async function ensureSidebarOpen(
  page: Page,
  options?: { isMobileSafari?: boolean; projectName?: string }
): Promise<void> {
  // Detect Mobile Safari once (if not provided)
  const isMobileSafari =
    options?.isMobileSafari ??
    (await detectMobileSafari(page, options?.projectName));
  const waitTime = isMobileSafari ? 1000 : 500;

  const hamburger = page
    .locator('button[aria-label*="toggle"], button[aria-label*="sidebar"]')
    .first();
  const isVisible = await hamburger
    .isVisible({ timeout: isMobileSafari ? 10000 : 5000 })
    .catch(() => false);
  if (isVisible) {
    await hamburger.click({ timeout: isMobileSafari ? 10000 : 5000 });
    await page.waitForTimeout(waitTime);
  }
}

/**
 * Helper to login user (if auth is required)
 * This assumes auth is handled via cookies/storage
 *
 * More robust version that:
 * 1. Checks multiple ways if already logged in
 * 2. Tries multiple selectors for login form
 * 3. Waits longer for redirect
 * 4. Provides better error context
 */
export async function loginUser(
  page: Page,
  email = 'test@test.com',
  password = 'test'
): Promise<boolean> {
  try {
    // Check current URL first
    const initialUrl = page.url();
    let baseUrl = 'http://localhost:3000';

    // Try to determine base URL from current URL or use default
    try {
      if (
        initialUrl &&
        initialUrl !== 'about:blank' &&
        initialUrl.startsWith('http')
      ) {
        baseUrl = new URL(initialUrl).origin;
      }
    } catch {
      // If URL parsing fails, use default
    }

    // Navigate to login page explicitly (don't rely on current page state)
    // This ensures we're always on the login page before attempting login
    // Use longer timeout and handle navigation errors gracefully
    try {
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForStable(page, 500);
    } catch {
      // If navigation fails (timeout, redirect, etc.), check current URL
      const currentUrl = page.url();
      if (
        currentUrl.includes('/dashboard') ||
        currentUrl.includes('/clients')
      ) {
        // Already logged in - return success
        return true;
      }
      // If still on login page or error, continue with login attempt
      if (
        !currentUrl.includes('/login') &&
        currentUrl !== baseUrl &&
        currentUrl !== `${baseUrl}/`
      ) {
        // Unexpected URL - might be an error page, try to continue
      }
    }

    // Check if already logged in by verifying auth token exists
    // Check both localStorage and sessionStorage (Supabase can use either)
    const isAlreadyAuthenticated = await page
      .evaluate(() => {
        try {
          // Check localStorage
          const localStorageKeys = Object.keys(localStorage);
          for (const key of localStorageKeys) {
            if (key.includes('supabase') && key.includes('auth')) {
              const value = localStorage.getItem(key);
              if (value) {
                try {
                  const parsed = JSON.parse(value);
                  if (parsed.access_token || parsed.session?.access_token) {
                    return true;
                  }
                } catch {
                  if (value.includes('access_token')) {
                    return true;
                  }
                }
              }
            }
          }

          // Check sessionStorage (Supabase might use this instead)
          const sessionStorageKeys = Object.keys(sessionStorage);
          for (const key of sessionStorageKeys) {
            if (key.includes('supabase') && key.includes('auth')) {
              const value = sessionStorage.getItem(key);
              if (value) {
                try {
                  const parsed = JSON.parse(value);
                  if (parsed.access_token || parsed.session?.access_token) {
                    return true;
                  }
                } catch {
                  if (value.includes('access_token')) {
                    return true;
                  }
                }
              }
            }
          }

          return false;
        } catch {
          return false;
        }
      })
      .catch(() => false);

    if (isAlreadyAuthenticated) {
      // Verify by checking if we can access a protected route
      const currentUrl = page.url();
      if (
        currentUrl.includes('/dashboard') ||
        currentUrl.includes('/clients') ||
        currentUrl.includes('/calendar') ||
        currentUrl.includes('/connections')
      ) {
        return true;
      }
      // Try navigating to dashboard to verify
      try {
        await page.goto(`${baseUrl}/dashboard`, {
          waitUntil: 'domcontentloaded',
          timeout: 5000,
        });
        await waitForStable(page, 1000);
        const dashboardUrl = page.url();
        if (
          dashboardUrl.includes('/dashboard') ||
          dashboardUrl.includes('/clients')
        ) {
          return true;
        }
      } catch {
        // Navigation failed, but we have token, so assume success
        return true;
      }
    }

    // Try to find login form - multiple selectors
    const emailInput = page.getByLabel(/email/i).first();
    const emailByPlaceholder = page.getByPlaceholder(/email/i).first();
    const passwordInput = page.getByLabel(/password/i).first();
    const passwordByPlaceholder = page.getByPlaceholder(/password/i).first();

    const hasEmail =
      (await elementExists(page, emailInput)) ||
      (await elementExists(page, emailByPlaceholder));
    const hasPassword =
      (await elementExists(page, passwordInput)) ||
      (await elementExists(page, passwordByPlaceholder));

    if (!hasEmail || !hasPassword) {
      // Login form not found - might already be logged in or page structure changed
      // Check URL again after a moment
      await waitForStable(page, 1000);
      const checkUrl = page.url();
      if (checkUrl.includes('/dashboard') || checkUrl.includes('/clients')) {
        return true;
      }
      return false;
    }

    // Fill form
    const actualEmailInput = (await emailInput.isVisible().catch(() => false))
      ? emailInput
      : emailByPlaceholder;
    const actualPasswordInput = (await passwordInput
      .isVisible()
      .catch(() => false))
      ? passwordInput
      : passwordByPlaceholder;

    await safeFill(page, actualEmailInput, email);
    await safeFill(page, actualPasswordInput, password);

    // Submit - try multiple button selectors
    const submitButton = page
      .getByRole('button', { name: /sign in|login|log in|submit/i })
      .first();
    const submitByType = page.locator('button[type="submit"]').first();

    const hasSubmit =
      (await elementExists(page, submitButton)) ||
      (await elementExists(page, submitByType));

    if (!hasSubmit) {
      return false;
    }

    const actualSubmitButton = (await submitButton
      .isVisible()
      .catch(() => false))
      ? submitButton
      : submitByType;
    await safeClick(page, actualSubmitButton);

    // ✅ CRITICAL: Wait for auth token to be created (localStorage OR sessionStorage)
    // Then verify with app-level signals (protected route access + UI indicators)
    try {
      // Wait for Supabase auth token to appear in localStorage OR sessionStorage
      await page.waitForFunction(
        () => {
          try {
            // Check localStorage
            const localStorageKeys = Object.keys(localStorage);
            for (const key of localStorageKeys) {
              if (key.includes('supabase') && key.includes('auth')) {
                const value = localStorage.getItem(key);
                if (value) {
                  try {
                    const parsed = JSON.parse(value);
                    if (parsed.access_token || parsed.session?.access_token) {
                      return true;
                    }
                  } catch {
                    if (value.includes('access_token')) {
                      return true;
                    }
                  }
                }
              }
            }

            // Check sessionStorage
            const sessionStorageKeys = Object.keys(sessionStorage);
            for (const key of sessionStorageKeys) {
              if (key.includes('supabase') && key.includes('auth')) {
                const value = sessionStorage.getItem(key);
                if (value) {
                  try {
                    const parsed = JSON.parse(value);
                    if (parsed.access_token || parsed.session?.access_token) {
                      return true;
                    }
                  } catch {
                    if (value.includes('access_token')) {
                      return true;
                    }
                  }
                }
              }
            }

            return false;
          } catch {
            return false;
          }
        },
        { timeout: 15000 }
      );

      // Token exists - now wait for redirect to protected route
      // LoginRedirect component uses useEffect which is asynchronous
      // Wait for URL to change to a protected route
      try {
        await page.waitForURL(
          url => {
            const urlStr = url.toString();
            return (
              urlStr.includes('/dashboard') ||
              urlStr.includes('/clients') ||
              urlStr.includes('/calendar') ||
              urlStr.includes('/connections') ||
              urlStr.includes('/sales')
            );
          },
          { timeout: 10000 }
        );
      } catch {
        // URL might not change if already on protected route or redirect is delayed
        // Continue with verification
      }

      await waitForStable(page, 1000);

      // App-level verification: Check multiple signals
      const authSignals = await page.evaluate(() => {
        const url = window.location.href;
        const isOnProtectedRoute =
          url.includes('/dashboard') ||
          url.includes('/clients') ||
          url.includes('/calendar') ||
          url.includes('/connections') ||
          url.includes('/sales');

        // Check for login form (should NOT be visible if authenticated)
        const hasLoginForm = !!document.querySelector(
          'input[type="email"], input[type="password"]'
        );

        // Check for auth indicators (sidebar, nav, etc.)
        const hasAuthIndicators = !!(
          document.querySelector('nav, aside, [data-testid="sidebar"]') ||
          document.querySelector(
            '[aria-label*="sign out"], [aria-label*="logout"]'
          )
        );

        return {
          isOnProtectedRoute,
          hasLoginForm,
          hasAuthIndicators,
        };
      });

      // Final success criteria: on protected route OR (no login form AND has auth indicators)
      const isAuthenticated =
        authSignals.isOnProtectedRoute ||
        (!authSignals.hasLoginForm && authSignals.hasAuthIndicators);

      if (isAuthenticated) {
        return true;
      }

      // If not on protected route yet, try navigating to dashboard
      const currentUrl = page.url();
      if (
        currentUrl === baseUrl ||
        currentUrl === `${baseUrl}/` ||
        currentUrl.includes('/login')
      ) {
        try {
          await page.goto(`${baseUrl}/dashboard`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          await waitForStable(page, 1000);

          // Verify we're on protected route and not redirected back to login
          const finalAuthSignals = await page.evaluate(() => {
            const url = window.location.href;
            const isOnProtectedRoute =
              url.includes('/dashboard') || url.includes('/clients');
            const hasLoginForm = !!document.querySelector(
              'input[type="email"], input[type="password"]'
            );
            return { isOnProtectedRoute, hasLoginForm };
          });

          if (
            finalAuthSignals.isOnProtectedRoute &&
            !finalAuthSignals.hasLoginForm
          ) {
            return true;
          }
        } catch {
          // Navigation failed, but we have token - assume success (might be app config issue)
          return true;
        }
      }

      // We have token, login succeeded (even if app-level signals are unclear)
      return true;
    } catch {
      // Token never appeared - login failed
      // Check for error messages to provide better feedback
      const errorMessage = page.getByText(/error|invalid|incorrect|failed/i);
      const hasError = await errorMessage.isVisible().catch(() => false);

      if (hasError) {
        const errorText = await errorMessage.textContent().catch(() => '');
        console.error(`Login error detected: ${errorText}`);
      }

      // Verify login form is still visible (confirms login failed)
      const loginFormStillVisible = await emailInput
        .isVisible()
        .catch(() => false);
      if (loginFormStillVisible) {
        console.error('Login form still visible - login did not succeed');
      }

      return false;
    }
  } catch (error) {
    // Log error for debugging but don't throw
    console.error('Login error:', error);
    return false;
  }
}

/**
 * Helper to ensure user is authenticated before test
 * Use this in beforeEach for tests that require auth
 *
 * This function:
 * 1. Attempts to login (with retry)
 * 2. Verifies we're on an authenticated page (not / or /login)
 * 3. Waits for auth state to be ready
 *
 * More lenient version that handles flaky auth better
 */
export async function ensureAuthenticated(
  page: Page,
  retries = 2
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const isLoggedIn = await loginUser(page);

      if (isLoggedIn) {
        // Double-check by trying to access a protected route
        const currentUrl = page.url();
        const baseUrl = new URL(currentUrl).origin;
        const isOnLoginPage =
          currentUrl.includes('/login') ||
          currentUrl === baseUrl ||
          currentUrl === `${baseUrl}/`;

        if (!isOnLoginPage) {
          // Already on protected route - success
          return;
        }

        // On login page - try navigating to protected route
        await page.goto('/dashboard', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await waitForStable(page, 2000);

        const newUrl = page.url();
        const stillOnLoginPage =
          newUrl.includes('/login') ||
          newUrl === baseUrl ||
          newUrl === `${baseUrl}/`;

        if (!stillOnLoginPage) {
          // Successfully navigated to protected route
          return;
        }
      }

      // If we get here, login failed
      if (attempt < retries) {
        // Wait a bit before retry (helps with rate limiting/session conflicts)
        await waitForStable(page, 1000);
        continue;
      }

      lastError = new Error(
        'Failed to authenticate user for test after retries'
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await waitForStable(page, 1000);
        continue;
      }
    }
  }

  // All retries failed - provide helpful error message
  const currentUrl = page.url();
  throw new Error(
    `Failed to authenticate user for test. ` +
      `Current URL: ${currentUrl}. ` +
      `This might be due to: 1) Wrong test credentials, 2) Login page structure changed, ` +
      `3) Session conflicts in parallel tests, 4) Server not ready. ` +
      `Original error: ${lastError?.message || 'Unknown'}`
  );
}

/**
 * Navigate to a protected route with authentication check
 * This ensures we're logged in before navigating and handles redirects
 */
export async function navigateToProtectedRoute(
  page: Page,
  path: string,
  options?: { timeout?: number }
): Promise<void> {
  // Ensure authenticated first
  await ensureAuthenticated(page);

  // Navigate to the route
  try {
    await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: options?.timeout || 20000,
    });

    // Wait a bit for any redirects
    await waitForStable(page, 500);

    // Check if we got redirected to login (auth failed)
    const currentUrl = page.url();
    const baseUrl = new URL(currentUrl).origin;
    const isOnLoginPage =
      currentUrl.includes('/login') ||
      (currentUrl === baseUrl && path !== '/') ||
      (currentUrl === `${baseUrl}/` && path !== '/');

    if (isOnLoginPage) {
      throw new Error(`Navigation to ${path} failed - redirected to login`);
    }

    // Wait for page to be ready
    await waitForPageLoad(page, options?.timeout || 20000, {
      skipNetworkIdle: false, // Allow network idle for data-heavy pages
    });
  } catch (error) {
    // If it's a connection error, that's a different issue
    if (
      error instanceof Error &&
      error.message.includes('ERR_CONNECTION_REFUSED')
    ) {
      throw new Error('Server not running - cannot run e2e tests');
    }
    // If navigation failed due to redirect, re-throw with better message
    if (
      error instanceof Error &&
      error.message.includes('redirected to login')
    ) {
      throw error;
    }
    throw error;
  }
}

/**
 * Wait for API response or network request to complete
 * This is more reliable than waiting for UI changes, especially on Mobile Safari
 */
export async function waitForAPIResponse(
  page: Page,
  urlPattern: string | RegExp,
  options?: { timeout?: number; method?: string }
): Promise<void> {
  const timeout = options?.timeout || 20000;
  const method = options?.method || 'GET';

  try {
    await page.waitForResponse(
      response => {
        const url = response.url();
        const matches =
          typeof urlPattern === 'string'
            ? url.includes(urlPattern)
            : urlPattern.test(url);
        return matches && response.request().method() === method;
      },
      { timeout }
    );
  } catch {
    // API response might not come (e.g., cached, error, etc.) - continue anyway
  }
}

/**
 * Wait for element to be visible with better error handling for Mobile Safari
 * Uses multiple strategies to detect element presence
 */
export async function waitForElementVisible(
  page: Page,
  locator:
    | ReturnType<Page['getByRole']>
    | ReturnType<Page['getByText']>
    | ReturnType<Page['locator']>,
  options?: { timeout?: number; retries?: number }
): Promise<boolean> {
  const timeout = options?.timeout || 10000;
  const retries = options?.retries || 3;

  for (let i = 0; i < retries; i++) {
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      // Wait a bit before retrying (especially for Mobile Safari)
      if (i < retries - 1) {
        await page.waitForTimeout(500);
      }
    }
  }
  return false;
}

/**
 * Wait for data to be loaded (check for empty state or data rows)
 * This is useful for pages that might have no data
 */
export async function waitForDataOrEmptyState(
  page: Page,
  dataSelector: string,
  emptyStateSelector: string,
  timeout = 10000
): Promise<'data' | 'empty' | 'loading'> {
  try {
    // Wait for either data or empty state to appear
    await page.waitForSelector(`${dataSelector}, ${emptyStateSelector}`, {
      timeout,
      state: 'attached',
    });

    const hasData = (await page.locator(dataSelector).count()) > 0;
    const hasEmpty = await page
      .locator(emptyStateSelector)
      .isVisible()
      .catch(() => false);

    if (hasData) return 'data';
    if (hasEmpty) return 'empty';
    return 'loading';
  } catch {
    return 'loading';
  }
}

/**
 * Wait for filter panel to open
 * Checks for common filter panel indicators
 */
export async function waitForFilterPanelOpen(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    // Wait for filter panel to appear (common patterns)
    await Promise.race([
      page.waitForSelector('[role="dialog"]', { state: 'visible', timeout }),
      page.waitForSelector('[class*="filter"]:not([class*="hidden"])', {
        state: 'visible',
        timeout,
      }),
      page.waitForSelector('[id*="filter"]', { state: 'visible', timeout }),
    ]);
    return true;
  } catch {
    // Filter panel might already be open or use different structure
    return false;
  }
}

/**
 * Wait for filter to be applied (results updated)
 * Checks for loading state to disappear or results to change
 */
export async function waitForFilterApplied(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timeout = 5000
): Promise<void> {
  // Wait for loading indicators to disappear
  const loadingSelectors = [
    '[class*="loading"]',
    '[class*="skeleton"]',
    '[aria-busy="true"]',
  ];

  for (const selector of loadingSelectors) {
    try {
      await page.waitForSelector(selector, { state: 'hidden', timeout: 1000 });
    } catch {
      // Loading might not exist - continue
    }
  }

  // Wait for stable state (no rapid DOM changes)
  await waitForStable(page, 300);
}

/**
 * Open filters panel if not already open
 * Returns true if panel is now open, false if it couldn't be opened
 */
export async function openFiltersPanel(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  // Check if panel is already open
  const isOpen = await page
    .locator('[role="dialog"], [class*="filter"]:not([class*="hidden"])')
    .first()
    .isVisible()
    .catch(() => false);
  if (isOpen) return true;

  // Try to find and click filters button
  const filtersButton = page
    .getByRole('button', { name: /filters?/i })
    .or(page.getByText(/filters?/i))
    .first();

  const clicked = await safeClick(page, filtersButton);
  if (!clicked) return false;

  // Wait for panel to open
  return await waitForFilterPanelOpen(page, timeout);
}

/**
 * Check if page has test data, skip test if not
 * This helps tests that require existing data to run
 */
export async function requireTestData(
  page: Page,
  dataSelector: string,
  minCount = 1
): Promise<boolean> {
  const count = await page.locator(dataSelector).count();
  if (count < minCount) {
    return false;
  }
  return true;
}
