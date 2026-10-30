import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

async function openTemplate(page: Page, name: RegExp) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'From template' }).click();
  await page.getByRole('menuitem', { name }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

const canvas = (page: Page) => page.getByTestId('canvas');
const tableNode = (page: Page, name: string) =>
  canvas(page).locator(`[data-testid="table-node"][data-table="${name}"]`);
const columnRow = (page: Page, table: string, column: string) =>
  tableNode(page, table).locator(`[data-testid="column-row"][data-column="${column}"]`);
const panel = (page: Page) => page.getByTestId('migration-panel');
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Schema' });

async function addColumn(page: Page, table: string, name: string) {
  await page.getByRole('button', { name: `Actions for table ${table}` }).click();
  await page.getByRole('menuitem', { name: 'Add column' }).click();
  const input = canvas(page).getByLabel('Column name');
  await input.fill(name);
  await input.press('Enter');
  await expect(columnRow(page, table, name)).toBeVisible();
}

async function renameColumn(page: Page, table: string, from: string, to: string) {
  await columnRow(page, table, from).dblclick();
  const input = canvas(page).getByLabel('Column name');
  await input.fill(to);
  await input.press('Enter');
  await expect(columnRow(page, table, to)).toBeVisible();
}

/** Opens a column in the Inspector: the table from the sidebar, then the column. */
async function inspectColumn(page: Page, table: string, column: string) {
  await page.getByRole('tab', { name: 'Inspector' }).click();
  // Buttons read "posts 7" and "body text": match the element holding exactly the name.
  await sidebar(page)
    .getByRole('button')
    .filter({ has: page.getByText(table, { exact: true }) })
    .click();
  await page
    .getByTestId('inspector')
    .getByRole('button')
    .filter({ has: page.getByText(column, { exact: true }) })
    .click();
}

async function deleteColumn(page: Page, table: string, column: string) {
  await inspectColumn(page, table, column);
  await page.getByRole('button', { name: 'Delete column' }).click();
  await expect(columnRow(page, table, column)).toHaveCount(0);
}

async function makeRequired(page: Page, table: string, column: string) {
  await inspectColumn(page, table, column);
  const nullable = page.getByTestId('inspector').getByLabel('Nullable');
  await nullable.click();
  await expect(nullable).not.toBeChecked();
}

test.describe('migration panel', () => {
  test('add column + rename + drop: warnings, rename dialog, output and files', async ({
    page,
  }) => {
    await openTemplate(page, /Blog/);
    await page.getByRole('tab', { name: 'Migration' }).click();
    await expect(panel(page).getByTestId('migration-empty')).toBeVisible();
    await page.getByTestId('baselines').getByRole('button', { name: 'Save baseline' }).click();
    await expect(panel(page).getByTestId('migration-empty')).toBeHidden();

    await addColumn(page, 'users', 'bio');
    await renameColumn(page, 'users', 'display_name', 'full_name');
    await deleteColumn(page, 'comments', 'body');
    // A drop plus a similar add: the diff can't tell it from a rename, so it asks.
    await deleteColumn(page, 'posts', 'body');
    await addColumn(page, 'posts', 'body_md');
    await makeRequired(page, 'posts', 'body_md');

    await page.getByRole('tab', { name: 'Migration' }).click();
    await panel(page).getByLabel('Name').fill('Profile changes!');
    await expect(panel(page).getByTestId('migration-slug')).toHaveText('profile_changes');
    await panel(page)
      .getByRole('button', { name: /Generate migration/ })
      .click();

    const dialog = page.getByTestId('rename-dialog');
    await expect(dialog).toContainText('Did you rename posts.body to posts.body_md');
    await dialog.getByRole('button', { name: 'Renamed' }).click();
    await expect(dialog).toBeHidden();

    const result = panel(page).getByTestId('migration-result');
    const up = result.getByTestId('migration-up');
    await expect(up).toContainText('ALTER TABLE posts RENAME COLUMN body TO body_md;');
    await expect(up).toContainText('ALTER TABLE users ADD COLUMN bio text;');
    await expect(up).toContainText('ALTER TABLE users RENAME COLUMN display_name TO full_name;');
    await expect(up).toContainText('ALTER TABLE comments DROP COLUMN body;');
    await expect(result.getByTestId('operation-count')).toHaveText('4 operations');
    await expect(result.getByTestId('risk-badge')).toHaveAttribute('data-risk', 'dangerous');
    await expect(result.getByTestId('destructive-count')).toHaveText('1 destructive');
    await expect(result.getByTestId('irreversible-count')).toHaveText('1 irreversible');

    // Safety findings: the drop and both renames.
    const findings = result.getByTestId('finding');
    await expect(findings.and(page.locator('[data-rule="drop-column"]'))).toHaveCount(1);
    await expect(findings.and(page.locator('[data-rule="rename-breaks-app"]'))).toHaveCount(2);
    await expect(findings.first()).toHaveAttribute('data-severity', 'dangerous');

    // The down migration reverses everything.
    await result.getByRole('tab', { name: 'Down' }).click();
    const down = result.getByTestId('migration-down');
    await expect(down).toContainText('ALTER TABLE users DROP COLUMN bio;');
    await expect(down).toContainText('RENAME COLUMN full_name TO display_name;');
    await expect(down).toContainText('ALTER TABLE comments ADD COLUMN body text');
    await result.getByRole('tab', { name: 'Up' }).click();

    // The canvas shows what changed.
    await expect(tableNode(page, 'users')).toHaveAttribute('data-change', 'changed');
    await expect(columnRow(page, 'users', 'bio')).toHaveAttribute('data-change', 'added');
    await expect(columnRow(page, 'users', 'full_name')).toHaveAttribute('data-change', 'changed');
    await expect(tableNode(page, 'comments').getByTestId('removed-column')).toHaveText(/body/);
    await expect(tableNode(page, 'tags')).not.toHaveAttribute('data-change', /.+/);

    await expect(
      findings.and(page.locator('[data-rule="drop-column"]')).getByRole('link', { name: 'Docs' }),
    ).toHaveAttribute('href', '/guides/postgres/drop-column');

    // Use the safer alternative for the drop: the statement is replaced in the up migration.
    const drop = findings.and(page.locator('[data-rule="drop-column"]'));
    await drop.getByRole('button', { name: 'Show safer alternative' }).click();
    await drop.getByRole('button', { name: 'Use in migration' }).click();
    await expect(up).toContainText('DashDB safer alternative (drop-column)');
    await expect(up).toContainText('-- ALTER TABLE comments DROP COLUMN body;');

    // Prisma bundle in the exact folder layout, with the alternative in migration.sql.
    await panel(page).getByLabel('Output').click();
    await page.getByRole('option', { name: 'Prisma Migrate' }).click();
    await expect(up).toContainText('ALTER TABLE users ADD COLUMN bio text;');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      result.getByRole('button', { name: 'Download .zip' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-profile_changes-prisma\.zip$/);
    const path = await download.path();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Playwright download path
    const zip = await JSZip.loadAsync(await readFile(path));
    const paths = Object.keys(zip.files)
      .filter((p) => !zip.files[p]?.dir)
      .sort();
    expect(paths).toEqual([
      expect.stringMatching(/^prisma\/migrations\/\d{14}_profile_changes\/down\.sql$/),
      expect.stringMatching(/^prisma\/migrations\/\d{14}_profile_changes\/migration\.sql$/),
      'prisma/migrations/migration_lock.toml',
      'prisma/schema.prisma',
    ]);
    const migration = await zip.file(paths[1] ?? '')?.async('string');
    expect(migration).toContain('DashDB safer alternative (drop-column)');
    expect(migration).toContain('ALTER TABLE users ADD COLUMN bio text;');

    // Mark as applied: a new baseline, and nothing left to migrate.
    await result.getByRole('button', { name: 'Mark as applied' }).click();
    await expect(panel(page).getByTestId('no-changes')).toBeVisible();
    await expect(page.getByTestId('baselines').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('baselines')).toContainText('Profile changes!');
  });

  test('generates from an empty database and highlights every table as added', async ({ page }) => {
    await openTemplate(page, /Blog/);
    await page.getByRole('tab', { name: 'Migration' }).click();
    await panel(page).getByRole('button', { name: 'Generate from an empty database' }).click();
    const result = panel(page).getByTestId('migration-result');
    await expect(result.getByTestId('risk-badge')).toHaveAttribute('data-risk', 'safe');
    await expect(result.getByTestId('no-findings')).toBeVisible();
    await expect(result.getByTestId('migration-up')).toContainText('CREATE TABLE users');
    await expect(tableNode(page, 'posts')).toHaveAttribute('data-change', 'added');

    // Leaving the tab hides the overlay; coming back restores the result.
    await page.getByRole('tab', { name: 'Inspector' }).click();
    await expect(tableNode(page, 'posts')).not.toHaveAttribute('data-change', /.+/);
    await page.getByRole('tab', { name: 'Migration' }).click();
    await expect(tableNode(page, 'posts')).toHaveAttribute('data-change', 'added');
  });

  test('shows removed tables as ghosts on the canvas', async ({ page }) => {
    await openTemplate(page, /Blog/);
    await page.getByRole('tab', { name: 'Migration' }).click();
    await page.getByTestId('baselines').getByRole('button', { name: 'Save baseline' }).click();
    await tableNode(page, 'post_tags').click();
    await page.keyboard.press('ControlOrMeta+Backspace');
    await page.getByRole('button', { name: 'Delete table', exact: true }).click();
    await expect(tableNode(page, 'post_tags')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(panel(page).getByTestId('migration-up')).toContainText('DROP TABLE post_tags;');
    await expect(canvas(page).getByTestId('ghost-table')).toHaveAttribute(
      'data-table',
      'post_tags',
    );
  });

  test('generates a migration for 300 tables in under a second', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabel('Name').fill('Big');
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await page.getByTestId('fps-meter').getByRole('button', { name: 'Load 300' }).click();
    await expect(page.getByTestId('table-count')).toHaveText('300 tables');

    await page.getByRole('tab', { name: 'Migration' }).click();
    const generate = panel(page).getByRole('button', { name: /Generate migration/ });
    // From an empty database: 300 CREATE TABLEs. The first run also loads the worker.
    await generate.click();
    const duration = panel(page).getByTestId('migration-duration');
    await expect(panel(page).getByTestId('operation-count')).toContainText('operations');
    const first = Number(await duration.getAttribute('data-duration'));
    expect(first).toBeLessThan(1000);

    // Warm: time the round trip from click to the rendered result for a new name.
    const path = panel(page).getByTitle(/_warm\/up\.sql$/);
    await panel(page).getByLabel('Name').fill('warm');
    const started = Date.now();
    await generate.click();
    await expect(path).toBeVisible();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(Number(await duration.getAttribute('data-duration'))).toBeLessThan(1000);
  });

  test('safety guides exist for each rule and dialect', async ({ page }) => {
    await page.goto('/guides/postgres/drop-column');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dropping a column');
    await expect(page.getByRole('heading', { name: 'The safer way' })).toBeVisible();
    // Postgres-only rules have no MySQL page.
    const missing = await page.goto('/guides/mysql/add-fk-validating');
    expect(missing?.status()).toBe(404);
  });
});
