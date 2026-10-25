import { expect, test } from '@playwright/test';

test('home page renders the DashDB heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'DashDB' })).toBeVisible();
});
