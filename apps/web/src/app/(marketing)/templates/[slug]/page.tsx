import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { JsonLd } from '@/components/marketing/json-ld';
import { Container, buttonClass } from '@/components/marketing/primitives';
import { UseTemplateButton } from '@/components/templates/use-template-button';
import { creativeWorkLd } from '@/lib/json-ld';
import { metadataFor } from '@/lib/seo';
import { templatePage } from '@/lib/site';
import { findTemplate, getTemplates, relatedTemplates } from '@/templates/load';
import { templateFiles, templatePreview } from '@/templates/preview';

interface Params {
  slug: string;
}

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getTemplates().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const template = findTemplate((await params).slug);
  return template ? metadataFor(templatePage(template)) : {};
}

const DIALECTS = { postgres: 'PostgreSQL', mysql: 'MySQL' } as const;

export default async function TemplatePage({ params }: { params: Promise<Params> }) {
  const template = findTemplate((await params).slug);
  if (!template) notFound();
  const { meta, schema, slug } = template;
  const page = templatePage(template);
  const preview = templatePreview(template);
  const files = templateFiles(slug);
  const tableName = new Map(schema.tables.map((t) => [t.id, t.name]));
  const related = relatedTemplates(template);

  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <JsonLd
        data={creativeWorkLd({
          name: page.title,
          description: meta.description,
          path: page.path,
          image: files.preview,
          keywords: meta.tags,
          author: meta.author,
        })}
      />

      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-primary-text">
            {DIALECTS[meta.dialect]} · {meta.tablesCount} tables
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {meta.title}
          </h1>
          <p className="mt-4 text-lg text-text-muted">{meta.description}</p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
            {meta.tags.map((tag) => (
              <li key={tag} className="rounded-full border px-2.5 py-0.5 text-xs text-text-muted">
                {tag}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <UseTemplateButton href={files.project} />
        </div>
      </header>

      {/*
        The diagram, rendered at build time by the editor's image export and inlined: it arrives
        compressed with the page instead of as a separate request. The renderer escapes every
        name and comment it draws, so the markup is safe to inline.
      */}
      <figure
        role="img"
        aria-label={`Diagram of the ${meta.title} schema: ${schema.tables.map((t) => t.name).join(', ')}`}
        className="mt-10 overflow-hidden rounded-xl border bg-[var(--white)] [&>svg]:h-auto [&>svg]:w-full"
        style={{ aspectRatio: `${String(preview.width)} / ${String(preview.height)}` }}
        data-testid="template-preview"
        dangerouslySetInnerHTML={{
          __html: preview.svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" '),
        }}
      />

      <div className="mt-6 flex flex-wrap gap-3" aria-label="Downloads">
        <a href={files.sql} download={`${slug}.sql`} className={buttonClass('outline')}>
          Download {DIALECTS[meta.dialect]} SQL
        </a>
        <a href={files.prisma} download={`${slug}.prisma`} className={buttonClass('outline')}>
          Download Prisma schema
        </a>
        <a href={files.project} download={`${slug}.dashdb.json`} className={buttonClass('outline')}>
          Download .dashdb.json
        </a>
      </div>

      <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="max-w-3xl space-y-12">
          <section aria-labelledby="decisions-title">
            <h2 id="decisions-title" className="text-2xl font-semibold tracking-tight">
              Design decisions
            </h2>
            <ul className="mt-6 space-y-6">
              {meta.decisions.map((decision) => (
                <li key={decision.title}>
                  <h3 className="font-semibold">{decision.title}</h3>
                  <p className="mt-1 leading-7 text-text-muted">{decision.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="tables-title">
            <h2 id="tables-title" className="text-2xl font-semibold tracking-tight">
              Tables
            </h2>
            <div className="mt-6 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm" data-testid="template-tables">
                <thead className="border-b bg-surface">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Table
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Columns
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      References
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schema.tables.map((table) => {
                    const refs = [
                      ...new Set(table.foreignKeys.map((fk) => tableName.get(fk.refTable) ?? '?')),
                    ];
                    return (
                      <tr key={table.id}>
                        <th scope="row" className="px-4 py-2.5 align-top font-normal">
                          <span className="font-mono">{table.name}</span>
                          {table.comment && (
                            <span className="mt-0.5 block text-xs text-text-muted">
                              {table.comment}
                            </span>
                          )}
                        </th>
                        <td className="px-4 py-2.5 align-top">{table.columns.length}</td>
                        <td className="px-4 py-2.5 align-top font-mono text-xs text-text-muted">
                          {refs.length ? refs.join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <nav aria-labelledby="related-title">
            <h2 id="related-title" className="text-sm font-semibold">
              Related templates
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {related.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/templates/${other.slug}`}
                    className="text-primary-text hover:underline"
                  >
                    {other.meta.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/templates" className="text-text-muted hover:text-text hover:underline">
                  All templates
                </Link>
              </li>
            </ul>
          </nav>
          <div className="rounded-lg border bg-surface/50 p-4 text-sm">
            <p className="font-medium">Have a schema worth sharing?</p>
            <p className="mt-1 text-text-muted">
              Templates come from the community too.{' '}
              <Link href="/templates/contribute" className="text-primary-text underline">
                Contribute one
              </Link>
              .
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
