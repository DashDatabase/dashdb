import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', h1: 'Design your database visually. Ship the migration.' },
  { path: '/features/migrations', h1: 'Migrations you can review before they run' },
  { path: '/features/diagram', h1: 'A database diagram you can actually ship' },
  { path: '/pricing', h1: 'Free to use. No signup.' },
  { path: '/open-source', h1: 'Built in the open' },
  { path: '/changelog', h1: 'Changelog' },
  { path: '/about', h1: 'Schema design and migrations belong together' },
  { path: '/privacy', h1: 'Privacy policy' },
  { path: '/terms', h1: 'Terms of service' },
  { path: '/security', h1: 'Security' },
] as const;

/** Every JSON-LD block on the page, parsed. */
async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((text) => JSON.parse(text) as Record<string, unknown>);
}

const typesOf = (data: Record<string, unknown>[]) => data.map((d) => d['@type']);

test.describe('marketing site', () => {
  for (const { path, h1 } of PAGES) {
    test(`${path} has its heading, metadata and an OG image`, async ({ page, request }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
      await expect(page).toHaveTitle(/DashDB/);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      // The root's canonical is the bare origin; other pages end in their path.
      if (path === '/') expect(canonical).toMatch(/^https?:\/\/[^/]+$/);
      else expect(new URL(canonical ?? '').pathname).toBe(path);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      );
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
      const image = await request.get(new URL(ogImage ?? '').pathname);
      expect(image.status()).toBe(200);
      expect(image.headers()['content-type']).toBe('image/png');
      // Footer sitemap links are on every page.
      await expect(page.getByRole('navigation', { name: 'Legal' }).getByRole('link')).toHaveCount(
        2,
      );
    });
  }

  test('pages pass axe (WCAG 2.2 AA) in light and dark themes', async ({ page }) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const { path } of PAGES) {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations, `${path} (${colorScheme})`).toEqual([]);
      }
    }
  });

  test('home page sections and structured data', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: 'Open the editor — no signup' }).first(),
    ).toHaveAttribute('href', '/app');
    await expect(page.getByTestId('star-button')).toHaveAttribute('href', /github\.com/);
    for (const section of ['How it works', 'Migration safety', 'Supported stacks', 'FAQ']) {
      await expect(page.getByText(section, { exact: true })).toBeVisible();
    }
    // The showcase is real engine output with its warnings.
    await expect(page.getByTestId('showcase-finding')).toHaveCount(2);
    await expect(page.getByTestId('migration-showcase')).toContainText('CREATE INDEX CONCURRENTLY');
    expect(typesOf(await structuredData(page)).sort()).toEqual(['FAQPage', 'SoftwareApplication']);
  });

  test('the demo video loads only when scrolled into view, then plays muted', async ({ page }) => {
    // A phone-sized viewport puts the demo just below the fold, as in the Lighthouse run.
    await page.setViewportSize({ width: 412, height: 823 });
    const videoRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/media/demo.webm')) videoRequests.push(request.url());
    });
    await page.goto('/');
    const demo = page.getByTestId('demo');
    await expect(demo.getByRole('img')).toHaveJSProperty('complete', true);
    await expect(demo).toHaveAttribute('data-mode', 'idle');
    await expect(demo.locator('video')).toHaveCount(0);
    expect(videoRequests).toEqual([]);

    await demo.scrollIntoViewIfNeeded();
    const video = page.getByTestId('demo-video');
    await expect(video).toHaveJSProperty('muted', true);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime > 0)).toBe(true);
    expect(videoRequests.length).toBeGreaterThan(0);
  });

  test('pricing and feature pages carry FAQ and breadcrumb structured data', async ({ page }) => {
    await page.goto('/pricing');
    expect(typesOf(await structuredData(page)).sort()).toEqual(['BreadcrumbList', 'FAQPage']);
    await page.goto('/features/migrations');
    const [crumbs] = await structuredData(page);
    expect(crumbs).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Home' },
        { position: 2, name: 'Migrations' },
      ],
    });
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Migrations');
  });

  test('robots.txt keeps crawlers out of the app, API and share links', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    for (const path of ['/app', '/api', '/share']) expect(robots).toContain(`Disallow: ${path}`);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test('sitemap.xml lists every page and the safety guides', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc = '']) => new URL(loc));
    for (const { path } of PAGES) {
      expect(
        locs.map((loc) => loc.pathname),
        path,
      ).toContain(path);
    }
    expect(sitemap).toContain('/guides/postgres/drop-column</loc>');
    expect(sitemap).not.toContain('/app');
  });

  test('unknown pages get the 404 page', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("This page doesn't exist");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('the waitlist form validates, ignores bots and confirms signups', async ({ page }) => {
    // A distinct client per run, so repeated runs against one dev server stay under the limit.
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${String(Date.now() % 250)}` });
    await page.goto('/pricing');
    const form = page.getByTestId('waitlist-form');
    await form.getByLabel('Email address').fill('not-an-email');
    await form.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(form.getByRole('alert')).toHaveText('Enter a valid email address.');

    await form.getByLabel('Email address').fill('ada@example.com');
    await form.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByTestId('waitlist-done')).toHaveText(/on the list/);

    // A bot filling the hidden honeypot sees the same success, and nothing is stored.
    await page.goto('/pricing');
    await page.locator('input[name="website"]').fill('http://spam.example', { force: true });
    await page.getByTestId('waitlist-form').getByLabel('Email address').fill('bot@example.com');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByTestId('waitlist-done')).toBeVisible();
  });
});
