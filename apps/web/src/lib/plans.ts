// Display copy for the pricing page (dashdb.dev only). What a build actually unlocks comes from
// the edition's entitlements, never from this file; DashDB Community unlocks everything.

export type PlanId = 'free' | 'pro' | 'team' | 'enterprise';

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  readonly pitch: string;
  /** Shown instead of a price: `$0` for Free, otherwise how it will be priced. */
  readonly price: string;
  readonly priceNote: string;
  /** Free is available now; the rest are planned. */
  readonly available: boolean;
  readonly features: readonly string[];
}

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    pitch: 'Everything you need to design and ship.',
    price: '$0',
    priceNote: 'forever',
    available: true,
    features: [
      'Unlimited projects and tables',
      'Visual editor and Code tab',
      'Import SQL, Prisma, DBML and live introspection',
      'Migrations as SQL, Prisma or Drizzle',
      'Migration safety review',
      'Expand/contract migration plans',
      'PNG, SVG, Mermaid and code exports',
      'The desktop app, when it ships',
      'No account, no tracking of your schema',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    pitch: 'For individuals who work across machines.',
    price: 'Pricing to be announced',
    priceNote: '',
    available: false,
    features: [
      'Everything in Free',
      'Encrypted cloud sync',
      'Read-only share links',
      'Version history',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    pitch: 'For teams that review schema changes together.',
    price: 'Pricing to be announced',
    priceNote: '',
    available: false,
    features: [
      'Everything in Pro',
      'Shared projects',
      'Comments on changes',
      'Review before merge',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    pitch: 'For organizations with security and compliance needs.',
    price: 'Contact us',
    priceNote: '',
    available: false,
    features: [
      'Everything in Team',
      'SSO and SAML',
      'Audit log',
      'Self-hosted DashDB Cloud',
      'Priority support',
    ],
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan ${id}`);
  return plan;
}
