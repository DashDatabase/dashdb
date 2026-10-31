'use client';

import { Button } from '@dashdb/ui';
import { XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { announce } from '../a11y/announcer';
import { editorStore, useEditor } from '../store';
import { TOUR_STEPS, isStepDone, snapshotOf, tourStore, type TourSnapshot } from './tour';

const CARD_WIDTH = 320;
const GAP = 12;

/** The first visible element matching `selector`. */
function findTarget(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

interface Placement {
  readonly ring: DOMRect | null;
  readonly left: number;
  readonly top: number;
}

/** Below the target if it fits, else above; large targets (the canvas) get the card inside. */
function place(rect: DOMRect | null): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { ring: null, left: vw - CARD_WIDTH - 24, top: vh - 260 };
  const clampX = (x: number) => Math.min(Math.max(x, 12), vw - CARD_WIDTH - 12);
  if (rect.height > vh / 2) {
    return { ring: null, left: clampX(rect.left + 24), top: rect.bottom - 240 };
  }
  const below = rect.bottom + GAP;
  return {
    ring: rect,
    left: clampX(rect.left + rect.width / 2 - CARD_WIDTH / 2),
    top: below + 220 < vh ? below : Math.max(12, rect.top - GAP - 220),
  };
}

/** The guided tour's card, shown in the project the tour was started in. */
export function TourOverlay() {
  const tour = useStore(tourStore);
  const projectId = useEditor((s) => s.projectId);
  const active = tour.status === 'active' && tour.projectId === projectId;
  const step = TOUR_STEPS[tour.step];
  const start = useRef<TourSnapshot | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const titleId = useId();

  // Each step is measured from the moment it began; doing the step moves the tour on.
  useEffect(() => {
    if (!active || !step) return;
    start.current = snapshotOf(editorStore.getState());
    announce(`Tour step ${String(tour.step + 1)} of ${String(TOUR_STEPS.length)}: ${step.title}`);
    return editorStore.subscribe((state) => {
      if (start.current && isStepDone(step.id, start.current, snapshotOf(state))) {
        start.current = null;
        tourStore.getState().next();
      }
    });
  }, [active, step, tour.step]);

  // Follow the target as panels open, resize or scroll.
  useEffect(() => {
    if (!active || !step) return;
    const update = () => {
      const target = findTarget(step.target);
      setPlacement(place(target?.getBoundingClientRect() ?? null));
    };
    update();
    const timer = window.setInterval(update, 300);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', update);
    };
  }, [active, step]);

  useEffect(() => {
    if (tour.status === 'done' && tour.projectId === projectId) {
      announce('Tour complete. Press ? for keyboard shortcuts.');
    }
  }, [tour.status, tour.projectId, projectId]);

  if (!active || !step || !placement) return null;
  const last = tour.step === TOUR_STEPS.length - 1;
  const { ring } = placement;

  return (
    <>
      {ring && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-all"
          style={{ left: ring.left, top: ring.top, width: ring.width, height: ring.height }}
        />
      )}
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-testid="tour"
        className="fixed z-50 rounded-lg border bg-surface-raised p-4 shadow-lg"
        style={{ left: placement.left, top: placement.top, width: CARD_WIDTH }}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-text-muted">
            Step {tour.step + 1} of {TOUR_STEPS.length}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-2"
            aria-label="End tour"
            onClick={() => {
              tourStore.getState().dismiss();
              announce('Tour ended. Restart it from the command palette.');
            }}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
        <h2 id={titleId} className="font-semibold">
          {step.title}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{step.body}</p>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={
                i <= tour.step
                  ? 'h-1.5 w-6 rounded-full bg-primary'
                  : 'h-1.5 w-6 rounded-full bg-highlight'
              }
            />
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {tour.step > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                tourStore.getState().back();
              }}
            >
              Back
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              tourStore.getState().next();
            }}
          >
            {last ? 'Finish' : 'Skip step'}
          </Button>
        </div>
      </section>
    </>
  );
}
