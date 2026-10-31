// The docs and blog as site pages, so they get metadata, OG images, breadcrumbs and sitemap
// entries like every other page. Separate from lib/site.ts, which stays free of the MDX
// collections (unit tests import it).
import 'server-only';
import { allPages, getPage, type Crumb, type SitePage } from './site';
import { getPosts, source, type BlogPost, type DocsPage } from './source';

const HOME: Crumb = { path: '/', label: 'Home' };

/** A docs page as a site page. The docs home is the registry's `docs` entry. */
export function docsPage(page: DocsPage): SitePage {
  if (page.slugs.length === 0) return getPage('docs');
  // Folders in the URL become crumbs when they have an index page, e.g. Docs / ORMs / Prisma.
  const ancestors: Crumb[] = [HOME, { path: '/docs', label: 'Docs' }];
  for (let i = 1; i < page.slugs.length; i++) {
    const parent = source.getPage(page.slugs.slice(0, i));
    if (parent) ancestors.push({ path: parent.url, label: parent.data.title });
  }
  return {
    slug: `docs-${page.slugs.join('-')}`,
    path: page.url,
    title: page.data.title,
    label: page.data.title,
    description: page.data.description,
    ancestors,
    ogSubtitle: 'DashDB documentation',
    changeFrequency: 'monthly',
    priority: 0.6,
  };
}

/** A blog post as a site page. */
export function blogPage(post: BlogPost): SitePage {
  return {
    slug: `blog-${post.slug}`,
    path: post.path,
    title: post.title,
    label: post.title,
    description: post.description,
    parent: '/blog',
    ogSubtitle: `${post.author.name} · ${formatDate(post.date)}`,
    changeFrequency: 'yearly',
    priority: 0.6,
  };
}

/** `2026-10-31` → `October 31, 2026`, in UTC so the build machine's time zone can't shift it. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every public page, including each docs page and blog post. */
export async function everyPage(): Promise<SitePage[]> {
  const docs = source
    .getPages()
    .filter((p) => p.slugs.length > 0)
    .map(docsPage);
  const posts = (await getPosts()).map(blogPage);
  return [...allPages(), ...docs, ...posts];
}

export async function findPage(slug: string): Promise<SitePage | undefined> {
  return (await everyPage()).find((p) => p.slug === slug);
}
