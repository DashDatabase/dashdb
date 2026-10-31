import { toNativeType } from '../ir/types-map';
import type { Column, ColumnDefault, ReferentialAction } from '../ir/types';
import type { SchemaModel } from './model';

/** Native types Postgres and MySQL both accept with the same meaning. */
const PORTABLE_NATIVE = /^(?:char|character)\s*\(\d+\)$|^time$/i;

/**
 * Same type, different name, keyed by the target dialect. Postgres `real` is 4-byte like MySQL
 * `float` (MySQL's own `real` means `double`); MySQL `year` fits in a Postgres `smallint`.
 */
const NATIVE_ALIASES: Record<'postgres' | 'mysql', ReadonlyMap<string, string>> = {
  mysql: new Map([
    ['real', 'float'],
    ['float4', 'float'],
    ['double precision', 'double'],
    ['float8', 'double'],
  ]),
  postgres: new Map([
    ['float', 'real'],
    ['double', 'double precision'],
    ['year', 'smallint'],
  ]),
};

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
  const type = column.logicalType;
  if (type.kind === 'enum' && dialect === 'postgres') {
    const en = model.enum(type.enumId);
    // Same dialect: keep the type as written (e.g. `public.mood`), unless the name needs quotes.
    // A Prisma enum `Role` must be written "Role", or Postgres folds it to `role`.
    if (model.schema.dialect === dialect && quotePostgres(en.name) === en.name) {
      return column.nativeType;
    }
    const ns = model.targetNamespace(en.namespace, 'postgres');
    return ns === 'public'
      ? quotePostgres(en.name)
      : `${quotePostgres(ns)}.${quotePostgres(en.name)}`;
  }
  if (model.schema.dialect === dialect) return column.nativeType;
  // Types without a logical equivalent that both dialects spell the same way are fine as is,
  // and a few have a direct counterpart under another name.
  if (type.kind === 'unknown') {
    const native = column.nativeType.trim();
    if (PORTABLE_NATIVE.test(native)) return column.nativeType;
    const alias = NATIVE_ALIASES[dialect].get(native.toLowerCase());
    if (alias) return alias;
  }
  if (type.kind === 'unknown') {
    model.warn(
      'lossy-type',
      element,
      `Type "${column.nativeType}" has no ${dialect} equivalent; kept verbatim`,
    );
    return column.nativeType;
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

/** Default expressions both Postgres and MySQL accept as written. */
const PORTABLE_DEFAULT =
  /^(?:now\(\)|current_timestamp|current_timestamp\(\d*\)|current_date|true|false|null)$/i;

/**
 * Warns when a column's default is an expression written for another dialect: it is copied as
 * is (functions differ, e.g. Postgres `gen_random_uuid()` vs MySQL `(UUID())`), so it needs a look.
 */
export function warnForeignDefault(
  model: SchemaModel,
  column: Column,
  dialect: 'postgres' | 'mysql',
  element: string,
): void {
  const def = column.default;
  if (def?.kind !== 'expression' || model.schema.dialect === dialect) return;
  if (PORTABLE_DEFAULT.test(def.sql.trim())) return;
  model.warn(
    'unsupported-feature',
    element,
    `Default "${def.sql}" was written for ${model.schema.dialect} and is copied as is; check it works in ${dialect}`,
  );
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
