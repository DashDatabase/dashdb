import { qkey } from '../../diff/defs';
import type { ColumnDef, ColumnState, Operation, QName, TableDef } from '../../diff/types';
import { actionSql, defaultSql, quotePostgres as q, sqlString } from '../../serializers/sql-common';

/** Where a statement runs relative to the migration's transaction. */
export type Phase = 'before' | 'transaction' | 'after';

export interface Built {
  readonly sql: string;
  readonly phase: Phase;
  readonly destructive?: boolean;
  readonly comment?: string;
}

export interface PostgresContext {
  /** Use CONCURRENTLY for non-unique indexes on tables that exist before and after. */
  readonly concurrent: boolean;
  /** Tables this migration creates or drops (their indexes never need CONCURRENTLY). */
  readonly transient: ReadonlySet<string>;
  /** Framework runners execute the file in one transaction: everything stays in order. */
  readonly embedded: boolean;
  /** `table.column` (after-names) of columns whose default this migration changes anyway. */
  readonly defaultChanges: ReadonlySet<string>;
}

const SERIAL_FOR: Record<string, string> = {
  integer: 'serial',
  bigint: 'bigserial',
  smallint: 'smallserial',
};

const ADD_VALUE_NOTE =
  'Runs before the transaction: a value added by ALTER TYPE … ADD VALUE cannot be used until it is committed.';
const CONCURRENT_NOTE = 'CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction block.';

export function tableName(t: QName): string {
  return t.namespace === 'public' || t.namespace === ''
    ? q(t.name)
    : `${q(t.namespace)}.${q(t.name)}`;
}

const tx = (sql: string, extra: Partial<Built> = {}): Built => ({
  sql,
  phase: 'transaction',
  ...extra,
});
const cols = (names: readonly string[]) => names.map(q).join(', ');

/**
 * A column type. Enum types are written from their reference, quoted and qualified like any
 * other name: a native spelling such as `PostStatus` would fold to `poststatus` unquoted.
 */
export function typeSql(t: Pick<ColumnDef, 'nativeType' | 'logicalType'>): string {
  return t.logicalType.kind === 'enum' ? tableName(t.logicalType.enum) : t.nativeType;
}

/** A column definition, e.g. `id serial NOT NULL` or `email varchar(255) DEFAULT 'x'`. */
export function columnSql(table: QName, c: ColumnDef): string {
  const parts: string[] = [];
  let type = typeSql(c);
  const def = c.default;
  const serial = SERIAL_FOR[type];
  const usesSerial =
    c.autoIncrement &&
    serial !== undefined &&
    def?.kind === 'sequence' &&
    // pg_dump qualifies the sequence with the table's schema: public.t_id_seq is t_id_seq.
    [`${table.name}_${c.name}_seq`, `${table.namespace}.${table.name}_${c.name}_seq`].includes(
      def.name,
    );
  if (usesSerial) type = serial;
  else if (c.metadata.generated) parts.push(`GENERATED ALWAYS AS (${c.metadata.generated}) STORED`);
  else if (c.autoIncrement && def === null) parts.push(identityClause(c.metadata.identity));
  if (def && !usesSerial) parts.push(`DEFAULT ${defaultSql(def, 'postgres')}`);
  if (!c.nullable) parts.push('NOT NULL');
  return [q(c.name), type, ...parts].join(' ');
}

