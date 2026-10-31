import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, name: string, database = 'PostgreSQL') {
  await page.goto('/app');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill(name);
  if (database !== 'PostgreSQL') {
    await dialog.getByLabel('Database').click();
    await page.getByRole('option', { name: database }).click();
  }
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/);
  await expect(page.getByTestId('editor')).toBeVisible();
}

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 160)} ${n.failureSummary ?? ''}`),
    ),
  ).toEqual([]);
}

test.describe('projects home', () => {
  test('is client-only and not indexed', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(page.getByText('No projects yet')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('renames, duplicates and deletes projects', async ({ page }) => {
    await createProject(page, 'Inventory');
    await page.goto('/app');
    const projects = page.getByRole('list', { name: 'Projects' });

    await page.getByRole('button', { name: 'Actions for Inventory' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('Warehouse');
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(projects.getByRole('heading', { name: 'Warehouse' })).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Warehouse' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(projects.getByRole('heading', { name: 'Warehouse (copy)' })).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Warehouse (copy)' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete project' }).click();
    await expect(projects.getByRole('listitem')).toHaveCount(1);
    await expectNoAxeViolations(page);
  });

  test('imports a file into a new project', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'shop.prisma',
      mimeType: 'text/plain',
      buffer: Buffer.from('model User {\n  id Int @id\n  email String @unique\n}\n'),
    });
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByLabel('Project name')).toHaveValue('shop');
    await expect(page.getByTestId('table-count')).toHaveText('1 table');
  });
});

test.describe('editor', () => {
  test('creates a project and opens the editor', async ({ page }) => {
    await createProject(page, 'Shop DB', 'MySQL');

    await expect(page.getByLabel('Project name')).toHaveValue('Shop DB');
    await expect(page.getByTestId('dialect-badge')).toHaveText('MySQL');
    await expect(page.getByTestId('table-count')).toHaveText('0 tables');
    await expect(page.getByRole('navigation', { name: 'Schema' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Inspector' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate migration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share' })).toBeDisabled();
    await expect(page).toHaveTitle('Shop DB · DashDB');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  test('edits with shortcuts, undoes, and saves locally across reloads', async ({ page }) => {
    await createProject(page, 'Shortcuts');
    await page.getByTestId('canvas').click();

    await page.keyboard.press('t');
    await expect(page.getByTestId('table-count')).toHaveText('1 table');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('table-count')).toHaveText('0 tables');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.getByTestId('table-count')).toHaveText('1 table');

    // Redo restores the table but not the selection, so pick it in the sidebar.
    await page
      .getByRole('navigation', { name: 'Schema' })
      .getByRole('button', { name: /^new_table/ })
      .click();
    const inspector = page.getByTestId('inspector');
    await inspector.getByLabel('Table name').fill('customers');
    await inspector.getByLabel('Table name').press('Enter');
    await expect(
      page.getByRole('navigation', { name: 'Schema' }).getByText('customers'),
    ).toBeVisible();

    await page.getByLabel('Project name').fill('Renamed');
    await page.getByLabel('Project name').press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Project name')).toHaveValue('Renamed');
    await expect(
      page.getByRole('navigation', { name: 'Schema' }).getByText('customers'),
    ).toBeVisible();
  });

  test('opens the command palette and runs an action', async ({ page }) => {
    await createProject(page, 'Palette');
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('export');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Export schema' })).toBeVisible();
  });

  test('opens a template, focuses tables and inspects them', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'From template' }).click();
    await page.getByRole('menuitem', { name: /Blog/ }).click();
    await expect(page.getByTestId('table-count')).toHaveText('5 tables');

    const sidebar = page.getByRole('navigation', { name: 'Schema' });
    await sidebar.getByLabel('Search tables').fill('post');
    await expect(sidebar.getByRole('button', { name: /^users\s*\d+$/ })).toBeHidden();
    await sidebar.getByRole('button', { name: /^posts\s*\d+$/ }).click();
    await expect(
      page.getByTestId('canvas').locator('[data-testid="table-node"][data-table="posts"]'),
    ).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('inspector').getByLabel('Table name')).toHaveValue('posts');
    await expect(sidebar.getByText('post_status')).toBeVisible();

    await page.getByRole('button', { name: /0 problems/ }).click();
    await expect(page.getByRole('dialog', { name: 'Problems' })).toContainText(
      'The schema is valid.',
    );
    await page.keyboard.press('Escape');
    await expectNoAxeViolations(page);
  });

  test('exports the schema', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'From template' }).click();
    await page.getByRole('menuitem', { name: /SaaS/ }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'PostgreSQL DDL' }).click();
    const output = page.getByTestId('export-output');
    await expect(output).toContainText('CREATE TABLE');
    await page.getByRole('dialog').getByLabel('Format').click();
    await page.getByRole('option', { name: 'Prisma schema' }).click();
    await expect(output).toContainText('model ');
  });

  test('exports the diagram as SVG and PNG', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'From template' }).click();
    await page.getByRole('menuitem', { name: /Blog/ }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: /PNG or SVG image/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Export diagram' });
    await expect(dialog.getByRole('img', { name: 'Diagram preview' })).toBeVisible();
    await dialog.getByLabel('Transparent background').click();
    await dialog.getByLabel('DashDB watermark').click();

    await dialog.getByLabel('Format').click();
    await page.getByRole('option', { name: /SVG/ }).click();
    const svgDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download SVG' }).click();
    const svg = await svgDownload;
    expect(svg.suggestedFilename()).toMatch(/\.svg$/);
    const text = await (await svg.createReadStream()).toArray();
    const markup = Buffer.concat(text).toString('utf8');
    expect(markup).toContain('>posts<');
    expect(markup).not.toContain('Made with DashDB');

    await dialog.getByLabel('Format').click();
    await page.getByRole('option', { name: /PNG/ }).click();
    const pngDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PNG' }).click();
    expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/);
    await expectNoAxeViolations(page);
  });

  test('imports pasted SQL with dialect detection', async ({ page }) => {
    await createProject(page, 'Pasted');
    await page.getByRole('button', { name: 'Import schema…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import schema' });
    await dialog
      .getByLabel('Schema source')
      .fill('CREATE TABLE `users` (id int unsigned AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;');
    await expect(dialog.getByLabel('Format')).toContainText('Auto-detect (MySQL DDL)');
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByTestId('table-count')).toHaveText('1 table');
  });

  test('imports the pasted result of the introspection query', async ({ page }) => {
    await createProject(page, 'Introspected');
    await page.getByRole('button', { name: 'Import schema…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import schema' });
    await dialog.getByRole('tab', { name: 'From existing database' }).click();
    await expect(dialog).toContainText('DashDB never connects to your database.');
    await expect(dialog.getByTestId('introspection-query')).toContainText('pg_catalog');
    for (const client of ['psql', 'TablePlus', 'DBeaver', 'pgAdmin'])
      await expect(dialog.getByRole('tab', { name: client })).toBeVisible();
    await dialog.getByRole('tab', { name: 'MySQL 8' }).click();
    await expect(dialog.getByTestId('introspection-query')).toContainText('information_schema');
    await dialog.getByRole('tab', { name: 'PostgreSQL' }).click();

    const result = {
      tables: [{ schema: 'public', name: 'accounts' }],
      columns: [
        {
          schema: 'public',
          table: 'accounts',
          name: 'id',
          position: 1,
          type: 'bigint',
          nullable: false,
        },
      ],
      constraints: [
        {
          schema: 'public',
          table: 'accounts',
          name: 'accounts_pkey',
          type: 'PRIMARY KEY',
          columns: ['id'],
        },
      ],
    };
    // As psql prints it without -A -t: a header, a rule and a row count.
    await dialog.getByLabel('Query result (JSON)').fill(` result
--------
 ${JSON.stringify(result)}
(1 row)`);
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByTestId('table-count')).toHaveText('1 table');
  });

  test('shows a read-only notice below 1024px', async ({ page }) => {
    await createProject(page, 'Narrow');
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.getByTestId('read-only-notice')).toBeVisible();
    await expect(page.getByTestId('editor')).toBeHidden();

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByTestId('editor')).toBeVisible();
    // Everything in the top bar fits at the minimum supported width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('shows a not-found state for unknown projects', async ({ page }) => {
    await page.goto('/app/p/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible();
  });
});
