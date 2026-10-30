// Pure mapping from the Schema IR and layout to React Flow nodes and edges.
import type { Column, ForeignKey, Id, Schema, Table } from '@dashdb/core';
import type { Edge, Node } from '@xyflow/react';
import type { Layout, NodeLayout } from '../store';

/** Fixed node width keeps auto-layout deterministic; long names truncate. */
export const NODE_WIDTH = 272;
export const HEADER_HEIGHT = 41;
export const ROW_HEIGHT = 28;
export const GRID_SIZE = 16;
/** Below this zoom, nodes drop their column rows (level of detail) and edges attach per table. */
export const COMPACT_ZOOM = 0.45;

export type Side = 'l' | 'r';

export interface TableNodeData extends Record<string, unknown> {
  readonly table: Table;
  readonly layout: NodeLayout;
}
export type TableFlowNode = Node<TableNodeData, 'table'>;

/** Left = the referenced ("one") end, right = the referencing ("many") end. */
export type Cardinality = 'one' | 'zero-one' | 'many';

export interface RelationshipData extends Record<string, unknown> {
  readonly name: string;
  readonly label: string;
  /** Marker at the foreign-key table: how many child rows per parent. */
  readonly sourceEnd: Cardinality;
  /** Marker at the referenced table: how many parents per child row. */
  readonly targetEnd: Cardinality;
}
export type RelationshipFlowEdge = Edge<RelationshipData, 'relationship'>;

export interface ColumnFlags {
  readonly pk: boolean;
  readonly fk: boolean;
  readonly unique: boolean;
  readonly nullable: boolean;
}

export function columnFlags(table: Table, column: Column): ColumnFlags {
  const pk = table.primaryKey?.columns.includes(column.id) ?? false;
  const single = (columns: readonly Id[]) => columns.length === 1 && columns[0] === column.id;
  return {
    pk,
    fk: table.foreignKeys.some((fk) => fk.columns.includes(column.id)),
    unique:
      table.uniques.some((u) => single(u.columns)) ||
      table.indexes.some(
        (i) =>
          i.unique &&
          i.where === null &&
          i.columns.length === 1 &&
          i.columns[0]?.column === column.id,
      ),
    nullable: column.nullable && !pk,
  };
}

/** Collapsed tables only show key columns: primary key first, then foreign keys. */
export function visibleColumns(table: Table, collapsed: boolean): readonly Column[] {
  if (!collapsed) return table.columns;
  const keys = new Set([
    ...(table.primaryKey?.columns ?? []),
    ...table.foreignKeys.flatMap((fk) => fk.columns),
  ]);
  return table.columns.filter((c) => keys.has(c.id));
}

export function columnHandleId(columnId: Id, side: Side): string {
  return `c:${side}:${columnId}`;
}

/** Fallback anchor on the header for columns hidden by collapsing. */
export function tableHandleId(side: Side): string {
  return `t:${side}`;
}

export function parseHandleId(
  handleId: string | null | undefined,
): { columnId: Id | null; side: Side } | null {
  const [kind, side, ...rest] = (handleId ?? '').split(':');
  if (side !== 'l' && side !== 'r') return null;
  const columnId = rest.join(':');
  if (kind === 't' && rest.length === 0) return { columnId: null, side };
  if (kind === 'c' && columnId) return { columnId, side };
  return null;
}

export function estimateNodeHeight(table: Table, collapsed: boolean): number {
  const rows = visibleColumns(table, collapsed).length;
  const hidden = table.columns.length - rows;
  return HEADER_HEIGHT + Math.max(rows + (hidden > 0 ? 1 : 0), 1) * ROW_HEIGHT;
}

export function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Reconciles React Flow nodes with the document. Unchanged tables keep their node and `data`
 * objects so memoized nodes skip re-rendering; local drag state and measurements survive.
 */
