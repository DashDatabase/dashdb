// The public site's pages: one registry feeds page metadata, the sitemap, OG images,
// breadcrumbs and the footer, so a page added here shows up everywhere. The converter tools
// (src/tools/registry.ts) join it through `toolPage`, the safety guides through `guidePage`;
// the docs and blog, which come from MDX collections, are added in lib/content-pages.ts.
import { rules } from '@dashdb/core';
import { DIALECT_NAMES, RULE_GUIDES, type GuideDialect } from '@/guides/rule-guides';
import { getTemplates, type Template } from '@/templates/load';
import { FORMATS, TOOLS, type ToolDefinition } from '@/tools/registry';
import { isCloudEdition } from './config';

export const SITE = {
  name: 'DashDB',
  headline: 'Design your database visually. Ship the migration.',
  description:
    'Design Postgres and MySQL schemas on a visual canvas, then generate safe, reviewable migrations for SQL, Prisma and Drizzle. Free, local-first, no signup.',
} as const;

/** A breadcrumb: where it links and what it says. */
export interface Crumb {
  readonly path: string;
  readonly label: string;
}

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
  readonly group?: 'Product' | 'Resources' | 'Project' | 'Legal';
  /** Path of the parent page, for breadcrumbs (e.g. features under the home page). */
  readonly parent?: string;
  /** The full breadcrumb trail above the page, for pages whose parents are not in `PAGES`. */
  readonly ancestors?: readonly Crumb[];
  /** The line under the title on the OG image; the site headline by default. */
  readonly ogSubtitle?: string;
  readonly changeFrequency: 'weekly' | 'monthly' | 'yearly';
  readonly priority: number;
  /** Only on dashdb.dev: left out of the footer and sitemap of self-hosted (OSS) builds. */
  readonly cloudOnly?: boolean;
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
    cloudOnly: true,
  },
  {
    slug: 'templates',
    path: '/templates',
    title: 'Database schema templates',
    label: 'Templates',
    description:
      'Twelve ready-made database schemas, from SaaS multi-tenancy to e-commerce and analytics, with diagrams, design notes and SQL or Prisma downloads.',
    group: 'Product',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    slug: 'contribute-template',
    path: '/templates/contribute',
    title: 'Contribute a template',
    label: 'Contribute',
    description:
      'How to submit a schema template to the DashDB gallery: design it in the editor, export it, describe your design decisions and open a pull request.',
    parent: '/templates',
    changeFrequency: 'yearly',
    priority: 0.4,
  },
  {
    slug: 'tools',
    path: '/tools',
    title: 'Free schema converter tools',
    label: 'Tools',
    description:
      'Free converters between SQL, Prisma, Drizzle, DBML and Mermaid, and between PostgreSQL and MySQL. They run in your browser; nothing is uploaded.',
    group: 'Product',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    slug: 'docs',
    path: '/docs',
    title: 'DashDB documentation',
    label: 'Docs',
    description:
      'Learn DashDB: design schemas on the canvas, import from SQL, Prisma or a live database, generate safe migrations, and self-host the editor.',
    group: 'Resources',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    slug: 'blog',
    path: '/blog',
    title: 'Blog',
    label: 'Blog',
    description:
      'Articles on database schema design, zero-downtime migrations, Postgres and MySQL locking, and what is new in DashDB.',
    group: 'Resources',
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  {
    slug: 'changelog',
    path: '/changelog',
    title: 'Changelog',
    label: 'Changelog',
    description: 'What is new in DashDB: every notable feature and fix, newest first.',
    group: 'Resources',
    changeFrequency: 'weekly',
    priority: 0.6,
  },
  {
    slug: 'open-source',
    path: '/open-source',
    title: 'Open source',
    label: 'Open source',
    description:
      'DashDB is open source under the AGPL-3.0. Read the code on GitHub, self-host it, change it and contribute.',
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

/** A converter tool as a site page: `/tools/<slug>`, under the Tools hub. */
export function toolPage(tool: ToolDefinition): SitePage {
  return {
    slug: `tool-${tool.slug}`,
    path: `/tools/${tool.slug}`,
    title: tool.title,
    label: `${FORMATS[tool.from].label} to ${tool.diagram ? 'ER diagram' : FORMATS[tool.to].label}`,
    description: tool.description,
    parent: '/tools',
    changeFrequency: 'monthly',
    priority: 0.7,
  };
}

/** A gallery template as a site page: `/templates/<slug>`, under the Templates hub. */
export function templatePage(template: Template): SitePage {
  return {
    slug: `template-${template.slug}`,
    path: `/templates/${template.slug}`,
    title: `${template.meta.title} database schema`,
    label: template.meta.title,
    description: template.meta.description,
    parent: '/templates',
    changeFrequency: 'monthly',
    priority: 0.7,
  };
}

/** The docs page that lists every safety rule; the guides sit under it. */
export const SAFETY_RULES_PATH = '/docs/safety-rules';

const HOME_CRUMB: Crumb = { path: '/', label: 'Home' };
const DOCS_CRUMB: Crumb = { path: '/docs', label: 'Docs' };

/** A migration safety guide as a site page: `/guides/<dialect>/<rule-id>`. */
export function guidePage(ruleId: string, dialect: GuideDialect): SitePage {
  const guide = RULE_GUIDES[ruleId];
  if (!guide) throw new Error(`No guide for rule "${ruleId}"`);
  const name = DIALECT_NAMES[dialect];
  return {
    slug: `guide-${dialect}-${ruleId}`,
    path: `/guides/${dialect}/${ruleId}`,
    // The dialect is in the title for search, unless the title already names it.
    title: guide.title.includes(name) ? guide.title : `${guide.title} in ${name}`,
    label: guide.title,
    description: `${guide.risk} Why it happens in ${name}, and the safer way.`,
    ancestors: [HOME_CRUMB, DOCS_CRUMB, { path: SAFETY_RULES_PATH, label: 'Safety rules' }],
    ogSubtitle: `Migration safety guide · ${name}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  };
}

/** One guide per rule and dialect it applies to: exactly the safety findings' `docsUrl`s. */
export function guidePages(): SitePage[] {
  return rules.flatMap((rule) => rule.dialects.map((dialect) => guidePage(rule.id, dialect)));
}

/**
 * Every public page built from code: the registry above, plus one per converter tool, template
 * and safety guide. `everyPage()` in lib/content-pages.ts adds the docs and blog.
 */
/** The registry pages this edition serves (OSS builds drop the cloud-only ones). */
export function listedPages(cloud: boolean = isCloudEdition()): SitePage[] {
  const pages: readonly SitePage[] = PAGES;
  return pages.filter((p) => cloud || !p.cloudOnly);
}

export function allPages(): SitePage[] {
  const tools: readonly ToolDefinition[] = TOOLS;
  return [
    ...listedPages(),
    ...tools.map(toolPage),
    ...getTemplates().map(templatePage),
    ...guidePages(),
  ];
}

/** The trail from the home page to `page`, inclusive. */
export function breadcrumbTrail(page: SitePage): Crumb[] {
  if (page.ancestors) return [...page.ancestors, page];
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
