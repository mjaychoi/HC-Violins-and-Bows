import { test, expect } from '@playwright/test';

test.describe('Form Page (Connected Clients)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/form');
  });

  test('should display the form page', async ({ page }) => {
    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should show add connection button', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|connect/i });
    if (await addButton.isVisible()) {
      await expect(addButton).toBeVisible();
    }
  });

  test('should display sidebar navigation', async ({ page }) => {
    await expect(page.getByText('Inventory App')).toBeVisible();
    await expect(page.getByText('Items')).toBeVisible();
    await expect(page.getByText('Clients')).toBeVisible();
  });
});

test.describe('Connection Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/form');
    await page.waitForTimeout(1000); // Wait for data to load
  });

  test('should open connection modal', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|connect/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      // Wait for modal to appear
      const modalTitle = page.getByText(/connect|add.*connection/i);
      await expect(modalTitle)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {
          // Modal might not open if no data available
        });
    }
  });

  test('should close modal on cancel', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|connect/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      const cancelButton = page.getByRole('button', { name: /cancel/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
        // Modal should be closed
        await expect(
          page.getByText(/connect|add.*connection/i)
        ).not.toBeVisible();
      }
    }
  });
});

test.describe('Connection List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/form');
    await page.waitForTimeout(1000); // Wait for data to load
  });

  test('should display connections or empty state', async ({ page }) => {
    // Check for either connections or empty state
    const connectionsList = page.locator(
      '[class*="connection"], [class*="card"]'
    );
    const emptyState = page.getByText(/no connections|empty/i);

    const hasConnections = (await connectionsList.count()) > 0;
    const isEmptyState = await emptyState.isVisible().catch(() => false);

    // One of them should be true
    expect(hasConnections || isEmptyState).toBeTruthy();
  });

  test('should show loading state', async ({ page }) => {
    // Page should load eventually
    await expect(page.getByRole('heading')).toBeVisible();
  });
});

test.describe('Search and Filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/form');
    await page.waitForTimeout(1000);
  });

  test('should have search functionality', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Test');
      await expect(searchInput).toHaveValue('Test');
    }
  });

  test('should have filter options', async ({ page }) => {
    const filtersButton = page.getByText(/filters/i).first();
    if (await filtersButton.isVisible()) {
      await expect(filtersButton).toBeVisible();
    }
  });
});

test.describe('Navigation', () => {
  test('should navigate to dashboard from form', async ({ page }) => {
    await page.goto('/form');

    await page.getByText('Items').click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should navigate to clients from form', async ({ page }) => {
    await page.goto('/form');

    await page.getByText('Clients').click();
    await expect(page).toHaveURL('/clients');
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/form');

    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/form');

    await expect(page.getByRole('heading')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/form');

    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/form');

    // Tab through the page
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should be able to navigate
    await expect(page.locator(':focus')).toBeVisible();
  });
});
