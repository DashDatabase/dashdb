'use client';

import type { CanvasOverlay } from '@dashdb/edition';
import { useViewport } from '@xyflow/react';
import { editorApi } from '../edition-api';

/**
 * The active edition's canvas overlays (other people's cursors, for example), drawn over the
 * diagram in screen space with the current viewport. They ignore the pointer unless an overlay
 * opts back in with `pointer-events-auto`.
 */
export function EditionOverlays({ overlays }: { overlays: readonly CanvasOverlay[] }) {
  const { x, y, zoom } = useViewport();
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" data-testid="edition-overlays">
      {overlays.map(({ id, Component }) => (
        <Component key={id} editor={editorApi} viewport={{ x, y, zoom }} />
      ))}
    </div>
  );
}
