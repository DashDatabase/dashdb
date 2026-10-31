// What changed between a migration's "from" schema and the current one, per table and column,
// for the canvas overlay. Elements are matched by id (baselines are copies of the same schema,
// so ids are stable, and renames keep their ids).
import type { Column, Id, Schema, Table } from '@dashdb/core/lite';

export type ChangeKind = 'added' | 'changed';

export interface TableChange {
  readonly kind: ChangeKind;
  readonly columns: ReadonlyMap<Id, ChangeKind>;
  /** Names of columns the table no longer has. */
  readonly removedColumns: readonly string[];
}

export interface VisualDiff {
  readonly tables: ReadonlyMap<Id, TableChange>;
  /** Tables in "from" that the current schema no longer has. */
  readonly removedTables: readonly Table[];
}

/** Structural equality for IR values (plain data: no cycles, dates or maps). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => same(item, b[i]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]))
  );
}

function columnChanged(before: Column, after: Column): boolean {
  return !same(before, after);
}

/** Everything about a table except its columns' own definitions. */
function tableShape(table: Table) {
  return {
    name: table.name,
    namespace: table.namespace,
    columnIds: table.columns.map((c) => c.id),
    primaryKey: table.primaryKey,
    indexes: table.indexes,
    uniques: table.uniques,
    foreignKeys: table.foreignKeys,
    checks: table.checks,
    comment: table.comment,
  };
}

export function compareSchemas(before: Schema, after: Schema): VisualDiff {
  const beforeTables = new Map(before.tables.map((t) => [t.id, t]));
  const afterIds = new Set(after.tables.map((t) => t.id));
  const tables = new Map<Id, TableChange>();

  for (const table of after.tables) {
    const old = beforeTables.get(table.id);
    if (!old) {
      const columns = new Map(table.columns.map((c) => [c.id, 'added' as const]));
      tables.set(table.id, { kind: 'added', columns, removedColumns: [] });
      continue;
    }
    if (old === table) continue;
    const oldColumns = new Map(old.columns.map((c) => [c.id, c]));
    const columns = new Map<Id, ChangeKind>();
    for (const column of table.columns) {
      const previous = oldColumns.get(column.id);
      if (!previous) columns.set(column.id, 'added');
      else if (columnChanged(previous, column)) columns.set(column.id, 'changed');
    }
    const ids = new Set(table.columns.map((c) => c.id));
    const removedColumns = old.columns.filter((c) => !ids.has(c.id)).map((c) => c.name);
    if (
      columns.size > 0 ||
      removedColumns.length > 0 ||
      !same(tableShape(old), tableShape(table))
    ) {
      tables.set(table.id, { kind: 'changed', columns, removedColumns });
    }
  }

  return { tables, removedTables: before.tables.filter((t) => !afterIds.has(t.id)) };
}

const cache = new WeakMap<Schema, WeakMap<Schema, VisualDiff>>();

/** `compareSchemas`, memoized per pair so every canvas node can ask without recomputing. */
export function cachedCompare(before: Schema, after: Schema): VisualDiff {
  let byAfter = cache.get(before);
  if (!byAfter) {
    byAfter = new WeakMap();
    cache.set(before, byAfter);
  }
  let diff = byAfter.get(after);
  if (!diff) {
    diff = compareSchemas(before, after);
    byAfter.set(after, diff);
  }
  return diff;
}
