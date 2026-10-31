import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { UiProviders } from '@/components/ui-providers';
import './react-flow.css';

// The editor is a local, per-browser workspace: nothing here should be indexed.
export const metadata: Metadata = {
  title: 'Projects',
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <UiProviders>{children}</UiProviders>;
}
