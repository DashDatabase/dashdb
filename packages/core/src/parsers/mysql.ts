// node-sql-parser is CommonJS without named ESM exports, so take Parser off the default export.
import nodeSqlParser, { type Parser } from 'node-sql-parser';
import type { ColumnDefault, ReferentialAction } from '../ir/types';
import {
  checkInputSize,
  createLocator,
  errorMessage,
  firstLine,
  normalizeNewlines,
} from './diagnostics';
import {
  DraftSchema,
  draftColumn,
  emptyResult,
  finalize,
  type DraftColumn,
  type DraftTable,
  type TableRef,
} from './draft';
import { isNumericLiteral } from './literals';
import { isSchemaStatement, leadingKeywords, splitSql } from './split-sql';
import type { ParseOptions, ParseResult, SourceLocation } from './types';

/** Namespace for tables when the script names no database (no `USE`, no `db.table`). */
const DEFAULT_NAMESPACE = 'default';

// node-sql-parser's published types are loose; these describe the parts of its AST we read.
interface Expr {
  readonly type: string;
  readonly value?: unknown;
}
interface ColumnRef {
  readonly column: string | { expr: { value: string } };
  readonly order_by?: string | null;
}
interface TableName {
  readonly db: string | null;
  readonly table: string;
}
interface ReferenceDefinition {
  readonly definition: readonly ColumnRef[];
  readonly table: readonly TableName[];
  readonly on_action?: readonly { type: string; value: { value: string } }[];
}
interface ColumnDefinition {
  readonly resource: 'column';
  readonly column: ColumnRef;
  readonly definition: {
    readonly dataType: string;
    readonly length?: number | null;
    readonly scale?: number | null;
    readonly suffix?: readonly string[] | null;
    readonly expr?: { readonly value: readonly Expr[] };
  };
  readonly nullable?: { type: string } | null;
  readonly default_val?: { value: Expr & { over?: { type: string; keyword?: string } } } | null;
  readonly auto_increment?: string | null;
  readonly primary_key?: string | null;
  readonly unique?: string | null;
  readonly comment?: { value: { value: string } } | null;
  readonly reference_definition?: ReferenceDefinition | null;
}
interface ConstraintDefinition {
  readonly resource: 'constraint';
  readonly constraint?: string | null;
  readonly constraint_type: string;
  readonly index?: string | null;
  readonly definition: readonly (ColumnRef | Expr)[];
  readonly reference_definition?: ReferenceDefinition;
  readonly index_options?: readonly { keyword: string; type: string }[] | null;
}
interface IndexDefinition {
  readonly resource: 'index';
  readonly index?: string | null;
  readonly keyword?: string | null;
  readonly definition: readonly ColumnRef[];
  readonly index_type?: { keyword: string; type: string } | null;
  readonly index_options?: readonly { keyword: string; type: string }[] | null;
}
type CreateDefinition = ColumnDefinition | ConstraintDefinition | IndexDefinition;
/** `ADD CONSTRAINT` nests its definition; `ADD COLUMN` / `ADD INDEX` inline it. */
type AlterChange = (
  CreateDefinition | { resource?: string; create_definitions: CreateDefinition }
) & {
  readonly action: string;
};

interface MysqlAst {
  readonly type: string;
  readonly keyword?: string;
  readonly table?: readonly TableName[] | TableName;
  readonly if_not_exists?: string | null;
  readonly create_definitions?: readonly CreateDefinition[] | null;
  readonly table_options?: readonly { keyword: string; value: unknown }[] | null;
  readonly expr?: readonly AlterChange[];
  readonly db?: string;
  readonly database?: string | { schema: { value: string }[] };
  readonly index?: string;
  readonly index_type?: string | null;
  readonly index_columns?: readonly ColumnRef[];
  readonly index_using?: { type: string } | null;
}

const NUMERIC_TYPES = new Set([
  'tinyint',
  'smallint',
  'mediumint',
  'int',
  'integer',
  'bigint',
  'decimal',
  'numeric',
  'dec',
  'fixed',
  'float',
  'double',
  'real',
]);

const parser: Parser = new nodeSqlParser.Parser();
const OPTIONS = { database: 'MySQL' } as const;

