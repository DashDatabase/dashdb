import { z } from 'zod';
import { parseMysqlEnumValues } from '../ir/types-map';
import type { ColumnDefault, IrDialect, ReferentialAction } from '../ir/types';
import { START, checkInputSize, createLocator, errorMessage, firstLine } from './diagnostics';
import { jsonErrorOffset } from './json-error';
import { isNumericLiteral, readQuoted } from './literals';
import { DraftSchema, draftColumn, emptyResult, finalize, type DraftTable } from './draft';
import type { ParseOptions, ParseResult } from './types';

/*
 * The introspection contract: what DashDB's "smart query" (`introspection/queries.ts`) returns.
 * Rows mirror the system catalogs, one array per object kind. Each column carries its full
 * native type as the database spells it (Postgres `format_type()`, MySQL `COLUMN_TYPE`), so no
 * type has to be reassembled from catalog fragments.
 */

const name = z.string().min(1);
const nullableText = z.string().nullish();

/**
 * Entries in key order. Engines whose JSON aggregates keep no order (MySQL's `JSON_ARRAYAGG`)
 * tag each entry with a 1-based `seq` instead; the sort is stable for untagged entries.
 */
function bySeq<T>(entries: T[]): T[] {
  const seq = (e: T) =>
    typeof e === 'object' && e !== null && 'seq' in e && typeof e.seq === 'number' ? e.seq : 0;
  return entries.some((e) => seq(e) !== 0) ? [...entries].sort((a, b) => seq(a) - seq(b)) : entries;
}

/** Key columns: names, or `{ name, seq }` entries (see `bySeq`). */
const keyColumns = z
  .array(z.union([name, z.object({ name, seq: z.number().int().positive() })]))
  .transform((entries) => bySeq(entries).map((e) => (typeof e === 'string' ? e : e.name)));

export const introspectedTableSchema = z.object({
  schema: name,
  name,
  /** `view`s are skipped; omitted means a base table. */
  kind: z.enum(['table', 'view', 'materialized view']).optional(),
  comment: nullableText,
  /** MySQL table options, preserved as metadata. */
  engine: nullableText,
  collation: nullableText,
});

export const introspectedColumnSchema = z.object({
  schema: name,
  table: name,
  name,
  /** 1-based ordinal position; columns are ordered by it. */
  position: z.number().int().positive(),
  type: name,
  nullable: z.boolean(),
  /** The default as SQL text (`pg_get_expr` / `COLUMN_DEFAULT`). */
  default: nullableText,
  /** Postgres identity column: `attidentity` as words or its `a` / `d` code. */
  identity: z
    .enum(['always', 'by default', 'a', 'd'])
    .nullish()
    .transform((v) => (v === 'a' ? 'always' : v === 'd' ? 'by default' : (v ?? null))),
  /** MySQL `EXTRA` (`auto_increment`, `DEFAULT_GENERATED on update CURRENT_TIMESTAMP`, …). */
  extra: nullableText,
  comment: nullableText,
});

const actionSchema = z.string().nullish();

export const introspectedConstraintSchema = z.object({
  schema: name,
  table: name,
  name,
  type: z.enum(['PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK']),
  /** Constrained columns, in key order. */
  columns: keyColumns,
  ref_schema: nullableText,
  ref_table: nullableText,
  ref_columns: keyColumns.nullish(),
  /** Words (`CASCADE`, `SET NULL`) or Postgres `confdeltype` codes (`a r c n d`). */
  on_delete: actionSchema,
  on_update: actionSchema,
  /** CHECK definition, with or without the `CHECK (…)` wrapper. */
  definition: nullableText,
});

export const introspectedIndexSchema = z.object({
  schema: name,
  table: name,
  name,
  unique: z.boolean(),
  primary: z.boolean().optional(),
  method: nullableText,
  /** Partial-index predicate. */
  predicate: nullableText,
  columns: z
    .array(
      z.union([
        name,
        z.object({
          name: name.nullish(),
          /** Set for expression index entries. */
          expression: nullableText,
          order: z.enum(['asc', 'desc']).optional(),
          nulls: z.enum(['first', 'last']).nullish(),
          /** Position in the index (see `bySeq`). */
          seq: z.number().int().positive().optional(),
        }),
      ]),
    )
    .transform(bySeq),
});

export const introspectedEnumSchema = z.object({
  schema: name,
  name,
  values: z.array(z.string()).min(1),
});

export const introspectionResultSchema = z.object({
  tables: z.array(introspectedTableSchema),
  columns: z.array(introspectedColumnSchema),
  constraints: z.array(introspectedConstraintSchema).default([]),
  indexes: z.array(introspectedIndexSchema).default([]),
  enums: z.array(introspectedEnumSchema).default([]),
});

export type IntrospectionResult = z.input<typeof introspectionResultSchema>;

const PG_ACTION_CODES: Record<string, ReferentialAction> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
};
const ACTION_WORDS = new Set<ReferentialAction>([
  'no action',
  'restrict',
  'cascade',
  'set null',
  'set default',
]);

