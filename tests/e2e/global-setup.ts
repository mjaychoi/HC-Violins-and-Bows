import { chromium, FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginUser, safeFill, safeClick, waitForStable } from './test-helpers';
import { logInfo, logWarn } from '../../src/utils/logger';

/**
 * Global setup: Login once and save authentication state
 * This runs once before all tests, avoiding repeated login attempts
 */
async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    logInfo('🔐 Logging in for e2e tests...');

    // Get test credentials from environment or use defaults
    const testEmail = process.env.E2E_TEST_EMAIL || 'test@test.com';
    const testPassword = process.env.E2E_TEST_PASSWORD || 'test';

    logInfo(`Using test email: ${testEmail}`);

    // Set baseURL for the page context if not already set
    const targetUrl = baseURL || 'http://localhost:3000';

    // Explicitly navigate to login page (root page is login page)
    // Don't rely on current page state
    logInfo(`Navigating to login page: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await waitForStable(page, 1000);

    // Use the robust loginUser helper function
    // loginUser will verify auth token creation (not just UI state)
    logInfo(`Attempting login with ${testEmail}...`);
    let loginSuccess = await loginUser(page, testEmail, testPassword);

    if (!loginSuccess) {
      // Get more details about why login failed
      const currentUrl = page.url();
      const errorMessages = await page
        .getByText(/error|invalid|incorrect|failed/i)
        .allTextContents()
        .catch(() => []);
      const pageTitle = await page.title().catch(() => 'Unable to get title');

      logInfo('⚠️ Login failed, checking if account needs to be created...');
      logInfo(`Current URL: ${currentUrl}`);
      logInfo(`Page title: ${pageTitle}`);
      if (errorMessages.length > 0) {
        logInfo(`Error messages found: ${errorMessages.join(', ')}`);
      }

      // Check if error is "Invalid login credentials" - account might not exist
      const hasInvalidCredentials = errorMessages.some(
        msg =>
          msg.toLowerCase().includes('invalid') ||
          msg.toLowerCase().includes('credentials')
      );

      if (hasInvalidCredentials) {
        logInfo('📝 Account does not exist, attempting to create account...');

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
          logInfo(`Signup error: ${errorText}`);

          // Check if error is about email being invalid - might need a different email
          if (
            errorText &&
            errorText.toLowerCase().includes('email') &&
            errorText.toLowerCase().includes('invalid')
          ) {
            logWarn('');
            logWarn(
              '❌ Email validation failed. Supabase rejected the test email address.'
            );
            logWarn('');
            logWarn('📋 Solutions:');
            logWarn('  1. Use a real email address via environment variable:');
            logWarn(
              '     E2E_TEST_EMAIL=your-email@example.com E2E_TEST_PASSWORD=yourpassword npx playwright test'
            );
            logWarn('');
            logWarn('  2. Configure Supabase to allow test emails:');
            logWarn(
              '     - Go to Supabase Dashboard > Authentication > Settings'
            );
            logWarn('     - Check "Email" provider settings');
            logWarn('     - Disable or adjust email validation if needed');
            logWarn('');
            logWarn('  3. Use a disposable email service for testing:');
            logWarn(
              '     E2E_TEST_EMAIL=test@mailinator.com npx playwright test'
            );
            logWarn('');
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
            logInfo('Account already exists, trying login...');
            await page.goto(targetUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
            await waitForStable(page, 1000);
            loginSuccess = await loginUser(page, testEmail, testPassword);
          } else {
            // Other error - signup failed
            logWarn(`❌ Signup failed with error: ${errorText}`);
            throw new Error(`Signup failed: ${errorText}`);
          }
        } else if (successMessage) {
          // Signup successful, wait for redirect and verify auth token
          logInfo('✅ Account created successfully, waiting for redirect...');
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
          logInfo(`URL after signup: ${signupUrl}`);

          // If already on dashboard/clients and have auth token, we're good
          if (
            (signupUrl.includes('/dashboard') ||
              signupUrl.includes('/clients')) &&
            hasAuthAfterSignup
          ) {
            logInfo('✅ Already authenticated after signup');
            loginSuccess = true;
          } else if (hasAuthAfterSignup) {
            // Have token but not on protected route, navigate to verify
            logInfo('Auth token exists, navigating to dashboard to verify...');
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
            // No token yet - Supabase might require email confirmation
            // Wait for redirect first, then check token
            logWarn(
              '⚠️ Signup succeeded but no auth token found immediately, waiting for redirect...'
            );

            // Wait for redirect to dashboard (signup page redirects after 2 seconds)
            try {
              await page.waitForURL(
                url => {
                  const urlStr = url.toString();
                  return (
                    urlStr.includes('/dashboard') ||
                    urlStr.includes('/clients') ||
                    urlStr.includes('/signup')
                  );
                },
                { timeout: 5000 }
              );
            } catch {
              // Redirect might take longer
            }

            await page.waitForTimeout(2000); // Wait for redirect and token storage

            // Check again for token (both localStorage and sessionStorage)
            const hasAuthRetry = await page
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

            if (hasAuthRetry) {
              logInfo('✅ Auth token found after waiting');
              loginSuccess = true;
            } else {
              // Still no token - Supabase might require email confirmation
              // Try login anyway (account might be created but needs login)
              logInfo(
                'No token after signup (might require email confirmation), trying login...'
              );
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
          logWarn(`URL after signup (no clear message): ${signupUrl}`);

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
            logInfo('✅ Already authenticated (on protected route with token)');
            loginSuccess = true;
          } else if (
            signupUrl.includes('/dashboard') ||
            signupUrl.includes('/clients')
          ) {
            // On protected route but no token - might be app issue, but try to verify
            logInfo(
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
              logInfo('✅ App-level signals indicate authentication');
              loginSuccess = true;
            } else {
              // Not authenticated, try login
              logInfo('Not authenticated, trying login...');
              await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
              });
              await waitForStable(page, 1000);
              loginSuccess = await loginUser(page, testEmail, testPassword);
            }
          } else if (signupUrl.includes('/signup')) {
            // Still on signup page - signup might have failed or needs email confirmation
            logInfo('Still on signup page, checking if signup succeeded...');

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
              logInfo(`Delayed error found: ${errorText}`);

              // If account already exists, try login
              if (
                errorText &&
                (errorText.toLowerCase().includes('already exists') ||
                  errorText.toLowerCase().includes('already registered'))
              ) {
                logInfo('Account already exists, trying login...');
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
              logInfo(
                'No error message, signup might need email confirmation or manual login'
              );
              logInfo('Trying login with created account...');
              await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
              });
              await waitForStable(page, 1000);
              loginSuccess = await loginUser(page, testEmail, testPassword);
            }
          } else if (hasAuthToken) {
            // Have token but unexpected URL, navigate to dashboard
            logInfo(
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
            logInfo(
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
        logInfo(`Verifying final state. URL: ${finalUrl}`);

        // Wait a bit more for any async operations to complete
        await page.waitForTimeout(2000);

        // Check if we're actually authenticated (might be on dashboard but loginUser failed)
        // Check both localStorage and sessionStorage
        const hasAuthToken = await page
          .evaluate(() => {
            try {
              const checkStorage = (storage: Storage) => {
                const keys = Object.keys(storage);
                for (const key of keys) {
                  if (
                    key.toLowerCase().includes('supabase') &&
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
              return checkStorage(localStorage) || checkStorage(sessionStorage);
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
            logInfo(
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
              logInfo(
                '✅ Authentication confirmed (has auth indicators or token)'
              );
              loginSuccess = true;
            } else {
              // On dashboard but no clear indicators - wait a bit and check token again
              logInfo(
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
                logInfo('✅ Auth token found on retry');
                loginSuccess = true;
              } else {
                // Still on dashboard without token - might be app issue, but allow it
                logWarn(
                  '⚠️ On dashboard but no auth token found. Assuming authenticated (may be app configuration issue)'
                );
                loginSuccess = true;
              }
            }
          } else {
            // Has login form on protected route - check app-level signals
            logInfo(
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
              logWarn(
                '⚠️ Login form visible but auth indicators present - might be UI issue, assuming authenticated'
              );
              loginSuccess = true;
            } else {
              // No auth indicators and login form visible = not authenticated
              logWarn(`Login form visible on protected route - auth failed`);
              throw new Error(
                `Login failed after signup attempt. URL: ${finalUrl}, Has token: ${hasAuthToken}, Has login form: ${appLevelAuth.hasLoginForm}, Has auth indicators: ${appLevelAuth.hasAuthIndicators}`
              );
            }
          }
        } else {
          // Not on protected route and no token - check app-level signals
          logInfo(
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
            logInfo(
              '✅ App-level signals indicate authentication (no login form, has auth indicators)'
            );
            loginSuccess = true;
          } else {
            // Has login form or no auth indicators = not authenticated
            // But wait a bit more and try one more login attempt
            logWarn(
              `Login form visible: ${appLevelAuth.hasLoginForm}, Has auth indicators: ${appLevelAuth.hasAuthIndicators}, Has token: ${hasAuthToken}`
            );
            logInfo('Waiting a bit more and trying login one more time...');
            await page.waitForTimeout(3000);

            // Try login one more time
            await page.goto(targetUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
            await waitForStable(page, 2000);

            const finalLoginSuccess = await loginUser(
              page,
              testEmail,
              testPassword
            );

            if (!finalLoginSuccess) {
              // Final check - might be on protected route despite loginUser returning false
              const finalCheckUrl = page.url();
              const finalCheckToken = await page
                .evaluate(() => {
                  try {
                    const checkStorage = (storage: Storage) => {
                      const keys = Object.keys(storage);
                      for (const key of keys) {
                        if (
                          key.toLowerCase().includes('supabase') &&
                          key.toLowerCase().includes('auth')
                        ) {
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

              const isOnProtectedRouteFinal =
                finalCheckUrl.includes('/dashboard') ||
                finalCheckUrl.includes('/clients') ||
                finalCheckUrl.includes('/calendar') ||
                finalCheckUrl.includes('/connections') ||
                finalCheckUrl.includes('/sales');

              if (isOnProtectedRouteFinal || finalCheckToken) {
                logInfo('✅ Actually authenticated on final check');
                loginSuccess = true;
              } else {
                logWarn(`Login form visible: ${appLevelAuth.hasLoginForm}`);
                logWarn(
                  `Has auth indicators: ${appLevelAuth.hasAuthIndicators}`
                );
                logWarn(`Has auth token: ${hasAuthToken}`);
                throw new Error(
                  `Login failed after signup attempt. URL: ${finalUrl}, Has token: ${hasAuthToken}, Has login form: ${appLevelAuth.hasLoginForm}, Has auth indicators: ${appLevelAuth.hasAuthIndicators}`
                );
              }
            } else {
              loginSuccess = true;
            }
          }
        }
      }
    }

    logInfo('✅ Login function returned success');

    // Wait for redirect or verify authentication
    logInfo('⏳ Verifying authentication...');
    await page.waitForTimeout(2000); // Give React time to update state and redirect

    let currentUrl = page.url();
    logInfo(`Current URL after login: ${currentUrl}`);

    // Always verify authentication token, even if loginUser returned success
    // This catches cases where loginUser incorrectly returned success
    logInfo('Checking authentication state in browser storage...');
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

    logInfo(
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
      logWarn('❌ Authentication verification failed');
      logWarn(
        `Token check: ${authState.hasAuth ? '✅' : '❌'} (${authState.reason})`
      );
      logWarn(
        `App-level check: protected route=${appLevelAuth.isOnProtectedRoute}, login form=${appLevelAuth.hasLoginForm}, auth indicators=${appLevelAuth.hasAuthIndicators}`
      );

      // Try to get more information about why login failed
      const errorMessages = await page
        .getByText(/error|invalid|incorrect|failed/i)
        .allTextContents()
        .catch(() => []);
      if (errorMessages.length > 0) {
        logWarn(`Error messages on page: ${errorMessages.join(', ')}`);
      }

      throw new Error(
        `Authentication failed - no token and app-level signals indicate failure. Token: ${authState.reason}, App: protected=${appLevelAuth.isOnProtectedRoute}, loginForm=${appLevelAuth.hasLoginForm}, indicators=${appLevelAuth.hasAuthIndicators}`
      );
    }

    if (!authState.hasAuth) {
      logWarn(
        `⚠️ No token in storage but app-level signals indicate authentication (${authState.reason})`
      );
      logInfo('✅ Continuing with app-level authentication verification');
    } else {
      const storageType = authState.storage || 'localStorage';
      logInfo(`✅ Authentication token found (${storageType})`);
    }

    // Check if we're already on a protected route
    const isAlreadyOnProtectedRoute =
      currentUrl.includes('/dashboard') ||
      currentUrl.includes('/clients') ||
      currentUrl.includes('/calendar') ||
      currentUrl.includes('/connections') ||
      currentUrl.includes('/sales');

    if (isAlreadyOnProtectedRoute) {
      logInfo('✅ Already on protected route, authentication successful');
    } else {
      // If still on root page, try navigating to dashboard to verify auth
      // This will redirect to login if not authenticated, or show dashboard if authenticated
      if (currentUrl === baseURL || currentUrl === `${baseURL}/`) {
        logInfo(
          'Still on root page, navigating to dashboard to verify auth...'
        );
        try {
          await page.goto(`${baseURL}/dashboard`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          await page.waitForTimeout(3000); // Wait for potential redirect and React to update
          currentUrl = page.url();
          logInfo(`URL after navigating to dashboard: ${currentUrl}`);
        } catch (error) {
          logWarn(
            `Navigation to dashboard failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // Verify we're authenticated by checking URL
    const finalUrl = page.url();
    logInfo(`Final URL: ${finalUrl}`);

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

    logInfo('✅ Authentication verified');

    // Save authentication state
    const authDir = path.join(__dirname, '.auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const authFile = path.join(authDir, 'user.json');
    await page.context().storageState({ path: authFile });

    logInfo(`✅ Authentication state saved to ${authFile}`);
    logInfo(`✅ Logged in as ${testEmail}`);

    // ✅ Verify storageState works with WebKit (Mobile Safari uses WebKit)
    // This catches issues where Chromium storageState doesn't work in WebKit
    logInfo('🔍 Verifying storageState compatibility with WebKit...');
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
        logInfo('✅ WebKit storageState verification passed');
      } else {
        logWarn(
          '⚠️ WebKit storageState verification: redirected to login (may indicate storageState compatibility issue)'
        );
      }

      await webkitBrowser.close();
    } catch (error) {
      logWarn(
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