/** Parse MySQL DDL (e.g. a `mysqldump --no-data` file) into Schema IR. */
export function parseMySQLDDL(input: string, options: ParseOptions = {}): ParseResult {
  const sql = normalizeNewlines(input);
  const tooLarge = checkInputSize(sql);
  if (tooLarge) return emptyResult('mysql', DEFAULT_NAMESPACE, [tooLarge], options);

  const draft = new DraftSchema('mysql', DEFAULT_NAMESPACE);
  const locate = createLocator(sql);
  let currentDb: string | null = null;

  for (const statement of splitSql(sql, 'mysql')) {
    const loc = locate(statement.offset);
    let asts: MysqlAst[];
    try {
      const result = parser.astify(statement.text, OPTIONS) as unknown as MysqlAst | MysqlAst[];
      asts = Array.isArray(result) ? result : [result];
    } catch (error) {
      reportParseFailure(
        draft,
        statement.text,
        error,
        (offset) => locate(statement.offset + offset),
        loc,
      );
      continue;
    }
    for (const ast of asts) {
      try {
        if (ast.type === 'use' && ast.db) {
          currentDb = draft.ensureNamespace(ast.db);
          continue;
        }
        applyStatement(draft, ast, loc, currentDb ?? DEFAULT_NAMESPACE);
      } catch (error) {
        draft.report(
          'error',
          'invalid-input',
          `Could not apply statement: ${firstLine(errorMessage(error))}`,
          loc,
        );
      }
    }
  }
  // The "default" namespace stands in for an unnamed database; with USE, that database is the default.
  if (currentDb && !draft.tables.some((t) => t.namespace === DEFAULT_NAMESPACE)) {
    draft.defaultNamespace = currentDb;
  }
  return finalize(draft, options);
}

function reportParseFailure(
  draft: DraftSchema,
  text: string,
  error: unknown,
  at: (offset: number) => SourceLocation,
  statementLoc: SourceLocation,
): void {
  const keywords = leadingKeywords(text);
  if (!isSchemaStatement(text)) {
    draft.report(
      'warning',
      'unsupported-statement',
      `Ignored unsupported statement: ${keywords} …`,
      statementLoc,
    );
    return;
  }
  const offset = (error as { location?: { start?: { offset?: number } } }).location?.start?.offset;
  const loc = typeof offset === 'number' ? at(offset) : statementLoc;
  // The library lists every expected token; the unexpected one is what helps.
  const raw = firstLine(errorMessage(error));
  const found = /but (.+) found\.?$/.exec(raw)?.[1];
  draft.report(
    'error',
    'syntax-error',
    `${keywords} …: ${found ? `Syntax error near ${found}` : raw}`,
    loc,
  );
}

function applyStatement(draft: DraftSchema, ast: MysqlAst, loc: SourceLocation, db: string): void {
  if (ast.type === 'create' && ast.keyword === 'table') {
    createTable(draft, ast, loc, db);
  } else if (ast.type === 'create' && ast.keyword === 'index') {
    createIndex(draft, ast, loc, db);
  } else if (ast.type === 'create' && (ast.keyword === 'database' || ast.keyword === 'schema')) {
    const name = databaseName(ast);
    if (name) draft.ensureNamespace(name);
  } else if (ast.type === 'alter') {
    alterTable(draft, ast, loc, db);
  } else {
    reportIgnored(draft, ast, loc);
  }
}

function reportIgnored(draft: DraftSchema, ast: MysqlAst, loc: SourceLocation): void {
  const what = [ast.type, ast.keyword].filter(Boolean).join(' ').toUpperCase();
  draft.report('warning', 'unsupported-statement', `Ignored ${what} statement`, loc);
}

function databaseName(ast: MysqlAst): string | null {
  const db = ast.database;
  if (typeof db === 'string') return db;
  return db?.schema.map((s) => s.value).join('.') ?? null;
}

function firstTable(ast: MysqlAst): TableName | undefined {
  const table = ast.table;
  if (table === undefined) return undefined;
  return 'table' in table ? table : table[0];
}

function columnName(ref: ColumnRef): string {
  return typeof ref.column === 'string' ? ref.column : ref.column.expr.value;
}

function tableRef(name: TableName): TableRef {
  return { namespace: name.db ?? null, name: name.table };
}

