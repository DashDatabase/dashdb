import {
  parse,
  type AlterTableStatement,
  type ColumnConstraint,
  type CommentStatement,
  type CreateColumnDef,
  type CreateIndexStatement,
  type CreateTableStatement,
  type DataTypeDef,
  type Expr,
  type PGNode,
  type QName,
  type Statement,
  type TableConstraint,
  type TableReference,
} from 'pgsql-ast-parser';
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
import { isSchemaStatement, leadingKeywords, splitSql } from './split-sql';
import type { ParseOptions, ParseResult, SourceLocation } from './types';

const DEFAULT_NAMESPACE = 'public';
/** Placeholder column for `REFERENCES t` without a column list; resolved to t's primary key. */
const PK_PLACEHOLDER = '__dashdb_pk__';

const SERIAL_TYPES: Record<string, string> = {
  smallserial: 'smallint',
  serial2: 'smallint',
  serial: 'integer',
  serial4: 'integer',
  bigserial: 'bigint',
  serial8: 'bigint',
};

/** Context for one statement: its text and a converter from statement offsets to positions. */
interface StatementContext {
  readonly text: string;
  /** Where the statement starts; used for statement-level nodes. */
  readonly loc: SourceLocation;
  readonly at: (node?: PGNode | null) => SourceLocation;
  readonly slice: (node: PGNode) => string | null;
}

/**
 * Parse PostgreSQL DDL (e.g. a `pg_dump --schema-only` file) into Schema IR. Each statement is
 * parsed independently, so one bad statement produces a diagnostic and the rest still load.
 */
export function parsePostgresDDL(input: string, options: ParseOptions = {}): ParseResult {
  const sql = normalizeNewlines(input);
  const tooLarge = checkInputSize(sql);
  if (tooLarge) return emptyResult('postgres', DEFAULT_NAMESPACE, [tooLarge], options);

  const draft = new DraftSchema('postgres', DEFAULT_NAMESPACE);
  const locate = createLocator(sql);

  for (const statement of splitSql(sql, 'postgres')) {
    const base = statement.offset;
    const statementLoc = locate(base);
    let parsed: Statement[];
    let text = statement.text;
    try {
      parsed = parse(text, { locationTracking: true });
    } catch (error) {
      // Retry with rewrites for syntax the library lacks; offsets after a rewrite may drift slightly.
      const lenient = lenientRewrite(text);
      try {
        if (lenient === text) throw error;
        parsed = parse(lenient, { locationTracking: true });
        text = lenient;
      } catch {
        reportParseFailure(draft, text, error, (offset) => locate(base + offset), statementLoc);
        continue;
      }
    }
    const statementText = text;
    const ctx: StatementContext = {
      text: statementText,
      loc: statementLoc,
      at: (node) => (node?._location ? locate(base + node._location.start) : statementLoc),
      slice: (node) =>
        node._location
          ? balancedSlice(statementText, node._location.start, node._location.end)
          : null,
    };
    for (const stmt of parsed) {
      try {
        applyStatement(draft, stmt, ctx);
      } catch (error) {
        draft.report(
          'error',
          'invalid-input',
          `Could not apply statement: ${firstLine(errorMessage(error))}`,
          ctx.loc,
        );
      }
    }
  }
  return finalize(draft, options);
}

/**
 * Source text for a node. The library's locations for some list expressions (`x IN (…)`) stop
 * before the closing parenthesis, so the slice is extended until its parentheses balance.
 */
function balancedSlice(text: string, start: number, end: number): string {
  let depth = 0;
  let quoted = false;
  let i = start;
  for (; i < text.length && (i < end || depth > 0); i++) {
    const ch = text[i];
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === '(') depth++;
    else if (!quoted && ch === ')') depth--;
  }
  return text.slice(start, i).trim();
}

function lenientRewrite(text: string): string {
  // Deferrability does not affect the schema shape.
  const withoutDeferrable = text
    .replace(/\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE)\b/gi, '')
    .replace(/\s+NOT\s+DEFERRABLE\b/gi, '')
    .replace(/\s+DEFERRABLE\b/gi, '');
  return addMissingReferenceColumns(withoutDeferrable);
}

