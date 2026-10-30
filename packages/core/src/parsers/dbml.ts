import { Parser } from '@dbml/core';
import type { ColumnDefault, IrDialect, ReferentialAction } from '../ir/types';
import { START, checkInputSize, errorMessage, firstLine, normalizeNewlines } from './diagnostics';
import { DraftSchema, draftColumn, emptyResult, finalize, type DraftTable } from './draft';
import type { Diagnostic, ParseOptions, ParseResult, SourceLocation } from './types';

/** DBML's implicit schema. */
const DEFAULT_NAMESPACE = 'public';

// @dbml/core types most model fields as `any`; these describe what we read.
interface Token {
  readonly start: { readonly line: number; readonly column: number };
}
interface DbmlField {
  readonly name: string;
  readonly type: { readonly schemaName: string | null; readonly type_name: string };
  readonly pk?: boolean;
  readonly unique?: boolean;
  readonly not_null?: boolean;
  readonly increment?: boolean;
  readonly note?: string | null;
  readonly dbdefault?: { readonly type: string; readonly value: string | number } | null;
  readonly checks?: readonly DbmlCheck[];
  readonly token: Token;
}
interface DbmlCheck {
  readonly name?: string | null;
  readonly expression: string;
  readonly token: Token;
}
interface DbmlIndex {
  readonly name?: string | null;
  readonly type?: string | null;
  readonly unique?: boolean;
  readonly pk?: boolean;
  readonly columns: readonly { readonly type: string; readonly value: string }[];
  readonly token: Token;
}
interface DbmlTable {
  readonly name: string;
  readonly note?: string | null;
  readonly fields: readonly DbmlField[];
  readonly indexes: readonly DbmlIndex[];
  readonly checks?: readonly DbmlCheck[];
  readonly token: Token;
}
interface DbmlEndpoint {
  readonly schemaName: string | null;
  readonly tableName: string;
  readonly fieldNames: readonly string[];
  readonly relation: '1' | '*';
}
interface DbmlRef {
  readonly name?: string | null;
  readonly onDelete?: string | null;
  readonly onUpdate?: string | null;
  readonly endpoints: readonly [DbmlEndpoint, DbmlEndpoint];
  readonly token: Token;
}
interface DbmlEnum {
  readonly name: string;
  readonly values: readonly { readonly name: string }[];
  readonly token: Token;
}
interface DbmlSchema {
  readonly name: string;
  readonly tables: readonly DbmlTable[];
  readonly enums: readonly DbmlEnum[];
  readonly refs: readonly DbmlRef[];
}
interface DbmlDatabase {
  readonly databaseType?: string | null;
  readonly schemas: readonly DbmlSchema[];
}
interface DbmlDiagnostic {
  readonly message: string;
  readonly location?: { readonly start?: { readonly line?: number; readonly column?: number } };
}

const DATABASE_TYPES: Record<string, IrDialect> = {
  postgresql: 'postgres',
  postgres: 'postgres',
  mysql: 'mysql',
  sqlite: 'sqlite',
};

const ACTIONS = new Set<ReferentialAction>([
  'no action',
  'restrict',
  'cascade',
  'set null',
  'set default',
]);

function at(token: Token | undefined): SourceLocation {
  return token ? { line: token.start.line, column: token.start.column } : START;
}

function compilerDiagnostics(error: unknown): Diagnostic[] {
  const diags = (error as { diags?: readonly DbmlDiagnostic[] }).diags;
  if (!diags?.length) {
    return [
      {
        severity: 'error',
        code: 'syntax-error',
        message: firstLine(errorMessage(error)),
        ...START,
      },
    ];
  }
  return diags.map((d) => ({
    severity: 'error',
    code: 'syntax-error',
    message: d.message,
    line: d.location?.start?.line ?? 1,
    column: d.location?.start?.column ?? 1,
  }));
}

/** Parse DBML (dbdiagram.io) into Schema IR. `Project.database_type` decides the dialect. */
export function parseDBML(input: string, options: ParseOptions = {}): ParseResult {
  const source = normalizeNewlines(input);
  const tooLarge = checkInputSize(source);
  if (tooLarge) return emptyResult('postgres', DEFAULT_NAMESPACE, [tooLarge], options);

  let db: DbmlDatabase;
  try {
    db = new Parser().parse(source, 'dbmlv2') as unknown as DbmlDatabase;
  } catch (error) {
    return emptyResult('postgres', DEFAULT_NAMESPACE, compilerDiagnostics(error), options);
  }

  const databaseType = db.databaseType?.toLowerCase() ?? null;
  const dialect = databaseType ? DATABASE_TYPES[databaseType] : undefined;
  const draft = new DraftSchema(dialect ?? 'postgres', DEFAULT_NAMESPACE);
  if (databaseType && !dialect) {
    draft.report(
      'warning',
      'unsupported-feature',
      `database_type "${db.databaseType ?? ''}" is not supported; assuming PostgreSQL`,
    );
  }

  for (const schema of db.schemas) {
    for (const en of schema.enums)
      draft.addEnum(
        schema.name,
        en.name,
        en.values.map((v) => v.name),
        at(en.token),
      );
  }
  for (const schema of db.schemas) {
    for (const table of schema.tables) addTable(draft, schema.name, table);
  }
  for (const schema of db.schemas) {
    for (const ref of schema.refs) addRef(draft, ref);
  }
  return finalize(draft, options);
}

