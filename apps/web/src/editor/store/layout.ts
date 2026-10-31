import type { Id, Schema } from '@dashdb/core/lite';
import type { Draft } from 'immer';
import type { Layout, NodeLayout } from './types';

const COLUMNS = 4;
const CELL_WIDTH = 300;
const CELL_HEIGHT = 260;

/** Grid position for the n-th node, used when a table appears without a layout. */
export function defaultNodePosition(index: number): { x: number; y: number } {
  return { x: (index % COLUMNS) * CELL_WIDTH, y: Math.floor(index / COLUMNS) * CELL_HEIGHT };
}

export function defaultNode(index: number): NodeLayout {
  return { ...defaultNodePosition(index), collapsed: false, color: 'default' };
}

/** Keeps exactly one node per table: drops nodes for removed tables, places new tables. */
export function syncLayout(layout: Draft<Layout>, schema: Schema): void {
  const tableIds = new Set<Id>(schema.tables.map((t) => t.id));
  for (const id of Object.keys(layout.nodes)) {
    if (!tableIds.has(id)) Reflect.deleteProperty(layout.nodes, id);
  }
  let placed = Object.keys(layout.nodes).length;
  for (const table of schema.tables) {
    if (!(table.id in layout.nodes)) layout.nodes[table.id] = defaultNode(placed++);
  }
}

/** A complete layout for `schema`, keeping any existing positions. */
export function layoutFor(schema: Schema, existing: Layout = { nodes: {} }): Layout {
  const nodes: Record<Id, NodeLayout> = {};
  let placed = 0;
  for (const table of schema.tables) {
    const node = existing.nodes[table.id];
    if (node) {
      nodes[table.id] = node;
      placed++;
    }
  }
  for (const table of schema.tables) {
    nodes[table.id] ??= defaultNode(placed++);
  }
  return { nodes };
}

/** A table node (272px wide) plus a margin; candidate spots are one footprint apart. */
const FOOTPRINT = { width: 352, height: 224 };
/** Closer than this to an existing node counts as overlapping it. */
const CLEARANCE = { width: 304, height: 176 };

/** Grid cells around the centre, nearest first, preferring the same row and the right side. */
function* nearbyCells(rings: number): Generator<[number, number]> {
  for (let r = 0; r <= rings; r++) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
      }
    }
    const score = ([dx, dy]: [number, number]) =>
      (Math.abs(dx) + Math.abs(dy)) * 4 + (dy === 0 ? 0 : 2) + (dx < 0 ? 1 : 0);
    yield* ring.sort((a, b) => score(a) - score(b));
  }
}

/** A grid-aligned spot near `center` (where a new node is centred) that no node occupies. */
export function freePosition(
  layout: Layout,
  center: { x: number; y: number },
): { x: number; y: number } {
  const snap = (v: number) => Math.round(v / 16) * 16;
  const base = {
    x: snap(center.x - FOOTPRINT.width / 2),
    y: snap(center.y - FOOTPRINT.height / 2),
  };
  const nodes = Object.values(layout.nodes);
  for (const [dx, dy] of nearbyCells(6)) {
    const x = base.x + dx * FOOTPRINT.width;
    const y = base.y + dy * FOOTPRINT.height;
    const taken = nodes.some(
      (n) => Math.abs(n.x - x) < CLEARANCE.width && Math.abs(n.y - y) < CLEARANCE.height,
    );
    if (!taken) return { x, y };
  }
  return base;
}
