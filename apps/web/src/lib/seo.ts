import type { Metadata } from 'next';
import { getSiteUrl } from './config';
import { getPage, SITE, type PageSlug, type SitePage } from './site';

/**
 * Absolute URL on the public site for a path such as `/pricing`. The root is the bare origin,
 * matching the canonical link Next.js renders, so every URL for a page is spelled the same way.
 */
export function absoluteUrl(path: string, siteUrl: string = getSiteUrl()): string {
  return path === '/' ? siteUrl : `${siteUrl}${path}`;
}

/** The OG image generated for a page (see `app/og/[slug]/route.tsx`). */
export function ogImagePath(page: Pick<SitePage, 'slug'>): string {
  return `/og/${page.slug}`;
}

export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * Metadata for a public page: title (through the root "%s · DashDB" template), description,
 * canonical URL, Open Graph and Twitter cards with the page's generated image.
 */
export function pageMetadata(slug: PageSlug, siteUrl: string = getSiteUrl()): Metadata {
  return metadataFor(getPage(slug), siteUrl);
}

/** `pageMetadata` for any site page, including the converter tools' generated ones. */
export function metadataFor(page: SitePage, siteUrl: string = getSiteUrl()): Metadata {
  const url = absoluteUrl(page.path, siteUrl);
  const isHome = page.path === '/';
  // The home page leads with the brand; every other page uses the template.
  const fullTitle = isHome ? `${SITE.name} · ${page.title}` : `${page.title} · ${SITE.name}`;
  const image = {
    url: absoluteUrl(ogImagePath(page), siteUrl),
    ...OG_SIZE,
    alt: `${page.title} · ${SITE.name}`,
    type: 'image/png',
  };
  return {
    title: isHome ? { absolute: fullTitle } : page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      locale: 'en_US',
      url,
      title: fullTitle,
      description: page.description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: page.description,
      images: [image],
    },
  };
}
