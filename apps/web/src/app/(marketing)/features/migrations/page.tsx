import { rules } from '@dashdb/core';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { MigrationShowcase } from '@/components/marketing/migration-showcase';
import { ButtonLink, Container, PageHeader, Section } from '@/components/marketing/primitives';
import { DIALECT_NAMES, RULE_GUIDES } from '@/guides/rule-guides';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('migrations');

const OUTPUTS = [
  {
    title: 'Plain SQL',
    body: 'Up and down files for Postgres or MySQL. Postgres changes run in one transaction; statements that cannot (like CREATE INDEX CONCURRENTLY) are placed outside it, with a comment saying why.',
  },
  {
    title: 'Prisma Migrate',
    body: 'A migration folder in the layout Prisma expects, ready to commit next to your schema.prisma.',
  },
  {
    title: 'Drizzle Kit',
    body: 'A drizzle-kit migration with statement breakpoints and its journal entry, plus the updated schema.ts.',
  },
] as const;

const DETAILS = [
  'Renames are detected and confirmed by you, never guessed: a renamed column stays a rename, not a drop and add.',
  'Operations are ordered so dependencies hold: tables before their foreign keys, enum values before columns that use them.',
  'Irreversible steps (dropping data) are flagged in both the up and the down file.',
  'Copy the migration, or download a bundle with every file.',
] as const;

export default function MigrationsPage() {
  const page = getPage('migrations');
  return (
    <>
      <Container className="pt-12 sm:pt-16">
        <Breadcrumbs page={page} />
        <PageHeader
          title="Migrations you can review before they run"
          intro="Change the diagram; DashDB writes the migration. Every change is diffed against your baseline, turned into SQL, Prisma or Drizzle, and checked for operations that lock or rewrite large tables."
        />
        <div className="mt-8">
          <ButtonLink href="/app" prefetch={false}>
            Open the editor — no signup
          </ButtonLink>
        </div>
      </Container>

      <Section id="example" eyebrow="Example" title="A real migration and its review">
        <MigrationShowcase />
      </Section>

      <Section
        id="outputs"
        eyebrow="Output"
        title="In the format your project already uses"
        className="border-y bg-surface/50"
      >
        <ul className="grid gap-6 md:grid-cols-3">
          {OUTPUTS.map((output) => (
            <li key={output.title} className="rounded-lg border bg-background p-6">
              <h3 className="text-lg font-semibold">{output.title}</h3>
              <p className="mt-2 text-text-muted">{output.body}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-10 grid gap-3 md:grid-cols-2">
          {DETAILS.map((detail) => (
            <li key={detail} className="flex gap-3 text-text-muted">
              <span aria-hidden="true" className="text-success-text">
                ✓
              </span>
              {detail}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="rules"
        eyebrow="Safety rules"
        title={`${String(rules.length)} rules that know how your database takes locks`}
        intro="Each finding explains what goes wrong, why, and the safer way to make the same change. Size-dependent rules take your table sizes into account."
      >
        <ul className="grid gap-4 md:grid-cols-2">
          {rules.map((rule) => {
            const guide = RULE_GUIDES[rule.id];
            return (
              <li key={rule.id} className="rounded-lg border p-5">
                <h3 className="font-semibold">{guide?.title ?? rule.id}</h3>
                {guide && <p className="mt-1 text-sm text-text-muted">{guide.risk}</p>}
                <p className="mt-3 flex flex-wrap gap-3 text-sm">
                  {rule.dialects.map((dialect) => (
                    <Link
                      key={dialect}
                      href={`/guides/${dialect}/${rule.id}`}
                      className="text-primary-text underline"
                    >
                      {DIALECT_NAMES[dialect]} guide
                    </Link>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
