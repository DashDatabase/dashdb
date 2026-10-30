import type { IrDialect } from '../ir/types';
import { parseIntrospectionJSON, type IntrospectionResult } from '../parsers/introspection';
import type { ParseOptions, ParseResult } from '../parsers/types';
import { MYSQL_INTROSPECTION_QUERIES } from './mysql';
import { POSTGRES_INTROSPECTION_SQL } from './postgres';

export { MYSQL_INTROSPECTION_QUERIES } from './mysql';
export { POSTGRES_INTROSPECTION_SQL } from './postgres';

export type Row = Readonly<Record<string, unknown>>;

/** Runs one SQL statement and returns its rows; supplied by the caller's database driver. */
export type QueryRunner = (sql: string) => Promise<readonly Row[]>;

type Introspected = Required<
  Pick<IntrospectionResult, 'tables' | 'columns' | 'constraints' | 'indexes'>
>;

/** A catalog value as text: drivers return strings, numbers or (rarely) buffers. */
const text = (v: unknown): string | null =>
  v === null || v === undefined
    ? null
    : typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean'
        ? String(v)
        : Buffer.isBuffer(v)
          ? v.toString('utf8')
          : JSON.stringify(v);
const nonEmpty = (v: unknown): string | null => text(v) || null;

/** MySQL's unnamed namespace in the IR: the connected database. */
const DB = 'default';

/** Groups ordered rows by a key, keeping first-seen order. */
function group(rows: readonly Row[], key: (r: Row) => string): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.values()];
}

/** Turns the flat information_schema rows into the introspection contract. */
export function assembleMysql(rows: {
  readonly tables: readonly Row[];
  readonly columns: readonly Row[];
  readonly constraints: readonly Row[];
  readonly indexes: readonly Row[];
}): Introspected {
  const byConstraint = group(rows.constraints, (r) => JSON.stringify([r.tbl, r.name]));
  const byIndex = group(rows.indexes, (r) => JSON.stringify([r.tbl, r.name]));
  return {
    tables: rows.tables.map((t) => ({
      schema: DB,
      name: String(t.name),
      kind: t.type === 'VIEW' ? 'view' : 'table',
      comment: nonEmpty(t.comment),
      engine: nonEmpty(t.engine),
      collation: nonEmpty(t.collation),
    })),
    columns: rows.columns.map((c) => ({
      schema: DB,
      table: String(c.tbl),
      name: String(c.name),
      position: Number(c.position),
      type: String(c.type),
      nullable: c.nullable === 'YES',
      default: text(c.dflt),
      extra: nonEmpty(c.extra),
      comment: nonEmpty(c.comment),
    })),
    constraints: byConstraint.map((parts) => {
      const k = parts[0] as Row;
      const fk = k.type === 'FOREIGN KEY';
      return {
        schema: DB,
        table: String(k.tbl),
        name: String(k.name),
        type: String(k.type) as 'PRIMARY KEY' | 'UNIQUE' | 'FOREIGN KEY' | 'CHECK',
        columns: parts.flatMap((p) => text(p.col) ?? []),
        ref_schema: fk ? text(k.ref_schema) : null,
        ref_table: fk ? text(k.ref_table) : null,
        ref_columns: fk ? parts.map((p) => String(p.ref_col)) : null,
        on_delete: fk ? text(k.on_delete) : null,
        on_update: fk ? text(k.on_update) : null,
        definition: text(k.definition),
      };
    }),
    indexes: byIndex.map((parts) => {
      const i = parts[0] as Row;
      const method = String(i.method).toLowerCase();
      return {
        schema: DB,
        table: String(i.tbl),
        name: String(i.name),
        unique: Number(i.non_unique) === 0,
        primary: i.name === 'PRIMARY',
        // BTREE is what an index without USING gets; keep the IR's "unspecified".
        method: method === 'btree' ? null : method,
        columns: parts.map((p) => ({
          name: text(p.col),
          expression: text(p.expression),
          order: p.collation === 'D' ? ('desc' as const) : ('asc' as const),
        })),
      };
    }),
  };
}

/**
 * Reads a live database's schema with DashDB's introspection queries and returns it as IR.
 * `run` executes SQL with the caller's driver, so this module has no driver dependency.
 */
export async function introspect(
  run: QueryRunner,
  dialect: Extract<IrDialect, 'postgres' | 'mysql'>,
  options: ParseOptions = {},
): Promise<ParseResult> {
  if (dialect === 'postgres') {
    const [row] = await run(POSTGRES_INTROSPECTION_SQL);
    const result: unknown = row?.result;
    return parseIntrospectionJSON(
      typeof result === 'string' ? result : (result ?? null),
      dialect,
      options,
    );
  }
  const q = MYSQL_INTROSPECTION_QUERIES;
  const [tables, columns, constraints, indexes] = await Promise.all([
    run(q.tables),
    run(q.columns),
    run(q.constraints),
    run(q.indexes),
  ]);
  return parseIntrospectionJSON(
    assembleMysql({ tables, columns, constraints, indexes }),
    dialect,
    options,
  );
}
