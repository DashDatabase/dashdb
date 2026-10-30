// Turning a column-to-column drag into a proposed foreign key.
import type { Id, ReferentialAction, Schema } from '@dashdb/core';
import { uniqueName } from '../store';
import { columnFlags } from './model';

export interface RelationshipDraft {
  readonly tableId: Id;
  readonly columnId: Id;
  readonly refTableId: Id;
  readonly refColumnId: Id;
  readonly name: string;
  readonly onDelete: ReferentialAction;
  readonly onUpdate: ReferentialAction;
  /** Problems worth showing before the user confirms; none of them block creation. */
  readonly warnings: readonly string[];
}

export interface ColumnRef {
  readonly tableId: Id;
  readonly columnId: Id;
}

/**
 * The foreign key a drag from `from` to `to` most likely means. Normally `from` references `to`;
 * dragging from a key column onto a plain one is read the other way round.
 */
export function proposeRelationship(
  schema: Schema,
  from: ColumnRef,
  to: ColumnRef,
): RelationshipDraft | null {
  if (from.tableId === to.tableId && from.columnId === to.columnId) return null;
  const lookup = (ref: ColumnRef) => {
    const table = schema.tables.find((t) => t.id === ref.tableId);
    const column = table?.columns.find((c) => c.id === ref.columnId);
    return table && column ? { table, column, flags: columnFlags(table, column) } : null;
  };
  const a = lookup(from);
  const b = lookup(to);
  if (!a || !b) return null;
  const isKey = (side: NonNullable<typeof a>) => side.flags.pk || side.flags.unique;
  const [child, parent] = isKey(a) && !isKey(b) ? [b, a] : [a, b];

  const warnings: string[] = [];
  if (!isKey(parent)) {
    warnings.push(
      `${parent.table.name}.${parent.column.name} is not a primary key or unique column.`,
    );
  }
  if (child.column.nativeType.toLowerCase() !== parent.column.nativeType.toLowerCase()) {
    warnings.push(`Types differ: ${child.column.nativeType} → ${parent.column.nativeType}.`);
  }
  const duplicate = child.table.foreignKeys.some(
    (fk) =>
      fk.refTable === parent.table.id &&
      fk.columns.length === 1 &&
      fk.columns[0] === child.column.id &&
      fk.refColumns[0] === parent.column.id,
  );
  if (duplicate) warnings.push('This relationship already exists.');

  const taken = schema.tables.flatMap((t) => t.foreignKeys.map((fk) => fk.name));
  return {
    tableId: child.table.id,
    columnId: child.column.id,
    refTableId: parent.table.id,
    refColumnId: parent.column.id,
    name: uniqueName(`${child.table.name}_${child.column.name}_fkey`, taken),
    onDelete: 'no action',
    onUpdate: 'no action',
    warnings,
  };
}
