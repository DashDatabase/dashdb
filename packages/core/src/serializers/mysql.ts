import { columnFlags } from '../ir/relations';
import type { Column, Schema, Table } from '../ir/types';
import { SchemaModel } from './model';
import {
  actionSql,
  defaultSql,
  quoteMysql as q,
  sqlString,
  targetNativeType,
  warnForeignDefault,
} from './sql-common';
import { warnClientGenerated } from './prisma-client';
import type { SerializeResult } from './types';

/** Namespace the MySQL parser uses for tables without a database qualifier. */
const UNNAMED_DATABASE = 'default';

/** Table metadata (as the MySQL parser records it) → table option keyword. */
const TABLE_OPTIONS: Record<string, string> = {
  engine: 'ENGINE',
  charset: 'DEFAULT CHARSET',
  collate: 'COLLATE',
  auto_increment: 'AUTO_INCREMENT',
  row_format: 'ROW_FORMAT',
};

/**
 * Render the schema as MySQL DDL: databases, tables in dependency order (keys, checks, table
 * options inline), then indexes, then foreign keys. Enums are inline `enum(...)` column types.
 */
export function toMySQLDDL(schema: Schema): SerializeResult {
  const model = new SchemaModel(schema);
  const tableName = (table: Table) => {
    const db = model.targetNamespace(table.namespace, 'mysql');
    return db === UNNAMED_DATABASE || db === '' ? q(table.name) : `${q(db)}.${q(table.name)}`;
  };
  const statements: string[] = [];

  for (const ns of [...schema.namespaces].map((n) => model.targetNamespace(n.id, 'mysql')).sort()) {
    if (ns !== UNNAMED_DATABASE) statements.push(`CREATE DATABASE IF NOT EXISTS ${q(ns)};`);
  }

  const tables = model.sortedTables();
  for (const table of tables) {
    const element = model.qualified(table);
    const lines = table.columns.map(
      (c) => `  ${columnSql(model, table, c, `${element}.${c.name}`)}`,
    );
    if (table.primaryKey) {
      lines.push(
        `  PRIMARY KEY (${table.primaryKey.columns.map((id) => q(model.columnName(id))).join(', ')})`,
      );
    }
    for (const unique of table.uniques) {
      lines.push(
        `  UNIQUE KEY ${q(unique.name)} (${unique.columns.map((id) => q(model.columnName(id))).join(', ')})`,
      );
    }
    for (const check of table.checks)
      lines.push(`  CONSTRAINT ${q(check.name)} CHECK (${check.expression})`);

    const options = Object.entries(table.metadata).flatMap(([key, value]) => {
      const keyword = TABLE_OPTIONS[key];
      return keyword ? [`${keyword}=${value}`] : [];
    });
    if (table.comment !== null) options.push(`COMMENT=${sqlString(table.comment, 'mysql')}`);
    const suffix = options.length ? ` ${options.join(' ')}` : '';
    statements.push(`CREATE TABLE ${tableName(table)} (\n${lines.join(',\n')}\n)${suffix};`);
  }

  for (const table of tables) {
    for (const index of table.indexes) {
      const special =
        index.method === 'fulltext' || index.method === 'spatial'
          ? index.method.toUpperCase()
          : null;
      const kind = special ? `${special} ` : index.unique ? 'UNIQUE ' : '';
      const cols = index.columns
        .map((c) => `${q(model.columnName(c.column))}${c.order === 'desc' ? ' DESC' : ''}`)
        .join(', ');
      const using = index.method && !special ? ` USING ${index.method.toUpperCase()}` : '';
      if (index.where) {
        model.warn(
          'unsupported-feature',
          `${model.qualified(table)}.${index.name}`,
          'MySQL has no partial indexes; WHERE dropped',
        );
      }
      if (index.columns.some((c) => c.nulls)) {
        model.warn(
          'unsupported-feature',
          `${model.qualified(table)}.${index.name}`,
          'MySQL has no NULLS FIRST/LAST; dropped',
        );
      }
      statements.push(
        `CREATE ${kind}INDEX ${q(index.name)} ON ${tableName(table)} (${cols})${using};`,
      );
    }
  }

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const target = model.table(fk.refTable);
      const local = fk.columns.map((id) => q(model.columnName(id))).join(', ');
      const remote = fk.refColumns.map((id) => q(model.columnName(id))).join(', ');
      const onDelete = fk.onDelete === 'no action' ? '' : ` ON DELETE ${actionSql(fk.onDelete)}`;
      const onUpdate = fk.onUpdate === 'no action' ? '' : ` ON UPDATE ${actionSql(fk.onUpdate)}`;
      statements.push(
        `ALTER TABLE ${tableName(table)} ADD CONSTRAINT ${q(fk.name)} FOREIGN KEY (${local}) REFERENCES ${tableName(target)} (${remote})${onDelete}${onUpdate};`,
      );
    }
  }

  return {
    code: statements.length ? `${statements.join('\n\n')}\n` : '',
    warnings: model.warnings,
  };
}

