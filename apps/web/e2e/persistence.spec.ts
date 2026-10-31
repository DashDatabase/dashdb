import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function openTemplate(page: Page, name: RegExp) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'From template' }).click();
  await page.getByRole('menuitem', { name }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Saved locally' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Schema' });

test('reload restores the schema, selection and panels exactly', async ({ page }) => {
  await openTemplate(page, /Blog/);
  await sidebar(page)
    .getByRole('button', { name: /^posts\s*\d+$/ })
    .click();
  const inspector = page.getByTestId('inspector');
  await inspector.getByLabel('Table name').fill('articles');
  await inspector.getByLabel('Table name').press('Enter');
  await inspector.getByRole('button', { name: /^title/ }).click();
  await page.getByRole('tab', { name: 'Migration' }).click();
  await page.getByRole('tab', { name: 'Inspector' }).click();
  await page.getByTestId('canvas').click();
  await page.keyboard.press('ControlOrMeta+b');
  await expect(sidebar(page)).toBeHidden();
  await expect(saved(page)).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(sidebar(page)).toBeHidden();
  await expect(page.getByTestId('inspector').getByLabel('Column name')).toHaveValue('title');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(sidebar(page).getByRole('button', { name: /^articles\s*\d+$/ })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: /^posts\s*\d+$/ })).toHaveCount(0);
});

test('undo groups edits by user action', async ({ page }) => {
  await openTemplate(page, /Blank/);
  await page.getByTestId('canvas').click();
  await page.keyboard.press('t');
  await page.keyboard.press('c');
  await expect(page.getByTestId('inspector').getByLabel('Column name')).toHaveValue('new_column');

  await page.getByTestId('canvas').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('table-count')).toHaveText('1 table');
  await expect(page.getByTestId('inspector').getByText('new_column')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('table-count')).toHaveText('0 tables');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('saves baselines and keeps the three most recent', async ({ page }) => {
  await openTemplate(page, /SaaS/);
  await page.getByRole('tab', { name: 'Migration' }).click();
  const panel = page.getByTestId('baselines');
  for (let i = 1; i <= 4; i++) {
    await panel.getByRole('button', { name: 'Save baseline' }).click();
    await expect(panel.getByRole('listitem')).toHaveCount(Math.min(i, 3));
  }
  await page.reload();
  await page.getByRole('tab', { name: 'Migration' }).click();
  await expect(page.getByTestId('baselines').getByRole('listitem')).toHaveCount(3);
});

test('exports a project file and imports it as a new project', async ({ page }) => {
  await openTemplate(page, /E-commerce/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('canvas').click();
  await page.keyboard.press('ControlOrMeta+Shift+s');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('e-commerce.dashdb.json');
  const path = await download.path();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Playwright download path
  const contents = await readFile(path, 'utf8');
  expect(JSON.parse(contents)).toMatchObject({ format: 'dashdb.project', version: 1 });

  await page.goto('/app');
  await page.getByTestId('import-file-input').setInputFiles({
    name: 'e-commerce.dashdb.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('table-count')).toHaveText('4 tables');
  await page.goto('/app');
  await expect(page.getByRole('list', { name: 'Projects' }).getByRole('listitem')).toHaveCount(2);
});

test('a malformed project file shows errors and changes nothing', async ({ page }) => {
  await openTemplate(page, /Blog/);
  await page.goto('/app');
  const projects = page.getByRole('list', { name: 'Projects' });
  await expect(projects.getByRole('listitem')).toHaveCount(1);

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'broken.dashdb.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'dashdb.project',
        version: 1,
        exportedAt: '2026-10-31T00:00:00.000Z',
        project: { name: 'Broken', schema: { tables: 'nope' }, layout: {}, baselines: [] },
      }),
    ),
  });
  const dialog = page.getByRole('dialog', { name: 'Could not import broken.dashdb.json' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('import-errors')).toContainText('project.schema');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'garbage.dashdb.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not json'),
  });
  await expect(page.getByTestId('import-errors')).toContainText('Not valid JSON');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(projects.getByRole('listitem')).toHaveCount(1);
  await projects.getByRole('link').click();
  await expect(page.getByTestId('table-count')).toHaveText('5 tables');
});

test('warns when the same project is open in two tabs and stops the stale tab saving', async ({
  page,
  context,
}) => {
  await openTemplate(page, /Blog/);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('other-tab-warning')).toBeVisible();
  await expect(second.getByTestId('other-tab-warning')).toBeVisible();

  // Tab 1 saves; tab 2 now holds a stale copy and must not overwrite it.
  await page.getByTestId('canvas').click();
  await page.keyboard.press('t');
  await expect(saved(page)).toBeVisible();
  await expect(
    second.getByRole('alert').filter({ hasText: 'changed in another tab' }),
  ).toBeVisible();

  await second.getByTestId('canvas').click();
  await second.keyboard.press('t');
  await expect(second.getByRole('status').filter({ hasText: 'Not saving' })).toBeVisible();

  // Like a real tab close: run unload handlers (pagehide).
  await second.close({ runBeforeUnload: true });
  await expect(page.getByTestId('other-tab-warning')).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('table-count')).toHaveText('6 tables');
});
