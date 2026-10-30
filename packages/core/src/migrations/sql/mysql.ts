import { qkey } from '../../diff/defs';
import type { ColumnDef, Operation, QName, TableDef, UniqueDef } from '../../diff/types';
import { actionSql, defaultSql, quoteMysql as q, sqlString } from '../../serializers/sql-common';

/** Namespace the MySQL parser uses for tables without a database qualifier. */
const UNNAMED_DATABASE = 'default';

const TABLE_OPTIONS: Record<string, string> = {
  engine: 'ENGINE',
  charset: 'DEFAULT CHARSET',
  collate: 'COLLATE',
  auto_increment: 'AUTO_INCREMENT',
  row_format: 'ROW_FORMAT',
};

export interface MysqlBuilt {
  readonly sql: string;
  readonly destructive?: boolean;
  /** Indexes into the operation list that this statement implements. */
  readonly operations: readonly number[];
}

export function tableName(t: QName): string {
  return t.namespace === UNNAMED_DATABASE || t.namespace === ''
    ? q(t.name)
    : `${q(t.namespace)}.${q(t.name)}`;
}

const cols = (names: readonly string[]) => names.map(q).join(', ');
const enumType = (values: readonly string[]) =>
  `enum(${values.map((v) => sqlString(v, 'mysql')).join(',')})`;

/** A full column definition, as CREATE TABLE, ADD COLUMN and MODIFY COLUMN need it. */
export function columnSql(c: ColumnDef, type = c.nativeType): string {
  const parts = [q(c.name), type];
  if (!c.nullable) parts.push('NOT NULL');
  if (c.autoIncrement) parts.push('AUTO_INCREMENT');
  if (c.default && c.default.kind !== 'sequence')
    parts.push(`DEFAULT ${defaultSql(c.default, 'mysql')}`);
  if (c.metadata.onUpdate) parts.push(`ON UPDATE ${c.metadata.onUpdate}`);
  if (c.comment !== null) parts.push(`COMMENT ${sqlString(c.comment, 'mysql')}`);
  return parts.join(' ');
}

function createTableSql(table: TableDef): string {
  const lines = table.columns.map((c) => `  ${columnSql(c)}`);
  if (table.primaryKey) lines.push(`  PRIMARY KEY (${cols(table.primaryKey.columns)})`);
  for (const u of table.uniques) lines.push(`  UNIQUE KEY ${q(u.name)} (${cols(u.columns)})`);
  for (const c of table.checks) lines.push(`  CONSTRAINT ${q(c.name)} CHECK (${c.expression})`);
  const options = Object.entries(table.metadata).flatMap(([key, value]) => {
    const keyword = TABLE_OPTIONS[key];
    return keyword ? [`${keyword}=${value}`] : [];
  });
  if (table.comment !== null) options.push(`COMMENT=${sqlString(table.comment, 'mysql')}`);
  return `CREATE TABLE ${tableName(table)} (\n${lines.join(',\n')}\n)${options.length ? ` ${options.join(' ')}` : ''};`;
}

function indexSql(
  table: QName,
  index: Extract<Operation, { kind: 'createIndex' }>['index'],
): string {
  const special =
    index.method === 'fulltext' || index.method === 'spatial'
      ? `${index.method.toUpperCase()} `
      : '';
  const kind = special || (index.unique ? 'UNIQUE ' : '');
  const using = index.method && !special ? ` USING ${index.method.toUpperCase()}` : '';
  const columns = index.columns
    .map((c) => `${q(c.name)}${c.order === 'desc' ? ' DESC' : ''}`)
    .join(', ');
  return `CREATE ${kind}INDEX ${q(index.name)} ON ${tableName(table)} (${columns})${using};`;
}

/**
 * Statements for the whole operation list. MySQL changes a column by restating it with
 * MODIFY COLUMN, so every type, nullability, default and comment change to one column becomes
 * a single MODIFY with the final definition, and enum value changes restate each column that
 * uses the enum. MySQL enums are inline, so creating or dropping one needs no statement.
 */
/**
 * `ADD INDEX` clauses giving foreign keys back the index MySQL keeps for them, named after the
 * key as MySQL names it, so the key that covered them can be dropped in the same statement.
 */
function restoreImplicit(keys: readonly UniqueDef[]): string {
  return keys.map((k) => `ADD INDEX ${q(k.name)} (${k.columns.map(q).join(', ')}), `).join('');
}

