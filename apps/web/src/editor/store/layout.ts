import type { Id, Schema } from '@dashdb/core';
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
