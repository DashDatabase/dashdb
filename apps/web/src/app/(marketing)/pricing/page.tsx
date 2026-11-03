import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { Faq } from '@/components/marketing/faq';
import { ButtonLink, Container, PageHeader, Section } from '@/components/marketing/primitives';
import { WaitlistForm } from '@/components/marketing/waitlist-form';
import { notFound } from 'next/navigation';
import { isCloudEdition } from '@dashdb/edition';
import type { FaqItem } from '@/lib/json-ld';
import { PLANS } from '@/lib/plans';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';

export const metadata = pageMetadata('pricing');

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
    question: 'When will the paid plans be available?',
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
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) =>
            plan.available ? (
              <article
                key={plan.id}
                className="flex flex-col rounded-xl border-2 border-primary p-6"
                aria-labelledby={`plan-${plan.id}`}
              >
                <h2 id={`plan-${plan.id}`} className="text-xl font-semibold">
                  {plan.name}
                </h2>
                <p className="mt-1 text-text-muted">{plan.pitch}</p>
                <p className="mt-6">
                  <span className="text-4xl font-semibold">{plan.price}</span>
                  <span className="text-text-muted"> {plan.priceNote}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {plan.features.map((feature) => (
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
            ) : (
              <article
                key={plan.id}
                className="flex flex-col rounded-xl border p-6"
                aria-labelledby={`plan-${plan.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 id={`plan-${plan.id}`} className="text-xl font-semibold">
                    {plan.name}
                  </h2>
                  <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-text-muted">
                    Planned
                  </span>
                </div>
                <p className="mt-1 text-text-muted">{plan.pitch}</p>
                <p className="mt-6 text-sm text-text-muted">{plan.price}</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-text-muted">
                      <span aria-hidden="true">·</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ),
          )}
        </div>

        <div className="mt-12 rounded-xl border bg-surface/50 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Hear when the paid plans launch</h2>
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
