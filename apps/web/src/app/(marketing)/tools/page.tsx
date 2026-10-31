import Link from 'next/link';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Container, PageHeader } from '@/components/marketing/primitives';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';
import { CATEGORIES, FORMATS, toolsIn, type ToolCategory } from '@/tools/registry';

export const metadata = pageMetadata('tools');

const ORDER: readonly ToolCategory[] = ['orm', 'dialects', 'dbml', 'diagrams'];

export default function ToolsPage() {
  const page = getPage('tools');
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <PageHeader
        title="Free schema converters"
        intro="Convert between SQL, Prisma, Drizzle, DBML and Mermaid, or between PostgreSQL and MySQL. Every tool runs in your browser: your schema is never uploaded."
      />
      <div className="mt-12 space-y-14">
        {ORDER.map((category) => (
          <section key={category} aria-labelledby={`${category}-title`}>
            <h2 id={`${category}-title`} className="text-2xl font-semibold tracking-tight">
              {CATEGORIES[category].title}
            </h2>
            <p className="mt-1 text-text-muted">{CATEGORIES[category].description}</p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {toolsIn(category).map((tool) => (
                <li
                  key={tool.slug}
                  className="relative rounded-lg border p-5 hover:bg-highlight/50"
                >
                  <p className="font-mono text-xs text-text-muted">
                    {FORMATS[tool.from].label} →{' '}
                    {tool.diagram ? 'ER diagram' : FORMATS[tool.to].label}
                  </p>
                  <h3 className="mt-2 font-semibold">
                    {/* The link covers the whole card. */}
                    <Link
                      href={`/tools/${tool.slug}`}
                      className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      {tool.h1}
                    </Link>
                  </h3>
                  <p className="mt-2 text-sm text-text-muted">{tool.lead}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
