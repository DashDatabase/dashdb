import type { ReactNode } from 'react';
import type { Cardinality } from './model';

/*
 * Crow's-foot markers. Each is drawn for the end of a path (local +x points into the table) and
 * uses orient="auto-start-reverse", so the same marker serves both ends of an edge.
 */
const SHAPES: Record<Cardinality, ReactNode> = {
  // ||  exactly one
  one: (
    <>
      <path d="M -14 0 L 0 0 M -9 -6 L -9 6 M -5 -6 L -5 6" />
    </>
  ),
  // o|  zero or one
  'zero-one': (
    <>
      <path d="M -10 0 L 0 0 M -6 -6 L -6 6" />
      <circle cx="-14" cy="0" r="3.5" />
    </>
  ),
  // o<  zero or many
  many: (
    <>
      <path d="M -12 0 L 0 0 M -10 0 L 0 -6 M -10 0 L 0 6" />
      <circle cx="-15.5" cy="0" r="3.5" />
    </>
  ),
};

export function markerId(cardinality: Cardinality, highlighted: boolean): string {
  return `dashdb-${cardinality}${highlighted ? '-hl' : ''}`;
}

/** Marker definitions, rendered once per canvas. */
export function RelationshipMarkers() {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0">
      <defs>
        {(Object.keys(SHAPES) as Cardinality[]).flatMap((kind) =>
          [false, true].map((highlighted) => (
            <marker
              key={markerId(kind, highlighted)}
              id={markerId(kind, highlighted)}
              viewBox="-22 -10 24 20"
              markerWidth="24"
              markerHeight="20"
              refX="0"
              refY="0"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <g
                fill="var(--background)"
                stroke={highlighted ? 'var(--primary)' : 'var(--text-muted)'}
                strokeWidth={highlighted ? 1.75 : 1.25}
              >
                {SHAPES[kind]}
              </g>
            </marker>
          )),
        )}
      </defs>
    </svg>
  );
}
