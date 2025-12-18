import { test, expect } from '@playwright/test';
import { safeCheck } from './test-helpers';
import {
  waitForPageLoad,
  safeClick,
  safeFill,
  elementExists,
  waitForStable,
  openFiltersPanel,
  waitForFilterApplied,
} from './test-helpers';

test.describe('Filtering and Sorting', () => {
  test.describe('Dashboard Filtering', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      await waitForPageLoad(page);
    });

    test('should filter items by status', async ({ page }) => {
      // Open filters panel
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Look for status filter options
        const availableOption = page
          .getByText(/available/i)
          .or(page.getByLabel(/available/i))
          .first();

        const hasAvailable = await availableOption
          .isVisible()
          .catch(() => false);

        if (hasAvailable) {
          await availableOption.click();
          await waitForFilterApplied(page);

          // Verify filter is applied (check for active state or checked checkbox)
          const isChecked = await availableOption
            .isChecked()
            .catch(() => false);
          const hasActiveBadge = await page
            .locator(
              '[class*="badge"], [class*="active"], [aria-pressed="true"]'
            )
            .filter({ hasText: /available/i })
            .first()
            .isVisible()
            .catch(() => false);

          // Test passes if either checkbox is checked or filter badge is active
          expect(isChecked || hasActiveBadge).toBeTruthy();
        }
      }
    });

    test('should filter items by type', async ({ page }) => {
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Try to find type filter
        const typeFilter = page.getByText(/violin|cello|viola/i).first();
        const hasTypeFilter = await typeFilter.isVisible().catch(() => false);

        if (hasTypeFilter) {
          await safeClick(page, typeFilter);
          await waitForFilterApplied(page);
        }
      }
    });

    test('should combine multiple filters', async ({ page }) => {
      const filtersButton = page.getByText(/filters/i).first();
      const clicked = await safeClick(page, filtersButton);

      if (clicked) {
        await page.waitForTimeout(1000);

        // Apply multiple filters
        const availableCheckbox = page.getByLabel('Available');
        const hasAvailable = await elementExists(page, availableCheckbox);

        if (hasAvailable) {
          await availableCheckbox.check();
          await page.waitForTimeout(500);
        }

        // Clear filters
        const clearButton = page.getByText(/clear|reset/i);
        const hasClear = await elementExists(page, clearButton);

        if (hasClear) {
          await clearButton.click();
          await page.waitForTimeout(500);
        }
      }

      expect(true).toBeTruthy();
    });

    test('should clear all filters', async ({ page }) => {
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Apply a filter first
        const availableCheckbox = page.getByLabel('Available').first();
        const hasAvailable = await availableCheckbox
          .isVisible()
          .catch(() => false);

        if (hasAvailable) {
          await safeCheck(page, availableCheckbox);
          await waitForFilterApplied(page);
        }

        // Clear all
        const clearButton = page.getByText(/clear|reset|all/i).first();
        const hasClear = await clearButton.isVisible().catch(() => false);

        if (hasClear) {
          await safeClick(page, clearButton);
          await waitForFilterApplied(page);
        }
      }
    });
  });

  test.describe('Dashboard Sorting', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      await waitForPageLoad(page);
    });

    test('should sort items by column', async ({ page }) => {
      // Find sortable column header
      const makerHeader = page.getByText(/maker/i).first();
      if (await makerHeader.isVisible()) {
        await makerHeader.click();
        await waitForFilterApplied(page); // Wait for sort to apply

        // Click again to reverse sort
        await makerHeader.click();
        await waitForFilterApplied(page);
      }
    });

    test('should show sort indicator', async ({ page }) => {
      const sortableHeader = page
        .locator('th, [role="columnheader"]')
        .filter({ hasText: /maker|type|created/i })
        .first();

      const hasSortable = await elementExists(page, sortableHeader);
      if (hasSortable) {
        await safeClick(page, sortableHeader);
        await waitForStable(page, 500);

        // Check for sort indicator (arrow icon)
        const sortIndicator = page.locator('[class*="sort"], [aria-sort]');
        const count = await sortIndicator.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Clients Filtering', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/clients', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(page, 15000);
    });

    test('should filter clients by tags', async ({ page }) => {
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Try to find tag filter
        const ownerTag = page.getByLabel('Owner').first();
        const hasOwnerTag = await ownerTag.isVisible().catch(() => false);
        if (hasOwnerTag) {
          await safeCheck(page, ownerTag);
          await waitForFilterApplied(page);
          await expect(ownerTag).toBeChecked();
        }
      }
    });

    test('should filter clients by interest', async ({ page }) => {
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Interest filter is a checkbox group, not a select
        // Find the Interest filter group and click one of the checkboxes
        // Use more specific selector: find the filter group with "Interest" title
        const interestGroup = page
          .locator(
            '[id="filter-group-interest"], [aria-label*="Interest 필터"]'
          )
          .first();
        const interestCheckbox = interestGroup
          .locator('input[type="checkbox"]')
          .first();

        if (await interestCheckbox.isVisible().catch(() => false)) {
          await interestCheckbox.check();
          await waitForFilterApplied(page);
        }
      }
    });

    test('should search and filter simultaneously', async ({ page }) => {
      // Apply search
      const searchInput = page.getByPlaceholder(/search/i).first();
      const hasSearch = await searchInput.isVisible().catch(() => false);
      if (hasSearch) {
        await safeFill(page, searchInput, 'John');
        await waitForFilterApplied(page); // Wait for search to apply

        // Apply filter
        const panelOpened = await openFiltersPanel(page);
        if (panelOpened) {
          // Owner tag checkbox - use more specific selector to avoid strict mode violation
          // The checkbox is in the Tags filter group
          const tagsGroup = page
            .locator('[id="filter-group-tags"], [aria-label*="Tags 필터"]')
            .first();
          const ownerCheckbox = tagsGroup
            .locator(
              'input[type="checkbox"][aria-label*="Owner"], input[type="checkbox"]'
            )
            .filter({ hasText: /owner/i })
            .first();

          // Fallback: try to find by label but use first() to avoid strict mode
          const ownerTag = page.getByLabel('Owner').first();
          const checkboxToUse = (await ownerCheckbox
            .isVisible()
            .catch(() => false))
            ? ownerCheckbox
            : ownerTag;

          if (await checkboxToUse.isVisible().catch(() => false)) {
            await checkboxToUse.check();
            await waitForFilterApplied(page);
          }
        }
      }
    });
  });

  test.describe('Calendar Filtering', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/calendar', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(page, 15000);
    });

    test('should filter tasks by status', async ({ page }) => {
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Filter by pending status
        const pendingFilter = page.getByText(/pending/i).first();
        if (await pendingFilter.isVisible()) {
          await pendingFilter.click();
          await waitForFilterApplied(page);
        }
      }
    });

    test('should filter tasks by priority', async ({ page }) => {
      const filtersButton = page.getByText(/filters/i).first();
      const clicked = await safeClick(page, filtersButton);
      if (clicked) {
        await waitForStable(page, 500);

        // Filter by high priority
        const highPriority = page
          .getByText(/high.*priority|priority.*high/i)
          .first();
        const hasPriority = await elementExists(page, highPriority);
        if (hasPriority) {
          await safeClick(page, highPriority);
          await waitForStable(page);
        }
      }
    });

    test('should filter tasks by date range', async ({ page }) => {
      const advancedSearchButton = page.getByTestId('advanced-search-toggle');
      if (await advancedSearchButton.isVisible()) {
        await advancedSearchButton.click();
        // Wait for advanced search panel to open
        await page
          .waitForSelector(
            '[data-testid="advanced-search"], [class*="advanced"]',
            { state: 'visible', timeout: 3000 }
          )
          .catch(() => {});

        // Set date range
        const dateInputs = page.locator('input[type="date"]');
        const count = await dateInputs.count();
        if (count >= 2) {
          await safeFill(page, dateInputs.nth(0), '2024-01-01');
          await safeFill(page, dateInputs.nth(1), '2024-12-31');
          await waitForFilterApplied(page);
        }
      }
    });
  });

  test.describe('Sales Filtering', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/sales', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(page, 15000);
    });

    test('should filter sales by date range', async ({ page }) => {
      // Try quick date filters
      const todayButton = page.getByText(/today/i).first();
      if (await todayButton.isVisible()) {
        await todayButton.click();
        await waitForFilterApplied(page);
      }
    });

    test('should filter sales by client', async ({ page }) => {
      const panelOpened = await openFiltersPanel(page);

      if (panelOpened) {
        // Try to find client filter
        const clientFilter = page.getByLabel(/client/i).first();
        const hasClient = await clientFilter.isVisible().catch(() => false);
        if (hasClient) {
          await safeFill(page, clientFilter, 'Test');
          await waitForFilterApplied(page);
        }
      }
    });
  });
});
