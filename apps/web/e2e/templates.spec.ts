import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('template gallery', () => {
  test('the hub shows every template with a preview and structured data', async ({ page }) => {
    await page.goto('/templates');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Database schema templates');
    const cards = page.locator('main li').filter({ has: page.locator('a[href^="/templates/"]') });
    await expect(cards).toHaveCount(12);
    // Previews are static SVG files generated at build time.
    const previews = page.locator('img[src$="/preview.svg"]');
    await expect(previews).toHaveCount(12);
    await expect(previews.first()).toHaveJSProperty('complete', true);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const collection = ld
      .map(
        (text) => JSON.parse(text) as { '@type': string; mainEntity?: { numberOfItems: number } },
      )
      .find((d) => d['@type'] === 'CollectionPage');
    expect(collection?.mainEntity?.numberOfItems).toBe(12);
  });

  test('a template page has its preview, decisions, tables and downloads', async ({
    page,
    request,
  }) => {
    await page.goto('/templates/saas-multi-tenant');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SaaS multi-tenant');
    await expect(page).toHaveTitle('SaaS multi-tenant database schema · DashDB');
    // The build-time diagram is inlined, labelled as one image, and also served as a file.
    const preview = page.getByTestId('template-preview');
    await expect(preview).toHaveAttribute('role', 'img');
    await expect(preview.locator('svg')).toBeVisible();
    expect((await preview.boundingBox())?.height).toBeGreaterThan(300);
    const file = await request.get('/templates/saas-multi-tenant/preview.svg');
    expect(file.headers()['content-type']).toContain('image/svg+xml');
    await expect(page.getByRole('heading', { name: 'Design decisions' })).toBeVisible();
    await expect(page.getByTestId('template-tables').locator('tbody tr')).toHaveCount(9);

    const sql = await request.get('/templates/saas-multi-tenant/schema.sql');
    expect(sql.status()).toBe(200);
    expect(await sql.text()).toContain('CREATE TABLE memberships');
    const prisma = await request.get('/templates/saas-multi-tenant/schema.prisma');
    expect(await prisma.text()).toContain('model Membership');
    const mysql = await request.get('/templates/e-commerce/schema.sql');
    expect(await mysql.text()).toContain('AUTO_INCREMENT');

    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => (JSON.parse(n.textContent) as { '@type': string })['@type']),
      );
    expect(types.sort()).toEqual(['BreadcrumbList', 'CreativeWork']);
    await expect(
      page.getByRole('navigation', { name: 'Related templates' }).getByRole('link'),
    ).toHaveCount(4);
  });

  test('"Use this template" opens it in the editor as a local project', async ({ page }) => {
    await page.goto('/templates/helpdesk');
    await page.getByRole('button', { name: 'Use this template' }).click();
    await page.waitForURL(/\/app\/p\/[\w-]+$/);
    await expect(page.getByTestId('table-count')).toHaveText('10 tables');
  });

  test('the contribution guide explains the pull request flow', async ({ page }) => {
    await page.goto('/templates/contribute');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contribute a template');
    await expect(page.getByText('pnpm --filter @dashdb/web templates:check')).toBeVisible();
  });

  test('pass axe (WCAG 2.2 AA)', async ({ page }) => {
    for (const path of ['/templates', '/templates/booking-system', '/templates/contribute']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, path).toEqual([]);
    }
  });
});
