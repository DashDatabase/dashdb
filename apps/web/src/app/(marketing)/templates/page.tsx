import Link from 'next/link';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { JsonLd } from '@/components/marketing/json-ld';
import { Container, PageHeader } from '@/components/marketing/primitives';
import { collectionPageLd } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';
import { getTemplates } from '@/templates/load';
import { templateFiles, templatePreview } from '@/templates/preview';

export const metadata = pageMetadata('templates');

const DIALECTS = { postgres: 'PostgreSQL', mysql: 'MySQL' } as const;

export default function TemplatesPage() {
  const page = getPage('templates');
  const templates = getTemplates();
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <JsonLd
        data={collectionPageLd(
          page,
          templates.map((t) => ({ name: t.meta.title, path: `/templates/${t.slug}` })),
        )}
      />
      <PageHeader
        title="Database schema templates"
        intro="Start from a schema that has already made the hard decisions. Every template opens in the editor with one click, and comes with its reasoning, a diagram, and SQL or Prisma to download."
      />
      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template, i) => {
          const preview = templatePreview(template);
          return (
            <li
              key={template.slug}
              className="relative flex flex-col overflow-hidden rounded-xl border hover:bg-highlight/40"
            >
              <div className="aspect-[16/10] overflow-hidden border-b bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- static SVG with intrinsic size */}
                <img
                  src={templateFiles(template.slug).preview}
                  width={preview.width}
                  height={preview.height}
                  alt=""
                  // The first card is the largest thing on a phone's first screen: fetch it first.
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'auto'}
                  className="h-full w-full object-cover object-left-top"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs text-text-muted">
                  {DIALECTS[template.meta.dialect]} · {template.meta.tablesCount} tables
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {/* The link covers the whole card. */}
                  <Link
                    href={`/templates/${template.slug}`}
                    className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {template.meta.title}
                  </Link>
                </h2>
                <p className="mt-2 flex-1 text-sm text-text-muted">{template.meta.description}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                  {template.meta.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border px-2 py-0.5 text-xs text-text-muted"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-12 text-text-muted">
        Built a schema others could learn from?{' '}
        <Link href="/templates/contribute" className="text-primary-text underline">
          Contribute a template
        </Link>
        .
      </p>
    </Container>
  );
}
