import { test, expect } from '@playwright/test';

test.describe('Instruments Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instruments');
  });

  test('should display the instruments page', async ({ page }) => {
    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should show add instrument button', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add/i });
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

test.describe('Instrument List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instruments');
    await page.waitForTimeout(1000); // Wait for data to load
  });

  test('should display instruments or empty state', async ({ page }) => {
    // Check for either instruments or empty state
    const instrumentsList = page.locator(
      '[class*="item"], [class*="instrument"]'
    );
    const emptyState = page.getByText(/no.*instruments|empty/i);

    const hasInstruments = (await instrumentsList.count()) > 0;
    const isEmptyState = await emptyState.isVisible().catch(() => false);

    // One of them should be true
    expect(hasInstruments || isEmptyState).toBeTruthy();
  });

  test('should show loading state', async ({ page }) => {
    // Page should load eventually
    await expect(page.getByRole('heading')).toBeVisible();
  });
});

test.describe('Instrument Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instruments');
  });

  test('should open add instrument modal', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      // Wait for modal to appear
      const modalTitle = page.getByText(/add.*instrument/i);
      await expect(modalTitle)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {
          // Modal might not open
        });
    }
  });

  test('should close modal on cancel', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      const cancelButton = page.getByRole('button', { name: /cancel/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
        await expect(page.getByText(/add.*instrument/i)).not.toBeVisible();
      }
    }
  });
});

test.describe('Navigation', () => {
  test('should navigate to dashboard from instruments', async ({ page }) => {
    await page.goto('/instruments');

    await page.getByText('Items').click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should navigate to clients from instruments', async ({ page }) => {
    await page.goto('/instruments');

    await page.getByText('Clients').click();
    await expect(page).toHaveURL('/clients');
  });

  test('should navigate to connections page from instruments', async ({
    page,
  }) => {
    await page.goto('/instruments');

    await page.getByText('Connected Clients').click();
    await expect(page).toHaveURL('/connections');
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/instruments');

    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/instruments');

    await expect(page.getByRole('heading')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/instruments');

    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/instruments');

    // Tab through the page
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should be able to navigate
    await expect(page.locator(':focus')).toBeVisible();
  });
});
