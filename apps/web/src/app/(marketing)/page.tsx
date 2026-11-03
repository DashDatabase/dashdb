import Link from 'next/link';
import { DemoVideo } from '@/components/marketing/demo-video';
import { Faq } from '@/components/marketing/faq';
import { JsonLd } from '@/components/marketing/json-ld';
import { MigrationShowcase } from '@/components/marketing/migration-showcase';
import { ButtonLink, Container, Section } from '@/components/marketing/primitives';
import { StarButton } from '@/components/marketing/star-button';
import { WaitlistForm } from '@/components/marketing/waitlist-form';
import { isCloudEdition } from '@dashdb/edition';
import { softwareApplicationLd, type FaqItem } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/seo';
import { SITE } from '@/lib/site';

export const metadata = pageMetadata('home');

// Static, regenerated at most hourly so the GitHub star count stays fresh.
export const revalidate = 3600;

const STEPS = [
  {
    title: 'Design',
    body: 'Draw tables and relationships on the canvas, or import what you have: SQL, Prisma, DBML, or a read-only query against your database.',
  },
  {
    title: 'Snapshot',
    body: 'Save a baseline that matches production. Keep editing; DashDB tracks every change against it.',
  },
  {
    title: 'Ship',
    body: 'Generate the migration as SQL, Prisma or Drizzle, with a safety review that catches rewrites and long locks before they reach production.',
  },
] as const;

const STACKS = [
  { name: 'PostgreSQL', note: 'DDL, migrations, safety rules' },
  { name: 'MySQL', note: 'DDL, migrations, safety rules' },
  { name: 'Prisma', note: 'Schema import, export, migrations' },
  { name: 'Drizzle', note: 'Schema export, migrations' },
  { name: 'DBML', note: 'Import and export' },
  { name: 'Mermaid', note: 'ER diagram export' },
] as const;

const COMPARISON = [
  { feature: 'Visual schema editor', dashdb: true, diagram: true, cli: false },
  { feature: 'Generates migrations from edits', dashdb: true, diagram: false, cli: true },
  { feature: 'Flags locking and rewrite risks', dashdb: true, diagram: false, cli: false },
  { feature: 'Works without an account', dashdb: true, diagram: false, cli: true },
  { feature: 'Schema stays on your machine', dashdb: true, diagram: false, cli: true },
] as const;

const HOME_FAQ: readonly FaqItem[] = [
  {
    question: 'Do I need an account?',
    answer:
      'No. Open the editor and start designing. Projects are saved in your browser, on your device.',
  },
  {
    question: 'Does DashDB connect to my database?',
    answer:
      'No. To import an existing schema you run one read-only introspection query yourself (in psql, TablePlus, DBeaver or pgAdmin) and paste the result. DashDB never sees your credentials or your data.',
  },
  {
    question: 'Which databases and ORMs are supported?',
    answer:
      'PostgreSQL and MySQL, with import and export for SQL, Prisma, Drizzle, DBML and Mermaid. Migrations can be generated as plain SQL, Prisma migrations or Drizzle migrations.',
  },
  {
    question: 'How does the migration safety review work?',
    answer:
      'Every generated migration is checked against rules for its database, such as type changes that rewrite a table, SET NOT NULL scans and blocking index builds. Each finding explains the risk and links to a safer way to make the same change.',
  },
  {
    question: 'Is it free?',
    answer: isCloudEdition()
      ? 'Yes. The editor is free with no limits on projects or tables. Cloud sync and team features are planned; join the waitlist to hear when they arrive.'
      : 'Yes. DashDB is open source under the AGPL-3.0, with no limits on projects or tables.',
  },
];