function identityClause(identity: string | null | undefined): string {
  return `GENERATED ${identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
}

function commentSql(table: QName, column: string | null, text: string | null): string {
  const target =
    column === null ? `TABLE ${tableName(table)}` : `COLUMN ${tableName(table)}.${q(column)}`;
  return `COMMENT ON ${target} IS ${text === null ? 'NULL' : sqlString(text, 'postgres')};`;
}

function createTableSql(table: TableDef): Built[] {
  const lines = table.columns.map((c) => `  ${columnSql(table, c)}`);
  if (table.primaryKey) {
    const name = table.primaryKey.name === null ? '' : `CONSTRAINT ${q(table.primaryKey.name)} `;
    lines.push(`  ${name}PRIMARY KEY (${cols(table.primaryKey.columns)})`);
  }
  for (const u of table.uniques)
    lines.push(`  CONSTRAINT ${q(u.name)} UNIQUE (${cols(u.columns)})`);
  for (const c of table.checks) lines.push(`  CONSTRAINT ${q(c.name)} CHECK (${c.expression})`);
  const out = [tx(`CREATE TABLE ${tableName(table)} (\n${lines.join(',\n')}\n);`)];
  if (table.comment !== null) out.push(tx(commentSql(table, null, table.comment)));
  for (const c of table.columns)
    if (c.comment !== null) out.push(tx(commentSql(table, c.name, c.comment)));
  return out;
}

function indexColumns(index: Extract<Operation, { kind: 'createIndex' }>['index']): string {
  return index.columns
    .map(
      (c) =>
        `${q(c.name)}${c.order === 'desc' ? ' DESC' : ''}${c.nulls ? ` NULLS ${c.nulls.toUpperCase()}` : ''}`,
    )
    .join(', ');
}

const maxPlusOne = (table: QName, column: string) =>
  `COALESCE((SELECT MAX(${q(column)}) FROM ${tableName(table)}), 0) + 1`;

function alterDefault(table: QName, column: string, from: ColumnState, to: ColumnState): Built[] {
  const alter = (rest: string) =>
    tx(`ALTER TABLE ${tableName(table)} ALTER COLUMN ${q(column)} ${rest};`);
  const out: Built[] = [];
  if (from.identity && !to.identity) out.push(alter('DROP IDENTITY'));
  if (from.identity && to.identity && from.identity !== to.identity) {
    out.push(alter(`SET GENERATED ${to.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'}`));
  }
  const fromDefault = JSON.stringify(from.default);
  if (fromDefault !== JSON.stringify(to.default)) {
    if (to.default === null) {
      out.push(alter('DROP DEFAULT'));
    } else {
      if (to.default.kind === 'sequence') {
        const owner = `${tableName(table)}.${q(column)}`;
        out.push(tx(`CREATE SEQUENCE IF NOT EXISTS ${to.default.name} OWNED BY ${owner};`));
      }
      out.push(alter(`SET DEFAULT ${defaultSql(to.default, 'postgres')}`));
      if (to.default.kind === 'sequence' && to.autoIncrement) {
        // A reused or new sequence must continue after the existing rows.
        out.push(
          tx(
            `SELECT setval(${sqlString(to.default.name, 'postgres')}, ${maxPlusOne(table, column)}, false);`,
          ),
        );
      }
    }
  }
  if (!from.identity && to.identity) {
    out.push(alter(`ADD ${identityClause(to.identity)}`));
    // Continue numbering after the existing rows instead of restarting at 1.
    const sequence = `pg_get_serial_sequence(${sqlString(tableName(table), 'postgres')}, ${sqlString(column, 'postgres')})`;
    out.push(tx(`SELECT setval(${sequence}, ${maxPlusOne(table, column)}, false);`));
  }
  return out;
}

