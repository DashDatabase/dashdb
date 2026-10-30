import type {
  Column,
  ForeignKey,
  Id,
  Index,
  IrDialect,
  LogicalType,
  Schema,
  Table,
} from '../ir/types';
import { SchemaModel } from '../serializers/model';
import type { ColumnDef, ForeignKeyDef, IndexDef, KeyDef, QName, TableDef, TypeRef } from './types';

export const qkey = (q: QName): string => `${q.namespace}.${q.name}`;

/** Code-point string order (locale-independent, so results are the same everywhere). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Name-based views of IR elements, as operations carry them. */
export class SchemaView {
  readonly model: SchemaModel;

  constructor(readonly schema: Schema) {
    this.model = new SchemaModel(schema);
  }

  tableName(table: Table): QName {
    return { namespace: this.model.namespaceName(table.namespace), name: table.name };
  }

  enumName(id: Id): QName {
    const en = this.model.enum(id);
    return { namespace: this.model.namespaceName(en.namespace), name: en.name };
  }

  typeRef(type: LogicalType): TypeRef {
    return type.kind === 'enum' ? { kind: 'enum', enum: this.enumName(type.enumId) } : type;
  }

  column(column: Column): ColumnDef {
    return {
      name: column.name,
      nativeType: column.nativeType,
      logicalType: this.typeRef(column.logicalType),
      nullable: column.nullable,
      default: column.default,
      autoIncrement: column.autoIncrement,
      comment: column.comment,
      metadata: column.metadata,
    };
  }

  names(ids: readonly Id[]): string[] {
    return ids.map((id) => this.model.columnName(id));
  }

  key(table: Table): KeyDef | null {
    return (
      table.primaryKey && {
        name: table.primaryKey.name,
        columns: this.names(table.primaryKey.columns),
      }
    );
  }

  index(index: Index): IndexDef {
    return {
      name: index.name,
      columns: index.columns.map((c) => ({
        name: this.model.columnName(c.column),
        order: c.order,
        nulls: c.nulls,
      })),
      unique: index.unique,
      method: index.method,
      where: index.where,
    };
  }

  foreignKey(fk: ForeignKey): ForeignKeyDef {
    return {
      name: fk.name,
      columns: this.names(fk.columns),
      refTable: this.tableName(this.model.table(fk.refTable)),
      refColumns: this.names(fk.refColumns),
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
    };
  }

  /** The table without foreign keys; indexes only when `withIndexes` (a dropped table's). */
  table(table: Table, withIndexes: boolean): TableDef {
    return {
      ...this.tableName(table),
      columns: table.columns.map((c) => this.column(c)),
      primaryKey: this.key(table),
      uniques: table.uniques.map((u) => ({ name: u.name, columns: this.names(u.columns) })),
      checks: table.checks.map((c) => ({ name: c.name, expression: c.expression })),
      indexes: withIndexes ? table.indexes.map((i) => this.index(i)) : [],
      comment: table.comment,
      metadata: table.metadata,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------------------------

const POSTGRES_ALIASES: Record<string, string> = {
  int: 'integer',
  int4: 'integer',
  int8: 'bigint',
  int2: 'smallint',
  bool: 'boolean',
  float8: 'double precision',
  float4: 'real',
  'character varying': 'varchar',
  character: 'char',
  bpchar: 'char',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  'time without time zone': 'time',
  'time with time zone': 'timetz',
  decimal: 'numeric',
};

const MYSQL_ALIASES: Record<string, string> = {
  integer: 'int',
  bool: 'tinyint',
  boolean: 'tinyint',
  dec: 'decimal',
  numeric: 'decimal',
  fixed: 'decimal',
};

/** MySQL integer display widths (`int(11)`) carry no meaning, except `tinyint(1)` (boolean). */
const MYSQL_INTEGERS = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint']);

/**
 * A comparable spelling of a native type: lowercased, whitespace collapsed, and aliases
 * resolved, so `int4` equals `integer` and `bigint(20) unsigned` equals `bigint unsigned`.
 */
export function normalizeNativeType(dialect: IrDialect, native: string): string {
  const text = native.trim().toLowerCase().replace(/\s+/g, ' ');
  const array = text.endsWith('[]') ? '[]' : '';
  const core = array ? text.slice(0, -2) : text;
  const open = core.indexOf('(');
  const close = core.lastIndexOf(')');
  const hasArgs = open !== -1 && close > open;
  let base = (hasArgs ? `${core.slice(0, open)} ${core.slice(close + 1)}` : core)
    .trim()
    .replace(/\s+/g, ' ');
  let args = hasArgs ? core.slice(open + 1, close).replace(/\s+/g, '') : null;

  if (dialect === 'postgres') {
    base = POSTGRES_ALIASES[base] ?? base;
  } else if (dialect === 'mysql') {
    if ((base === 'bool' || base === 'boolean') && args === null) args = '1';
    const unsigned = base.endsWith(' unsigned');
    const head = unsigned ? base.slice(0, -' unsigned'.length) : base;
    const resolved = MYSQL_ALIASES[head] ?? head;
    base = unsigned ? `${resolved} unsigned` : resolved;
    if (MYSQL_INTEGERS.has(resolved) && !(resolved === 'tinyint' && args === '1')) args = null;
    if (resolved === 'decimal' && args === null) args = '10,0';
  }
  return `${base}${args === null ? '' : `(${args})`}${array}`;
}

/** Whitespace-insensitive SQL text, for comparing expressions. */
export function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const above = previous[j] as number;
      const left = current[j - 1] as number;
      const diagonal = previous[j - 1] as number;
      current.push(Math.min(above + 1, left + 1, diagonal + cost));
    }
    previous = current;
  }
  return previous[b.length] as number;
}

/** 1 − Levenshtein distance / longer length, on lowercased names without `_` and `-`. */
export function nameSimilarity(a: string, b: string): number {
  const x = a.toLowerCase().replace(/[_-]/g, '');
  const y = b.toLowerCase().replace(/[_-]/g, '');
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 1 : 1 - levenshtein(x, y) / longest;
}
