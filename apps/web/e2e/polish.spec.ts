import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 160) ?? ''}`)).toEqual([]);
}

async function openTemplate(page: Page, name: RegExp) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'From template' }).click();
  await page.getByRole('menuitem', { name }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

test.describe('first run', () => {
  // A brand-new visitor: no saved onboarding state.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('opens the SaaS starter and walks through the four-step tour', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/);
    await expect(page.getByLabel('Project name')).toHaveValue('SaaS starter');
    const tour = page.getByTestId('tour');
    await expect(tour).toContainText('Step 1 of 4');
    await expect(tour).toContainText('Add a column');

    // 1. Add a column: select a table, press C.
    await page
      .getByRole('navigation', { name: 'Schema' })
      .getByRole('button', { name: /^users\s*\d+$/ })
      .click();
    await page.keyboard.press('c');
    await expect(tour).toContainText('Step 2 of 4');

    // 2. Save a baseline.
    await page.keyboard.press('ControlOrMeta+Alt+s');
    await expect(tour).toContainText('Step 3 of 4');

    // 3. Change something.
    await page.keyboard.press('t');
    await expect(tour).toContainText('Step 4 of 4');

    // 4. Generate the migration.
    await page.keyboard.press('ControlOrMeta+g');
    await expect(tour).toBeHidden();
    await expect(page.getByTestId('announcer')).toContainText('Tour complete');

    // Remembered: the projects page no longer starts a tour.
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  });

  test('can be dismissed, and is remembered', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('tour')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'End tour' }).click();
    await expect(page.getByTestId('tour')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('tour')).toBeHidden();

    // And restarted from the palette.
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('tour');
    await page.getByRole('option', { name: /Restart guided tour/ }).click();
    await expect(page.getByTestId('tour')).toContainText('Step 1 of 4');
  });
});

test.describe('polish', () => {
  test('shows every shortcut in the ? cheat sheet', async ({ page }) => {
    await openTemplate(page, /Blog/);
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Shift+?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    for (const title of ['Add table', 'Generate migration', 'Undo', 'Search tables'])
      await expect(sheet.getByText(title, { exact: true })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('uses T, Del and Ctrl/⌘+G, and announces edits', async ({ page }) => {
    await openTemplate(page, /Blog/);
    const count = page.getByTestId('table-count');
    await expect(count).toHaveText('5 tables');
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('t');
    await expect(count).toHaveText('6 tables');
    await expect(page.getByTestId('announcer')).toContainText('Add table');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('announcer')).toContainText('Undid add table');

    await page
      .getByTestId('canvas')
      .locator('[data-testid="table-node"][data-table="tags"]')
      .click();
    await page.keyboard.press('Delete');
    await page
      .getByRole('button', { name: /^Delete/ })
      .last()
      .click();
    await expect(count).toHaveText('4 tables');

    await page.keyboard.press('ControlOrMeta+g');
    await expect(page.getByRole('tab', { name: 'Migration', selected: true })).toBeVisible();
  });

  test('moves between sidebar tables with the arrow keys', async ({ page }) => {
    await openTemplate(page, /Blog/);
    const sidebar = page.getByRole('navigation', { name: 'Schema' });
    const first = sidebar.getByRole('list').first().getByRole('button').first();
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(sidebar.getByRole('list').first().getByRole('button').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(sidebar.getByRole('list').first().getByRole('button').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-current', 'true');
  });

  test('offers a project export when the editor crashes', async ({ page }) => {
    await openTemplate(page, /Blog/);
    await page.goto(`${page.url()}?crash`);
    const fallback = page.getByTestId('error-fallback');
    await expect(fallback).toContainText('Something went wrong in the editor');
    const download = page.waitForEvent('download');
    await fallback.getByRole('button', { name: 'Export your project' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('blog.dashdb.json');
    const text = Buffer.concat(await (await file.createReadStream()).toArray()).toString('utf8');
    expect(JSON.parse(text)).toMatchObject({ format: 'dashdb.project', project: { name: 'Blog' } });
    await expectNoAxeViolations(page);
  });
});
