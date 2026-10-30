import { expect, test, type Page } from '@playwright/test';

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
const status = (page: Page) => page.getByTestId('code-status');
const editor = (page: Page) => page.getByTestId('code-editor');

/** The editor's text (all of it fits on screen for these small schemas). */
async function editorText(page: Page): Promise<string> {
  const text = await editor(page).locator('.view-lines').innerText();
  return text.replaceAll(' ', ' ');
}

/**
 * Replaces the whole document by pasting, as a user would. (Typed text goes through Monaco's
 * auto-indent and bracket auto-closing, which would mangle it.)
 */
async function replaceText(page: Page, text: string) {
  await editor(page).locator('.view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    const paste = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement?.dispatchEvent(paste);
  }, text);
}

async function openCode(page: Page, format: string) {
  await page.getByRole('tab', { name: 'Code' }).click();
  await page.getByRole('combobox', { name: 'Code format' }).click();
  await page.getByRole('option', { name: format }).click();
  await expect(status(page)).toHaveAttribute('data-state', 'synced');
}

test.describe('code panel', () => {
  test('a column type edited in Prisma updates the canvas without moving nodes', async ({
    page,
  }) => {
    await createProject(page, 'Code sync');
    await page.keyboard.press('n');
    const node = tableNode(page, 'new_table');
    await expect(node).toBeVisible();

    await openCode(page, 'Prisma');
    await expect(editor(page)).toContainText('model NewTable');
    const before = await node.boundingBox();

    const text = await editorText(page);
    const edited = text.replace(/(\bid\s+)BigInt/, '$1Int');
    expect(edited).not.toBe(text);
    await replaceText(page, edited);
    await expect(status(page)).toHaveAttribute('data-state', 'synced');

    await expect(node.locator('[data-testid="column-row"][data-column="id"]')).toContainText(
      'integer',
    );
    expect(await node.boundingBox()).toEqual(before);

    // One undo restores the original type and regenerates the code.
    await canvas(page).click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(node.locator('[data-testid="column-row"][data-column="id"]')).toContainText(
      'bigint',
    );
    await expect(editor(page)).toContainText('BigInt');
  });

  test('invalid code shows markers and never touches the canvas', async ({ page }) => {
    await createProject(page, 'Code errors');
    await page.keyboard.press('n');
    await expect(tableNode(page, 'new_table')).toBeVisible();

    await openCode(page, 'DBML');
    await replaceText(page, 'Table broken {\n  id int [pk\n');
    await page.keyboard.press('ControlOrMeta+S');
    await expect(status(page)).toHaveAttribute('data-state', 'invalid');
    await expect(editor(page).locator('.squiggly-error').first()).toBeAttached();
    await expect(tableNode(page, 'new_table')).toBeVisible();
    await expect(page.getByTestId('table-count')).toHaveText('1 table');

    // Fixing the code applies it.
    await replaceText(page, 'Table renamed_table {\n  id bigint [pk]\n}\n');
    await expect(status(page)).toHaveAttribute('data-state', 'synced');
    await expect(tableNode(page, 'renamed_table')).toBeVisible();
  });

  test('canvas edits update the code, and Drizzle is read-only', async ({ page }) => {
    await createProject(page, 'Code live');
    await openCode(page, 'SQL (PostgreSQL)');
    await page.keyboard.press('Escape');
    await canvas(page).click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('n');
    await expect(editor(page)).toContainText('CREATE TABLE');

    await openCode(page, 'Drizzle');
    await expect(status(page)).toContainText('generated only');
    await expect(editor(page)).toContainText('pgTable');
  });
});
