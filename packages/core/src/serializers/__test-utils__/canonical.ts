import type { Id, LogicalType, Schema } from '../../ir/types';

/**
 * The schema with every id replaced by the qualified name of what it identifies, and
 * namespaces, enums and tables sorted by name. Two schemas are "equal ignoring ids" when their
 * canonical forms are deeply equal. Order inside a table (columns, constraints) is kept: it is
 * part of the schema.
 */
export function canonical(schema: Schema): unknown {
  const ns = new Map(schema.namespaces.map((n) => [n.id, n.name]));
  const tables = new Map(
    schema.tables.map((t) => [t.id, `${ns.get(t.namespace) ?? '?'}.${t.name}`]),
  );
  const columns = new Map<Id, string>();
  for (const t of schema.tables) for (const c of t.columns) columns.set(c.id, c.name);
  const enums = new Map(schema.enums.map((e) => [e.id, `${ns.get(e.namespace) ?? '?'}.${e.name}`]));
  const col = (id: Id) => columns.get(id) ?? `?${id}`;
  const type = (t: LogicalType) =>
    t.kind === 'enum' ? { kind: 'enum', enum: enums.get(t.enumId) ?? '?' } : t;
  const byKey = <T extends { key: string }>(items: T[]) =>
    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    dialect: schema.dialect,
    version: schema.version,
    namespaces: schema.namespaces.map((n) => n.name).sort(),
    enums: byKey(schema.enums.map((e) => ({ key: enums.get(e.id) ?? '', values: e.values }))),
    tables: byKey(
      schema.tables.map((t) => ({
        key: tables.get(t.id) ?? '',
        comment: t.comment,
        metadata: t.metadata,
        columns: t.columns.map(({ id: _id, logicalType, ...c }) => ({
          ...c,
          logicalType: type(logicalType),
        })),
        primaryKey: t.primaryKey && {
          name: t.primaryKey.name,
          columns: t.primaryKey.columns.map(col),
        },
        indexes: t.indexes.map(({ id: _id, columns: cs, ...i }) => ({
          ...i,
          columns: cs.map((c) => ({ ...c, column: col(c.column) })),
        })),
        uniques: t.uniques.map((u) => ({ name: u.name, columns: u.columns.map(col) })),
        foreignKeys: t.foreignKeys.map(({ id: _id, columns: cs, refTable, refColumns, ...f }) => ({
          ...f,
          columns: cs.map(col),
          refTable: tables.get(refTable) ?? '?',
          refColumns: refColumns.map(col),
        })),
        checks: t.checks.map((c) => ({ name: c.name, expression: c.expression })),
      })),
    ),
  };
}