function createTable(draft: DraftSchema, ast: MysqlAst, loc: SourceLocation, db: string): void {
  const name = firstTable(ast);
  if (!name) return;
  const table = draft.addTable(name.db ?? db, name.table, loc, {
    ifNotExists: Boolean(ast.if_not_exists),
  });
  if (!table) return;
  for (const def of ast.create_definitions ?? []) addDefinition(draft, table, def, loc);
  applyTableOptions(table, ast.table_options ?? []);
}

/** `ENGINE`, `CHARSET` & co. do not shape the schema but are preserved as table metadata. */
function applyTableOptions(
  table: DraftTable,
  options: readonly { keyword: string; value: unknown }[],
): void {
  for (const option of options) {
    const raw = option.value;
    const value = typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
    const text =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);
    if (option.keyword === 'comment') {
      table.comment = unquote(text);
      continue;
    }
    const key = option.keyword.replace(/^default /, '').replace(/ /g, '_');
    table.metadata[key === 'character_set' ? 'charset' : key] = text.toLowerCase();
  }
}

function addDefinition(
  draft: DraftSchema,
  table: DraftTable,
  def: CreateDefinition,
  loc: SourceLocation,
): void {
  if (def.resource === 'column') {
    addColumn(draft, table, def, loc);
    return;
  }
  if (def.resource === 'index') {
    const special = /^(fulltext|spatial)\b/.exec(def.keyword ?? '')?.[1];
    const method =
      special ??
      def.index_type?.type ??
      def.index_options?.find((o) => o.keyword === 'using')?.type ??
      null;
    table.indexes.push({
      name: def.index ?? null,
      columns: def.definition.map((c) => ({
        name: columnName(c),
        order: c.order_by?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        nulls: null,
      })),
      unique: false,
      method: method?.toLowerCase() ?? null,
      where: null,
      loc,
    });
    return;
  }
  const type = def.constraint_type.toLowerCase();
  const columns = def.definition.filter((d): d is ColumnRef => 'column' in d).map(columnName);
  if (type === 'primary key') {
    draft.addPrimaryKey(table, { name: null, columns, loc });
  } else if (type.startsWith('unique')) {
    table.uniques.push({ name: def.index ?? def.constraint ?? null, columns, loc });
  } else if (type === 'foreign key' && def.reference_definition) {
    table.foreignKeys.push({
      name: def.constraint ?? null,
      columns,
      ...reference(def.reference_definition),
      loc,
    });
  } else if (type === 'check') {
    const [expr] = def.definition;
    table.checks.push({ name: def.constraint ?? null, expression: expr ? exprSql(expr) : '', loc });
  } else {
    draft.report(
      'warning',
      'unsupported-feature',
      `Constraint type "${type}" on "${table.name}" is ignored`,
      loc,
    );
  }
}

function reference(ref: ReferenceDefinition): {
  ref: TableRef;
  refColumns: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
} {
  const action = (kind: string): ReferentialAction => {
    const value = ref.on_action?.find((a) => a.type === kind)?.value.value.toLowerCase();
    return value === 'cascade' ||
      value === 'restrict' ||
      value === 'set null' ||
      value === 'set default'
      ? value
      : 'no action';
  };
  const target = ref.table[0] ?? { db: null, table: '' };
  return {
    ref: tableRef(target),
    refColumns: ref.definition.map(columnName),
    onDelete: action('on delete'),
    onUpdate: action('on update'),
  };
}

/** MySQL string literals in the AST keep their SQL escaping (`it''s`, `a\'b`). */
function unescapeLiteral(value: string): string {
  return value.replace(/''/g, "'").replace(/\\(.)/g, '$1');
}

