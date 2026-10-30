import type { Enum, IrDialect, LogicalType } from './types';

/** Dialects with a native type mapping. */
export type MappableDialect = Extract<IrDialect, 'postgres' | 'mysql'>;

export interface TypeMapContext {
  /** Enums visible to the column; postgres matches by name, mysql by value list. */
  readonly enums: readonly Enum[];
}

type NativeParser = (args: string | null, ctx: TypeMapContext) => LogicalType | null;

const INT: LogicalType = { kind: 'int' };
const BIGINT: LogicalType = { kind: 'bigint' };
const TEXT: LogicalType = { kind: 'text' };
const BOOLEAN: LogicalType = { kind: 'boolean' };
const UUID: LogicalType = { kind: 'uuid' };
const JSON_TYPE: LogicalType = { kind: 'json' };
const DATE: LogicalType = { kind: 'date' };
const BYTES: LogicalType = { kind: 'bytes' };
const TIMESTAMP: LogicalType = { kind: 'timestamp', withTimeZone: false };
const TIMESTAMPTZ: LogicalType = { kind: 'timestamp', withTimeZone: true };

/**
 * Split `numeric(10, 2)` or `timestamp(3) with time zone` into a normalized base name
 * (`timestamp with time zone`) and the raw text between the parentheses.
 */
function splitNative(native: string): { base: string; args: string | null } {
  const trimmed = native.trim();
  const open = trimmed.indexOf('(');
  const close = trimmed.lastIndexOf(')');
  const hasArgs = open !== -1 && close > open;
  const base = hasArgs ? `${trimmed.slice(0, open)} ${trimmed.slice(close + 1)}` : trimmed;
  return {
    base: base.toLowerCase().split(/\s+/).filter(Boolean).join(' '),
    args: hasArgs ? trimmed.slice(open + 1, close) : null,
  };
}

/** Parse `10, 2` into `[10, 2]`; `null` when any argument is not a non-negative integer. */
function intArgs(args: string | null): number[] | null {
  if (args === null) return null;
  const parts = args.split(',').map((part) => part.trim());
  return parts.every((part) => /^\d+$/.test(part)) ? parts.map(Number) : null;
}

function decimalFrom(args: string | null): LogicalType | null {
  const nums = intArgs(args);
  if (!nums || nums.length > 2) return null;
  const [precision = 0, scale = 0] = nums;
  return precision > 0 && scale <= precision ? { kind: 'decimal', precision, scale } : null;
}

function varcharFrom(args: string | null): LogicalType | null {
  const nums = intArgs(args);
  const length = nums?.length === 1 ? nums[0] : undefined;
  return length ? { kind: 'varchar', length } : null;
}

/** Parse MySQL's `'a','it''s','b\\c'` enum value list; `null` when malformed. */
export function parseMysqlEnumValues(args: string): string[] | null {
  const values: string[] = [];
  let i = 0;
  for (;;) {
    while (args[i] === ' ') i++;
    if (args[i] !== "'") return null;
    i++;
    let value = '';
    for (;;) {
      const ch = args[i];
      if (ch === undefined) return null;
      if (ch === '\\') {
        const next = args[i + 1];
        if (next === undefined) return null;
        value += next;
        i += 2;
      } else if (ch === "'") {
        if (args[i + 1] === "'") {
          value += "'";
          i += 2;
        } else {
          i++;
          break;
        }
      } else {
        value += ch;
        i++;
      }
    }
    values.push(value);
    while (args[i] === ' ') i++;
    if (i === args.length) return values;
    if (args[i] !== ',') return null;
    i++;
  }
}

function quoteMysqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

const always =
  (type: LogicalType): NativeParser =>
  () =>
    type;

const POSTGRES_PARSERS = new Map<string, NativeParser>([
  ...[
    'integer',
    'int',
    'int4',
    'smallint',
    'int2',
    'serial',
    'serial4',
    'smallserial',
    'serial2',
  ].map((name) => [name, always(INT)] as const),
  ...['bigint', 'int8', 'bigserial', 'serial8'].map((name) => [name, always(BIGINT)] as const),
  ['numeric', decimalFrom],
  ['decimal', decimalFrom],
  ['text', always(TEXT)],
  // An unbounded varchar behaves like text in postgres.
  ['varchar', (args) => (args === null ? TEXT : varcharFrom(args))],
  ['character varying', (args) => (args === null ? TEXT : varcharFrom(args))],
  ['boolean', always(BOOLEAN)],
  ['bool', always(BOOLEAN)],
  ['uuid', always(UUID)],
  ['json', always(JSON_TYPE)],
  ['jsonb', always(JSON_TYPE)],
  ['timestamp', always(TIMESTAMP)],
  ['timestamp without time zone', always(TIMESTAMP)],
  ['timestamptz', always(TIMESTAMPTZ)],
  ['timestamp with time zone', always(TIMESTAMPTZ)],
  ['date', always(DATE)],
  ['bytea', always(BYTES)],
]);

