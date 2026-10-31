// schema.org structured data for the public pages, rendered by <JsonLd>.
import { getGithubUrl, getSiteUrl } from './config';
import { absoluteUrl, ogImagePath } from './seo';
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

export interface CollectionItem {
  readonly name: string;
  readonly path: string;
}

/** A gallery page: the collection and its items in order. */
export function collectionPageLd(
  page: SitePage,
  items: readonly CollectionItem[],
  siteUrl: string = getSiteUrl(),
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.title,
    description: page.description,
    url: absoluteUrl(page.path, siteUrl),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: absoluteUrl(item.path, siteUrl),
      })),
    },
  };
}

export interface CreativeWorkInput {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly image: string;
  readonly keywords: readonly string[];
  readonly author?: string;
}

/** A free, reusable work such as a schema template. */
export function creativeWorkLd(
  work: CreativeWorkInput,
  siteUrl: string = getSiteUrl(),
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: work.name,
    description: work.description,
    url: absoluteUrl(work.path, siteUrl),
    image: absoluteUrl(work.image, siteUrl),
    keywords: work.keywords.join(', '),
    isAccessibleForFree: true,
    author: work.author
      ? { '@type': 'Person', name: work.author }
      : { '@type': 'Organization', name: SITE.name },
  };
}

const PUBLISHER = (siteUrl: string) => ({
  '@type': 'Organization',
  name: SITE.name,
  url: absoluteUrl('/', siteUrl),
  logo: { '@type': 'ImageObject', url: absoluteUrl('/icon.svg', siteUrl) },
});

/** A reference page such as a migration safety guide or a docs page. */
export function techArticleLd(
  page: SitePage,
  about: readonly string[],
  siteUrl: string = getSiteUrl(),
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: page.title,
    description: page.description,
    url: absoluteUrl(page.path, siteUrl),
    mainEntityOfPage: absoluteUrl(page.path, siteUrl),
    image: absoluteUrl(ogImagePath(page), siteUrl),
    about: about.map((name) => ({ '@type': 'Thing', name })),
    inLanguage: 'en',
    author: { '@type': 'Organization', name: SITE.name },
    publisher: PUBLISHER(siteUrl),
  };
}

export interface ArticleInput {
  readonly page: SitePage;
  /** ISO date, `YYYY-MM-DD`. */
  readonly datePublished: string;
  readonly author: { readonly name: string; readonly url: string };
  readonly keywords: readonly string[];
}

/** A blog post (Google's Article rich result). */
export function articleLd(article: ArticleInput, siteUrl: string = getSiteUrl()): JsonLdObject {
  const { page } = article;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: page.title,
    description: page.description,
    url: absoluteUrl(page.path, siteUrl),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(page.path, siteUrl) },
    image: [absoluteUrl(ogImagePath(page), siteUrl)],
    datePublished: article.datePublished,
    dateModified: article.datePublished,
    author: [{ '@type': 'Organization', name: article.author.name, url: article.author.url }],
    publisher: PUBLISHER(siteUrl),
    keywords: article.keywords.join(', '),
    inLanguage: 'en',
  };
}
