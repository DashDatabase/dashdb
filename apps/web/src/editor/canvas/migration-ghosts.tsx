'use client';

import type { Table } from '@dashdb/core/lite';
import { ViewportPortal } from '@xyflow/react';
import { useMemo } from 'react';
import { cachedCompare } from '../migration/visual-diff';
import { useEditor, type Layout, type NodeLayout } from '../store';
import { freePosition } from '../store/layout';
import { NODE_WIDTH, ROW_HEIGHT } from './model';

/**
 * Where removed tables are drawn. Their old position went with them, so each takes the free
 * grid spot nearest the middle of the diagram, where fitting the view shows it.
 */
export function ghostPositions(
  tables: readonly Table[],
  layout: Layout,
): { table: Table; x: number; y: number }[] {
  const nodes = Object.values(layout.nodes);
  const center = nodes.length
    ? {
        x:
          (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x)) + NODE_WIDTH) /
          2,
        y: (Math.min(...nodes.map((n) => n.y)) + Math.max(...nodes.map((n) => n.y))) / 2,
      }
    : { x: 0, y: 0 };
  const taken: Record<string, NodeLayout> = { ...layout.nodes };
  return tables.map((table) => {
    const { x, y } = freePosition({ nodes: taken }, center);
    taken[`ghost:${table.id}`] = { x, y, collapsed: false, color: 'default' };
    return { table, x, y };
  });
}

/** Red "ghosts" of the tables a migration drops, while the Migration panel shows changes. */
export function MigrationGhosts() {
  const removed = useEditor((s) =>
    s.migrationOverlay && s.doc
      ? cachedCompare(s.migrationOverlay, s.doc.schema).removedTables
      : null,
  );
  const layout = useEditor((s) => s.doc?.layout);
  const ghosts = useMemo(
    () => (removed?.length && layout ? ghostPositions(removed, layout) : []),
    [removed, layout],
  );
  if (ghosts.length === 0) return null;
  return (
    <ViewportPortal>
      {ghosts.map(({ table, x, y }) => (
        <article
          key={table.id}
          aria-label={`Removed table ${table.name}`}
          data-testid="ghost-table"
          data-table={table.name}
          className="pointer-events-none absolute rounded-lg border-2 border-dashed border-danger/70 bg-danger/5 text-danger-text opacity-80"
          style={{ transform: `translate(${String(x)}px, ${String(y)}px)`, width: NODE_WIDTH }}
        >
          <header className="flex h-10 items-center gap-2 border-b border-dashed border-danger/50 px-3">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold line-through">
              {table.name}
            </h3>
            <span className="text-xs font-medium">Removed</span>
          </header>
          <ul>
            {table.columns.map((column) => (
              <li
                key={column.id}
                className="flex items-center gap-1.5 px-3 font-mono text-xs line-through"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="min-w-0 flex-1 truncate">{column.name}</span>
                <span className="truncate opacity-70">{column.nativeType}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </ViewportPortal>
  );
}