/** Length of the (possibly quoted, possibly schema-qualified) identifier at `from`. */
function identifierLength(text: string, from: number): number {
  let i = from;
  for (let part = 0; part < 2; part++) {
    if (text[i] === '"') {
      const close = text.indexOf('"', i + 1);
      if (close === -1) return 0;
      i = close + 1;
    } else {
      const start = i;
      while (i < text.length && /[\w$]/.test(text[i] as string)) i++;
      if (i === start) return 0;
    }
    if (text[i] !== '.') break;
    i++;
  }
  return i - from;
}

/** `REFERENCES t` with no column list means t's primary key: insert a placeholder list. */
function addMissingReferenceColumns(text: string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(/\bREFERENCES\s+/gi)) {
    const nameStart = match.index + match[0].length;
    const length = identifierLength(text, nameStart);
    if (length === 0) continue;
    const nameEnd = nameStart + length;
    if (text.slice(nameEnd).trimStart().startsWith('(')) continue;
    out += `${text.slice(last, nameEnd)} ("${PK_PLACEHOLDER}")`;
    last = nameEnd;
  }
  return out + text.slice(last);
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
  const token = (error as { token?: { offset?: number; text?: string } }).token;
  const loc = typeof token?.offset === 'number' ? at(token.offset) : statementLoc;
  // The library's message embeds statement-relative positions; report the token instead.
  const message = token?.text
    ? `Syntax error near "${token.text}"`
    : firstLine(errorMessage(error)).replace(/\s+at line \d+ col \d+:?$/, '');
  draft.report('error', 'syntax-error', `${keywords} …: ${message}`, loc);
}

function applyStatement(draft: DraftSchema, stmt: Statement, ctx: StatementContext): void {
  switch (stmt.type) {
    case 'create table':
      createTable(draft, stmt, ctx);
      return;
    case 'create index':
      createIndex(draft, stmt, ctx);
      return;
    case 'create enum':
      draft.addEnum(
        stmt.name.schema ?? DEFAULT_NAMESPACE,
        stmt.name.name,
        stmt.values.map((v) => v.value),
        ctx.loc,
      );
      return;
    case 'create schema':
      draft.ensureNamespace(stmt.name.name);
      return;
    case 'alter table':
      alterTable(draft, stmt, ctx);
      return;
    case 'comment':
      comment(draft, stmt, ctx);
      return;
    default:
      draft.report(
        'warning',
        'unsupported-statement',
        `Ignored ${stmt.type.toUpperCase()} statement`,
        ctx.loc,
      );
  }
}

function tableRef(name: QName): TableRef {
  return { namespace: name.schema ?? null, name: name.name };
}

function requireTable(draft: DraftSchema, name: QName, ctx: StatementContext): DraftTable | null {
  const table = draft.findTable(tableRef(name));
  if (!table) {
    draft.report(
      'error',
      'unresolved-reference',
      `Unknown table "${qualified(name)}"`,
      ctx.at(name),
    );
  }
  return table ?? null;
}

function qualified(name: QName): string {
  return name.schema ? `${name.schema}.${name.name}` : name.name;
}

function createTable(draft: DraftSchema, stmt: CreateTableStatement, ctx: StatementContext): void {
  const table = draft.addTable(stmt.name.schema ?? DEFAULT_NAMESPACE, stmt.name.name, ctx.loc, {
    ifNotExists: stmt.ifNotExists === true,
  });
  if (!table) return;
  if (stmt.inherits?.length) {
    draft.report(
      'warning',
      'unsupported-feature',
      `INHERITS on "${table.name}" is ignored`,
      ctx.loc,
    );
  }
  for (const def of stmt.columns) {
    if (def.kind === 'column') addColumn(draft, table, def, ctx);
    else
      draft.report(
        'warning',
        'unsupported-feature',
        `LIKE in "${table.name}" is ignored`,
        ctx.at(def),
      );
  }
  for (const constraint of stmt.constraints ?? [])
    addTableConstraint(draft, table, constraint, ctx);
}

/** Render a parsed data type back to its native spelling, e.g. `timestamp(3) with time zone`. */
function nativeTypeOf(type: DataTypeDef): string {
  if (type.kind === 'array') return `${nativeTypeOf(type.arrayOf)}[]`;
  const name = type.schema ? `${type.schema}.${type.name}` : type.name;
  if (!type.config?.length) return name;
  const args = `(${type.config.join(',')})`;
  // Precision goes after the first word for `timestamp with time zone` and friends.
  const space = name.indexOf(' ');
  if (space !== -1 && /^(timestamp|time) with/.test(name)) {
    return `${name.slice(0, space)}${args}${name.slice(space)}`;
  }
  return `${name}${args}`;
}