function toDefault(def: NonNullable<DbmlField['dbdefault']>): ColumnDefault {
  const value = def.value;
  switch (def.type) {
    case 'number':
      return { kind: 'literal', value: Number(value) };
    case 'boolean':
      // DBML reports `null` defaults as the boolean-typed string "null".
      return { kind: 'literal', value: value === 'null' ? null : value === 'true' };
    case 'expression':
      return { kind: 'expression', sql: String(value) };
    default:
      return { kind: 'literal', value: String(value) };
  }
}

function addTable(draft: DraftSchema, namespace: string, source: DbmlTable): void {
  const table = draft.addTable(namespace, source.name, at(source.token));
  if (!table) return;
  table.comment = source.note ?? null;

  for (const field of source.fields) {
    const loc = at(field.token);
    const typeName = field.type.type_name;
    const column = draftColumn(
      field.name,
      field.type.schemaName ? `${field.type.schemaName}.${typeName}` : typeName,
      loc,
      {
        nullable: !field.not_null && !field.pk,
        autoIncrement: field.increment === true,
        comment: field.note ?? null,
        default: field.dbdefault ? toDefault(field.dbdefault) : null,
      },
    );
    // Enum-typed fields reference an enum by (optionally schema-qualified) name.
    const enumNamespace = field.type.schemaName ?? namespace;
    if (draft.enums.some((e) => e.namespace === enumNamespace && e.name === typeName)) {
      column.enumRef = { namespace: enumNamespace, name: typeName };
    }
    table.columns.push(column);
    if (field.pk) draft.addPrimaryKey(table, { name: null, columns: [field.name], loc }, true);
    if (field.unique) table.uniques.push({ name: null, columns: [field.name], loc });
    for (const check of field.checks ?? []) {
      table.checks.push({
        name: check.name ?? null,
        expression: check.expression,
        column: field.name,
        loc: at(check.token),
      });
    }
  }
  for (const check of source.checks ?? []) {
    table.checks.push({
      name: check.name ?? null,
      expression: check.expression,
      loc: at(check.token),
    });
  }
  for (const index of source.indexes) addIndex(draft, table, index);
}

function addIndex(draft: DraftSchema, table: DraftTable, index: DbmlIndex): void {
  const loc = at(index.token);
  if (index.columns.some((c) => c.type !== 'column')) {
    draft.report(
      'warning',
      'unsupported-feature',
      `Expression index ${index.name ? `"${index.name}"` : `on "${table.name}"`} is skipped: the IR only indexes columns`,
      loc,
    );
    return;
  }
  const names = index.columns.map((c) => c.value);
  if (index.pk) {
    draft.addPrimaryKey(table, { name: index.name ?? null, columns: names, loc });
    return;
  }
  table.indexes.push({
    name: index.name ?? null,
    columns: names.map((name) => ({ name, order: 'asc', nulls: null })),
    unique: index.unique === true,
    method: index.type ?? null,
    where: null,
    loc,
  });
}

function action(value: string | null | undefined): ReferentialAction {
  const normalized = value?.toLowerCase() as ReferentialAction | undefined;
  return normalized && ACTIONS.has(normalized) ? normalized : 'no action';
}

function addRef(draft: DraftSchema, ref: DbmlRef): void {
  const loc = at(ref.token);
  const [first, second] = ref.endpoints;
  if (first.relation === '*' && second.relation === '*') {
    draft.report(
      'warning',
      'unsupported-feature',
      'Many-to-many refs (<>) have no foreign key and are skipped',
      loc,
    );
    return;
  }
  // The "many" side holds the foreign key; for one-to-one, the second endpoint does (as with inline refs).
  const [owner, target] = first.relation === '*' ? [first, second] : [second, first];
  const table = draft.findTable({
    namespace: owner.schemaName ?? DEFAULT_NAMESPACE,
    name: owner.tableName,
  });
  if (!table) {
    draft.report(
      'error',
      'unresolved-reference',
      `Ref references unknown table "${owner.tableName}"`,
      loc,
    );
    return;
  }
  table.foreignKeys.push({
    name: ref.name ?? null,
    columns: [...owner.fieldNames],
    ref: { namespace: target.schemaName ?? DEFAULT_NAMESPACE, name: target.tableName },
    refColumns: [...target.fieldNames],
    onDelete: action(ref.onDelete),
    onUpdate: action(ref.onUpdate),
    loc,
  });
}
