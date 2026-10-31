import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Every JSON-LD block on the page, parsed. */
async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  // A block may hold one object or an array of them.
  return blocks.flatMap<Record<string, unknown>>(
    (text) => JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[],
  );
}

/** Paths listed in the sitemap. */
async function sitemapPaths(page: Page): Promise<Set<string>> {
  const response = await page.request.get('/sitemap.xml');
  const xml = await response.text();
  return new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname),
  );
}

/** Distinct internal links under `prefix` on the current page. */
async function linksUnder(page: Page, prefix: string): Promise<string[]> {
  const hrefs = await page
    .locator(`a[href^="${prefix}"]`)
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  return [...new Set(hrefs.map((h) => h.split('#')[0] ?? ''))];
}

test.describe('docs', () => {
  test('the docs home has the sidebar, search and structured data', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('DashDB documentation');
    await expect(page).toHaveTitle('DashDB documentation · DashDB');
    const sidebar = page.locator('#nd-sidebar');
    for (const name of [
      'Getting started',
      'Editor basics',
      'Safety rules',
      'Self-hosting',
      'FAQ',
    ]) {
      await expect(sidebar.getByRole('link', { name, exact: true })).toBeVisible();
    }
    const types = (await structuredData(page)).map((d) => d['@type']);
    expect(types).toEqual(expect.arrayContaining(['TechArticle', 'BreadcrumbList']));
  });

  test('every docs page is in the sitemap and has a description and OG image', async ({ page }) => {
    await page.goto('/docs');
    // Folders in the sidebar start closed; the search index lists every page.
    const index = (await (await page.request.get('/api/search')).json()) as unknown;
    const urls = [...JSON.stringify(index).matchAll(/"url":"(\/docs[^"#]*)/g)]
      .map((m) => m[1] ?? '')
      .filter((u, i, all) => all.indexOf(u) === i);
    expect(urls.length).toBeGreaterThanOrEqual(19);
    const sitemap = await sitemapPaths(page);
    for (const url of urls) {
      expect(sitemap, url).toContain(url);
      await page.goto(url);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description?.length ?? 0, url).toBeGreaterThanOrEqual(50);
      const og = await page.locator('meta[property="og:image"]').getAttribute('content');
      const image = await page.request.get(new URL(og ?? '').pathname);
      expect(image.headers()['content-type'], url).toBe('image/png');
    }
  });

  test('generated tables match the product', async ({ page }) => {
    await page.goto('/docs/editor-basics');
    const shortcuts = page.locator('table').filter({ hasText: 'Generate migration' });
    await expect(shortcuts.getByRole('row', { name: /Generate migration/ })).toContainText('Ctrl');
    await page.goto('/docs/safety-rules');
    await expect(page.locator('tr[data-rule]')).toHaveCount(12);
  });

  test('search finds docs, guides and posts in the browser', async ({ page }) => {
    await page.goto('/docs/getting-started', { waitUntil: 'networkidle' });
    const searches: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/search')) searches.push(r.url());
    });
    await page
      .getByRole('button', { name: /^Search/ })
      .first()
      .click();
    const input = page.getByRole('dialog').getByRole('combobox', { name: 'Search' });
    await input.fill('concurrently');
    const results = page.getByRole('dialog').getByRole('option');
    await expect(results.first()).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/CONCURRENTLY/i);
    // Guides and posts are indexed too.
    await input.fill('gh-ost');
    await expect(page.getByRole('dialog')).toContainText('Rebuilding a large MySQL table in place');
    await input.fill('whiteboard');
    await expect(page.getByRole('dialog')).toContainText('Blog');
    // One download of the static index, with no query string: every query ran locally.
    expect(searches.every((url) => new URL(url).search === '')).toBe(true);
    expect(searches.length).toBeLessThanOrEqual(1);
  });

  test('pass axe (WCAG 2.2 AA) in light and dark', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ['/docs', '/docs/getting-started', '/docs/safety-rules']) {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations, `${path} (${scheme})`).toEqual([]);
      }
    }
  });
});

