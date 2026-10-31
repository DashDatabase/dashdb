import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Faq } from '@/components/marketing/faq';
import { Container, PageHeader } from '@/components/marketing/primitives';
import { InlineCode } from '@/components/tools/inline-code';
import { ToolConverter } from '@/components/tools/tool-converter';
import { metadataFor } from '@/lib/seo';
import { toolPage } from '@/lib/site';
import { FORMATS, TOOLS, findTool } from '@/tools/registry';

interface Params {
  slug: string;
}

/** Every tool is generated at build time; anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const tool = findTool((await params).slug);
  return tool ? metadataFor(toolPage(tool)) : {};
}

export default async function ToolPage({ params }: { params: Promise<Params> }) {
  const tool = findTool((await params).slug);
  if (!tool) notFound();
  const input = FORMATS[tool.from];
  const output = FORMATS[tool.to];
  const related = tool.related.flatMap((slug) => {
    const found = findTool(slug);
    return found ? [found] : [];
  });

  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={toolPage(tool)} />
      <PageHeader title={tool.h1} intro={tool.lead} />

      <div className="mt-10">
        <ToolConverter
          from={tool.from}
          to={tool.to}
          example={tool.exampleInput}
          inputLabel={input.label}
          outputLabel={output.label}
          inputLanguage={input.language}
          outputLanguage={output.language}
          outputExtension={output.extension}
          projectName={`From ${input.label}`}
          diagram={tool.diagram ?? false}
        />
      </div>

      <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="max-w-3xl space-y-12">
          <section aria-labelledby="how-title" className="space-y-4">
            <h2 id="how-title" className="text-2xl font-semibold tracking-tight">
              How the conversion works
            </h2>
            {tool.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="leading-7 text-text-muted">
                <InlineCode text={paragraph} />
              </p>
            ))}
          </section>

          <section aria-labelledby="mapping-title" className="space-y-4">
            <h2 id="mapping-title" className="text-2xl font-semibold tracking-tight">
              {tool.mapping.heading}
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm" data-testid="mapping-table">
                <thead className="border-b bg-surface">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      {tool.mapping.columns[0]}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      {tool.mapping.columns[1]}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[13px]">
                  {tool.mapping.rows.map((row) => (
                    <tr key={row.source}>
                      <td className="px-4 py-2">{row.source}</td>
                      <td className="px-4 py-2">{row.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted">
              Every row is checked against the converter in DashDB&apos;s test suite.
            </p>
          </section>

          <section aria-labelledby="gotchas-title" className="space-y-4">
            <h2 id="gotchas-title" className="text-2xl font-semibold tracking-tight">
              Gotchas
            </h2>
            <ul className="space-y-4">
              {tool.gotchas.map((gotcha) => (
                <li key={gotcha.title} className="rounded-lg border p-4">
                  <h3 className="font-semibold">{gotcha.title}</h3>
                  <p className="mt-1 leading-7 text-text-muted">
                    <InlineCode text={gotcha.body} />
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="faq-title" className="space-y-4">
            <h2 id="faq-title" className="text-2xl font-semibold tracking-tight">
              FAQ
            </h2>
            <Faq items={tool.faq} />
          </section>
        </article>

        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <nav aria-labelledby="related-title">
            <h2 id="related-title" className="text-sm font-semibold">
              Related tools
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {related.map((other) => (
                <li key={other.slug}>
                  <Link href={`/tools/${other.slug}`} className="text-primary-text hover:underline">
                    {other.h1}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/tools" className="text-text-muted hover:text-text hover:underline">
                  All tools
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="guides-title">
            <h2 id="guides-title" className="text-sm font-semibold">
              Guides
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {tool.guides.map((guide) => (
                <li key={guide.href}>
                  <Link href={guide.href} className="text-primary-text hover:underline">
                    {guide.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="rounded-lg border bg-surface/50 p-4 text-sm">
            <p className="font-medium">Keep editing visually</p>
            <p className="mt-1 text-text-muted">
              Open the result in the DashDB editor to change it on a canvas and generate safe
              migrations. Free, no signup.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