export function syncNodes(
  previous: readonly TableFlowNode[],
  schema: Schema,
  layout: Layout,
  selected: ReadonlySet<Id>,
): TableFlowNode[] {
  const byId = new Map(previous.map((n) => [n.id, n]));
  const next: TableFlowNode[] = [];
  for (const table of schema.tables) {
    const node = layout.nodes[table.id];
    if (!node) continue;
    const prev = byId.get(table.id);
    const isSelected = selected.has(table.id);
    const sameData = prev?.data.table === table && prev.data.layout === node;
    // While dragging, React Flow owns the position until the drop is committed.
    const position = prev?.dragging ? prev.position : { x: node.x, y: node.y };
    if (
      prev &&
      sameData &&
      prev.selected === isSelected &&
      prev.position.x === position.x &&
      prev.position.y === position.y
    ) {
      next.push(prev);
      continue;
    }
    next.push({
      ...prev,
      id: table.id,
      type: 'table',
      position,
      selected: isSelected,
      data: sameData ? prev.data : { table, layout: node },
    });
  }
  return next;
}

function isUniqueSet(table: Table, columns: readonly Id[]): boolean {
  const same = (ids: readonly Id[]) =>
    ids.length === columns.length && ids.every((id) => columns.includes(id));
  return (
    same(table.primaryKey?.columns ?? []) ||
    table.uniques.some((u) => same(u.columns)) ||
    table.indexes.some((i) => i.unique && i.where === null && same(i.columns.map((c) => c.column)))
  );
}

export function cardinality(
  table: Table,
  fk: ForeignKey,
): { sourceEnd: Cardinality; targetEnd: Cardinality } {
  const nullable = fk.columns.some(
    (id) => table.columns.find((c) => c.id === id)?.nullable ?? false,
  );
  return {
    sourceEnd: isUniqueSet(table, fk.columns) ? 'zero-one' : 'many',
    targetEnd: nullable ? 'zero-one' : 'one',
  };
}

function handleFor(table: Table, node: NodeLayout, columnId: Id | undefined, side: Side): string {
  const visible =
    columnId !== undefined && visibleColumns(table, node.collapsed).some((c) => c.id === columnId);
  return visible ? columnHandleId(columnId, side) : tableHandleId(side);
}

/**
 * One edge per foreign key, attached to the facing sides of the two tables: at the columns, or
 * at the table headers when `compact` (zoomed out, where column rows are not rendered).
 */
export function buildEdges(
  schema: Schema,
  layout: Layout,
  compact = false,
): RelationshipFlowEdge[] {
  const tables = new Map(schema.tables.map((t) => [t.id, t]));
  const edges: RelationshipFlowEdge[] = [];
  for (const table of schema.tables) {
    const node = layout.nodes[table.id];
    if (!node) continue;
    for (const fk of table.foreignKeys) {
      const target = tables.get(fk.refTable);
      const targetNode = layout.nodes[fk.refTable];
      if (!target || !targetNode) continue;
      let sourceSide: Side = 'r';
      let targetSide: Side = 'r';
      if (target.id !== table.id) {
        const leftToRight = node.x + NODE_WIDTH / 2 <= targetNode.x + NODE_WIDTH / 2;
        sourceSide = leftToRight ? 'r' : 'l';
        targetSide = leftToRight ? 'l' : 'r';
      }
      const name = (t: Table, ids: readonly Id[]) =>
        ids.map((id) => t.columns.find((c) => c.id === id)?.name ?? '?').join(', ');
      edges.push({
        id: fk.id,
        type: 'relationship',
        source: table.id,
        target: target.id,
        sourceHandle: compact
          ? tableHandleId(sourceSide)
          : handleFor(table, node, fk.columns[0], sourceSide),
        targetHandle: compact
          ? tableHandleId(targetSide)
          : handleFor(target, targetNode, fk.refColumns[0], targetSide),
        data: {
          name: fk.name,
          label: `${table.name}.${name(table, fk.columns)} → ${target.name}.${name(target, fk.refColumns)}`,
          ...cardinality(table, fk),
        },
      });
    }
  }
  return edges;
}

/** The table and foreign key behind an edge id. */
export function findForeignKey(schema: Schema, fkId: Id): { table: Table; fk: ForeignKey } | null {
  for (const table of schema.tables) {
    const fk = table.foreignKeys.find((f) => f.id === fkId);
    if (fk) return { table, fk };
  }
  return null;
}
