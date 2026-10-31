// schema.org structured data for the public pages, rendered by <JsonLd>.
import { getGithubUrl, getSiteUrl } from './config';
import { absoluteUrl } from './seo';
import { breadcrumbTrail, SITE, type SitePage } from './site';

export type JsonLdObject = {
  readonly '@context': 'https://schema.org';
  readonly '@type': string;
} & {
  readonly [key: string]: unknown;
};

export interface FaqItem {
  readonly question: string;
  /** Plain text; it is also rendered on the page, which Google requires for FAQ markup. */
  readonly answer: string;
}

export function softwareApplicationLd(siteUrl: string = getSiteUrl()): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    url: absoluteUrl('/', siteUrl),
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web browser',
    browserRequirements: 'Requires JavaScript and a modern browser.',
    image: absoluteUrl('/og/home', siteUrl),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    sameAs: [getGithubUrl()],
  };
}

export function faqPageLd(items: readonly FaqItem[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function breadcrumbListLd(page: SitePage, siteUrl: string = getSiteUrl()): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbTrail(page).map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: absoluteUrl(crumb.path, siteUrl),
    })),
  };
}

/**
 * JSON for a `<script type="application/ld+json">`. `<`, `>` and `&` are escaped as Unicode so
 * no value can close the script element (the Next.js JSON-LD guide's XSS advice), and U+2028/9
 * so the output is also valid JavaScript.
 */
export function serializeJsonLd(data: JsonLdObject | readonly JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
