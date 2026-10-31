import type { ReactNode } from 'react';
import { UiProviders } from '@/components/ui-providers';

export default function DesignLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <UiProviders>{children}</UiProviders>;
}
