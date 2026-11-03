import { describe, expect, it } from 'vitest';
import { absoluteUrl, pageMetadata } from './seo';
import { rules } from '@dashdb/core';
import {
  allPages,
  breadcrumbTrail,
  getPage,
  guidePage,
  guidePages,
  listedPages,
  PAGES,
} from './site';

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

  it('leave cloud-only pages out of self-hosted (OSS) builds', () => {
    const paths = (cloud: boolean) => listedPages(cloud).map((p) => p.path);
    expect(paths(true)).toContain('/pricing');
    expect(paths(false)).not.toContain('/pricing');
    expect(paths(false)).toHaveLength(PAGES.length - 1);
  });
});

describe('safety guide pages', () => {
  it('exist for exactly the docsUrl of every rule and dialect', () => {
    const expected = rules.flatMap((rule) =>
      rule.dialects.map((dialect) => `/guides/${dialect}/${rule.id}`),
    );
    expect(
      guidePages()
        .map((p) => p.path)
        .sort(),
    ).toEqual(expected.sort());
  });

  it('have search-friendly titles and descriptions', () => {
    for (const page of guidePages()) {
      expect(page.description.length, page.slug).toBeGreaterThanOrEqual(50);
      expect(page.description.length, page.slug).toBeLessThanOrEqual(170);
      expect(page.title, page.slug).toMatch(/PostgreSQL|MySQL/);
    }
    expect(guidePage('alter-table-copy-algorithm', 'mysql').title).toBe(
      'Changes MySQL makes with ALGORITHM=COPY',
    );
  });

  it('sit under the docs in breadcrumbs', () => {
    expect(breadcrumbTrail(guidePage('drop-column', 'mysql')).map((c) => c.path)).toEqual([
      '/',
      '/docs',
      '/docs/safety-rules',
      '/guides/mysql/drop-column',
    ]);
  });

  it('keep slugs and paths unique across every generated page', () => {
    const pages = allPages();
    expect(new Set(pages.map((p) => p.slug)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
  });
});

describe('absoluteUrl', () => {
  it('spells the root as the bare origin', () => {
    expect(absoluteUrl('/', SITE)).toBe(SITE);
    expect(absoluteUrl('/pricing', SITE)).toBe(`${SITE}/pricing`);
  });
});
