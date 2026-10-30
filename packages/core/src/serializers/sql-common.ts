import { toNativeType } from '../ir/types-map';
import type { Column, ColumnDefault, ReferentialAction } from '../ir/types';
import type { SchemaModel } from './model';

/**
 * The column's type in the target dialect: verbatim when the IR is already in that dialect,
 * otherwise translated through its logical type (with a warning when that loses information).
 */
export function targetNativeType(
  model: SchemaModel,
  column: Column,
  dialect: 'postgres' | 'mysql',
  element: string,
): string {
  if (model.schema.dialect === dialect) return column.nativeType;
  const type = column.logicalType;
  if (type.kind === 'unknown') {
    model.warn(
      'lossy-type',
      element,
      `Type "${column.nativeType}" has no ${dialect} equivalent; kept verbatim`,
    );
    return column.nativeType;
  }
  if (type.kind === 'enum' && dialect === 'postgres') {
    const en = model.enum(type.enumId);
    const ns = model.targetNamespace(en.namespace, 'postgres');
    return ns === 'public'
      ? quotePostgres(en.name)
      : `${quotePostgres(ns)}.${quotePostgres(en.name)}`;
  }
  return toNativeType(dialect, type, { enums: model.schema.enums });
}

/** Keywords that cannot be used as bare identifiers in Postgres (reserved + type-function names). */
const POSTGRES_RESERVED = new Set(
  `all analyse analyze and any array as asc asymmetric authorization binary both case cast check
  collate collation column concurrently constraint create cross current_catalog current_date
  current_role current_schema current_time current_timestamp current_user default deferrable desc
  distinct do else end except false fetch for foreign freeze from full grant group having ilike in
  initially inner intersect into is isnull join lateral leading left like limit localtime
  localtimestamp natural not notnull null offset on only or order outer overlaps placing primary
  references returning right select session_user similar some symmetric system_user table
  tablesample then to trailing true union unique user using variadic verbose when where window with`.split(
    /\s+/,
  ),
);

/** MySQL 8 reserved words (the ones plausible as table or column names, plus SQL core). */
const MYSQL_RESERVED = new Set(
  `accessible add all alter analyze and as asc before between bigint binary blob both by call
  cascade case change char character check collate column condition constraint continue convert
  create cross cube current_date current_time current_timestamp current_user cursor database
  databases date day_hour declare default delayed delete desc describe distinct div double drop
  dual each else elseif empty enclosed escaped except exists exit explain false fetch float for
  force foreign from fulltext function generated get grant group grouping groups having high_priority
  if ignore in index infile inner inout insert int integer interval into is iterate join json_table
  key keys kill lag lateral lead leading leave left like limit linear lines load localtime lock long
  loop low_priority match maxvalue mediumint minute_second mod modifies natural not null numeric of
  on optimize option optionally or order out outer outfile over partition precision primary
  procedure purge range rank read reads real recursive references regexp release rename repeat
  replace require resignal restrict return revoke right rlike row row_number rows schema schemas
  select sensitive separator set show signal smallint spatial specific sql sqlexception sqlstate
  sqlwarning ssl starting stored straight_join system table terminated then tinyint to trailing
  trigger true undo union unique unlock unsigned update usage use using utc_date utc_time
  utc_timestamp values varbinary varchar varying virtual when where while window with write xor
  year_month zerofill`.split(/\s+/),
);

export function quotePostgres(name: string): string {
  if (/^[a-z_][a-z0-9_$]*$/.test(name) && !POSTGRES_RESERVED.has(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteMysql(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) && !MYSQL_RESERVED.has(name.toLowerCase()))
    return name;
  return `\`${name.replace(/`/g, '``')}\``;
}

/** A SQL string literal; `''` escapes quotes, and MySQL also needs backslashes escaped. */
export function sqlString(value: string, dialect: 'postgres' | 'mysql'): string {
  const escaped = value.replace(/'/g, "''");
  return `'${dialect === 'mysql' ? escaped.replace(/\\/g, '\\\\') : escaped}'`;
}

export function literalSql(
  value: string | number | boolean | null,
  dialect: 'postgres' | 'mysql',
): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  return sqlString(value, dialect);
}

export function defaultSql(def: ColumnDefault, dialect: 'postgres' | 'mysql'): string {
  switch (def.kind) {
    case 'literal':
      return literalSql(def.value, dialect);
    case 'expression':
      return def.sql;
    case 'sequence':
      return `nextval(${sqlString(def.name, dialect)}::regclass)`;
  }
}

export function actionSql(action: ReferentialAction): string {
  return action.toUpperCase();
}