function Check({ value }: { value: boolean }) {
  return value ? (
    <span className="font-semibold text-success-text">
      <span aria-hidden="true">✓</span>
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="text-text-muted">
      <span aria-hidden="true">–</span>
      <span className="sr-only">No</span>
    </span>
  );
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={softwareApplicationLd()} />

      <section aria-labelledby="hero-title" className="border-b bg-surface/50">
        <Container className="py-20 text-center sm:py-28">
          <h1
            id="hero-title"
            className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
          >
            {SITE.headline}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-text-muted sm:text-xl">
            Sketch your schema on a canvas, keep it in sync with code, and get a migration you can
            trust, with a safety review that catches table rewrites and long locks before production
            does.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/app" prefetch={false} className="h-12 px-6 text-base">
              Open the editor — no signup
            </ButtonLink>
            <StarButton />
          </div>
          <p className="mt-4 text-sm text-text-muted">
            Free · Runs in your browser · Your schema never leaves your device
          </p>
        </Container>
      </section>

      <section aria-label="Product demo" className="py-16">
        <Container className="max-w-5xl">
          <DemoVideo />
        </Container>
      </section>

      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="From idea to migration in three steps"
      >
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-lg border p-6">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary font-mono text-sm text-primary-foreground">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="safety"
        eyebrow="Migration safety"
        title="Catch the migration that would have taken production down"
        intro={
          <>
            A real example, generated by DashDB&apos;s engine when this page was built: two
            innocent-looking edits, and the review that flags them.{' '}
            <Link href="/features/migrations" className="text-primary-text underline">
              How migrations work
            </Link>
          </>
        }
        className="border-y bg-surface/50"
      >
        <MigrationShowcase />
      </Section>

      <Section id="stacks" eyebrow="Supported stacks" title="Fits the stack you already have">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STACKS.map((stack) => (
            <li key={stack.name} className="rounded-lg border px-5 py-4">
              <p className="font-semibold">{stack.name}</p>
              <p className="text-sm text-text-muted">{stack.note}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-text-muted">
          Names are trademarks of their respective owners, used only to describe compatibility.
          DashDB is not affiliated with or endorsed by them.
        </p>
      </Section>

      <Section
        id="compare"
        eyebrow="Compared"
        title="Diagram tools draw. Migration tools apply. DashDB does both."
        className="border-y bg-surface/50"
      >
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">
              DashDB compared with diagram-only tools and migration CLIs
            </caption>
            <thead className="border-b bg-surface">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Feature
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-primary-text">
                  DashDB
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Diagram-only tools
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Migration CLIs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="px-4 py-3 font-normal">
                    {row.feature}
                  </th>
                  <td className="px-4 py-3">
                    <Check value={row.dashdb} />
                  </td>
                  <td className="px-4 py-3">
                    <Check value={row.diagram} />
                  </td>
                  <td className="px-4 py-3">
                    <Check value={row.cli} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Typical capabilities of each category; individual products vary.
        </p>
      </Section>

      <Section id="testimonials" eyebrow="From developers" title="Your story could go here">
        <div
          className="rounded-lg border border-dashed p-8 text-center"
          data-testid="testimonials-placeholder"
        >
          <p className="text-text-muted">
            DashDB is new, and we&apos;d rather show real words than invented ones. Using it on a
            project? Tell us how it went.
          </p>
          <ButtonLink href="/open-source" variant="outline" className="mt-5">
            Share feedback
          </ButtonLink>
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Questions, answered" className="border-t">
        <Faq items={HOME_FAQ} />
      </Section>

      <section aria-labelledby="cta-title" className="border-t bg-surface/50 py-20">
        <Container className="flex flex-col items-center text-center">
          <h2
            id="cta-title"
            className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Your next migration, designed and reviewed in minutes.
          </h2>
          <ButtonLink href="/app" prefetch={false} className="mt-8 h-12 px-6 text-base">
            Open the editor — no signup
          </ButtonLink>
          {isCloudEdition() && (
            <div className="mt-12 w-full max-w-md text-left">
              <WaitlistForm source="/" label="Or get product updates by email" cta="Subscribe" />
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
