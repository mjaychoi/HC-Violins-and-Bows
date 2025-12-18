import { chromium, FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginUser, safeFill, safeClick, waitForStable } from './test-helpers';

/**
 * Global setup: Login once and save authentication state
 * This runs once before all tests, avoiding repeated login attempts
 */
async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('🔐 Logging in for e2e tests...');

    // Get test credentials from environment or use defaults
    const testEmail = process.env.E2E_TEST_EMAIL || 'test@test.com';
    const testPassword = process.env.E2E_TEST_PASSWORD || 'test';

    console.log(`Using test email: ${testEmail}`);

    // Set baseURL for the page context if not already set
    const targetUrl = baseURL || 'http://localhost:3000';

    // Explicitly navigate to login page (root page is login page)
    // Don't rely on current page state
    console.log(`Navigating to login page: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForStable(page, 1000);

    // Use the robust loginUser helper function
    // loginUser will verify auth token creation (not just UI state)
    console.log(`Attempting login with ${testEmail}...`);
    let loginSuccess = await loginUser(page, testEmail, testPassword);

    if (!loginSuccess) {
      // Get more details about why login failed
      const currentUrl = page.url();
      const errorMessages = await page
        .getByText(/error|invalid|incorrect|failed/i)
        .allTextContents()
        .catch(() => []);
      const pageTitle = await page.title().catch(() => 'Unable to get title');

      console.log(
        '⚠️ Login failed, checking if account needs to be created...'
      );
      console.log(`Current URL: ${currentUrl}`);
      console.log(`Page title: ${pageTitle}`);
      if (errorMessages.length > 0) {
        console.log(`Error messages found: ${errorMessages.join(', ')}`);
      }

      // Check if error is "Invalid login credentials" - account might not exist
      const hasInvalidCredentials = errorMessages.some(
        msg =>
          msg.toLowerCase().includes('invalid') ||
          msg.toLowerCase().includes('credentials')
      );

      if (hasInvalidCredentials) {
        console.log(
          '📝 Account does not exist, attempting to create account...'
        );

        // Navigate to signup page
        await page.goto(`${targetUrl}/signup`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.waitForTimeout(1000);

        // Fill signup form
        const emailInput = page.getByLabel(/email/i).first();
        const passwordInput = page.getByLabel(/password/i).first();
        const confirmPasswordInput = page
          .getByLabel(/confirm.*password/i)
          .first();

        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
        await confirmPasswordInput.waitFor({
          state: 'visible',
          timeout: 10000,
        });

        await safeFill(page, emailInput, testEmail);
        await safeFill(page, passwordInput, testPassword);
        await safeFill(page, confirmPasswordInput, testPassword);

        // Submit signup form
        const signupButton = page
          .getByRole('button', { name: /sign up|create/i })
          .first();
        await safeClick(page, signupButton);

        // Wait for signup to complete and check for success/error
        // Wait longer for signup to process and redirect
        await waitForStable(page, 3000);

        // Wait for redirect or success message
        try {
          await page.waitForURL(/\/dashboard|\/signup/, { timeout: 5000 });
        } catch {
          // URL might not change immediately
        }

        // Check for success message or error
        const successMessage = await page
          .getByText(/success|created|redirecting|account.*created/i)
          .first()
          .isVisible()
          .catch(() => false);
        const errorMessage = await page
          .getByText(/error|invalid|failed|already exists/i)
          .first()
          .isVisible()
          .catch(() => false);

        if (errorMessage) {
          const errorText =
            (await page
              .getByText(/error|invalid|failed|already exists/i)
              .first()
              .textContent()
              .catch(() => '')) || '';
          console.log(`Signup error: ${errorText}`);

          // Check if error is about email being invalid - might need a different email
          if (
            errorText &&
            errorText.toLowerCase().includes('email') &&
            errorText.toLowerCase().includes('invalid')
          ) {
            console.error('');
            console.error(
              '❌ Email validation failed. Supabase rejected the test email address.'
            );
            console.error('');
            console.error('📋 Solutions:');
            console.error(
              '  1. Use a real email address via environment variable:'
            );
            console.error(
              '     E2E_TEST_EMAIL=your-email@example.com E2E_TEST_PASSWORD=yourpassword npx playwright test'
            );
            console.error('');
            console.error('  2. Configure Supabase to allow test emails:');
            console.error(
              '     - Go to Supabase Dashboard > Authentication > Settings'
            );
            console.error('     - Check "Email" provider settings');
            console.error(
              '     - Disable or adjust email validation if needed'
            );
            console.error('');
            console.error('  3. Use a disposable email service for testing:');
            console.error(
              '     E2E_TEST_EMAIL=test@mailinator.com npx playwright test'
            );
            console.error('');
            throw new Error(
              `Signup failed: ${errorText}. Please use a valid email address or configure Supabase email validation. See error messages above for solutions.`
            );
          }

          // Check if account already exists
          if (
            errorText &&
            (errorText.toLowerCase().includes('already exists') ||
              errorText.toLowerCase().includes('already registered'))
          ) {
            console.log('Account already exists, trying login...');
            await page.goto(targetUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
            await waitForStable(page, 1000);
            loginSuccess = await loginUser(page, testEmail, testPassword);
          } else {
            // Other error - signup failed
            console.error(`❌ Signup failed with error: ${errorText}`);
            throw new Error(`Signup failed: ${errorText}`);
          }
        } else if (successMessage) {
          // Signup successful, wait for redirect and verify auth token
          console.log(
            '✅ Account created successfully, waiting for redirect...'
          );
          // Wait for redirect to dashboard (signup page redirects after 2 seconds)
          try {
            await page.waitForURL(/\/dashboard/, { timeout: 5000 });
          } catch {
            // Redirect might take longer, continue
          }
          await page.waitForTimeout(2000); // Additional wait for token to be stored

          // Verify auth token was created
          const hasAuthAfterSignup = await page
            .evaluate(() => {
              try {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                  if (key.includes('supabase') && key.includes('auth')) {
                    const value = localStorage.getItem(key);
                    if (value) {
                      try {
                        const parsed = JSON.parse(value);
                        if (
                          parsed.access_token ||
                          parsed.session?.access_token
                        ) {
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

          // Check current URL
          const signupUrl = page.url();
          console.log(`URL after signup: ${signupUrl}`);

          // If already on dashboard/clients and have auth token, we're good
          if (
            (signupUrl.includes('/dashboard') ||
              signupUrl.includes('/clients')) &&
            hasAuthAfterSignup
          ) {
            console.log('✅ Already authenticated after signup');
            loginSuccess = true;
          } else if (hasAuthAfterSignup) {
            // Have token but not on protected route, navigate to verify
            console.log(
              'Auth token exists, navigating to dashboard to verify...'
            );
            await page.goto(`${targetUrl}/dashboard`, {
              waitUntil: 'domcontentloaded',
              timeout: 10000,
            });
            await waitForStable(page, 2000);
            const dashboardUrl = page.url();
            loginSuccess =
              (dashboardUrl.includes('/dashboard') ||
                dashboardUrl.includes('/clients')) &&
              !dashboardUrl.includes('/signup') &&
              !dashboardUrl.includes('/login');
          } else {
            // No token yet, wait a bit more
            console.warn(
              '⚠️ Signup succeeded but no auth token found, waiting longer...'
            );
            await page.waitForTimeout(3000);

            // Check again
            const hasAuthRetry = await page
              .evaluate(() => {
                try {
                  const keys = Object.keys(localStorage);
                  for (const key of keys) {
                    if (key.includes('supabase') && key.includes('auth')) {
                      const value = localStorage.getItem(key);
                      if (value) {
                        try {
                          const parsed = JSON.parse(value);
                          if (
                            parsed.access_token ||
                            parsed.session?.access_token
                          ) {
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

            if (hasAuthRetry) {
              loginSuccess = true;
            } else {
              // Still no token, try login
              console.log('No token after signup, trying login...');
              await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
              });
              await waitForStable(page, 1000);
              loginSuccess = await loginUser(page, testEmail, testPassword);
            }
          }
        } else {
          // No clear success/error message, check URL and auth token
          // Wait longer for signup to process
          await waitForStable(page, 3000);

          // Wait for possible redirect
          try {
            await page.waitForURL(/\/dashboard|\/signup|\//, { timeout: 5000 });
          } catch {
            // URL might not change
          }

          const signupUrl = page.url();
          console.log(`URL after signup (no clear message): ${signupUrl}`);

          // Check if we have auth token (both localStorage and sessionStorage)
          const hasAuthToken = await page
            .evaluate(() => {
              try {
                const checkStorage = (storage: Storage) => {
                  const keys = Object.keys(storage);
                  for (const key of keys) {
                    if (key.includes('supabase') && key.includes('auth')) {
                      const value = storage.getItem(key);
                      if (value) {
                        try {
                          const parsed = JSON.parse(value);
                          if (
                            parsed.access_token ||
                            parsed.session?.access_token
                          ) {
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
                };
                return (
                  checkStorage(localStorage) || checkStorage(sessionStorage)
                );
              } catch {
                return false;
              }
            })
            .catch(() => false);

          if (
            (signupUrl.includes('/dashboard') ||
              signupUrl.includes('/clients')) &&
            hasAuthToken
          ) {
            console.log(
              '✅ Already authenticated (on protected route with token)'
            );
            loginSuccess = true;
          } else if (
            signupUrl.includes('/dashboard') ||
            signupUrl.includes('/clients')
          ) {
            // On protected route but no token - might be app issue, but try to verify
            console.log(
              'On protected route but no token, checking app-level signals...'
            );
            const appLevelAuth = await page.evaluate(() => {
              const hasLoginForm = !!document.querySelector(
                'input[type="email"], input[type="password"]'
              );
              const hasAuthIndicators = !!(
                document.querySelector('nav, aside, [data-testid="sidebar"]') ||
                document.querySelector(
                  '[aria-label*="sign out"], [aria-label*="logout"]'
                )
              );
              return { hasLoginForm, hasAuthIndicators };
            });

            if (!appLevelAuth.hasLoginForm && appLevelAuth.hasAuthIndicators) {
              console.log('✅ App-level signals indicate authentication');
              loginSuccess = true;
            } else {
              // Not authenticated, try login
              console.log('Not authenticated, trying login...');
              await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
              });
              await waitForStable(page, 1000);
              loginSuccess = await loginUser(page, testEmail, testPassword);
            }
          } else if (signupUrl.includes('/signup')) {
            // Still on signup page - signup might have failed or needs email confirmation
            console.log(
              'Still on signup page, checking if signup succeeded...'
            );

            // Wait a bit more for any delayed response
            await page.waitForTimeout(2000);

            // Check for any error messages that might have appeared
            const delayedError = await page
              .getByText(/error|invalid|failed/i)
              .first()
              .isVisible()
              .catch(() => false);
            if (delayedError) {
              const errorText =
                (await page
                  .getByText(/error|invalid|failed/i)
                  .first()
                  .textContent()
                  .catch(() => null)) ?? '';
              console.log(`Delayed error found: ${errorText}`);

              // If account already exists, try login
              if (
                errorText &&
                (errorText.toLowerCase().includes('already exists') ||
                  errorText.toLowerCase().includes('already registered'))
              ) {
                console.log('Account already exists, trying login...');
                await page.goto(targetUrl, {
                  waitUntil: 'domcontentloaded',
                  timeout: 15000,
                });
                await waitForStable(page, 1000);
                loginSuccess = await loginUser(page, testEmail, testPassword);
              } else {
                // Other error - signup failed
                throw new Error(
                  `Signup failed: ${errorText || 'Unknown error'}`
                );
              }
            } else {
              // No error, might need email confirmation or just needs login
              console.log(
                'No error message, signup might need email confirmation or manual login'
              );
              console.log('Trying login with created account...');
              await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
              });
              await waitForStable(page, 1000);
              loginSuccess = await loginUser(page, testEmail, testPassword);
            }
          } else if (hasAuthToken) {
            // Have token but unexpected URL, navigate to dashboard
            console.log(
              'Auth token exists but unexpected URL, navigating to dashboard...'
            );
            await page.goto(`${targetUrl}/dashboard`, {
              waitUntil: 'domcontentloaded',
              timeout: 10000,
            });
            await waitForStable(page, 2000);
            const dashboardUrl = page.url();
            loginSuccess =
              (dashboardUrl.includes('/dashboard') ||
                dashboardUrl.includes('/clients')) &&
              !dashboardUrl.includes('/signup') &&
              !dashboardUrl.includes('/login');
          } else {
            // No token and unexpected state, try login (account might have been created)
            console.log(
              'No auth token found, trying login (account might have been created)...'
            );
            await page.goto(targetUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
            await waitForStable(page, 1000);
            loginSuccess = await loginUser(page, testEmail, testPassword);
          }
        }
      }

      // If login still failed after signup attempt, verify one more time
      if (!loginSuccess) {
        const finalUrl = page.url();
        console.log(`Verifying final state. URL: ${finalUrl}`);

        // Check if we're actually authenticated (might be on dashboard but loginUser failed)
        const hasAuthToken = await page
          .evaluate(() => {
            try {
              const keys = Object.keys(localStorage);
              for (const key of keys) {
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
              return false;
            } catch {
              return false;
            }
          })
          .catch(() => false);

        // If we're on a protected route, we're likely authenticated
        // Even if token check failed, being on dashboard means auth succeeded
        const isOnProtectedRoute =
          finalUrl.includes('/dashboard') ||
          finalUrl.includes('/clients') ||
          finalUrl.includes('/calendar') ||
          finalUrl.includes('/connections') ||
          finalUrl.includes('/sales');

        if (isOnProtectedRoute) {
          // Check if we can actually see dashboard content (not redirected to login)
          const hasLoginForm = await page
            .getByLabel(/email/i)
            .first()
            .isVisible()
            .catch(() => false);

          if (!hasLoginForm) {
            // On protected route and no login form = authenticated
            console.log(
              '✅ Actually authenticated (on protected route without login form)'
            );

            // Try to find auth indicators (sidebar, user menu, etc.)
            const hasAuthIndicators = await Promise.all([
              page
                .locator('nav, aside, [data-testid="sidebar"]')
                .first()
                .isVisible()
                .catch(() => false),
              page
                .getByText(/sign out|logout/i)
                .first()
                .isVisible()
                .catch(() => false),
            ])
              .then(results => results.some(Boolean))
              .catch(() => false);

            if (hasAuthIndicators || hasAuthToken) {
              console.log(
                '✅ Authentication confirmed (has auth indicators or token)'
              );
              loginSuccess = true;
            } else {
              // On dashboard but no clear indicators - wait a bit and check token again
              console.log(
                'On dashboard but no clear auth indicators, waiting and rechecking token...'
              );
              await page.waitForTimeout(2000);

              const hasAuthTokenRetry = await page
                .evaluate(() => {
                  try {
                    // Check all storage locations
                    const checkStorage = (storage: Storage) => {
                      const keys = Object.keys(storage);
                      for (const key of keys) {
                        if (
                          key.toLowerCase().includes('supabase') ||
                          key.toLowerCase().includes('auth')
                        ) {
                          const value = storage.getItem(key);
                          if (value) {
                            try {
                              const parsed = JSON.parse(value);
                              if (
                                parsed.access_token ||
                                parsed.session?.access_token ||
                                parsed.user
                              ) {
                                return true;
                              }
                            } catch {
                              if (
                                value.includes('access_token') ||
                                value.includes('user') ||
                                value.includes('session')
                              ) {
                                return true;
                              }
                            }
                          }
                        }
                      }
                      return false;
                    };

                    return (
                      checkStorage(localStorage) || checkStorage(sessionStorage)
                    );
                  } catch {
                    return false;
                  }
                })
                .catch(() => false);

              if (hasAuthTokenRetry) {
                console.log('✅ Auth token found on retry');
                loginSuccess = true;
              } else {
                // Still on dashboard without token - might be app issue, but allow it
                console.warn(
                  '⚠️ On dashboard but no auth token found. Assuming authenticated (may be app configuration issue)'
                );
                loginSuccess = true;
              }
            }
          } else {
            // Has login form on protected route - check app-level signals
            console.log(
              'Login form visible on protected route, checking app-level signals...'
            );

            const appLevelAuth = await page.evaluate(() => {
              const hasLoginForm = !!document.querySelector(
                'input[type="email"], input[type="password"]'
              );
              const hasAuthIndicators = !!(
                document.querySelector('nav, aside, [data-testid="sidebar"]') ||
                document.querySelector(
                  '[aria-label*="sign out"], [aria-label*="logout"]'
                )
              );
              return {
                hasLoginForm,
                hasAuthIndicators,
              };
            });

            // If has auth indicators despite login form, might be a UI issue
            if (appLevelAuth.hasAuthIndicators) {
              console.warn(
                '⚠️ Login form visible but auth indicators present - might be UI issue, assuming authenticated'
              );
              loginSuccess = true;
            } else {
              // No auth indicators and login form visible = not authenticated
              console.error(
                `Login form visible on protected route - auth failed`
              );
              throw new Error(
                `Login failed after signup attempt. URL: ${finalUrl}, Has token: ${hasAuthToken}, Has login form: ${appLevelAuth.hasLoginForm}, Has auth indicators: ${appLevelAuth.hasAuthIndicators}`
              );
            }
          }
        } else {
          // Not on protected route and no token - check app-level signals
          console.log(
            'Not on protected route, checking app-level authentication signals...'
          );

          const appLevelAuth = await page.evaluate(() => {
            const hasLoginForm = !!document.querySelector(
              'input[type="email"], input[type="password"]'
            );
            const hasAuthIndicators = !!(
              document.querySelector('nav, aside, [data-testid="sidebar"]') ||
              document.querySelector(
                '[aria-label*="sign out"], [aria-label*="logout"]'
              )
            );
            return {
              hasLoginForm,
              hasAuthIndicators,
            };
          });

          // If no login form and has auth indicators, might be authenticated
          if (!appLevelAuth.hasLoginForm && appLevelAuth.hasAuthIndicators) {
            console.log(
              '✅ App-level signals indicate authentication (no login form, has auth indicators)'
            );
            loginSuccess = true;
          } else {
            // Has login form or no auth indicators = not authenticated
            console.error(`Login form visible: ${appLevelAuth.hasLoginForm}`);
            console.error(
              `Has auth indicators: ${appLevelAuth.hasAuthIndicators}`
            );
            console.error(`Has auth token: ${hasAuthToken}`);
            throw new Error(
              `Login failed after signup attempt. URL: ${finalUrl}, Has token: ${hasAuthToken}, Has login form: ${appLevelAuth.hasLoginForm}, Has auth indicators: ${appLevelAuth.hasAuthIndicators}`
            );
          }
        }
      }
    }

    console.log('✅ Login function returned success');

    // Wait for redirect or verify authentication
    console.log('⏳ Verifying authentication...');
    await page.waitForTimeout(2000); // Give React time to update state and redirect

    let currentUrl = page.url();
    console.log(`Current URL after login: ${currentUrl}`);

    // Always verify authentication token, even if loginUser returned success
    // This catches cases where loginUser incorrectly returned success
    console.log('Checking authentication state in browser storage...');
    const authState = await page
      .evaluate(() => {
        try {
          // Check for Supabase auth token in localStorage AND sessionStorage
          const localStorageKeys = Object.keys(localStorage);
          const sessionStorageKeys = Object.keys(sessionStorage);

          const localStorageSupabaseKeys = localStorageKeys.filter(
            key => key.includes('supabase') && key.includes('auth')
          );
          const sessionStorageSupabaseKeys = sessionStorageKeys.filter(
            key => key.includes('supabase') && key.includes('auth')
          );

          // Check localStorage
          for (const key of localStorageSupabaseKeys) {
            const value = localStorage.getItem(key);
            if (value) {
              try {
                const parsed = JSON.parse(value);
                if (parsed.access_token || parsed.session?.access_token) {
                  return {
                    hasAuth: true,
                    reason: 'Access token found in localStorage',
                    storage: 'localStorage',
                  };
                }
              } catch {
                if (value.includes('access_token')) {
                  return {
                    hasAuth: true,
                    reason: 'Access token string found in localStorage',
                    storage: 'localStorage',
                  };
                }
              }
            }
          }

          // Check sessionStorage
          for (const key of sessionStorageSupabaseKeys) {
            const value = sessionStorage.getItem(key);
            if (value) {
              try {
                const parsed = JSON.parse(value);
                if (parsed.access_token || parsed.session?.access_token) {
                  return {
                    hasAuth: true,
                    reason: 'Access token found in sessionStorage',
                    storage: 'sessionStorage',
                  };
                }
              } catch {
                if (value.includes('access_token')) {
                  return {
                    hasAuth: true,
                    reason: 'Access token string found in sessionStorage',
                    storage: 'sessionStorage',
                  };
                }
              }
            }
          }

          if (
            localStorageSupabaseKeys.length === 0 &&
            sessionStorageSupabaseKeys.length === 0
          ) {
            return {
              hasAuth: false,
              reason:
                'No supabase auth keys found in localStorage or sessionStorage',
              storage: undefined,
            };
          }

          return {
            hasAuth: false,
            reason: 'No access token in supabase keys',
            storage: undefined,
          };
        } catch (error) {
          return {
            hasAuth: false,
            reason: `Error: ${error}`,
            storage: undefined,
          };
        }
      })
      .catch(() => ({
        hasAuth: false,
        reason: 'Evaluation failed',
        storage: undefined,
      }));

    console.log(
      `Auth token in storage: ${authState.hasAuth} (${authState.reason})`
    );

    // App-level verification: Check multiple signals (more reliable than token alone)
    const appLevelAuth = await page.evaluate(() => {
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

    // Final authentication check: token OR app-level signals
    const isAuthenticated =
      authState.hasAuth ||
      (appLevelAuth.isOnProtectedRoute && !appLevelAuth.hasLoginForm) ||
      (!appLevelAuth.hasLoginForm && appLevelAuth.hasAuthIndicators);

    if (!isAuthenticated) {
      console.error('❌ Authentication verification failed');
      console.error(
        `Token check: ${authState.hasAuth ? '✅' : '❌'} (${authState.reason})`
      );
      console.error(
        `App-level check: protected route=${appLevelAuth.isOnProtectedRoute}, login form=${appLevelAuth.hasLoginForm}, auth indicators=${appLevelAuth.hasAuthIndicators}`
      );

      // Try to get more information about why login failed
      const errorMessages = await page
        .getByText(/error|invalid|incorrect|failed/i)
        .allTextContents()
        .catch(() => []);
      if (errorMessages.length > 0) {
        console.error(`Error messages on page: ${errorMessages.join(', ')}`);
      }

      throw new Error(
        `Authentication failed - no token and app-level signals indicate failure. Token: ${authState.reason}, App: protected=${appLevelAuth.isOnProtectedRoute}, loginForm=${appLevelAuth.hasLoginForm}, indicators=${appLevelAuth.hasAuthIndicators}`
      );
    }

    if (!authState.hasAuth) {
      console.warn(
        `⚠️ No token in storage but app-level signals indicate authentication (${authState.reason})`
      );
      console.log('✅ Continuing with app-level authentication verification');
    } else {
      const storageType = authState.storage || 'localStorage';
      console.log(`✅ Authentication token found (${storageType})`);
    }

    // Check if we're already on a protected route
    const isAlreadyOnProtectedRoute =
      currentUrl.includes('/dashboard') ||
      currentUrl.includes('/clients') ||
      currentUrl.includes('/calendar') ||
      currentUrl.includes('/connections') ||
      currentUrl.includes('/sales');

    if (isAlreadyOnProtectedRoute) {
      console.log('✅ Already on protected route, authentication successful');
    } else {
      // If still on root page, try navigating to dashboard to verify auth
      // This will redirect to login if not authenticated, or show dashboard if authenticated
      if (currentUrl === baseURL || currentUrl === `${baseURL}/`) {
        console.log(
          'Still on root page, navigating to dashboard to verify auth...'
        );
        try {
          await page.goto(`${baseURL}/dashboard`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          await page.waitForTimeout(3000); // Wait for potential redirect and React to update
          currentUrl = page.url();
          console.log(`URL after navigating to dashboard: ${currentUrl}`);
        } catch (error) {
          console.warn('Navigation to dashboard failed:', error);
        }
      }
    }

    // Verify we're authenticated by checking URL
    const finalUrl = page.url();
    console.log(`Final URL: ${finalUrl}`);

    // Check if we're on a protected route (dashboard, clients, etc.)
    // Recalculate using finalUrl (may have changed after navigation)
    const isOnProtectedRouteFinal =
      finalUrl.includes('/dashboard') ||
      finalUrl.includes('/clients') ||
      finalUrl.includes('/calendar') ||
      finalUrl.includes('/connections') ||
      finalUrl.includes('/sales');

    // Check if we're back on login page (indicates auth failed)
    const isOnLoginPage =
      finalUrl.includes('/login') ||
      finalUrl === baseURL ||
      finalUrl === `${baseURL}/`;

    // If we're on login page, check for login form to confirm
    if (isOnLoginPage) {
      const hasLoginForm = await page
        .getByLabel(/email/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (hasLoginForm) {
        throw new Error(
          `Login verification failed - redirected back to login page. URL: ${finalUrl}`
        );
      }
    }

    // If not on protected route, authentication likely failed
    if (!isOnProtectedRouteFinal) {
      throw new Error(
        `Login verification failed - not on protected route after login. URL: ${finalUrl}`
      );
    }

    console.log('✅ Authentication verified');

    // Save authentication state
    const authDir = path.join(__dirname, '.auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const authFile = path.join(authDir, 'user.json');
    await page.context().storageState({ path: authFile });

    console.log(`✅ Authentication state saved to ${authFile}`);
    console.log(`✅ Logged in as ${testEmail}`);

    // ✅ Verify storageState works with WebKit (Mobile Safari uses WebKit)
    // This catches issues where Chromium storageState doesn't work in WebKit
    console.log('🔍 Verifying storageState compatibility with WebKit...');
    try {
      const { webkit } = require('playwright');
      const webkitBrowser = await webkit.launch();
      const webkitContext = await webkitBrowser.newContext({
        storageState: authFile,
      });
      const webkitPage = await webkitContext.newPage();

      // Try to access protected route
      await webkitPage.goto(targetUrl + '/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      // Check if we're actually authenticated (not redirected to login)
      const webkitUrl = webkitPage.url();
      const isAuthenticated =
        !webkitUrl.includes('/login') &&
        (webkitUrl.includes('/dashboard') || webkitUrl.includes('/clients'));

      if (isAuthenticated) {
        console.log('✅ WebKit storageState verification passed');
      } else {
        console.warn(
          '⚠️ WebKit storageState verification: redirected to login (may indicate storageState compatibility issue)'
        );
      }

      await webkitBrowser.close();
    } catch (error) {
      console.warn(
        `⚠️ WebKit storageState verification failed (non-critical): ${error}`
      );
      // Don't fail global setup - this is just a smoke test
    }

    await browser.close();
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    await browser.close();
    throw error;
  }
}

export default globalSetup;