function addColumn(
  draft: DraftSchema,
  table: DraftTable,
  def: CreateColumnDef,
  ctx: StatementContext,
): void {
  const loc = ctx.at(def);
  const name = def.name.name;
  const dataType = def.dataType;
  const serial =
    dataType.kind === 'array' || dataType.schema ? undefined : SERIAL_TYPES[dataType.name];
  const column: DraftColumn = draftColumn(name, serial ?? nativeTypeOf(dataType), loc);
  if (serial) {
    column.autoIncrement = true;
    column.nullable = false;
    column.default = { kind: 'sequence', name: `${table.name}_${name}_seq` };
  }
  table.columns.push(column);
  for (const constraint of def.constraints ?? [])
    applyColumnConstraint(draft, table, column, constraint, ctx);
}

function applyColumnConstraint(
  draft: DraftSchema,
  table: DraftTable,
  column: DraftColumn,
  constraint: ColumnConstraint,
  ctx: StatementContext,
): void {
  const loc = ctx.at(constraint);
  const name = constraint.constraintName?.name ?? null;
  switch (constraint.type) {
    case 'not null':
      column.nullable = false;
      return;
    case 'null':
      column.nullable = true;
      return;
    case 'default':
      setDefault(column, constraint.default, ctx);
      return;
    case 'primary key':
      draft.addPrimaryKey(table, { name, columns: [column.name], loc }, true);
      return;
    case 'unique':
      table.uniques.push({ name, columns: [column.name], loc });
      return;
    case 'check':
      table.checks.push({
        name,
        expression: expressionText(constraint.expr, ctx),
        column: column.name,
        loc,
      });
      return;
    case 'reference':
      table.foreignKeys.push({ name, columns: [column.name], ...reference(constraint), loc });
      return;
    case 'add generated':
      if (constraint.expression) {
        // The node's location spans the whole `AS (expr)` clause.
        column.metadata.generated = expressionText(constraint.expression, ctx)
          .replace(/^AS\s*\(/i, '')
          .replace(/\)$/, '')
          .trim();
      } else {
        column.autoIncrement = true;
        column.nullable = false;
        column.metadata.identity = constraint.always ?? 'always';
      }
      return;
  }
}

function reference(ref: TableReference): {
  ref: TableRef;
  refColumns: string[] | null;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
} {
  const columns = ref.foreignColumns.map((c) => c.name);
  return {
    ref: tableRef(ref.foreignTable),
    refColumns: columns.length === 0 || columns.includes(PK_PLACEHOLDER) ? null : columns,
    onDelete: ref.onDelete ?? 'no action',
    onUpdate: ref.onUpdate ?? 'no action',
  };
}

function addTableConstraint(
  draft: DraftSchema,
  table: DraftTable,
  constraint: TableConstraint,
  ctx: StatementContext,
): void {
  const loc = ctx.at(constraint);
  const name = constraint.constraintName?.name ?? null;
  switch (constraint.type) {
    case 'primary key':
      draft.addPrimaryKey(table, { name, columns: constraint.columns.map((c) => c.name), loc });
      return;
    case 'unique':
      table.uniques.push({ name, columns: constraint.columns.map((c) => c.name), loc });
      return;
    case 'check':
      table.checks.push({ name, expression: expressionText(constraint.expr, ctx), loc });
      return;
    case 'foreign key':
      table.foreignKeys.push({
        name,
        columns: constraint.localColumns.map((c) => c.name),
        ...reference(constraint),
        loc,
      });
      return;
  }
}

/** The expression as written in the source (falls back to an empty string). */
function expressionText(expr: Expr, ctx: StatementContext): string {
  return ctx.slice(expr) ?? '';
}

function setDefault(column: DraftColumn, expr: Expr, ctx: StatementContext): void {
  column.default = toDefault(expr, ctx);
  if (column.default.kind === 'sequence') column.autoIncrement = true;
}

