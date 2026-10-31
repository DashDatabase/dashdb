'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';

// Dialogs and panels that are closed when the editor opens load on first use, keeping their
// code (and the UI primitives only they use) out of the editor's first load.
export const ImportDialog = dynamic(() => import('./import-dialog').then((m) => m.ImportDialog), {
  ssr: false,
});
export const ExportDialog = dynamic(() => import('./export-dialog').then((m) => m.ExportDialog), {
  ssr: false,
});
export const ExportImageDialog = dynamic(
  () => import('./export-image-dialog').then((m) => m.ExportImageDialog),
  { ssr: false },
);
export const CommandPalette = dynamic(
  () => import('./command-palette').then((m) => m.CommandPalette),
  { ssr: false },
);
export const ShortcutsDialog = dynamic(
  () => import('./shortcuts-dialog').then((m) => m.ShortcutsDialog),
  { ssr: false },
);
/** Only below the editor's minimum width (1024px). */
export const ReadOnlyView = dynamic(() => import('./read-only-view').then((m) => m.ReadOnlyView), {
  ssr: false,
});
export const CodePanel = dynamic(() => import('../code/code-panel').then((m) => m.CodePanel), {
  ssr: false,
});
export const MigrationPanel = dynamic(
  () => import('../migration/migration-panel').then((m) => m.MigrationPanel),
  { ssr: false },
);

/**
 * Renders `children` from the first time `when` is true, then keeps them mounted (so a lazy
 * dialog loads on first open and can still animate closed).
 */
export function MountOnce({ when, children }: { when: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(when);
  if (when && !mounted) setMounted(true);
  return mounted ? children : null;
}
