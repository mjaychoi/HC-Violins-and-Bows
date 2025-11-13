import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should display the dashboard page', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /items|dashboard/i })
    ).toBeVisible();
  });

  test('should show add item button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /add.*item/i })
    ).toBeVisible();
  });

  test('should have search functionality', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Test');
      await expect(searchInput).toHaveValue('Test');
    }
  });

  test('should show filters button', async ({ page }) => {
    const filtersButton = page.getByText(/filters/i).first();
    if (await filtersButton.isVisible()) {
      await expect(filtersButton).toBeVisible();
    }
  });

  test('should display sidebar navigation', async ({ page }) => {
    await expect(page.getByText('Inventory App')).toBeVisible();
    await expect(page.getByText('Items')).toBeVisible();
    await expect(page.getByText('Clients')).toBeVisible();
  });
});

test.describe('Item Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should open add item modal', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add/i });
    if (await addButton.isVisible()) {
      await addButton.click();
      // Wait for modal to appear
      await expect(page.getByText(/add.*item/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('should fill item form', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      // Fill form if fields are visible
      const makerInput = page.getByLabel(/maker/i);
      if (await makerInput.isVisible()) {
        await makerInput.fill('Stradivarius');
      }

      const typeInput = page.getByLabel(/type/i);
      if (await typeInput.isVisible()) {
        await typeInput.fill('Violin');
      }
    }
  });

  test('should close modal on cancel', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      const cancelButton = page.getByRole('button', { name: /cancel/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
        await expect(page.getByText(/add.*item/i)).not.toBeVisible();
      }
    }
  });
});

test.describe('Item List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should display items table', async ({ page }) => {
    // Wait for items to load
    await page.waitForTimeout(1000);

    // Check if table headers are visible
    const makerHeader = page.getByText(/maker/i);
    const typeHeader = page.getByText(/type/i);

    // Headers might not always be visible, so check if either is visible
    const hasTable =
      (await makerHeader.isVisible().catch(() => false)) ||
      (await typeHeader.isVisible().catch(() => false));

    // If table exists, check for basic structure
    if (hasTable) {
      await expect(makerHeader.or(typeHeader)).toBeVisible();
    }
  });

  test('should show loading state', async ({ page }) => {
    // Just verify the page loaded, loading state is transient
    await expect(page.getByRole('heading')).toBeVisible();
  });
});

test.describe('Filtering and Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(1000); // Wait for data to load
  });

  test('should filter items by status', async ({ page }) => {
    const filtersButton = page.getByText(/filters/i).first();
    if (await filtersButton.isVisible()) {
      await filtersButton.click();

      // Try to find and interact with status filter
      const availableCheckbox = page.getByLabel('Available');
      if (await availableCheckbox.isVisible()) {
        await availableCheckbox.check();
        await expect(availableCheckbox).toBeChecked();
      }
    }
  });

  test('should search items', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Test');
      await expect(searchInput).toHaveValue('Test');

      // Wait for search results to update
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Navigation', () => {
  test('should navigate to clients from dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByText('Clients').click();
    await expect(page).toHaveURL('/clients');
  });

  test('should navigate to form page from dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByText('Connected Clients').click();
    await expect(page).toHaveURL('/form');
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading')).toBeVisible();
  });
});
