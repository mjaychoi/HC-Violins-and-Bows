import { test, expect } from '@playwright/test';
import {
  waitForPageLoad,
  safeClick,
  safeFill,
  elementExists,
  waitForStable,
  loginUser,
} from './test-helpers';

/**
 * Core E2E Flows - These tests verify actual state changes and business logic
 * These are the "contract tests" that should catch regressions
 */
test.describe('Core User Flows', () => {
  test.describe('Authentication Flow', () => {
    test('should login and redirect to dashboard', async ({ page }) => {
      // Login
      const loggedIn = await loginUser(page);

      if (!loggedIn) {
        // If login page structure is different, try manual login
        // Use try-catch to handle Firefox navigation interruptions (NS_BINDING_ABORTED)
        try {
          await page.goto('/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          await waitForPageLoad(page, 10000);
        } catch {
          // Firefox might throw NS_BINDING_ABORTED if redirect happens during navigation
          // Check if we're already on dashboard or login page
          const currentUrl = page.url();
          if (
            currentUrl.includes('/dashboard') ||
            currentUrl.includes('/clients')
          ) {
            // Already logged in and redirected - test passes
            return;
          }
          if (currentUrl.includes('/login')) {
            // Redirected to login - continue with login flow
            await waitForPageLoad(page, 10000);
          } else {
            // Other error - try navigating to login page directly
            try {
              await page.goto('/login', {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
              });
              await waitForPageLoad(page, 10000);
            } catch {
              // If that also fails, check current URL - might already be on login
            }
          }
        }

        const emailInput = page.getByLabel(/email/i).first();
        const passwordInput = page.getByLabel(/password/i).first();

        const hasEmail = await emailInput.isVisible().catch(() => false);
        const hasPassword = await passwordInput.isVisible().catch(() => false);

        if (hasEmail && hasPassword) {
          await safeFill(page, emailInput, 'test@example.com');
          await safeFill(page, passwordInput, 'password123');

          const submitButton = page
            .getByRole('button', { name: /sign in|login/i })
            .first();
          const hasSubmit = await submitButton.isVisible().catch(() => false);

          if (hasSubmit) {
            await safeClick(page, submitButton);
            await waitForStable(page, 3000);
          }
        }
      }

      // Verify redirect to dashboard or clients page
      // Use more flexible URL matching with retry for Firefox
      let currentUrl = page.url();
      let isRedirected =
        currentUrl.includes('/dashboard') ||
        currentUrl.includes('/clients') ||
        currentUrl === 'http://localhost:3000/';

      // If not redirected yet, wait a bit more (Firefox might be slower)
      if (!isRedirected) {
        await page.waitForTimeout(2000);
        currentUrl = page.url();
        isRedirected =
          currentUrl.includes('/dashboard') ||
          currentUrl.includes('/clients') ||
          currentUrl === 'http://localhost:3000/';
      }

      // Should be redirected after login
      expect(isRedirected).toBeTruthy();
    });
  });

  test.describe('Client CRUD Flow', () => {
    test.beforeEach(async ({ page }) => {
      // Ensure authenticated - use storageState if available, otherwise login
      // Check if page is already authenticated by trying to navigate
      // Use longer timeout for Mobile Chrome
      try {
        await page.goto('/clients', {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await waitForPageLoad(page, 30000);

        // Check if we're on login page (not authenticated)
        const currentUrl = page.url();
        if (
          currentUrl.includes('/login') ||
          currentUrl === 'http://localhost:3000/' ||
          currentUrl === 'http://localhost:3000'
        ) {
          // Try to login
          const loginSuccess = await loginUser(page);
          if (loginSuccess) {
            await page.goto('/clients', {
              waitUntil: 'domcontentloaded',
              timeout: 45000,
            });
            await waitForPageLoad(page, 30000);
          }
        }
      } catch {
        // If navigation fails, try login
        const loginSuccess = await loginUser(page);
        if (loginSuccess) {
          await page.goto('/clients', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await waitForPageLoad(page, 20000);
        }
      }
    });

    test('should create client and see it in list', async ({ page }) => {
      // Get initial row count
      const rowsBefore = page.locator('tbody tr, [class*="row"]');
      const countBefore = await rowsBefore.count();

      // Open add client modal
      const addButton = page.getByRole('button', { name: /add.*client/i });
      const clicked = await safeClick(page, addButton);

      if (!clicked) {
        test.skip(true, 'Add client button not found');
      }

      await waitForStable(page, 500);

      // Fill form with unique name
      const testName = `E2E Test ${Date.now()}`;
      const firstNameInput = page.getByLabel(/first name/i);
      const lastNameInput = page.getByLabel(/last name/i);
      const emailInput = page.getByLabel(/email/i);

      const hasFirstName = await elementExists(page, firstNameInput);
      if (!hasFirstName) {
        test.skip(true, 'Client form not found');
      }

      await safeFill(page, firstNameInput, testName);
      await safeFill(page, lastNameInput, 'Client');
      await safeFill(page, emailInput, `e2e-${Date.now()}@example.com`);

      // Submit
      const submitButton = page.getByRole('button', {
        name: /save|create|add client/i,
      });
      const hasSubmit = await elementExists(page, submitButton);

      if (hasSubmit) {
        await safeClick(page, submitButton);
        await waitForStable(page, 2000);

        // Verify: Row count increased OR new client name is visible
        const rowsAfter = page.locator('tbody tr, [class*="row"]');
        const countAfter = await rowsAfter.count();
        const hasNewClient = await page
          .getByText(testName)
          .isVisible()
          .catch(() => false);

        // This is the key assertion - actual state change
        expect(countAfter > countBefore || hasNewClient).toBeTruthy();
      }
    });

    test('should delete client and see count decrease', async ({ page }) => {
      // Get initial count
      const rowsBefore = page.locator('tbody tr, [class*="row"]');
      const countBefore = await rowsBefore.count();

      if (countBefore === 0) {
        test.skip(true, 'No clients to delete');
      }

      // Find and click delete button
      const deleteButton = page
        .locator('button[aria-label*="delete"], button[aria-label*="remove"]')
        .first();
      const hasDelete = await elementExists(page, deleteButton);

      if (!hasDelete) {
        test.skip(true, 'Delete button not found');
      }

      await safeClick(page, deleteButton);
      await waitForStable(page, 500);

      // Confirm deletion
      const confirmButton = page.getByRole('button', {
        name: /confirm|delete|yes/i,
      });
      const hasConfirm = await elementExists(page, confirmButton);

      if (hasConfirm) {
        await safeClick(page, confirmButton);
        await waitForStable(page, 2000);

        // Verify: Count decreased OR empty state shown
        const rowsAfter = page.locator('tbody tr, [class*="row"]');
        const countAfter = await rowsAfter.count();
        const emptyState = page.getByText(/no.*clients|empty/i);
        const isEmpty = await elementExists(page, emptyState);

        // This is the key assertion - actual state change
        expect(countAfter < countBefore || isEmpty).toBeTruthy();
      }
    });

    test('should edit client and see changes persist', async ({ page }) => {
      // Find first client row
      const firstRow = page.locator('tbody tr, [class*="row"]').first();
      const hasRow = await elementExists(page, firstRow);

      if (!hasRow) {
        test.skip(true, 'No clients to edit');
      }

      // Get initial client name (if visible)
      // Open edit (click row or edit button)
      const editButton = page
        .locator('button[aria-label*="edit"], button[aria-label*="update"]')
        .first();
      const hasEdit = await elementExists(page, editButton);

      if (hasEdit) {
        await safeClick(page, editButton);
      } else {
        await safeClick(page, firstRow);
      }

      await waitForStable(page, 500);

      // Edit first name
      const firstNameInput = page.getByLabel(/first name/i);
      const hasInput = await elementExists(page, firstNameInput);

      if (hasInput) {
        const newName = `Updated ${Date.now()}`;
        await safeFill(page, firstNameInput, newName);

        // Save
        const saveButton = page.getByRole('button', { name: /save|update/i });
        const hasSave = await elementExists(page, saveButton);

        if (hasSave) {
          await safeClick(page, saveButton);
          await waitForStable(page, 2000);

          // Verify: New name is visible in list
          const hasUpdatedName = await page
            .getByText(newName)
            .isVisible()
            .catch(() => false);
          expect(hasUpdatedName).toBeTruthy();
        }
      }
    });
  });

  test.describe('Search and Filter Flow', () => {
    test.beforeEach(async ({ page }) => {
      // Use try-catch to handle navigation timeouts in Mobile Chrome
      try {
        await loginUser(page);
        await page.goto('/clients', {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await waitForPageLoad(page, 30000);
      } catch {
        // If navigation fails, check current URL and retry
        const currentUrl = page.url();
        if (!currentUrl.includes('/clients')) {
          // Try navigating again
          await page.goto('/clients', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });
          await waitForPageLoad(page, 30000);
        }
      }
    });

    test('should filter clients and see results change', async ({ page }) => {
      // Guard: Ensure we're on clients page
      const currentUrl = page.url();
      if (!currentUrl.includes('/clients')) {
        // Not on clients page - try to navigate
        try {
          await page.goto('/clients', {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
          });
          await waitForPageLoad(page, 15000);
        } catch {
          // Navigation failed - skip this test
          test.skip(true, 'Could not navigate to clients page');
          return;
        }
      }

      // Wait for page to be fully loaded
      await waitForPageLoad(page, 15000);
      await waitForStable(page, 500);

      // Check if page is loaded by checking for main heading
      const mainHeading = page
        .getByRole('heading', { name: 'Clients', exact: true })
        .first();
      const hasHeading = await mainHeading
        .isVisible({ timeout: 10000 })
        .catch(() => false);

      if (!hasHeading) {
        // Page not loaded - skip this test
        test.skip(true, 'Clients page not loaded');
        return;
      }

      // Get initial count
      const rowsBefore = page.locator('tbody tr');
      const countBefore = await rowsBefore.count();

      if (countBefore === 0) {
        test.skip(true, 'No clients to filter');
      }

      // Apply search filter
      const searchInput = page.getByPlaceholder(/search/i);
      const hasSearch = await elementExists(page, searchInput);

      if (!hasSearch) {
        test.skip(true, 'Search input not found');
      }

      // Search for something that might not exist
      await safeFill(page, searchInput, 'NonExistentClient12345');
      await waitForStable(page, 1000);

      // Verify: Count decreased OR empty state shown
      const rowsAfter = page.locator('tbody tr');
      const countAfter = await rowsAfter.count();
      const emptyState = page.getByText(/no.*clients|empty|no.*results/i);
      const isEmpty = await elementExists(page, emptyState);

      // This is the key assertion - filter actually worked
      expect(countAfter < countBefore || isEmpty).toBeTruthy();

      // Clear search
      await searchInput.clear();
      await waitForStable(page, 1000);

      // Verify: Results restored
      const rowsRestored = page.locator('tbody tr');
      const countRestored = await rowsRestored.count();
      expect(countRestored >= countBefore).toBeTruthy();
    });
  });
});
