// What a table's keys say about its columns and relationships: which columns are keys, and how
// many rows sit at each end of a foreign key. Used by diagrams (canvas, SVG, Mermaid).
import type { Column, ForeignKey, Id, Table } from './types';

/** How many rows can be at one end of a relationship. */
export type Cardinality = 'one' | 'zero-one' | 'many';

export interface ColumnFlags {
  readonly pk: boolean;
  readonly fk: boolean;
  /** Unique on its own (a single-column unique constraint or full unique index). */
  readonly unique: boolean;
  /** Nullable and not part of the primary key. */
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

/**
 * Whether `columns` (in any order) are exactly the primary key, a unique constraint or a full
 * (non-partial) unique index of `table`, so each combination of their values appears once.
 */
export function isUniqueSet(table: Table, columns: readonly Id[]): boolean {
  const same = (ids: readonly Id[]) =>
    ids.length === columns.length && ids.every((id) => columns.includes(id));
  return (
    same(table.primaryKey?.columns ?? []) ||
    table.uniques.some((u) => same(u.columns)) ||
    table.indexes.some((i) => i.unique && i.where === null && same(i.columns.map((c) => c.column)))
  );
}

/**
 * The two ends of a foreign key on `table`: `sourceEnd` is how many child rows each parent has
 * (one at most when the key columns are unique), `targetEnd` how many parents each child row has
 * (none allowed when a key column is nullable).
 */
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
