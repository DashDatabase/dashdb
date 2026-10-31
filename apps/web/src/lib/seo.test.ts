import { describe, expect, it } from 'vitest';
import { absoluteUrl, pageMetadata } from './seo';
import { breadcrumbTrail, getPage, PAGES } from './site';

const SITE = 'https://example.test';

describe('pageMetadata', () => {
  it('builds canonical, Open Graph and Twitter metadata for every page', () => {
    for (const page of PAGES) {
      const meta = pageMetadata(page.slug, SITE);
      const url = absoluteUrl(page.path, SITE);
      expect(meta.description).toBe(page.description);
      expect(meta.alternates?.canonical).toBe(url);
      expect(meta.openGraph).toMatchObject({ url, siteName: 'DashDB', type: 'website' });
      expect(meta.openGraph?.images).toEqual([
        expect.objectContaining({ url: `${SITE}/og/${page.slug}`, width: 1200, height: 630 }),
      ]);
      expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
    }
  });

  it('uses the "%s · DashDB" template except on the home page', () => {
    expect(pageMetadata('pricing', SITE).title).toBe('Pricing');
    expect(pageMetadata('home', SITE).title).toEqual({
      absolute: 'DashDB · Design your database visually. Ship the migration.',
    });
    expect(pageMetadata('pricing', SITE).openGraph?.title).toBe('Pricing · DashDB');
  });

  it('keeps descriptions within what search results display', () => {
    for (const page of PAGES) {
      expect(page.description.length, page.slug).toBeGreaterThanOrEqual(50);
      expect(page.description.length, page.slug).toBeLessThanOrEqual(170);
    }
  });
});

describe('site pages', () => {
  it('have unique slugs and paths', () => {
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  it('build breadcrumb trails from the home page', () => {
    expect(breadcrumbTrail(getPage('migrations')).map((p) => p.path)).toEqual([
      '/',
      '/features/migrations',
    ]);
    expect(breadcrumbTrail(getPage('home')).map((p) => p.path)).toEqual(['/']);
  });
});

describe('absoluteUrl', () => {
  it('spells the root as the bare origin', () => {
    expect(absoluteUrl('/', SITE)).toBe(SITE);
    expect(absoluteUrl('/pricing', SITE)).toBe(`${SITE}/pricing`);
  });
});
