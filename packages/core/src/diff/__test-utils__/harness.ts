import { expect } from 'vitest';
import type { Column, Schema } from '../../ir/types';
import { parseMySQLDDL, parsePostgresDDL } from '../../parsers';
import { DEFAULT_NAMESPACE } from '../../serializers/model';
import { applyOperations } from '../apply';
import { SchemaView, normalizeNativeType, normalizeSql, qkey } from '../defs';
import { diffSchemas } from '../diff';
import { invertOperations } from '../invert';
import type { DiffOptions, DiffResult, Operation } from '../types';

export const pg = (sql: string): Schema => {
  const result = parsePostgresDDL(sql);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) throw new Error(errors.map((d) => d.message).join('\n'));
  return result.schema;
};
export const my = (sql: string): Schema => parseMySQLDDL(sql).schema;

function defaultKey(column: Column): string {
  const def = column.default;
  if (def?.kind !== 'expression') return JSON.stringify(def);
  const sql = normalizeSql(def.sql).toLowerCase();
  return sql === 'now()' ? 'current_timestamp' : sql;
}

const byName = <T extends { name: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => (a.name < b.name ? -1 : 1));

/**
 * The schema as the diff engine sees it: ids, column order, metadata other than identity,
 * unnamed-vs-named primary keys and (for MySQL) enum names are not part of a diff, so they are
 * left out; everything else must match exactly.
 */
export function diffCanonical(schema: Schema): unknown {
  const view = new SchemaView(schema);
  const mysql = schema.dialect === 'mysql';
  return {
    // The default namespace always exists; whether a schema lists it is not a difference.
    namespaces: schema.namespaces
      .map((n) => n.name)
      .filter((n) => n !== DEFAULT_NAMESPACE[schema.dialect])
      .sort(),
    enums: mysql
      ? []
      : schema.enums
          .map((e) => ({ name: qkey(view.enumName(e.id)), values: e.values }))
          .sort((a, b) => (a.name < b.name ? -1 : 1)),
    tables: schema.tables
      .map((t) => {
        const def = view.table(t, true);
        return {
          name: qkey(def),
          comment: t.comment,
          columns: byName(t.columns).map((c) => ({
            name: c.name,
            type:
              c.logicalType.kind === 'enum'
                ? mysql
                  ? view.model.enum(c.logicalType.enumId).values
                  : qkey(view.enumName(c.logicalType.enumId))
                : normalizeNativeType(schema.dialect, c.nativeType),
            nullable: c.nullable,
            default: defaultKey(c),
            autoIncrement: c.autoIncrement,
            identity: c.metadata.identity ?? null,
            comment: c.comment,
          })),
          primaryKey: def.primaryKey?.columns ?? null,
          uniques: byName(def.uniques),
          checks: byName(def.checks).map((c) => ({
            name: c.name,
            expression: normalizeSql(c.expression),
          })),
          indexes: byName(def.indexes).map((i) => ({
            ...i,
            method: i.method ?? 'btree',
            where: i.where && normalizeSql(i.where),
          })),
          foreignKeys: byName(t.foreignKeys.map((fk) => view.foreignKey(fk))),
        };
      })
      .sort((a, b) => (a.name < b.name ? -1 : 1)),
  };
}

/**
 * Diff, then prove the result: replaying the operations on `before` (strictly, so every op
 * must be valid where it stands) yields `after`, and replaying the inverse on `after` yields
 * `before`.
 */
export function expectRoundTrip(before: Schema, after: Schema, options?: DiffOptions): DiffResult {
  const result = diffSchemas(before, after, options);
  const up = applyOperations(before, result.operations);
  expect(diffCanonical(up)).toEqual(diffCanonical(after));
  const down = applyOperations(after, invertOperations(result.operations));
  expect(diffCanonical(down)).toEqual(diffCanonical(before));
  return result;
}

export const kinds = (ops: readonly Operation[]) => ops.map((op) => op.kind);

/** `kind:detail` labels, for asserting order compactly. */
export function labels(ops: readonly Operation[]): string[] {
  return ops.map((op) => {
    switch (op.kind) {
      case 'createNamespace':
      case 'dropNamespace':
        return `${op.kind}:${op.name}`;
      case 'createEnum':
      case 'dropEnum':
        return `${op.kind}:${op.enum.name}`;
      case 'alterEnumAddValue':
        return `${op.kind}:${op.enum.name}.${op.value}`;
      case 'recreateEnum':
        return `${op.kind}:${op.enum.name}`;
      case 'createTable':
      case 'dropTable':
        return `${op.kind}:${op.table.name}`;
      case 'renameTable':
        return `${op.kind}:${op.from.name}->${op.to.name}`;
      case 'renameColumn':
        return `${op.kind}:${op.table.name}.${op.from}->${op.to}`;
      case 'addColumn':
      case 'dropColumn':
        return `${op.kind}:${op.table.name}.${op.column.name}`;
      case 'alterColumnType':
      case 'alterColumnNullability':
      case 'alterColumnDefault':
        return `${op.kind}:${op.table.name}.${op.column}`;
      case 'addPrimaryKey':
      case 'dropPrimaryKey':
        return `${op.kind}:${op.table.name}`;
      case 'createIndex':
      case 'dropIndex':
        return `${op.kind}:${op.index.name}`;
      case 'addUnique':
      case 'dropUnique':
        return `${op.kind}:${op.unique.name}`;
      case 'addForeignKey':
      case 'dropForeignKey':
        return `${op.kind}:${op.foreignKey.name}`;
      case 'addCheck':
      case 'dropCheck':
        return `${op.kind}:${op.check.name}`;
      case 'setComment':
        return `${op.kind}:${op.table.name}${op.column ? `.${op.column}` : ''}`;
    }
  });
}
