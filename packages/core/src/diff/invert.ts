import { qkey } from './defs';
import { isTempColumn, isTempTable, netRenames, orderOperations } from './order';
import type { ColumnDefs, ColumnTarget, Operation, QName } from './types';

const swap = (defs: ColumnDefs): ColumnDefs => ({ before: defs.after, after: defs.before });

/**
 * The down migration: the inverse of each operation, re-ordered. Drops and creates swap,
 * alters swap `from`/`to`, renames reverse. Operations that use after-names (alters,
 * comments, enum column lists) are mapped back to before-names, because in the down
 * direction they run after the reversed renames. Inverting restores the schema, not data.
 */
export function invertOperations(ops: readonly Operation[]): Operation[] {
  const tableRenames = netRenames(
    ops.flatMap((op) => (op.kind === 'renameTable' ? [{ from: op.from, to: op.to }] : [])),
    qkey,
    isTempTable,
  );
  const tableBack = new Map(tableRenames.map((r) => [qkey(r.to), r.from]));
  const toBefore = (q: QName): QName => tableBack.get(qkey(q)) ?? q;

  // Column renames, keyed by the (after) table name they are written with.
  const columnRenames = new Map<
    string,
    { table: QName; renames: { from: string; to: string; definition?: ColumnDefs }[] }
  >();
  for (const op of ops) {
    if (op.kind !== 'renameColumn') continue;
    const entry = columnRenames.get(qkey(op.table)) ?? { table: op.table, renames: [] };
    entry.renames.push({
      from: op.from,
      to: op.to,
      ...(op.definition ? { definition: op.definition } : {}),
    });
    columnRenames.set(qkey(op.table), entry);
  }
  const netColumns = new Map(
    [...columnRenames].map(([key, { table, renames }]) => [
      key,
      { table, renames: netRenames(renames, String, isTempColumn) },
    ]),
  );
  const columnBack = (table: QName, column: string): string =>
    netColumns.get(qkey(table))?.renames.find((r) => r.to === column)?.from ?? column;
  const targetBack = (t: ColumnTarget): ColumnTarget => ({
    table: toBefore(t.table),
    column: columnBack(t.table, t.column),
    before: t.after,
    after: t.before,
  });

  // Indexes created on new tables go away with the table when it is dropped again.
  const createdTables = new Set(
    ops.flatMap((op) => (op.kind === 'createTable' ? [qkey(op.table)] : [])),
  );
  const out: Operation[] = [];

  for (const r of tableRenames) out.push({ kind: 'renameTable', from: r.to, to: r.from });
  for (const { table, renames } of netColumns.values()) {
    for (const r of renames)
      out.push({
        kind: 'renameColumn',
        table: toBefore(table),
        from: r.to,
        to: r.from,
        ...(r.definition ? { definition: swap(r.definition) } : {}),
      });
  }

  const enumAdds = new Map<string, Extract<Operation, { kind: 'alterEnumAddValue' }>[]>();
  for (const op of ops) {
    switch (op.kind) {
      case 'renameTable':
      case 'renameColumn':
        break;
      case 'createNamespace':
        out.push({ kind: 'dropNamespace', name: op.name });
        break;
      case 'dropNamespace':
        out.push({ kind: 'createNamespace', name: op.name });
        break;
      case 'createEnum':
        out.push({ kind: 'dropEnum', enum: op.enum });
        break;
      case 'dropEnum':
        out.push({ kind: 'createEnum', enum: op.enum });
        break;
      case 'alterEnumAddValue': {
        const list = enumAdds.get(qkey(op.enum)) ?? [];
        list.push(op);
        enumAdds.set(qkey(op.enum), list);
        break;
      }
      case 'recreateEnum':
        out.push({
          kind: 'recreateEnum',
          enum: op.enum,
          from: op.to,
          to: op.from,
          columns: op.columns.map(targetBack),
        });
        break;
      case 'createTable': {
        const indexes = ops.flatMap((o) =>
          o.kind === 'createIndex' && qkey(o.table) === qkey(op.table) ? [o.index] : [],
        );
        out.push({ kind: 'dropTable', table: { ...op.table, indexes } });
        break;
      }
      case 'dropTable':
        out.push({ kind: 'createTable', table: { ...op.table, indexes: [] } });
        for (const index of op.table.indexes)
          out.push({ kind: 'createIndex', table: op.table, index });
        break;
      case 'addColumn':
        out.push({ kind: 'dropColumn', table: op.table, column: op.column });
        break;
      case 'dropColumn':
        out.push({ kind: 'addColumn', table: op.table, column: op.column });
        break;
      case 'alterColumnType':
      case 'alterColumnNullability':
      case 'alterColumnDefault':
        out.push({
          ...op,
          table: toBefore(op.table),
          column: columnBack(op.table, op.column),
          from: op.to,
          to: op.from,
          definition: swap(op.definition),
        } as Operation);
        break;
      case 'setComment':
        out.push({
          ...op,
          table: toBefore(op.table),
          column: op.column === null ? null : columnBack(op.table, op.column),
          from: op.to,
          to: op.from,
          definition: op.definition && swap(op.definition),
        });
        break;
      case 'addPrimaryKey':
        out.push({ kind: 'dropPrimaryKey', table: op.table, primaryKey: op.primaryKey });
        break;
      case 'dropPrimaryKey':
        out.push({ kind: 'addPrimaryKey', table: op.table, primaryKey: op.primaryKey });
        break;
      case 'createIndex':
        if (!createdTables.has(qkey(op.table))) out.push({ ...op, kind: 'dropIndex' });
        break;
      case 'dropIndex':
        out.push({ ...op, kind: 'createIndex' });
        break;
      case 'addUnique':
        out.push({ ...op, kind: 'dropUnique' });
        break;
      case 'dropUnique':
        out.push({ ...op, kind: 'addUnique' });
        break;
      case 'addForeignKey':
        out.push({ ...op, kind: 'dropForeignKey' });
        break;
      case 'dropForeignKey':
        out.push({ ...op, kind: 'addForeignKey' });
        break;
      case 'addCheck':
        out.push({ kind: 'dropCheck', table: op.table, check: op.check });
        break;
      case 'dropCheck':
        out.push({ kind: 'addCheck', table: op.table, check: op.check });
        break;
    }
  }

  // Added enum values cannot be removed in place: undo them all with one recreate.
  for (const adds of enumAdds.values()) {
    const first = adds[0] as (typeof adds)[number];
    const last = adds[adds.length - 1] as (typeof adds)[number];
    out.push({
      kind: 'recreateEnum',
      enum: first.enum,
      from: last.to,
      to: first.from,
      columns: first.columns.map(targetBack),
    });
  }
  return orderOperations(out);
}
