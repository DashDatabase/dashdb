import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Faq } from '@/components/marketing/faq';
import { ButtonLink, Container, PageHeader, Section } from '@/components/marketing/primitives';
import { WaitlistForm } from '@/components/marketing/waitlist-form';
import { notFound } from 'next/navigation';
import { isCloudEdition } from '@dashdb/edition';
import type { FaqItem } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('pricing');

const FREE_FEATURES = [
  'Unlimited projects and tables',
  'Visual editor and Code tab',
  'Import SQL, Prisma, DBML and live introspection',
  'Migrations as SQL, Prisma or Drizzle',
  'Migration safety review',
  'PNG, SVG, Mermaid and code exports',
  'No account, no tracking of your schema',
] as const;

const PLANNED = [
  {
    name: 'Pro',
    pitch: 'For individuals who work across machines.',
    features: [
      'Everything in Free',
      'Encrypted cloud sync',
      'Read-only share links',
      'Version history',
    ],
  },
  {
    name: 'Team',
    pitch: 'For teams that review schema changes together.',
    features: [
      'Everything in Pro',
      'Shared projects',
      'Comments on changes',
      'Review before merge',
    ],
  },
] as const;

const PRICING_FAQ: readonly FaqItem[] = [
  {
    question: 'Is the free plan really free?',
    answer:
      'Yes. Everything in the editor today is free, with no limits on projects or tables and no trial period.',
  },
  {
    question: 'Will features move from Free to a paid plan?',
    answer:
      'No. Paid plans will add things that need a server, such as sync, sharing and team review. What runs in your browser today stays free.',
  },
  {
    question: 'When will Pro and Team be available?',
    answer:
      'They are planned, not scheduled. Join the waitlist and we will email you when there is something to try, along with pricing.',
  },
  {
    question: 'Where is my data stored on the free plan?',
    answer:
      "In your browser's local storage, on your device. DashDB has no copy. Export a .dashdb.json file to back it up or move it to another machine.",
  },
];

export default function PricingPage() {
  // Paid plans are for dashdb.dev; a self-hosted instance has no pricing to show.
  if (!isCloudEdition()) notFound();
  const page = getPage('pricing');
  return (
    <>
      <Container className="pt-12 sm:pt-16">
        <Breadcrumbs page={page} />
        <PageHeader
          title="Free to use. No signup."
          intro="The whole editor is free today. Paid plans for sync and teams are planned; they will add to Free, never take from it."
        />
      </Container>

      <Container className="py-12">
        <div className="grid gap-6 lg:grid-cols-3">
          <article
            className="flex flex-col rounded-xl border-2 border-primary p-6"
            aria-labelledby="plan-free"
          >
            <h2 id="plan-free" className="text-xl font-semibold">
              Free
            </h2>
            <p className="mt-1 text-text-muted">Everything you need to design and ship.</p>
            <p className="mt-6">
              <span className="text-4xl font-semibold">$0</span>
              <span className="text-text-muted"> forever</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-success-text">
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <ButtonLink href="/app" prefetch={false} className="mt-8">
              Open the editor
            </ButtonLink>
          </article>

          {PLANNED.map((plan) => (
            <article
              key={plan.name}
              className="flex flex-col rounded-xl border p-6"
              aria-labelledby={`plan-${plan.name}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id={`plan-${plan.name}`} className="text-xl font-semibold">
                  {plan.name}
                </h2>
                <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-text-muted">
                  Planned
                </span>
              </div>
              <p className="mt-1 text-text-muted">{plan.pitch}</p>
              <p className="mt-6 text-sm text-text-muted">Pricing to be announced</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-text-muted">
                    <span aria-hidden="true">·</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-xl border bg-surface/50 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Hear when Pro and Team launch</h2>
          <p className="mt-1 mb-5 text-sm text-text-muted">
            One email when there is something to try. Nothing else.
          </p>
          <WaitlistForm source="/pricing" label="Email address" />
        </div>
      </Container>

      <Section id="faq" eyebrow="FAQ" title="Pricing questions" className="border-t">
        <Faq items={PRICING_FAQ} />
      </Section>
    </>
  );
}
