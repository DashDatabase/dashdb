import { rules } from '@dashdb/core';
import { Logo } from '@dashdb/ui/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DIALECT_NAMES, RULE_GUIDES, isGuideDialect } from '@/guides/rule-guides';

interface Params {
  dialect: string;
  rule: string;
}

/** Only rules that apply to a dialect get a page for it. */
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return rules.flatMap((rule) => rule.dialects.map((dialect) => ({ dialect, rule: rule.id })));
}

function find({ dialect, rule }: Params) {
  const guide = RULE_GUIDES[rule];
  const applies = rules.some((r) => r.id === rule && r.dialects.some((d) => d === dialect));
  return guide && applies && isGuideDialect(dialect) ? { guide, dialect } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = find(await params);
  return found ? { title: `${found.guide.title} (${DIALECT_NAMES[found.dialect]})` } : {};
}

export default async function RuleGuidePage({ params }: { params: Promise<Params> }) {
  const found = find(await params);
  if (!found) notFound();
  const { guide, dialect } = found;
  const note = guide.notes?.[dialect];
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <Link href="/app" aria-label="DashDB projects">
        <Logo className="h-7" />
      </Link>
      <header className="space-y-2">
        <p className="text-sm text-text-muted">Migration safety guide · {DIALECT_NAMES[dialect]}</p>
        <h1 className="text-2xl font-semibold">{guide.title}</h1>
        <p className="text-lg">{guide.risk}</p>
      </header>
      <section className="space-y-2">
        <h2 className="font-medium">Why it happens</h2>
        <p className="text-text-muted">{guide.why}</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">The safer way</h2>
        <ol className="list-decimal space-y-1 pl-5 text-text-muted">
          {guide.saferSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      {note && <p className="rounded-md border bg-surface p-4 text-sm text-text-muted">{note}</p>}
      <p className="text-sm text-text-muted">
        In the Migration panel, open the finding and choose <strong>Show safer alternative</strong>{' '}
        to get SQL for your exact change.
      </p>
    </main>
  );
}
