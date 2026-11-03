// DashDB Community has no account, sharing or billing pages, and adds nothing to the editor.
import { expect, test } from '@playwright/test';

for (const path of [
  '/login',
  '/signup',
  '/verify',
  '/reset',
  '/settings',
  '/settings/profile',
  '/share/abc',
  '/invite/abc',
  '/billing',
]) {
  test(`${path} is 404`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  });
}

test('the editor has no edition slots', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill('Community');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('fixture-top-bar-item')).toHaveCount(0);
  await expect(page.getByTestId('edition-overlays')).toHaveCount(0);
});
