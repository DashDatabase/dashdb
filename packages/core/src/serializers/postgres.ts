import type { Column, Schema, Table } from '../ir/types';
import { SchemaModel } from './model';
import {
  actionSql,
  defaultSql,
  quotePostgres as q,
  sqlString,
  targetNativeType,
  warnForeignDefault,
} from './sql-common';
import { warnClientGenerated } from './prisma-client';
import type { SerializeResult } from './types';

const IDENTITY_TYPES = new Set(['smallint', 'integer', 'int', 'bigint']);

/**
 * MySQL writes boolean defaults as numbers (`tinyint(1) DEFAULT 0`), which Postgres rejects for
 * a boolean column; returns TRUE/FALSE for those, or null to use the default as written.
 */
function booleanDefault(column: Column): string | null {
  const def = column.default;
  if (column.logicalType.kind !== 'boolean' || def?.kind !== 'literal') return null;
  const value = def.value;
  if (value === 0 || value === '0') return 'FALSE';
  if (value === 1 || value === '1') return 'TRUE';
  return null;
}

/** `serial` types the Postgres parser expands back to these native types. */
const SERIAL_FOR: Record<string, string> = {
  integer: 'serial',
  bigint: 'bigserial',
  smallint: 'smallserial',
};

/**
 * Render the schema as PostgreSQL DDL: schemas, enums, tables in dependency order (with their
 * keys, checks and comments), then indexes, then foreign keys.
 */
export function toPostgresDDL(schema: Schema): SerializeResult {
  const model = new SchemaModel(schema);
  const tableName = (table: Table) =>
    qualifiedName(model.targetNamespace(table.namespace, 'postgres'), table.name);
  const statements: string[] = [];

  for (const ns of [...schema.namespaces]
    .map((n) => model.targetNamespace(n.id, 'postgres'))
    .sort()) {
    if (ns !== 'public') statements.push(`CREATE SCHEMA IF NOT EXISTS ${q(ns)};`);
  }
  for (const en of model.sortedEnums()) {
    const values = en.values.map((v) => sqlString(v, 'postgres')).join(', ');
    statements.push(
      `CREATE TYPE ${qualifiedName(model.targetNamespace(en.namespace, 'postgres'), en.name)} AS ENUM (${values});`,
    );
  }

  const tables = model.sortedTables();
  for (const table of tables) {
    const element = model.qualified(table);
    const lines = table.columns.map(
      (c) => `  ${columnSql(model, table, c, `${element}.${c.name}`)}`,
    );
    if (table.primaryKey) {
      const cols = table.primaryKey.columns.map((id) => q(model.columnName(id))).join(', ');
      lines.push(`  ${constraintPrefix(table.primaryKey.name)}PRIMARY KEY (${cols})`);
    }
    for (const unique of table.uniques) {
      lines.push(
        `  CONSTRAINT ${q(unique.name)} UNIQUE (${unique.columns.map((id) => q(model.columnName(id))).join(', ')})`,
      );
    }
    for (const check of table.checks)
      lines.push(`  CONSTRAINT ${q(check.name)} CHECK (${check.expression})`);
    statements.push(`CREATE TABLE ${tableName(table)} (\n${lines.join(',\n')}\n);`);

    const comments: string[] = [];
    if (table.comment !== null)
      comments.push(
        `COMMENT ON TABLE ${tableName(table)} IS ${sqlString(table.comment, 'postgres')};`,
      );
    for (const c of table.columns) {
      if (c.comment !== null) {
        comments.push(
          `COMMENT ON COLUMN ${tableName(table)}.${q(c.name)} IS ${sqlString(c.comment, 'postgres')};`,
        );
      }
    }
    if (comments.length) statements.push(comments.join('\n'));
  }

  for (const table of tables) {
    for (const index of table.indexes) {
      const cols = index.columns
        .map((c) => {
          const order = c.order === 'desc' ? ' DESC' : '';
          const nulls = c.nulls ? ` NULLS ${c.nulls.toUpperCase()}` : '';
          return `${q(model.columnName(c.column))}${order}${nulls}`;
        })
        .join(', ');
      const using = index.method ? ` USING ${index.method}` : '';
      const where = index.where ? ` WHERE ${index.where}` : '';
      statements.push(
        `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${q(index.name)} ON ${tableName(table)}${using} (${cols})${where};`,
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

function qualifiedName(namespace: string, name: string): string {
  return namespace === 'public' || namespace === '' ? q(name) : `${q(namespace)}.${q(name)}`;
}

function constraintPrefix(name: string | null): string {
  return name === null ? '' : `CONSTRAINT ${q(name)} `;
}

function columnSql(model: SchemaModel, table: Table, column: Column, element: string): string {
  let type = targetNativeType(model, column, 'postgres', element);
  const parts: string[] = [];
  const def = column.default;
  const conventionalSequence =
    def?.kind === 'sequence' && def.name === `${table.name}_${column.name}_seq`;
  const serial = SERIAL_FOR[type];

  if (column.autoIncrement && conventionalSequence && serial) {
    type = serial;
  } else if (column.metadata.generated) {
    parts.push(`GENERATED ALWAYS AS (${column.metadata.generated}) STORED`);
  } else if (column.autoIncrement && def === null) {
    // Identity columns, and auto-increment columns from other dialects.
    if (!IDENTITY_TYPES.has(type)) {
      // MySQL's `bigint unsigned` maps to numeric(20,0), which cannot be an identity column.
      model.warn(
        'lossy-type',
        element,
        `Identity columns must be integers; "${type}" written as bigint (max 9223372036854775807)`,
      );
      type = 'bigint';
    }
    const always = column.metadata.identity === 'always';
    parts.push(`GENERATED ${always ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`);
  }
  if (def && !(serial && type === serial)) {
    warnForeignDefault(model, column, 'postgres', element);
    parts.push(`DEFAULT ${booleanDefault(column) ?? defaultSql(def, 'postgres')}`);
  }
  if (column.metadata.onUpdate && model.schema.dialect !== 'postgres') {
    model.warn(
      'unsupported-feature',
      element,
      `Postgres has no ON UPDATE ${column.metadata.onUpdate}; dropped (use a trigger, or set it in your app)`,
    );
  }
  warnClientGenerated(model, column, element);
  if (!column.nullable) parts.push('NOT NULL');
  return [q(column.name), type, ...parts].join(' ');
}
