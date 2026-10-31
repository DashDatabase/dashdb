// The public site's pages: one registry feeds page metadata, the sitemap, OG images,
// breadcrumbs and the footer, so a page added here shows up everywhere.

export const SITE = {
  name: 'DashDB',
  headline: 'Design your database visually. Ship the migration.',
  description:
    'Design Postgres and MySQL schemas on a visual canvas, then generate safe, reviewable migrations for SQL, Prisma and Drizzle. Free, local-first, no signup.',
} as const;

export interface SitePage {
  /** Stable id; also the OG image slug. */
  readonly slug: string;
  readonly path: string;
  /** The `<title>` (before " · DashDB"), and the breadcrumb label unless `label` is set. */
  readonly title: string;
  readonly description: string;
  /** Short name for navigation and breadcrumbs. */
  readonly label: string;
  /** Footer column; pages without one are left out of the footer. */
  readonly group?: 'Product' | 'Project' | 'Legal';
  /** Path of the parent page, for breadcrumbs (e.g. features under the home page). */
  readonly parent?: string;
  readonly changeFrequency: 'weekly' | 'monthly' | 'yearly';
  readonly priority: number;
}

export const PAGES = [
  {
    slug: 'home',
    path: '/',
    title: SITE.headline,
    label: 'Home',
    description: SITE.description,
    changeFrequency: 'weekly',
    priority: 1,
  },
  {
    slug: 'migrations',
    path: '/features/migrations',
    title: 'Safe database migrations from a diagram',
    label: 'Migrations',
    description:
      'DashDB diffs your schema, writes up and down SQL, Prisma or Drizzle migrations, and flags risky changes such as table rewrites and long locks before they ship.',
    group: 'Product',
    parent: '/',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    slug: 'diagram',
    path: '/features/diagram',
    title: 'A visual database diagram editor',
    label: 'Diagram editor',
    description:
      'Draw tables, columns and relationships on a fast canvas, edit the same schema as code, auto-arrange large schemas and export PNG, SVG, SQL, Prisma, Drizzle or DBML.',
    group: 'Product',
    parent: '/',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    slug: 'pricing',
    path: '/pricing',
    title: 'Pricing',
    label: 'Pricing',
    description:
      'The DashDB editor is free, with no signup and no limits on tables or projects. Cloud sync and team features are planned.',
    group: 'Product',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    slug: 'changelog',
    path: '/changelog',
    title: 'Changelog',
    label: 'Changelog',
    description: 'What is new in DashDB: every notable feature and fix, newest first.',
    group: 'Product',
    changeFrequency: 'weekly',
    priority: 0.6,
  },
  {
    slug: 'open-source',
    path: '/open-source',
    // "Source code", not "open source": the FSL is source-available (fair source), not OSI.
    title: 'Source code',
    label: 'Source code',
    description:
      "DashDB's code is public on GitHub under the Functional Source License. Read it, run it, contribute; each release becomes MIT after two years.",
    group: 'Project',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    slug: 'about',
    path: '/about',
    title: 'About',
    label: 'About',
    description:
      'Why DashDB exists: schema design and migrations belong in one place, and your schema should never have to leave your machine.',
    group: 'Project',
    changeFrequency: 'yearly',
    priority: 0.5,
  },
  {
    slug: 'security',
    path: '/security',
    title: 'Security',
    label: 'Security',
    description: 'How DashDB keeps your schemas on your device, and how to report a vulnerability.',
    group: 'Project',
    changeFrequency: 'yearly',
    priority: 0.4,
  },
  {
    slug: 'privacy',
    path: '/privacy',
    title: 'Privacy policy',
    label: 'Privacy',
    description:
      'What DashDB collects (very little), what it never sees (your schemas), and your choices.',
    group: 'Legal',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    slug: 'terms',
    path: '/terms',
    title: 'Terms of service',
    label: 'Terms',
    description: 'The terms for using the DashDB website and editor.',
    group: 'Legal',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
] as const satisfies readonly SitePage[];

export type PageSlug = (typeof PAGES)[number]['slug'];

export function getPage(slug: PageSlug): SitePage {
  const page: SitePage | undefined = PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown page "${slug}"`);
  return page;
}

export function findPage(slug: string): SitePage | undefined {
  return PAGES.find((p) => p.slug === slug);
}

/** The trail from the home page to `page`, inclusive. */
export function breadcrumbTrail(page: SitePage): SitePage[] {
  const trail: SitePage[] = [page];
  const seen = new Set([page.path]);
  let current: SitePage = page;
  while (current.path !== '/') {
    const parentPath: string = current.parent ?? '/';
    const parent: SitePage | undefined = PAGES.find((p) => p.path === parentPath);
    if (!parent || seen.has(parent.path)) break;
    seen.add(parent.path);
    trail.unshift(parent);
    current = parent;
  }
  return trail;
}
