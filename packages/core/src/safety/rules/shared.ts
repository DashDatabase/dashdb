import { normalizeNativeType } from '../../diff/defs';
import type { Operation, QName } from '../../diff/types';
import { tableName as mysqlTable } from '../../migrations/sql/mysql';
import { tableName as pgTable } from '../../migrations/sql/postgres';
import type { MigrationDialect } from '../../migrations/types';
import { quoteMysql, quotePostgres } from '../../serializers/sql-common';

export const sqlFor = (dialect: MigrationDialect) =>
  dialect === 'postgres'
    ? { table: pgTable, col: quotePostgres }
    : { table: mysqlTable, col: quoteMysql };

/** The tables a table-level operation changes (an enum change touches every table using it). */
export function tablesOf(op: Operation): QName[] {
  return op.kind === 'recreateEnum'
    ? op.columns.map((c) => c.table)
    : [(op as Extract<Operation, { table: QName }>).table];
}

export interface ParsedType {
  readonly base: string;
  readonly args: readonly number[];
}

/** `varchar(255)` → `{ base: 'varchar', args: [255] }`, after alias normalization. */
export function parseType(dialect: MigrationDialect, native: string): ParsedType {
  const normalized = normalizeNativeType(dialect, native);
  const open = normalized.indexOf('(');
  if (open === -1) return { base: normalized, args: [] };
  // Only `base(n[,m])` has numeric arguments; anything after the parenthesis (arrays) does not.
  const inner = normalized.endsWith(')') ? normalized.slice(open + 1, -1).split(',') : [];
  if (!inner.length || !inner.every((a) => /^\d+$/.test(a))) return { base: normalized, args: [] };
  return { base: normalized.slice(0, open), args: inner.map(Number) };
}

export function numberedSteps(steps: readonly string[]): string {
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}