test.describe('safety guides', () => {
  test('every safety rule docsUrl resolves to a guide in the sitemap', async ({ page }) => {
    await page.goto('/docs/safety-rules');
    // The table lists every rule with a link per dialect: exactly the findings' docsUrls.
    const guides = await linksUnder(page, '/guides/');
    expect(guides).toHaveLength(14);
    const sitemap = await sitemapPaths(page);
    for (const path of guides) {
      expect(sitemap, path).toContain(path);
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });

  test('a guide shows the generated migration, the finding and the safer way', async ({ page }) => {
    await page.goto('/guides/postgres/create-index-blocking');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Creating an index without CONCURRENTLY in PostgreSQL',
    );
    await expect(page.getByLabel('Generated migration SQL')).toContainText(
      'CREATE UNIQUE INDEX users_email_key ON users (email);',
    );
    await expect(page.getByTestId('guide-finding')).toContainText('blocks writes');
    await expect(page.getByLabel('Safer alternative SQL')).toContainText(
      'CREATE UNIQUE INDEX CONCURRENTLY',
    );
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Safety rules' })).toHaveAttribute(
      'href',
      '/docs/safety-rules',
    );
    const types = (await structuredData(page)).map((d) => d['@type']);
    expect(types.sort()).toEqual(['BreadcrumbList', 'TechArticle']);
  });

  test('the guide index redirects to the docs', async ({ page }) => {
    await page.goto('/guides');
    await expect(page).toHaveURL(/\/docs\/safety-rules$/);
  });
});

test.describe('blog', () => {
  test('the index lists posts newest first with their details', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
    const posts = page.getByTestId('blog-posts').locator('> li');
    await expect(posts).toHaveCount(4);
    await expect(posts.last()).toContainText('Introducing DashDB');
    await expect(posts.first()).toContainText(/\d+ min read/);
    await expect(page.locator('link[type="application/rss+xml"]')).toHaveAttribute(
      'href',
      /\/blog\/rss\.xml$/,
    );
  });

  test('a post has its metadata, Article JSON-LD, OG image and related posts', async ({ page }) => {
    await page.goto('/blog/create-index-concurrently');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('CONCURRENTLY');
    await expect(page.locator('time[datetime="2026-11-01"]').first()).toBeVisible();
    await expect(page.getByText(/\d+ min read/).first()).toBeVisible();
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    const article = (await structuredData(page)).find((d) => d['@type'] === 'BlogPosting');
    expect(article).toMatchObject({
      datePublished: '2026-11-01',
      author: [{ name: 'The DashDB team' }],
    });
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(new URL(og ?? '').pathname).toBe('/og/blog-create-index-concurrently');
    const image = await page.request.get('/og/blog-create-index-concurrently');
    expect(image.headers()['content-type']).toBe('image/png');
    const related = page.getByRole('navigation', { name: 'Related posts' }).getByRole('link');
    await expect(related).toHaveCount(3);
    // Code is highlighted at build time.
    await expect(page.getByTestId('post-body').locator('pre.shiki').first()).toBeVisible();
  });

  test('the RSS feed lists every post', async ({ request }) => {
    const response = await request.get('/blog/rss.xml');
    expect(response.headers()['content-type']).toContain('application/rss+xml');
    const xml = await response.text();
    expect(xml).toMatch(/^<\?xml/);
    expect(xml.match(/<item>/g)).toHaveLength(4);
    expect(xml).toContain('/blog/introducing-dashdb</link>');
  });

  test('pass axe (WCAG 2.2 AA)', async ({ page }) => {
    for (const path of [
      '/blog',
      '/blog/renaming-columns-without-downtime',
      '/guides/mysql/large-table-online-change',
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, path).toEqual([]);
    }
  });
});
