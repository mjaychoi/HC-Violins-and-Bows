import { test, expect, type Locator, type Page } from '@playwright/test';
import { waitForPageLoad, waitForStable } from './test-helpers';

async function expectFocusInsideDialog(dialog: Locator) {
  await expect
    .poll(async () =>
      dialog.evaluate(node => node.contains(document.activeElement))
    )
    .toBe(true);
}

async function expectTabStaysInsideDialog(page: Page, dialog: Locator) {
  await expectFocusInsideDialog(dialog);

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    await expectFocusInsideDialog(dialog);
  }

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Shift+Tab');
    await expectFocusInsideDialog(dialog);
  }
}

test.describe('Dialog keyboard accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await waitForPageLoad(page, 15000);
  });

  test('Add Item dialog traps focus, restores it, and can be completed by keyboard', async ({
    page,
  }) => {
    const addButton = page.getByRole('button', { name: /add item/i }).first();
    await expect(addButton).toBeVisible();
    await addButton.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /add new item/i })
    ).toBeVisible();
    await expectFocusInsideDialog(dialog);
    await expectTabStaysInsideDialog(page, dialog);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(addButton).toBeFocused();

    await addButton.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expectFocusInsideDialog(dialog);

    const suffix = Date.now().toString().slice(-6);
    await page.getByLabel(/^maker$/i).fill(`QA Keyboard ${suffix}`);
    await page.getByLabel(/^type$/i).fill('Violin');
    await dialog.getByRole('button', { name: /^add item$/i }).click();

    await expect(
      page.getByRole('heading', { name: /item created successfully/i })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /^done$/i }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('Edit Item dialog traps focus and restores it to the actions trigger', async ({
    page,
  }) => {
    const moreActions = page.getByRole('button', { name: /more actions/i });
    await expect(moreActions.first()).toBeVisible({ timeout: 15000 });

    const trigger = moreActions.first();
    await trigger.click();
    await page.getByRole('menuitem', { name: /^edit$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /edit item/i })
    ).toBeVisible();
    await expectFocusInsideDialog(dialog);
    await expectTabStaysInsideDialog(page, dialog);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await waitForStable(page, 300);
    await expect(trigger).toBeFocused();
  });
});
