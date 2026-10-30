import { expect, test, type Locator, type Page } from '@playwright/test';

async function createProject(page: Page, name: string) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

const canvas = (page: Page) => page.getByTestId('canvas');
const tableNode = (page: Page, name: string) =>
  canvas(page).locator(`[data-testid="table-node"][data-table="${name}"]`);
const columnRow = (page: Page, table: string, column: string) =>
  tableNode(page, table).locator(`[data-testid="column-row"][data-column="${column}"]`);

/** Adds a table from the canvas and renames it inline. */
async function addTable(page: Page, name: string) {
  await page.keyboard.press('n');
  const created = tableNode(page, 'new_table');
  await expect(created).toBeVisible();
  await created.getByRole('heading', { name: 'new_table' }).dblclick();
  const input = canvas(page).getByLabel('Table name');
  await input.fill(name);
  await input.press('Enter');
  await expect(tableNode(page, name)).toBeVisible();
}

/** Adds a column through the table's menu and names it in the inline field that opens. */
async function addColumn(page: Page, table: string, name: string) {
  await page.getByRole('button', { name: `Actions for table ${table}` }).click();
  await page.getByRole('menuitem', { name: 'Add column' }).click();
  const input = canvas(page).getByLabel('Column name');
  await expect(input).toBeFocused();
  await input.fill(name);
  await input.press('Enter');
  await expect(columnRow(page, table, name)).toBeVisible();
}

/** The element's centre once it has stopped moving (the viewport may still be settling). */
async function center(locator: Locator) {
  let last = '';
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const now = JSON.stringify(box);
      const settled = box !== null && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  const box = JSON.parse(last) as { x: number; y: number; width: number; height: number };
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags from one column's handle to another column's handle, like a user drawing a link. */
async function connect(page: Page, from: Locator, to: Locator) {
  await from.hover();
  const start = await center(from.locator('.react-flow__handle-right'));
  await to.hover();
  const end = await center(to.locator('.react-flow__handle-left'));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}

test.describe('canvas', () => {
  // Viewport moves (fit view, focus) are instant, so element positions are stable for drags.
  test.use({ reducedMotion: 'reduce' });

  test('creates a table and adds a column, with both undoable', async ({ page }) => {
    await createProject(page, 'Canvas tables');
    await canvas(page).getByRole('button', { name: 'Add table' }).click();
    await expect(tableNode(page, 'new_table')).toBeVisible();
    await expect(tableNode(page, 'new_table')).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('table-count')).toHaveText('1 table');

    await tableNode(page, 'new_table').getByRole('heading').dblclick();
    await canvas(page).getByLabel('Table name').fill('customers');
    await canvas(page).getByLabel('Table name').press('Enter');
    await expect(tableNode(page, 'customers')).toBeVisible();

    await addColumn(page, 'customers', 'email');
    await expect(tableNode(page, 'customers').getByTestId('column-row')).toHaveCount(2);
    await expect(
      columnRow(page, 'customers', 'id').getByRole('img', { name: 'Primary key' }),
    ).toBeVisible();

    await page.keyboard.press('ControlOrMeta+z'); // rename column
    await page.keyboard.press('ControlOrMeta+z'); // add column
    await expect(tableNode(page, 'customers').getByTestId('column-row')).toHaveCount(1);
  });

  test('draws a relationship between columns and undoes it', async ({ page }) => {
    await createProject(page, 'Canvas relationships');
    await addTable(page, 'customers');
    await canvas(page).click({ position: { x: 10, y: 10 } });
    await addTable(page, 'orders');
    await addColumn(page, 'orders', 'customer_id');
    await expect(canvas(page).locator('.react-flow__edge')).toHaveCount(0);
    await canvas(page).getByRole('button', { name: 'Arrange' }).click();
    await expect(canvas(page).getByRole('button', { name: 'Arrange' })).toBeEnabled();

    await connect(
      page,
      columnRow(page, 'orders', 'customer_id'),
      columnRow(page, 'customers', 'id'),
    );
    const popover = page.getByRole('dialog', { name: 'New relationship' });
    await expect(popover).toContainText('orders.customer_id → customers.id');
    await expect(popover.getByLabel('Constraint name')).toHaveValue('orders_customer_id_fkey');
    await popover.getByLabel('On delete').click();
    await page.getByRole('option', { name: 'CASCADE' }).click();
    // Types differ (text vs bigint), so the popover warns before creating.
    await expect(popover).toContainText('Types differ');
    await popover.getByRole('button', { name: 'Create relationship' }).click();

    const edges = canvas(page).locator('.react-flow__edge');
    await expect(edges).toHaveCount(1);
    await expect(
      columnRow(page, 'orders', 'customer_id').getByRole('img', { name: 'Foreign key' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Schema' })).toContainText(
      'orders.customer_id → customers.id',
    );

    // Hovering the edge highlights it and names the foreign key.
    await edges.first().hover();
    await expect(page.getByTestId('edge-label')).toContainText('orders_customer_id_fkey');

    await canvas(page).click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(edges).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(edges).toHaveCount(1);
  });

  test('copies, pastes and deletes tables with confirmation', async ({ page }) => {
    await createProject(page, 'Canvas clipboard');
    await addTable(page, 'users');
    await tableNode(page, 'users').click();
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(tableNode(page, 'users_copy')).toBeVisible();
    await expect(page.getByTestId('table-count')).toHaveText('2 tables');

    await page.keyboard.press('ControlOrMeta+a');
    await canvas(page)
      .locator('.react-flow__node', { has: page.locator('[data-table="users"]') })
      .press('Delete');
    const confirm = page.getByRole('dialog', { name: 'Delete 2 tables?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete tables' }).click();
    await expect(page.getByTestId('table-count')).toHaveText('0 tables');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('table-count')).toHaveText('2 tables');
  });

  test('opens a context menu and arranges a template with the layout worker', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'From template' }).click();
    await page.getByRole('menuitem', { name: /Blog/ }).click();
    await expect(canvas(page).getByTestId('table-node')).toHaveCount(5);
    // Templates are arranged on open: parents sit left of their children.
    await expect
      .poll(async () => {
        const users = await tableNode(page, 'users').boundingBox();
        const posts = await tableNode(page, 'posts').boundingBox();
        return users && posts ? users.x < posts.x : false;
      })
      .toBe(true);

    await tableNode(page, 'posts').getByRole('heading').click({ button: 'right' });
    const menu = page.getByTestId('canvas-menu');
    await menu.getByRole('menuitem', { name: 'Show keys only' }).click();
    await expect(tableNode(page, 'posts')).toContainText('more columns');

    await page.getByRole('button', { name: 'Arrange' }).click();
    await expect(page.getByRole('button', { name: 'Arrange' })).toBeEnabled();
    await expect(canvas(page).locator('.react-flow__minimap')).toBeVisible();
  });
});
