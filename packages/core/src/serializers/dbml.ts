import { defaultName } from '../parsers/draft';
import type { ColumnDefault, IrDialect, Schema, Table } from '../ir/types';
import { SchemaModel } from './model';
import type { SerializeResult } from './types';

const DATABASE_TYPE: Record<IrDialect, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
};
/** DBML's implicit schema. */
const DEFAULT_SCHEMA = 'public';
/** Index types DBML accepts. */
const INDEX_TYPES = new Set(['btree', 'hash']);

const name = (n: string) => (/^\w+$/.test(n) ? n : `"${n.replace(/"/g, '\\"')}"`);
const str = (s: string) =>
  `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const expr = (s: string) => `\`${s.replace(/`/g, '\\`')}\``;

/** Bare when it is `name`, `schema.name` or `name(10, 2)`; quoted otherwise. */
function typeName(native: string): string {
  const open = native.indexOf('(');
  const head = open === -1 ? native : native.slice(0, open);
  const args = open === -1 ? '' : native.slice(open);
  const bare = /^[\w.]+$/.test(head) && (args === '' || /^\([\d, ]*\)$/.test(args));
  return bare ? native : `"${native.replace(/"/g, '\\"')}"`;
}

/** Render the schema as DBML (dbdiagram.io). */
export function toDBML(schema: Schema): SerializeResult {
  const model = new SchemaModel(schema);
  const qualified = (namespace: string, n: string) =>
    namespace === DEFAULT_SCHEMA || namespace === '' ? name(n) : `${name(namespace)}.${name(n)}`;
  // DBML's implicit schema is `public`; other dialects' default namespaces map onto it.
  const tableRef = (table: Table) =>
    qualified(model.targetNamespace(table.namespace, 'postgres'), table.name);
  const blocks: string[] = [
    `Project dashdb {\n  database_type: '${DATABASE_TYPE[schema.dialect]}'\n}`,
  ];

  for (const en of model.sortedEnums()) {
    const values = en.values.map((v) => `  ${name(v)}`).join('\n');
    blocks.push(
      `Enum ${qualified(model.targetNamespace(en.namespace, 'postgres'), en.name)} {\n${values}\n}`,
    );
  }

  const tables = model.sortedTables();
  for (const table of tables) {
    const element = model.qualified(table);
    const pk = table.primaryKey;
    // A single-column, unnamed key is a field setting; anything else goes in `indexes`.
    const inlinePk = pk && pk.name === null && pk.columns.length === 1 ? pk.columns[0] : undefined;
    const inlineUniques = new Set<string>();
    const lines: string[] = [];

    for (const unique of table.uniques) {
      const [only] = unique.columns;
      const conventional =
        unique.columns.length === 1 &&
        only !== undefined &&
        unique.name ===
          defaultName(schema.dialect, 'unique', table.name, [model.columnName(only)], 1);
      if (conventional) inlineUniques.add(only);
    }

    for (const column of table.columns) {
      const settings: string[] = [];
      if (column.id === inlinePk) settings.push('pk');
      if (column.autoIncrement) settings.push('increment');
      if (!column.nullable && column.id !== inlinePk) settings.push('not null');
      if (inlineUniques.has(column.id)) settings.push('unique');
      const def =
        column.default &&
        defaultSetting(model, column.default, column.autoIncrement, `${element}.${column.name}`);
      if (def) settings.push(`default: ${def}`);
      if (column.comment !== null) settings.push(`note: ${str(column.comment)}`);
      if (Object.keys(column.metadata).length) {
        model.warn(
          'unsupported-feature',
          `${element}.${column.name}`,
          'DBML has no column metadata; dropped',
        );
      }
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      lines.push(`  ${name(column.name)} ${typeName(column.nativeType)}${suffix}`);
    }

    const indexLines: string[] = [];
    if (pk && pk.columns[0] !== inlinePk) {
      const settings = ['pk', ...(pk.name === null ? [] : [`name: ${str(pk.name)}`])];
      indexLines.push(`    ${columnList(model, pk.columns)} [${settings.join(', ')}]`);
    }
    for (const unique of table.uniques) {
      if (unique.columns.length === 1 && inlineUniques.has(unique.columns[0] ?? '')) continue;
      model.warn(
        'unsupported-feature',
        `${element}.${unique.name}`,
        'DBML has no named unique constraints; written as a unique index',
      );
      indexLines.push(
        `    ${columnList(model, unique.columns)} [unique, name: ${str(unique.name)}]`,
      );
    }
    for (const index of table.indexes) {
      const where = `${element}.${index.name}`;
      if (index.columns.some((c) => c.order === 'desc' || c.nulls)) {
        model.warn('unsupported-feature', where, 'DBML has no index sort order; dropped');
      }
      if (index.where)
        model.warn('unsupported-feature', where, 'DBML has no partial indexes; WHERE dropped');
      const settings = [`name: ${str(index.name)}`];
      if (index.unique) settings.push('unique');
      if (index.method && INDEX_TYPES.has(index.method)) settings.push(`type: ${index.method}`);
      else if (index.method)
        model.warn(
          'unsupported-feature',
          where,
          `DBML has no "${index.method}" index type; dropped`,
        );
      indexLines.push(
        `    ${columnList(
          model,
          index.columns.map((c) => c.column),
        )} [${settings.join(', ')}]`,
      );
    }
    if (indexLines.length) lines.push('', '  indexes {', ...indexLines, '  }');

    if (table.checks.length) {
      lines.push(
        '',
        '  checks {',
        ...table.checks.map((c) => `    ${expr(c.expression)} [name: ${str(c.name)}]`),
        '  }',
      );
    }
    if (table.comment !== null) lines.push('', `  Note: ${str(table.comment)}`);
    if (Object.keys(table.metadata).length) {
      model.warn('unsupported-feature', element, 'DBML has no table metadata; dropped');
    }
    blocks.push(`Table ${tableRef(table)} {\n${lines.join('\n')}\n}`);
  }

  const refs: string[] = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const target = model.table(fk.refTable);
      const settings: string[] = [];
      if (fk.onDelete !== 'no action') settings.push(`delete: ${fk.onDelete}`);
      if (fk.onUpdate !== 'no action') settings.push(`update: ${fk.onUpdate}`);
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      refs.push(
        `Ref ${name(fk.name)}: ${tableRef(table)}.${columnList(model, fk.columns)} > ${tableRef(target)}.${columnList(model, fk.refColumns)}${suffix}`,
      );
    }
  }
  if (refs.length) blocks.push(refs.join('\n'));

  return { code: `${blocks.join('\n\n')}\n`, warnings: model.warnings };
}

function columnList(model: SchemaModel, ids: readonly string[]): string {
  const names = ids.map((id) => name(model.columnName(id)));
  return names.length === 1 ? (names[0] ?? '') : `(${names.join(', ')})`;
}

function defaultSetting(
  model: SchemaModel,
  def: ColumnDefault,
  autoIncrement: boolean,
  element: string,
): string | null {
  switch (def.kind) {
    case 'literal':
      if (def.value === null) return 'null';
      if (typeof def.value === 'string') return str(def.value);
      return String(def.value);
    case 'expression':
      return expr(def.sql);
    case 'sequence':
      // `increment` already says the value comes from a sequence.
      if (!autoIncrement)
        model.warn(
          'unsupported-feature',
          element,
          `DBML has no sequence defaults; "${def.name}" dropped`,
        );
      return null;
  }
}
