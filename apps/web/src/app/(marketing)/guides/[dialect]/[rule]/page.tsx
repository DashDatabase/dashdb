import { rules } from '@dashdb/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { CodeBlock } from '@/components/marketing/code-block';
import { JsonLd } from '@/components/marketing/json-ld';
import { SEVERITY_STYLE } from '@/components/marketing/migration-showcase';
import { ButtonLink, Container } from '@/components/marketing/primitives';
import { buildGuideExample } from '@/guides/examples';
import {
  DIALECT_NAMES,
  RULE_GUIDES,
  isGuideDialect,
  type GuideDialect,
} from '@/guides/rule-guides';
import { techArticleLd } from '@/lib/json-ld';
import { metadataFor } from '@/lib/seo';
import { guidePage, SAFETY_RULES_PATH } from '@/lib/site';

// One page per safety rule and dialect: the `docsUrl` of every finding the Migration panel shows.

interface Params {
  dialect: string;
  rule: string;
}

/** Only rules that apply to a dialect get a page for it. */
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return rules.flatMap((rule) => rule.dialects.map((dialect) => ({ dialect, rule: rule.id })));
}

function find({ dialect, rule: ruleId }: Params) {
  const guide = RULE_GUIDES[ruleId];
  const rule = rules.find((r) => r.id === ruleId);
  if (!guide || !rule || !isGuideDialect(dialect)) return null;
  if (!rule.dialects.some((d) => d === dialect)) return null;
  const example = buildGuideExample(ruleId, dialect);
  return example ? { guide, rule, dialect, example } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = find(await params);
  return found ? metadataFor(guidePage(found.rule.id, found.dialect)) : {};
}

const SEVERITY_LABELS = { dangerous: 'Dangerous', caution: 'Caution', info: 'Info' } as const;

export default async function RuleGuidePage({ params }: { params: Promise<Params> }) {
  const found = find(await params);
  if (!found) notFound();
  const { guide, rule, dialect, example } = found;
  const { finding } = example;
  const page = guidePage(rule.id, dialect);
  const name = DIALECT_NAMES[dialect];
  const note = guide.notes?.[dialect];
  const otherDialects = rule.dialects.filter((d): d is GuideDialect => d !== dialect);
  const sameDialect = rules.filter(
    (r) => r.id !== rule.id && r.dialects.some((d) => d === dialect),
  );
  const rows = Object.entries(example.rows);

  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <JsonLd data={techArticleLd(page, [name, 'Database migrations', 'Database locking'])} />

      <header className="max-w-3xl">
        <p className="text-sm font-medium text-primary-text">Migration safety guide · {name}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {page.title}
        </h1>
        <p className="mt-4 text-lg text-text-muted">{guide.risk}</p>
        <p className="mt-4 text-sm text-text-muted">
          Rule <code className="rounded bg-surface px-1.5 py-0.5 font-mono">{rule.id}</code>
          {otherDialects.length > 0 && (
            <>
              {' · Also applies to '}
              {otherDialects.map((other) => (
                <Link
                  key={other}
                  href={`/guides/${other}/${rule.id}`}
                  className="text-primary-text underline"
                >
                  {DIALECT_NAMES[other]}
                </Link>
              ))}
            </>
          )}
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="max-w-3xl min-w-0 space-y-14">
          <section aria-labelledby="why-title">
            <h2 id="why-title" className="text-2xl font-semibold tracking-tight">
              Why it happens
            </h2>
            <p className="mt-4 leading-7 text-text-muted">{guide.why}</p>
            {note && (
              <p className="mt-4 rounded-lg border bg-surface p-4 text-sm leading-6 text-text-muted">
                {note}
              </p>
            )}
          </section>

          <section aria-labelledby="example-title" className="space-y-5">
            <h2 id="example-title" className="text-2xl font-semibold tracking-tight">
              What DashDB flags
            </h2>
            <p className="leading-7 text-text-muted">
              Say you make this change on the canvas, on a {name} database where{' '}
              {rows.map(([table, count], i) => (
                <span key={table}>
                  {i > 0 && ' and '}
                  <code className="font-mono text-text">{table}</code> holds{' '}
                  {count.toLocaleString('en-US')} rows
                </span>
              ))}
              :
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              <CodeBlock title="Before" code={example.before} label="Schema before the change" />
              <CodeBlock title="After" code={example.after} label="Schema after the change" />
            </div>
            <p className="leading-7 text-text-muted">DashDB generates this migration:</p>
            <CodeBlock title="up.sql" code={example.up} label="Generated migration SQL" />
            <p className="leading-7 text-text-muted">and its safety review reports:</p>
            <div
              className={`rounded-lg border p-4 ${SEVERITY_STYLE[finding.severity]}`}
              data-testid="guide-finding"
            >
              <p className="text-xs font-semibold tracking-wide uppercase">
                {SEVERITY_LABELS[finding.severity]}
              </p>
              <p className="mt-1 font-medium text-text">{finding.title}</p>
              <p className="mt-1 text-sm text-text-muted">{finding.explanation}</p>
            </div>
          </section>

          <section aria-labelledby="safer-title" className="space-y-5">
            <h2 id="safer-title" className="text-2xl font-semibold tracking-tight">
              The safer way
            </h2>
            <ol className="list-decimal space-y-2 pl-6 leading-7 text-text-muted">
              {guide.saferSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="leading-7 text-text-muted">For the example above, DashDB suggests:</p>
            <CodeBlock
              title="Safer alternative"
              code={finding.saferAlternative}
              label="Safer alternative SQL"
            />
            <p className="leading-7 text-text-muted">
              In the Migration panel, open the finding and choose{' '}
              <strong className="text-text">Show safer alternative</strong>, then{' '}
              <strong className="text-text">Use in migration</strong> to swap it into your up
              migration. Steps that have to wait for an application deploy are added as comments.
            </p>
          </section>

          <section aria-labelledby="severity-title">
            <h2 id="severity-title" className="text-2xl font-semibold tracking-tight">
              How serious it is
            </h2>
            <p className="mt-4 leading-7 text-text-muted">
              It depends on the table. On a table created in the same migration there are no rows to
              lock or lose, so the finding is only informational. The example assumes
              production-sized tables, where rules whose cost grows with the table are rated
              dangerous from a million rows. The editor doesn&apos;t know your row counts, so it
              reports each rule at its base severity: read every finding with your largest tables in
              mind.
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t pt-8">
            <ButtonLink href="/app" prefetch={false}>
              Try it in the editor
            </ButtonLink>
            <ButtonLink href="/docs/migrations" prefetch={false} variant="outline">
              How migrations work
            </ButtonLink>
          </div>
        </article>

        <aside className="space-y-8 text-sm">
          <nav aria-labelledby="related-title">
            <h2 id="related-title" className="font-semibold">
              Other {name} rules
            </h2>
            <ul className="mt-3 space-y-2">
              {sameDialect.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/guides/${dialect}/${other.id}`}
                    className="text-primary-text hover:underline"
                  >
                    {RULE_GUIDES[other.id]?.title ?? other.id}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={SAFETY_RULES_PATH}
                  prefetch={false}
                  className="text-text-muted hover:text-text hover:underline"
                >
                  All safety rules
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
      </div>
    </Container>
  );
}