const MYSQL_PARSERS = new Map<string, NativeParser>([
  // MySQL's BOOLEAN is an alias for TINYINT(1); other display widths are plain integers.
  ['tinyint', (args) => (args?.trim() === '1' ? BOOLEAN : INT)],
  ['boolean', always(BOOLEAN)],
  ['bool', always(BOOLEAN)],
  ...[
    'smallint',
    'mediumint',
    'int',
    'integer',
    'tinyint unsigned',
    'smallint unsigned',
    'mediumint unsigned',
  ].map((name) => [name, always(INT)] as const),
  // Unsigned types widen to the next logical type that holds their full range.
  ...['bigint', 'int unsigned', 'integer unsigned'].map((name) => [name, always(BIGINT)] as const),
  ['bigint unsigned', always({ kind: 'decimal', precision: 20, scale: 0 })],
  // MySQL defaults an unqualified DECIMAL to DECIMAL(10,0).
  ...['decimal', 'numeric', 'dec', 'fixed'].map(
    (name) => [name, (args: string | null) => decimalFrom(args ?? '10')] as const,
  ),
  ...['text', 'tinytext', 'mediumtext', 'longtext'].map((name) => [name, always(TEXT)] as const),
  ['varchar', varcharFrom],
  ['char', (args) => (args?.trim() === '36' ? UUID : null)],
  ['json', always(JSON_TYPE)],
  ['datetime', always(TIMESTAMP)],
  ['timestamp', always(TIMESTAMPTZ)],
  ['date', always(DATE)],
  ...['blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary'].map(
    (name) => [name, always(BYTES)] as const,
  ),
  [
    'enum',
    (args, ctx) => {
      const values = args === null ? null : parseMysqlEnumValues(args);
      if (!values) return null;
      const match = ctx.enums.find(
        (e) => e.values.length === values.length && e.values.every((v, i) => v === values[i]),
      );
      return match ? { kind: 'enum', enumId: match.id } : null;
    },
  ],
]);

const PARSERS: Record<MappableDialect, ReadonlyMap<string, NativeParser>> = {
  postgres: POSTGRES_PARSERS,
  mysql: MYSQL_PARSERS,
};

/**
 * Map a native column type (as introspected) to a logical type. Returns `null` when the type has
 * no logical equivalent (e.g. `point`, `int[]`); the column's `nativeType` is then authoritative.
 */
export function fromNativeType(
  dialect: MappableDialect,
  native: string,
  ctx: TypeMapContext,
): LogicalType | null {
  const { base, args } = splitNative(native);
  const parser = PARSERS[dialect].get(base);
  if (parser) return parser(args, ctx);
  if (dialect === 'postgres') {
    // User-defined enum types are referenced by their (case-sensitive) name.
    const name = native.trim();
    const match = ctx.enums.find((e) => e.name === name);
    if (match) return { kind: 'enum', enumId: match.id };
  }
  return null;
}

function findEnum(enumId: string, ctx: TypeMapContext): Enum {
  const match = ctx.enums.find((e) => e.id === enumId);
  if (!match) throw new Error(`Unknown enum ${enumId}`);
  return match;
}

/** Map a logical type to the canonical native type for `dialect`. */
export function toNativeType(
  dialect: MappableDialect,
  type: LogicalType,
  ctx: TypeMapContext,
): string {
  const pg = dialect === 'postgres';
  switch (type.kind) {
    case 'int':
      return pg ? 'integer' : 'int';
    case 'bigint':
      return 'bigint';
    case 'decimal':
      return `${pg ? 'numeric' : 'decimal'}(${type.precision},${type.scale})`;
    case 'text':
      return 'text';
    case 'varchar':
      return `varchar(${type.length})`;
    case 'boolean':
      return pg ? 'boolean' : 'tinyint(1)';
    case 'uuid':
      return pg ? 'uuid' : 'char(36)';
    case 'json':
      return pg ? 'jsonb' : 'json';
    case 'timestamp':
      if (pg) return type.withTimeZone ? 'timestamptz' : 'timestamp';
      return type.withTimeZone ? 'timestamp' : 'datetime';
    case 'date':
      return 'date';
    case 'bytes':
      return pg ? 'bytea' : 'blob';
    case 'enum': {
      const en = findEnum(type.enumId, ctx);
      return pg ? en.name : `enum(${en.values.map(quoteMysqlString).join(',')})`;
    }
  }
}
