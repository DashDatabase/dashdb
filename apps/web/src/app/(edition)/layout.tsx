import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { UiProviders } from '@/components/ui-providers';

// Account, sharing and billing pages. The active edition provides them (DashDB Community has
// none, so each is a 404); none of them should be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EditionLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <UiProviders>{children}</UiProviders>;
}