export function mysqlStatements(ops: readonly Operation[]): MysqlBuilt[] {
  // Group the operations that become one statement: enum value changes per enum, and column
  // changes per column. Each group is emitted once, where its first operation stands.
  const groups = new Map<string, number[]>();
  const groupKey = (op: Operation): string | null => {
    if (op.kind === 'alterEnumAddValue' || op.kind === 'recreateEnum')
      return `enum:${qkey(op.enum)}`;
    if (
      op.kind === 'alterColumnType' ||
      op.kind === 'alterColumnNullability' ||
      op.kind === 'alterColumnDefault'
    ) {
      return `column:${qkey(op.table)}.${op.definition.after.name}`;
    }
    if (op.kind === 'setComment' && op.definition !== null)
      return `column:${qkey(op.table)}.${op.definition.after.name}`;
    return null;
  };
  ops.forEach((op, i) => {
    const key = groupKey(op);
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  // A column restated for its own changes already carries the enum's final values.
  const restated = new Set<string>();
  ops.forEach((op, i) => {
    if (op.kind !== 'alterEnumAddValue' && op.kind !== 'recreateEnum') return;
    for (const target of op.columns) {
      const column = groups.get(`column:${qkey(target.table)}.${target.column}`);
      if (!column) continue;
      restated.add(`${qkey(target.table)}.${target.column}`);
      column.push(i);
    }
  });

  const out: MysqlBuilt[] = [];
  ops.forEach((op, i) => {
    const one = (sql: string, destructive = false) =>
      out.push({ sql, destructive, operations: [i] });
    const key = groupKey(op);
    const group = key === null ? [i] : (groups.get(key) as number[]);
    if (group[0] !== i) return;
    const members = group.map((g) => ops[g] as Operation);
    switch (op.kind) {
      case 'createNamespace':
        return one(`CREATE DATABASE ${q(op.name)};`);
      case 'dropNamespace':
        return one(`DROP DATABASE ${q(op.name)};`);
      case 'createEnum':
      case 'dropEnum':
        return;
      case 'alterEnumAddValue':
      case 'recreateEnum': {
        // Restate each column using the enum with its final value list.
        const last = members[members.length - 1] as typeof op;
        const removed = op.from.some((v) => !last.to.includes(v));
        for (const target of last.columns) {
          if (restated.has(`${qkey(target.table)}.${target.column}`)) continue;
          out.push({
            sql: `ALTER TABLE ${tableName(target.table)} MODIFY COLUMN ${columnSql(target.after, enumType(last.to))};`,
            destructive: removed,
            operations: group,
          });
        }
        return;
      }
      case 'alterColumnType':
      case 'alterColumnNullability':
      case 'alterColumnDefault':
        out.push({
          sql: `ALTER TABLE ${tableName(op.table)} MODIFY COLUMN ${columnSql(op.definition.after)};`,
          destructive: members.some((m) => m.kind === 'alterColumnType'),
          operations: group,
        });
        return;
      case 'setComment':
        if (op.definition === null) {
          return one(
            `ALTER TABLE ${tableName(op.table)} COMMENT = ${sqlString(op.to ?? '', 'mysql')};`,
          );
        }
        out.push({
          sql: `ALTER TABLE ${tableName(op.table)} MODIFY COLUMN ${columnSql(op.definition.after)};`,
          destructive: false,
          operations: group,
        });
        return;
      case 'createTable':
        // Indexes of a new table are separate createIndex operations.
        return one(createTableSql(op.table));
      case 'dropTable':
        return one(`DROP TABLE ${tableName(op.table)};`, true);
      case 'renameTable':
        return one(`RENAME TABLE ${tableName(op.from)} TO ${tableName(op.to)};`);
      case 'addColumn':
        return one(`ALTER TABLE ${tableName(op.table)} ADD COLUMN ${columnSql(op.column)};`);
      case 'dropColumn':
        return one(`ALTER TABLE ${tableName(op.table)} DROP COLUMN ${q(op.column.name)};`, true);
      case 'renameColumn':
        return one(
          `ALTER TABLE ${tableName(op.table)} RENAME COLUMN ${q(op.from)} TO ${q(op.to)};`,
        );
      case 'addPrimaryKey':
        return one(
          `ALTER TABLE ${tableName(op.table)} ADD PRIMARY KEY (${cols(op.primaryKey.columns)});`,
        );
      case 'dropPrimaryKey':
        return one(`ALTER TABLE ${tableName(op.table)} DROP PRIMARY KEY;`);
      case 'createIndex':
        return one(indexSql(op.table, op.index));
      case 'dropIndex':
        return one(
          op.implicitIndexes
            ? `ALTER TABLE ${tableName(op.table)} ${restoreImplicit(op.implicitIndexes)}DROP INDEX ${q(op.index.name)};`
            : `DROP INDEX ${q(op.index.name)} ON ${tableName(op.table)};`,
        );
      case 'addUnique':
        return one(
          `ALTER TABLE ${tableName(op.table)} ADD CONSTRAINT ${q(op.unique.name)} UNIQUE (${cols(op.unique.columns)});`,
        );
      case 'dropUnique':
        return one(
          `ALTER TABLE ${tableName(op.table)} ${restoreImplicit(op.implicitIndexes ?? [])}DROP INDEX ${q(op.unique.name)};`,
        );
      case 'addForeignKey': {
        const fk = op.foreignKey;
        const onDelete = fk.onDelete === 'no action' ? '' : ` ON DELETE ${actionSql(fk.onDelete)}`;
        const onUpdate = fk.onUpdate === 'no action' ? '' : ` ON UPDATE ${actionSql(fk.onUpdate)}`;
        return one(
          `ALTER TABLE ${tableName(op.table)} ADD CONSTRAINT ${q(fk.name)} FOREIGN KEY (${cols(fk.columns)}) REFERENCES ${tableName(fk.refTable)} (${cols(fk.refColumns)})${onDelete}${onUpdate};`,
        );
      }
      case 'dropForeignKey':
        one(`ALTER TABLE ${tableName(op.table)} DROP FOREIGN KEY ${q(op.foreignKey.name)};`);
        // The index MySQL created for the key stays behind on its own.
        if (op.implicitIndex) one(`DROP INDEX ${q(op.foreignKey.name)} ON ${tableName(op.table)};`);
        return;
      case 'addCheck':
        return one(
          `ALTER TABLE ${tableName(op.table)} ADD CONSTRAINT ${q(op.check.name)} CHECK (${op.check.expression});`,
        );
      case 'dropCheck':
        return one(`ALTER TABLE ${tableName(op.table)} DROP CHECK ${q(op.check.name)};`);
    }
  });
  return out;
}
