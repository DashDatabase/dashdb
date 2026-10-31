import { Toaster, TooltipProvider } from '@dashdb/ui';
import type { ReactNode } from 'react';

/**
 * Tooltips and toasts for the interactive parts of the site (editor, design system). Kept out
 * of the root layout so marketing pages don't load the component library's client bundle.
 */
export function UiProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
