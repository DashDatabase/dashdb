import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function chooseTheme(page: Page, name: 'Light' | 'Dark' | 'System') {
  await page.getByRole('button', { name: 'Change theme' }).first().click();
  await page.getByRole('menuitemradio', { name }).click();
}

async function expectNoAxeViolations(page: Page) {
  // Resizable handles get aria-valuenow once the panel group has measured its layout.
  await expect(page.locator('[data-slot="resizable-handle"]:not([aria-valuenow])')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 160)} ${n.failureSummary ?? ''}`),
    ),
  ).toEqual([]);
}

test.describe('/design', () => {
  test('passes axe in the light page theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/design');
    await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await expectNoAxeViolations(page);
  });

  test('passes axe in the dark page theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/design');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expectNoAxeViolations(page);
  });

  test('passes axe with a dialog open', async ({ page }) => {
    await page.goto('/design');
    // Retry the click until hydration has attached the trigger's handler.
    await expect(async () => {
      await page.getByRole('button', { name: 'Dialog', exact: true }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expectNoAxeViolations(page);
  });
});

test.describe('theme toggle', () => {
  test('persists the chosen theme across reloads and pages', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    await chooseTheme(page, 'Dark');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.goto('/design');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await chooseTheme(page, 'Light');
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });

  test('defaults /app to dark when nothing is stored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/app');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });
});