function unquote(text: string): string {
  const match = /^'(.*)'$/s.exec(text);
  return match?.[1] !== undefined ? unescapeLiteral(match[1]) : text;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function exprSql(expr: unknown): string {
  return parser.exprToSQL(expr as Parameters<Parser['exprToSQL']>[0], OPTIONS);
}

function addColumn(
  draft: DraftSchema,
  table: DraftTable,
  def: ColumnDefinition,
  loc: SourceLocation,
): void {
  const name = columnName(def.column);
  const type = def.definition;
  const base = type.dataType.toLowerCase();
  const column: DraftColumn = draftColumn(name, base, loc);

  if ((base === 'enum' || base === 'set') && type.expr) {
    const values = type.expr.value.map((v) => unescapeLiteral(String(v.value)));
    column.nativeType = `${base}(${values.map(quoteLiteral).join(',')})`;
    if (base === 'enum') {
      // MySQL enums are inline; each column's value list becomes an IR enum named after it.
      const enumName = `${table.name}_${name}`;
      draft.addEnum(table.namespace, enumName, values, loc);
      column.enumRef = { namespace: table.namespace, name: enumName };
    }
  } else {
    const args =
      type.length != null ? `(${type.length}${type.scale != null ? `,${type.scale}` : ''})` : '';
    const suffix = (type.suffix ?? []).map((s) => ` ${s.toLowerCase()}`).join('');
    column.nativeType = `${base}${args}${suffix}`;
  }

  column.nullable = def.nullable?.type !== 'not null';
  column.autoIncrement = Boolean(def.auto_increment);
  if (def.comment) column.comment = def.comment.value.value;
  if (def.default_val) {
    const value = def.default_val.value;
    column.default = toDefault(value);
    // mysqldump quotes numeric defaults (`DEFAULT '0.00'`); they are numbers to the column.
    const literal = column.default.kind === 'literal' ? column.default.value : null;
    if (typeof literal === 'string' && NUMERIC_TYPES.has(base) && isNumericLiteral(literal)) {
      column.default = { kind: 'literal', value: Number(literal) };
    }
    if (value.over?.type === 'on update')
      column.metadata.onUpdate = value.over.keyword ?? 'CURRENT_TIMESTAMP';
  }
  table.columns.push(column);

  if (def.primary_key) draft.addPrimaryKey(table, { name: null, columns: [name], loc }, true);
  if (def.unique) table.uniques.push({ name: null, columns: [name], loc });
  if (def.reference_definition) {
    table.foreignKeys.push({
      name: null,
      columns: [name],
      ...reference(def.reference_definition),
      loc,
    });
  }
}

function toDefault(value: Expr): ColumnDefault {
  switch (value.type) {
    case 'single_quote_string':
    case 'double_quote_string':
    case 'string':
      return { kind: 'literal', value: unescapeLiteral(String(value.value)) };
    case 'number':
      return { kind: 'literal', value: Number(value.value) };
    case 'bool':
    case 'boolean':
      return { kind: 'literal', value: Boolean(value.value) };
    case 'null':
      return { kind: 'literal', value: null };
    default: {
      // `ON UPDATE` lives on the default node; keep it out of the default expression itself.
      const expr: Record<string, unknown> = { ...value };
      delete expr.over;
      return { kind: 'expression', sql: exprSql(expr) };
    }
  }
}

function createIndex(draft: DraftSchema, ast: MysqlAst, loc: SourceLocation, db: string): void {
  const name = firstTable(ast);
  const table = name && draft.findTable({ namespace: name.db ?? db, name: name.table });
  if (!table) {
    draft.report('error', 'unresolved-reference', `Unknown table "${name?.table ?? '?'}"`, loc);
    return;
  }
  const kind = ast.index_type?.toLowerCase() ?? null;
  table.indexes.push({
    name: ast.index ?? null,
    columns: (ast.index_columns ?? []).map((c) => ({
      name: columnName(c),
      order: c.order_by?.toLowerCase() === 'desc' ? 'desc' : 'asc',
      nulls: null,
    })),
    unique: kind === 'unique',
    method:
      kind === 'fulltext' || kind === 'spatial'
        ? kind
        : (ast.index_using?.type.toLowerCase() ?? null),
    where: null,
    loc,
  });
}

function alterTable(draft: DraftSchema, ast: MysqlAst, loc: SourceLocation, db: string): void {
  const name = firstTable(ast);
  const table = name && draft.findTable({ namespace: name.db ?? db, name: name.table });
  if (!table) {
    draft.report('error', 'unresolved-reference', `Unknown table "${name?.table ?? '?'}"`, loc);
    return;
  }
  for (const change of ast.expr ?? []) {
    if (change.action === 'add') {
      addDefinition(
        draft,
        table,
        'create_definitions' in change ? change.create_definitions : change,
        loc,
      );
    } else
      draft.report(
        'warning',
        'unsupported-statement',
        `Ignored ALTER TABLE ${change.action.toUpperCase()}`,
        loc,
      );
  }
}
