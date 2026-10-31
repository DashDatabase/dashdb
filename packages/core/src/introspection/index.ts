import type { IrDialect } from '../ir/types';
import { parseIntrospectionJSON } from '../parsers/introspection';
import type { ParseOptions, ParseResult } from '../parsers/types';
import { INTROSPECTION_QUERIES } from './queries';

export {
  INTROSPECTION_QUERIES,
  MYSQL_INTROSPECTION_QUERY,
  POSTGRES_INTROSPECTION_QUERY,
} from './queries';
export { normalizeIntrospectionPaste } from './paste';

export type IntrospectionDialect = Extract<IrDialect, 'postgres' | 'mysql'>;

export type Row = Readonly<Record<string, unknown>>;

/** Runs one SQL statement and returns its rows; supplied by the caller's database driver. */
export type QueryRunner = (sql: string) => Promise<readonly Row[]>;

/**
 * Reads a live database's schema with DashDB's introspection query and returns it as IR.
 * `run` executes SQL with the caller's driver, so this module has no driver dependency. The
 * query is the same text users run in their own client and paste into the import dialog.
 */
export async function introspect(
  run: QueryRunner,
  dialect: IntrospectionDialect,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const [row] = await run(INTROSPECTION_QUERIES[dialect]);
  // Drivers hand back the JSON column parsed (postgres.js, mysql2) or as text.
  const result: unknown = row?.result;
  return parseIntrospectionJSON(
    typeof result === 'string' ? result : (result ?? null),
    dialect,
    options,
  );
}