function action(value: string | null | undefined): ReferentialAction {
  if (!value) return 'no action';
  const word = value.toLowerCase().trim() as ReferentialAction;
  return PG_ACTION_CODES[word] ?? (ACTION_WORDS.has(word) ? word : 'no action');
}

const DEFAULT_NAMESPACE: Record<IrDialect, string> = {
  postgres: 'public',
  mysql: 'default',
  sqlite: 'main',
};

/**
 * Turn an introspection result (JSON text or an already-parsed object) into Schema IR. Invalid
 * JSON or rows that break the contract are reported as diagnostics.
 */
export function parseIntrospectionJSON(
  json: unknown,
  dialect: IrDialect,
  options: ParseOptions = {},
): ParseResult {
  let input: unknown = json;
  if (typeof json === 'string') {
    const tooLarge = checkInputSize(json);
    if (tooLarge) return emptyResult(dialect, DEFAULT_NAMESPACE[dialect], [tooLarge], options);
    try {
      input = JSON.parse(json);
    } catch (error) {
      // Engines word JSON errors differently (and not all give a position), so locate it ourselves.
      const loc = createLocator(json)(jsonErrorOffset(json));
      return emptyResult(
        dialect,
        DEFAULT_NAMESPACE[dialect],
        [
          {
            severity: 'error',
            code: 'invalid-input',
            message: `Invalid JSON: ${firstLine(errorMessage(error))}`,
            ...loc,
          },
        ],
        options,
      );
    }
  }

  const parsed = introspectionResultSchema.safeParse(input);
  if (!parsed.success) {
    return emptyResult(
      dialect,
      DEFAULT_NAMESPACE[dialect],
      parsed.error.issues.map((issue) => ({
        severity: 'error' as const,
        code: 'invalid-input' as const,
        message: `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
        ...START,
      })),
      options,
    );
  }
  const data = parsed.data;
  const draft = new DraftSchema(dialect, data.tables[0]?.schema ?? DEFAULT_NAMESPACE[dialect]);

  for (const e of data.enums) draft.addEnum(e.schema, e.name, e.values, START);

  const tables = new Map<string, DraftTable>();
  const key = (schema: string, table: string) => JSON.stringify([schema, table]);
  for (const t of data.tables) {
    if (t.kind && t.kind !== 'table') {
      draft.report('info', 'unsupported-feature', `${t.kind} "${t.schema}.${t.name}" is skipped`);
      continue;
    }
    const table = draft.addTable(t.schema, t.name, START);
    if (!table) continue;
    table.comment = t.comment ?? null;
    if (t.engine) table.metadata.engine = t.engine.toLowerCase();
    if (t.collation) table.metadata.collate = t.collation.toLowerCase();
    tables.set(key(t.schema, t.name), table);
  }

  const columns = [...data.columns].sort((a, b) => a.position - b.position);
  for (const c of columns) {
    const table = tables.get(key(c.schema, c.table));
    if (!table) {
      draft.report(
        'warning',
        'unresolved-reference',
        `Column "${c.name}" belongs to unknown table "${c.schema}.${c.table}"`,
      );
      continue;
    }
    const extra = c.extra?.toLowerCase() ?? '';
    const column = draftColumn(c.name, c.type, START, {
      nullable: c.nullable,
      comment: c.comment ?? null,
      autoIncrement: c.identity != null || extra.includes('auto_increment'),
    });
    if (c.identity) column.metadata.identity = c.identity;
    if (extra.includes('on update')) column.metadata.onUpdate = 'CURRENT_TIMESTAMP';
    if (c.default != null) {
      column.default =
        dialect === 'mysql'
          ? mysqlDefault(c.default, extra.includes('default_generated'))
          : postgresDefault(c.default);
      if (column.default.kind === 'sequence') column.autoIncrement = true;
    }
    if (dialect === 'mysql' && /^enum\s*\(/i.test(c.type)) {
      // MySQL enums are inline; each column's value list becomes an IR enum named after it.
      const values = parseMysqlEnumValues(
        c.type.slice(c.type.indexOf('(') + 1, c.type.lastIndexOf(')')),
      );
      if (values) {
        const enumName = `${table.name}_${c.name}`;
        draft.addEnum(table.namespace, enumName, values, START);
        column.enumRef = { namespace: table.namespace, name: enumName };
      }
    }
    table.columns.push(column);
  }

  const constraintNames = new Set<string>();
  for (const k of data.constraints) {
    const table = tables.get(key(k.schema, k.table));
    if (!table) {
      draft.report(
        'warning',
        'unresolved-reference',
        `Constraint "${k.name}" belongs to unknown table "${k.schema}.${k.table}"`,
      );
      continue;
    }
    constraintNames.add(key(k.schema, k.name));
    switch (k.type) {
      case 'PRIMARY KEY':
        // MySQL names every primary key PRIMARY; that is no information worth keeping.
        draft.addPrimaryKey(table, {
          name: dialect === 'mysql' ? null : k.name,
          columns: k.columns,
          loc: START,
        });
        break;
      case 'UNIQUE':
        table.uniques.push({ name: k.name, columns: k.columns, loc: START });
        break;
      case 'CHECK':
        table.checks.push({
          name: k.name,
          expression: checkExpression(k.definition ?? ''),
          loc: START,
        });
        break;
      case 'FOREIGN KEY':
        if (!k.ref_table) {
          draft.report('error', 'invalid-input', `Foreign key "${k.name}" has no ref_table`);
          break;
        }
        table.foreignKeys.push({
          name: k.name,
          columns: k.columns,
          ref: { namespace: k.ref_schema ?? k.schema, name: k.ref_table },
          refColumns: k.ref_columns?.length ? k.ref_columns : null,
          onDelete: action(k.on_delete),
          onUpdate: action(k.on_update),
          loc: START,
        });
        break;
    }
  }

  for (const index of data.indexes) {
    // Primary keys and unique constraints are backed by indexes the catalogs also list.
    if (index.primary || constraintNames.has(key(index.schema, index.name))) continue;
    const table = tables.get(key(index.schema, index.table));
    if (!table) {
      draft.report(
        'warning',
        'unresolved-reference',
        `Index "${index.name}" belongs to unknown table "${index.schema}.${index.table}"`,
      );
      continue;
    }
    const entries = index.columns.map((c) => (typeof c === 'string' ? { name: c } : c));
    if (entries.some((c) => !c.name || c.expression)) {
      draft.report(
        'warning',
        'unsupported-feature',
        `Expression index "${index.name}" is skipped: the IR only indexes columns`,
      );
      continue;
    }
    table.indexes.push({
      name: index.name,
      columns: entries.map((c) => ({
        name: c.name ?? '',
        order: 'order' in c && c.order ? c.order : 'asc',
        nulls: ('nulls' in c && c.nulls) || null,
      })),
      unique: index.unique,
      method: index.method?.toLowerCase() ?? null,
      where: index.predicate ? unwrapParens(index.predicate) : null,
      loc: START,
    });
  }

  return finalize(draft, options);
}

/** `CHECK ((amount >= 0))` → `amount >= 0`. */
function checkExpression(definition: string): string {
  return unwrapParens(definition.trim().replace(/^CHECK\s*/i, ''));
}

/** `((deleted_at IS NULL))` → `deleted_at IS NULL`: catalogs wrap expressions in parentheses. */
function unwrapParens(expression: string): string {
  let text = expression.trim();
  while (text.startsWith('(') && text.endsWith(')') && balanced(text.slice(1, -1)))
    text = text.slice(1, -1).trim();
  return text;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

const NUMERIC_CASTS = new Set([
  'integer',
  'bigint',
  'smallint',
  'numeric',
  'real',
  'double precision',
]);

/** Split a trailing `::type` cast off a catalog expression. */
function splitCast(text: string): { value: string; cast: string | null } {
  const at = text.lastIndexOf('::');
  return at === -1
    ? { value: text, cast: null }
    : { value: text.slice(0, at), cast: text.slice(at + 2).trim() };
}

/** Postgres catalog defaults: `nextval('x'::regclass)`, `'draft'::status`, `0`, `now()`. */
function postgresDefault(sql: string): ColumnDefault {
  const text = sql.trim();
  if (/^nextval\(/i.test(text) && text.endsWith(')')) {
    const name = readQuoted(text.slice('nextval('.length, -1));
    if (name && (name.rest === '' || name.rest === '::regclass'))
      return { kind: 'sequence', name: name.value };
  }
  const { value, cast } = splitCast(text);
  if (value.toUpperCase() === 'NULL') return { kind: 'literal', value: null };
  if (value === 'true' || value === 'false') return { kind: 'literal', value: value === 'true' };
  const bare = value.startsWith('(') && value.endsWith(')') ? value.slice(1, -1) : value;
  if (isNumericLiteral(bare)) return { kind: 'literal', value: Number(bare) };
  const quoted = readQuoted(value);
  if (quoted?.rest === '') {
    const numeric = cast !== null && NUMERIC_CASTS.has(cast) && isNumericLiteral(quoted.value);
    return { kind: 'literal', value: numeric ? Number(quoted.value) : quoted.value };
  }
  return { kind: 'expression', sql: text };
}

/** MySQL `COLUMN_DEFAULT`: unquoted values; expressions are flagged `DEFAULT_GENERATED`. */
function mysqlDefault(value: string, generated: boolean): ColumnDefault {
  if (generated || /^(current_timestamp|now)\b/i.test(value))
    return { kind: 'expression', sql: value };
  if (value.toUpperCase() === 'NULL') return { kind: 'literal', value: null };
  if (isNumericLiteral(value)) return { kind: 'literal', value: Number(value) };
  return { kind: 'literal', value: value.replace(/^'(.*)'$/s, '$1') };
}