/** The statements for one operation. */
export function postgresStatements(op: Operation, ctx: PostgresContext): Built[] {
  switch (op.kind) {
    case 'createNamespace':
      return [tx(`CREATE SCHEMA ${q(op.name)};`)];
    case 'dropNamespace':
      return [tx(`DROP SCHEMA ${q(op.name)};`)];
    case 'createEnum':
      return [
        tx(
          `CREATE TYPE ${tableName(op.enum)} AS ENUM (${op.enum.values.map((v) => sqlString(v, 'postgres')).join(', ')});`,
        ),
      ];
    case 'dropEnum':
      return [tx(`DROP TYPE ${tableName(op.enum)};`)];
    case 'alterEnumAddValue': {
      const before = op.before === null ? '' : ` BEFORE ${sqlString(op.before, 'postgres')}`;
      const sql = `ALTER TYPE ${tableName(op.enum)} ADD VALUE ${sqlString(op.value, 'postgres')}${before};`;
      return ctx.embedded ? [tx(sql)] : [{ sql, phase: 'before', comment: ADD_VALUE_NOTE }];
    }
    case 'recreateEnum': {
      // Postgres cannot drop or reorder enum values: swap in a new type and convert columns.
      const old = `${op.enum.name}__old`;
      const oldName = tableName({ namespace: op.enum.namespace, name: old });
      const removed = op.from.some((v) => !op.to.includes(v));
      const out: Built[] = [
        tx(`ALTER TYPE ${tableName(op.enum)} RENAME TO ${q(old)};`),
        tx(
          `CREATE TYPE ${tableName(op.enum)} AS ENUM (${op.to.map((v) => sqlString(v, 'postgres')).join(', ')});`,
        ),
      ];
      for (const target of op.columns) {
        const alter = (rest: string, extra: Partial<Built> = {}) =>
          tx(
            `ALTER TABLE ${tableName(target.table)} ALTER COLUMN ${q(target.column)} ${rest};`,
            extra,
          );
        if (target.before.default !== null) out.push(alter('DROP DEFAULT'));
        out.push(
          alter(
            `TYPE ${tableName(op.enum)} USING ${q(target.column)}::text::${tableName(op.enum)}`,
            { destructive: removed },
          ),
        );
        // Restore the default, unless an alterColumnDefault later in the migration sets it.
        const later = ctx.defaultChanges.has(`${qkey(target.table)}.${target.column}`);
        if (target.after.default !== null && !later) {
          out.push(alter(`SET DEFAULT ${defaultSql(target.after.default, 'postgres')}`));
        }
      }
      out.push(tx(`DROP TYPE ${oldName};`));
      return out;
    }
    case 'createTable':
      // Indexes of a new table are separate createIndex operations.
      return createTableSql(op.table);
    case 'dropTable':
      return [tx(`DROP TABLE ${tableName(op.table)};`, { destructive: true })];
    case 'renameTable': {
      const out: Built[] = [];
      let current = op.from;
      if (op.from.namespace !== op.to.namespace) {
        out.push(tx(`ALTER TABLE ${tableName(current)} SET SCHEMA ${q(op.to.namespace)};`));
        current = { namespace: op.to.namespace, name: op.from.name };
      }
      if (op.from.name !== op.to.name)
        out.push(tx(`ALTER TABLE ${tableName(current)} RENAME TO ${q(op.to.name)};`));
      return out;
    }
    case 'addColumn': {
      const out = [
        tx(`ALTER TABLE ${tableName(op.table)} ADD COLUMN ${columnSql(op.table, op.column)};`),
      ];
      if (op.column.comment !== null)
        out.push(tx(commentSql(op.table, op.column.name, op.column.comment)));
      return out;
    }
    case 'dropColumn':
      return [
        tx(`ALTER TABLE ${tableName(op.table)} DROP COLUMN ${q(op.column.name)};`, {
          destructive: true,
        }),
      ];
    case 'renameColumn':
      return [tx(`ALTER TABLE ${tableName(op.table)} RENAME COLUMN ${q(op.from)} TO ${q(op.to)};`)];
    case 'alterColumnType': {
      const column = q(op.column);
      const enumInvolved = op.from.logicalType.kind === 'enum' || op.to.logicalType.kind === 'enum';
      const using = `${column}::${enumInvolved ? 'text::' : ''}${typeSql(op.to)}`;
      const alter = (rest: string, extra: Partial<Built> = {}) =>
        tx(`ALTER TABLE ${tableName(op.table)} ALTER COLUMN ${column} ${rest};`, extra);
      // A default of the old type may not cast: drop it around the change and restore it.
      const { before, after } = op.definition;
      // The old default may not cast to the new type: drop it first, then restore the new one.
      const dropFirst = before.default !== null && before.default.kind !== 'sequence';
      const restore = dropFirst ? after.default : null;
      return [
        ...(dropFirst ? [alter('DROP DEFAULT')] : []),
        alter(`TYPE ${typeSql(op.to)} USING ${using}`, { destructive: true }),
        ...(restore ? [alter(`SET DEFAULT ${defaultSql(restore, 'postgres')}`)] : []),
      ];
    }
    case 'alterColumnNullability':
      return [
        tx(
          `ALTER TABLE ${tableName(op.table)} ALTER COLUMN ${q(op.column)} ${op.to ? 'DROP' : 'SET'} NOT NULL;`,
        ),
      ];
    case 'alterColumnDefault':
      return alterDefault(op.table, op.column, op.from, op.to);
    case 'addPrimaryKey': {
      const name = op.primaryKey.name === null ? '' : `CONSTRAINT ${q(op.primaryKey.name)} `;
      return [
        tx(
          `ALTER TABLE ${tableName(op.table)} ADD ${name}PRIMARY KEY (${cols(op.primaryKey.columns)});`,
        ),
      ];
    }
    case 'dropPrimaryKey':
      return [
        tx(
          `ALTER TABLE ${tableName(op.table)} DROP CONSTRAINT ${q(op.primaryKey.name ?? `${op.table.name}_pkey`)};`,
        ),
      ];
    case 'createIndex':
    case 'dropIndex': {
      const concurrent =
        ctx.concurrent && !ctx.embedded && !op.index.unique && !ctx.transient.has(qkey(op.table));
      const keyword = concurrent ? ' CONCURRENTLY' : '';
      const sql =
        op.kind === 'createIndex'
          ? `CREATE ${op.index.unique ? 'UNIQUE ' : ''}INDEX${keyword} ${q(op.index.name)} ON ${tableName(op.table)}${op.index.method ? ` USING ${op.index.method}` : ''} (${indexColumns(op.index)})${op.index.where ? ` WHERE ${op.index.where}` : ''};`
          : `DROP INDEX${keyword} ${tableName({ namespace: op.table.namespace, name: op.index.name })};`;
      if (!concurrent) return [tx(sql)];
      return [
        { sql, phase: op.kind === 'createIndex' ? 'after' : 'before', comment: CONCURRENT_NOTE },
      ];
    }
    case 'addUnique':
      return [
        tx(
          `ALTER TABLE ${tableName(op.table)} ADD CONSTRAINT ${q(op.unique.name)} UNIQUE (${cols(op.unique.columns)});`,
        ),
      ];
    case 'dropUnique':
      return [tx(`ALTER TABLE ${tableName(op.table)} DROP CONSTRAINT ${q(op.unique.name)};`)];
    case 'addForeignKey': {
      const fk = op.foreignKey;
      const onDelete = fk.onDelete === 'no action' ? '' : ` ON DELETE ${actionSql(fk.onDelete)}`;
      const onUpdate = fk.onUpdate === 'no action' ? '' : ` ON UPDATE ${actionSql(fk.onUpdate)}`;
      return [
        tx(
          `ALTER TABLE ${tableName(op.table)} ADD CONSTRAINT ${q(fk.name)} FOREIGN KEY (${cols(fk.columns)}) REFERENCES ${tableName(fk.refTable)} (${cols(fk.refColumns)})${onDelete}${onUpdate};`,
        ),
      ];
    }
    case 'dropForeignKey':
      return [tx(`ALTER TABLE ${tableName(op.table)} DROP CONSTRAINT ${q(op.foreignKey.name)};`)];
    case 'addCheck':
      return [
        tx(
          `ALTER TABLE ${tableName(op.table)} ADD CONSTRAINT ${q(op.check.name)} CHECK (${op.check.expression});`,
        ),
      ];
    case 'dropCheck':
      return [tx(`ALTER TABLE ${tableName(op.table)} DROP CONSTRAINT ${q(op.check.name)};`)];
    case 'setComment':
      return [tx(commentSql(op.table, op.column, op.to))];
  }
}