/** MySQL can only index TEXT/BLOB with a prefix length; DashDB writes varchar(255) instead. */
const UNINDEXABLE = /^(?:tiny|medium|long)?text$/i;
/** Types whose literal defaults MySQL (8.0.13+) only accepts as an expression in parentheses. */
const EXPRESSION_DEFAULT_ONLY = /^(?:(?:tiny|medium|long)?(?:text|blob)|json|geometry)$/i;
/** `datetime(3)` / `timestamp(6)`: fractional seconds precision. */
const FRACTIONAL = /^(?:datetime|timestamp)\((\d)\)$/i;
const CURRENT_TIMESTAMP = /^(?:current_timestamp|now\(\))$/i;

/** In a key or a B-tree index (FULLTEXT and SPATIAL indexes take TEXT as is). */
function isKeyed(table: Table, column: Column): boolean {
  const flags = columnFlags(table, column);
  return (
    flags.pk ||
    flags.unique ||
    table.uniques.some((u) => u.columns.includes(column.id)) ||
    table.indexes.some(
      (i) =>
        !/^(?:fulltext|spatial)$/i.test(i.method ?? '') &&
        i.columns.some((c) => c.column === column.id),
    )
  );
}

function columnSql(model: SchemaModel, table: Table, column: Column, element: string): string {
  let type = targetNativeType(model, column, 'mysql', element);
  // MySQL sources are left as written: a prefix length, if any, belongs to the index.
  if (model.schema.dialect !== 'mysql' && UNINDEXABLE.test(type) && isKeyed(table, column)) {
    model.warn(
      'lossy-type',
      element,
      `MySQL cannot index "${type}" without a prefix length; written as varchar(255)`,
    );
    type = 'varchar(255)';
  }
  const parts = [q(column.name), type];
  if (!column.nullable) parts.push('NOT NULL');
  if (column.autoIncrement) parts.push('AUTO_INCREMENT');
  const def = column.default;
  if (def?.kind === 'sequence') {
    if (!column.autoIncrement)
      model.warn(
        'unsupported-feature',
        element,
        `MySQL has no sequences; default "${def.name}" dropped`,
      );
  } else if (def) {
    warnForeignDefault(model, column, 'mysql', element);
    const sql = defaultSql(def, 'mysql');
    const precision = FRACTIONAL.exec(type)?.[1];
    if (def.kind === 'literal' && def.value !== null && EXPRESSION_DEFAULT_ONLY.test(type)) {
      parts.push(`DEFAULT (${sql})`);
    } else if (precision && def.kind === 'expression' && CURRENT_TIMESTAMP.test(def.sql.trim())) {
      // datetime(3) needs CURRENT_TIMESTAMP(3); a precision mismatch is an invalid default.
      parts.push(`DEFAULT CURRENT_TIMESTAMP(${precision})`);
    } else {
      parts.push(`DEFAULT ${sql}`);
    }
  }
  warnClientGenerated(model, column, element);
  if (column.metadata.onUpdate) parts.push(`ON UPDATE ${column.metadata.onUpdate}`);
  if (column.comment !== null) parts.push(`COMMENT ${sqlString(column.comment, 'mysql')}`);
  return parts.join(' ');
}