function toDefault(expr: Expr, ctx: StatementContext): ColumnDefault {
  switch (expr.type) {
    case 'integer':
    case 'numeric':
      return { kind: 'literal', value: expr.value };
    case 'string':
      return { kind: 'literal', value: expr.value };
    case 'boolean':
      return { kind: 'literal', value: expr.value };
    case 'null':
      return { kind: 'literal', value: null };
    case 'cast': {
      // pg_dump writes literals as `'draft'::post_status`; the cast adds nothing for a default.
      const operand = expr.operand;
      if (['string', 'integer', 'numeric', 'boolean'].includes(operand.type))
        return toDefault(operand, ctx);
      break;
    }
    case 'call': {
      const [arg] = expr.args;
      if (expr.function.name === 'nextval' && expr.args.length === 1 && arg) {
        const target = arg.type === 'cast' ? arg.operand : arg;
        if (target.type === 'string') return { kind: 'sequence', name: target.value };
      }
      break;
    }
  }
  return { kind: 'expression', sql: expressionText(expr, ctx) };
}

function createIndex(draft: DraftSchema, stmt: CreateIndexStatement, ctx: StatementContext): void {
  const table = requireTable(draft, stmt.table, ctx);
  if (!table) return;
  const columns: DraftTable['indexes'][number]['columns'] = [];
  for (const e of stmt.expressions) {
    if (e.expression.type !== 'ref') {
      draft.report(
        'warning',
        'unsupported-feature',
        `Expression index ${stmt.indexName?.name ?? 'on ' + table.name} is skipped: the IR only indexes columns`,
        ctx.loc,
      );
      return;
    }
    columns.push({ name: e.expression.name, order: e.order ?? 'asc', nulls: e.nulls ?? null });
  }
  table.indexes.push({
    name: stmt.indexName?.name ?? null,
    columns,
    unique: stmt.unique === true,
    method: stmt.using?.name ?? null,
    where: stmt.where ? expressionText(stmt.where, ctx) : null,
    loc: ctx.loc,
  });
}

function alterTable(draft: DraftSchema, stmt: AlterTableStatement, ctx: StatementContext): void {
  const table = requireTable(draft, stmt.table, ctx);
  if (!table) return;
  for (const change of stmt.changes) {
    switch (change.type) {
      case 'add constraint':
        addTableConstraint(draft, table, change.constraint, ctx);
        break;
      case 'add column':
        addColumn(draft, table, change.column, ctx);
        break;
      case 'alter column': {
        const column = table.columns.find((c) => c.name === change.column.name);
        if (!column) {
          draft.report(
            'error',
            'unresolved-reference',
            `Unknown column "${table.name}.${change.column.name}"`,
            ctx.at(change),
          );
          break;
        }
        const alter = change.alter;
        if (alter.type === 'set default') setDefault(column, alter.default, ctx);
        else if (alter.type === 'drop default') column.default = null;
        else if (alter.type === 'set not null') column.nullable = false;
        else if (alter.type === 'drop not null') column.nullable = true;
        else if (alter.type === 'add generated')
          applyColumnConstraint(draft, table, column, alter, ctx);
        else
          draft.report(
            'warning',
            'unsupported-statement',
            `Ignored ALTER COLUMN ${alter.type.toUpperCase()}`,
            ctx.at(change),
          );
        break;
      }
      case 'owner':
        // Ownership does not affect the schema shape.
        break;
      default:
        draft.report(
          'warning',
          'unsupported-statement',
          `Ignored ALTER TABLE ${change.type.toUpperCase()}`,
          ctx.at(change),
        );
    }
  }
}

function comment(draft: DraftSchema, stmt: CommentStatement, ctx: StatementContext): void {
  const on = stmt.on;
  if (on.type === 'table') {
    const table = requireTable(draft, on.name, ctx);
    if (table) table.comment = stmt.comment;
    return;
  }
  if (on.type === 'column') {
    const table = requireTable(draft, { name: on.column.table, schema: on.column.schema }, ctx);
    const column = table?.columns.find((c) => c.name === on.column.column);
    if (column) column.comment = stmt.comment;
    else if (table) {
      draft.report(
        'error',
        'unresolved-reference',
        `Unknown column "${table.name}.${on.column.column}"`,
        ctx.loc,
      );
    }
    return;
  }
  draft.report(
    'warning',
    'unsupported-statement',
    `Ignored COMMENT ON ${on.type.toUpperCase()}`,
    ctx.loc,
  );
}
