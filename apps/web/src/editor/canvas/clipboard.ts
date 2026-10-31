// Copy and paste of tables. The clipboard lives in memory for this tab: pasting never parses
// outside data, and ids are always regenerated so a paste can't collide with the original.
import {
  addCheck,
  addForeignKey,
  addIndex,
  addNamespace,
  addTable,
  addUnique,
  createId,
  setPrimaryKey,
  type Id,
  type IrDialect,
  type LogicalType,
  type Schema,
  type Table,
} from '@dashdb/core/lite';
import { uniqueName, type Layout } from '../store';

export const PASTE_OFFSET = 48;

export interface TableClip {
  readonly dialect: IrDialect;
  readonly tables: readonly Table[];
  readonly positions: Readonly<Record<Id, { x: number; y: number }>>;
}

let clipboard: TableClip | null = null;
let pasteCount = 0;

export function copyTables(
  schema: Schema,
  layout: Layout,
  tableIds: readonly Id[],
): TableClip | null {
  const ids = new Set(tableIds);
  const tables = schema.tables.filter((t) => ids.has(t.id));
  if (tables.length === 0) return null;
  const positions: Record<Id, { x: number; y: number }> = {};
  for (const t of tables) {
    const node = layout.nodes[t.id];
    positions[t.id] = { x: node?.x ?? 0, y: node?.y ?? 0 };
  }
  clipboard = { dialect: schema.dialect, tables, positions };
  pasteCount = 0;
  return clipboard;
}

export function readClipboard(): TableClip | null {
  return clipboard;
}

/** Each paste of the same clip lands a little further down and right. */
export function nextPasteOffset(): number {
  pasteCount += 1;
  return pasteCount * PASTE_OFFSET;
}

export function clearClipboard(): void {
  clipboard = null;
  pasteCount = 0;
}

/** `orders_pkey` → `orders_copy_pkey` when the table was renamed `orders_copy`. */
function renamed(name: string, from: string, to: string, taken: Set<string>): string {
  const base = name.startsWith(from) ? to + name.slice(from.length) : `${name}_copy`;
  const result = uniqueName(base, taken);
  taken.add(result);
  return result;
}

export interface PasteResult {
  readonly schema: Schema;
  /** New table ids in clip order. */
  readonly tableIds: readonly Id[];
  readonly positions: Readonly<Record<Id, { x: number; y: number }>>;
}

/**
 * Inserts copies of the clipped tables. Foreign keys between copied tables point at the copies;
 * keys to tables outside the clip keep pointing at the original if it still exists.
 */
export function pasteTables(target: Schema, clip: TableClip, offset: number): PasteResult {
  let schema = target;
  if (schema.namespaces.length === 0) {
    schema = addNamespace(schema, { name: schema.dialect === 'sqlite' ? 'main' : 'public' });
  }
  const namespaces = new Set(schema.namespaces.map((n) => n.id));
  const fallbackNamespace = schema.namespaces[0]?.id ?? '';
  const enums = new Set(schema.enums.map((e) => e.id));
  const tableIds = new Map(clip.tables.map((t) => [t.id, createId()]));
  const columnIds = new Map(
    clip.tables.flatMap((t) => t.columns.map((c) => [c.id, createId()] as const)),
  );
  const constraintNames = new Set(
    schema.tables.flatMap((t) => [
      ...t.indexes.map((i) => i.name),
      ...t.uniques.map((u) => u.name),
      ...t.foreignKeys.map((f) => f.name),
      ...t.checks.map((c) => c.name),
      ...(t.primaryKey?.name ? [t.primaryKey.name] : []),
    ]),
  );
  const col = (id: Id) => columnIds.get(id) ?? id;
  const positions: Record<Id, { x: number; y: number }> = {};
  const names = new Map<Id, string>();

  for (const table of clip.tables) {
    const id = tableIds.get(table.id) ?? createId();
    const namespace = namespaces.has(table.namespace) ? table.namespace : fallbackNamespace;
    const name = uniqueName(
      `${table.name}_copy`,
      schema.tables.filter((t) => t.namespace === namespace).map((t) => t.name),
    );
    names.set(table.id, name);
    schema = addTable(schema, {
      id,
      name,
      namespace,
      comment: table.comment,
      metadata: table.metadata,
      columns: table.columns.map((c) => ({
        ...c,
        id: col(c.id),
        logicalType:
          c.logicalType.kind === 'enum' && !enums.has(c.logicalType.enumId)
            ? ({ kind: 'unknown' } satisfies LogicalType)
            : c.logicalType,
      })),
    });
    if (table.primaryKey) {
      schema = setPrimaryKey(schema, id, {
        name:
          table.primaryKey.name &&
          renamed(table.primaryKey.name, table.name, name, constraintNames),
        columns: table.primaryKey.columns.map(col),
      });
    }
    for (const index of table.indexes) {
      schema = addIndex(schema, id, {
        ...index,
        id: createId(),
        name: renamed(index.name, table.name, name, constraintNames),
        columns: index.columns.map((c) => ({ ...c, column: col(c.column) })),
      });
    }
    for (const unique of table.uniques) {
      schema = addUnique(schema, id, {
        name: renamed(unique.name, table.name, name, constraintNames),
        columns: unique.columns.map(col),
      });
    }
    for (const check of table.checks) {
      schema = addCheck(schema, id, {
        name: renamed(check.name, table.name, name, constraintNames),
        expression: check.expression,
      });
    }
    const from = clip.positions[table.id] ?? { x: 0, y: 0 };
    positions[id] = { x: from.x + offset, y: from.y + offset };
  }

  for (const table of clip.tables) {
    const id = tableIds.get(table.id);
    const name = names.get(table.id);
    if (!id || !name) continue;
    for (const fk of table.foreignKeys) {
      const copied = tableIds.get(fk.refTable);
      const original = schema.tables.find((t) => t.id === fk.refTable);
      const keepsOriginal =
        !copied &&
        original &&
        fk.refColumns.every((c) => original.columns.some((oc) => oc.id === c));
      if (!copied && !keepsOriginal) continue;
      schema = addForeignKey(schema, id, {
        name: renamed(fk.name, table.name, name, constraintNames),
        columns: fk.columns.map(col),
        refTable: copied ?? fk.refTable,
        refColumns: copied ? fk.refColumns.map(col) : fk.refColumns,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      });
    }
  }
  return { schema, tableIds: [...tableIds.values()], positions };
}
