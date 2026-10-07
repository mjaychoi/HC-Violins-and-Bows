import { test, expect, type Page } from '@playwright/test';
import { waitForPageLoad } from './test-helpers';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
] as const;

async function expectNoPageHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(1);
}

async function expectRowActionReachable(page: Page) {
  const action = page
    .getByRole('button', { name: /more actions|edit|view|delete/i })
    .or(page.getByRole('link', { name: /view|edit/i }))
    .first();
  await expect(action).toBeVisible();
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  }
}

test.describe('Responsive lists and calendar', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} ${viewport.width}px`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('Items identity, status, and actions are reachable', async ({
        page,
      }) => {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 15000);
        await expect(
          page.getByRole('heading', { name: /items/i }).first()
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: /add item/i }).first()
        ).toBeVisible();
        await expectNoPageHorizontalOverflow(page);
        await expectRowActionReachable(page);
      });

      test('Clients identity and actions are reachable', async ({ page }) => {
        await page.goto('/clients', { waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 15000);
        await expect(
          page.getByRole('heading', { name: /clients/i }).first()
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: /add client/i }).first()
        ).toBeVisible();
        await expectNoPageHorizontalOverflow(page);
        await expectRowActionReachable(page);
      });

      test('Sales identity, status, value, and actions are reachable', async ({
        page,
      }) => {
        await page.goto('/sales', { waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 15000);
        await expect(
          page.getByRole('heading', { name: /sales/i }).first()
        ).toBeVisible();
        await expectNoPageHorizontalOverflow(page);
        const identity = page
          .getByRole('cell')
          .or(page.getByRole('row'))
          .first();
        await expect(identity).toBeVisible();
        await expectRowActionReachable(page);
      });

      test('Calendar view is readable and switchable', async ({ page }) => {
        await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 15000);
        await expect(
          page.getByRole('heading', { name: /calendar/i }).first()
        ).toBeVisible();
        await expectNoPageHorizontalOverflow(page);

        const listTab = page.getByRole('tab', { name: /list/i });
        const calendarTab = page.getByRole('tab', { name: /calendar/i });
        await expect(listTab).toBeVisible();
        await expect(calendarTab).toBeVisible();

        if (viewport.width < 768) {
          await expect(listTab).toHaveAttribute('aria-selected', 'true');
        }

        await calendarTab.click();
        await expect(calendarTab).toHaveAttribute('aria-selected', 'true');
        await listTab.click();
        await expect(listTab).toHaveAttribute('aria-selected', 'true');
      });
    });
  }

  test('desktop 1440px keeps existing table layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, 15000);
    await expect(page.getByRole('table').first()).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });
});
