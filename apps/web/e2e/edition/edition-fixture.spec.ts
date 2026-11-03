// Runs against the app built with the test edition (playwright.edition.config.ts): its top-bar
// item and login page appear, the rest stay 404.
import { expect, test } from '@playwright/test';

test('the edition adds a top-bar item to the editor', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill('Fixture');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  // A cold dev server compiles the editor route on first visit.
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/, { timeout: 60_000 });
  await expect(page.getByTestId('editor')).toBeVisible({ timeout: 60_000 });
  const projectId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  await expect(page.getByTestId('fixture-top-bar-item')).toHaveText(
    `Fixture edition · ${projectId}`,
  );
});

test('the edition provides /login, not indexed', async ({ page }) => {
  await page.goto('/login?next=/app/p/x');
  await expect(page.getByRole('heading', { name: 'Fixture login' })).toBeVisible();
  await expect(page.getByTestId('fixture-login-next')).toHaveText('/app/p/x');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('routes the edition does not provide are 404', async ({ page }) => {
  const response = await page.goto('/billing');
  expect(response?.status()).toBe(404);
});
