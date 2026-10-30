import {
  PrismaParser,
  VisitorClassFactory,
  getSchema,
  type Attribute,
  type AttributeArgument,
  type BlockAttribute,
  type Enum as PrismaEnum,
  type Field,
  type Func,
  type KeyValue,
  type Model,
  type Schema as PrismaSchema,
  type Value,
} from '@mrleebo/prisma-ast';
import type { IrDialect, LogicalType, ReferentialAction } from '../ir/types';
import { START, checkInputSize, errorMessage, firstLine, normalizeNewlines } from './diagnostics';
import {
  DraftSchema,
  draftColumn,
  emptyResult,
  finalize,
  type DraftColumn,
  type DraftTable,
} from './draft';
import { isNumericLiteral } from './literals';
import type { ParseOptions, ParseResult, SourceLocation } from './types';

const parser = new PrismaParser({ nodeLocationTracking: 'full' });
const visitor = new (VisitorClassFactory(parser))();

const DEFAULT_NAMESPACE: Record<IrDialect, string> = {
  postgres: 'public',
  mysql: 'default',
  sqlite: 'main',
};

type Scalar =
  'String' | 'Boolean' | 'Int' | 'BigInt' | 'Float' | 'Decimal' | 'DateTime' | 'Json' | 'Bytes';
const SCALARS = new Set<string>([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
]);

/** Native types Prisma Migrate uses for each scalar when there is no `@db.*` attribute. */
const PRISMA_NATIVE: Record<IrDialect, Record<Scalar, string>> = {
  postgres: {
    String: 'text',
    Boolean: 'boolean',
    Int: 'integer',
    BigInt: 'bigint',
    Float: 'double precision',
    Decimal: 'decimal(65,30)',
    DateTime: 'timestamp(3)',
    Json: 'jsonb',
    Bytes: 'bytea',
  },
  mysql: {
    String: 'varchar(191)',
    Boolean: 'tinyint(1)',
    Int: 'int',
    BigInt: 'bigint',
    Float: 'double',
    Decimal: 'decimal(65,30)',
    DateTime: 'datetime(3)',
    Json: 'json',
    Bytes: 'longblob',
  },
  sqlite: {
    String: 'TEXT',
    Boolean: 'BOOLEAN',
    Int: 'INTEGER',
    BigInt: 'INTEGER',
    Float: 'REAL',
    Decimal: 'DECIMAL',
    DateTime: 'DATETIME',
    Json: 'JSONB',
    Bytes: 'BLOB',
  },
};

/** SQLite types are affinities, so the logical type comes from the Prisma scalar instead. */
const SQLITE_LOGICAL: Record<Scalar, LogicalType> = {
  String: { kind: 'text' },
  Boolean: { kind: 'boolean' },
  Int: { kind: 'int' },
  BigInt: { kind: 'bigint' },
  Float: { kind: 'unknown' },
  Decimal: { kind: 'decimal', precision: 65, scale: 30 },
  DateTime: { kind: 'timestamp', withTimeZone: false },
  Json: { kind: 'json' },
  Bytes: { kind: 'bytes' },
};

/** `@db.*` attribute names whose SQL spelling is not simply the lowercased name. */
const DB_ATTRIBUTE_NATIVE: Record<string, string> = {
  DoublePrecision: 'double precision',
  UnsignedTinyInt: 'tinyint unsigned',
  UnsignedSmallInt: 'smallint unsigned',
  UnsignedMediumInt: 'mediumint unsigned',
  UnsignedInt: 'int unsigned',
  UnsignedBigInt: 'bigint unsigned',
};

const PROVIDERS: Record<string, IrDialect> = {
  postgresql: 'postgres',
  postgres: 'postgres',
  cockroachdb: 'postgres',
  mysql: 'mysql',
  sqlite: 'sqlite',
};

const ACTIONS: Record<string, ReferentialAction> = {
  Cascade: 'cascade',
  Restrict: 'restrict',
  NoAction: 'no action',
  SetNull: 'set null',
  SetDefault: 'set default',
};

interface EnumInfo {
  readonly namespace: string;
  readonly dbName: string;
  /** Prisma value name → database value (`@map`). */
  readonly values: ReadonlyMap<string, string>;
}

interface ModelInfo {
  readonly model: Model;
  readonly table: DraftTable;
  /** Prisma field name → database column name, for scalar fields. */
  readonly columns: Map<string, string>;
  readonly idField: string | null;
}

function loc(node: { location?: { startLine?: number; startColumn?: number } }): SourceLocation {
  const { startLine, startColumn } = node.location ?? {};
  return startLine && startColumn ? { line: startLine, column: startColumn } : START;
}

/** Prisma string values arrive with their quotes. */
function unquote(value: Value | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith('"')) return null;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, -1);
  }
}

function isKeyValue(value: AttributeArgument['value']): value is KeyValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.type === 'keyValue'
  );
}

function isKeyValueLike(value: unknown): value is KeyValue {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'keyValue'
  );
}

function isFunc(value: unknown): value is Func {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'function'
  );
}

/** Named argument `key: value`, or the first positional argument when `key` is null. */
function arg(
  attr: { args?: AttributeArgument[] } | undefined,
  key: string | null,
): Value | undefined {
  for (const a of attr?.args ?? []) {
    if (key === null && !isKeyValue(a.value)) return a.value;
    if (key !== null && isKeyValue(a.value) && a.value.key === key) return a.value.value;
  }
  return undefined;
}

/** Field names in `[a, b(sort: Desc)]` with their sort order. */
function fieldList(value: Value | undefined): { name: string; order: 'asc' | 'desc' }[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value.type !== 'array')
    return [];
  return value.args.flatMap((item) => {
    if (typeof item === 'string') return [{ name: item, order: 'asc' as const }];
    if (isFunc(item)) {
      const sort = (item.params as unknown[] | undefined)?.find(
        (p): p is KeyValue => isKeyValueLike(p) && p.key === 'sort',
      );
      return [
        { name: item.name, order: sort?.value === 'Desc' ? ('desc' as const) : ('asc' as const) },
      ];
    }
    return [];
  });
}

/** Prisma's constraint naming convention, used on every database. */
function prismaName(table: DraftTable, columns: readonly string[], suffix: 'key' | 'idx'): string {
  return `${table.name}_${columns.join('_')}_${suffix}`;
}

function attributes(field: Field): Attribute[] {
  return field.attributes ?? [];
}

function fieldAttr(field: Field, name: string): Attribute | undefined {
  return attributes(field).find((a) => a.name === name && !a.group);
}

function blockAttrs(model: Model): BlockAttribute[] {
  return model.properties.filter((p): p is BlockAttribute => p.type === 'attribute');
}

function fields(model: Model): Field[] {
  return model.properties.filter((p): p is Field => p.type === 'field');
}

/** Doc comments (`///`) directly preceding index `at` in a block list. */
function docComment(list: readonly { type: string; text?: string }[], at: number): string | null {
  const lines: string[] = [];
  for (let i = at - 1; i >= 0; i--) {
    const item = list[i];
    if (item?.type !== 'comment' || !item.text?.startsWith('///')) break;
    lines.unshift(item.text.replace(/^\/\/\/\s?/, ''));
  }
  return lines.length ? lines.join('\n') : null;
}

/** Parse a Prisma schema into Schema IR. The datasource `provider` decides the dialect. */
export function parsePrisma(input: string, options: ParseOptions = {}): ParseResult {
  const source = normalizeNewlines(input);
  const tooLarge = checkInputSize(source);
  if (tooLarge) return emptyResult('postgres', DEFAULT_NAMESPACE.postgres, [tooLarge], options);

  let ast: PrismaSchema;
  try {
    ast = getSchema(source, { parser, visitor });
  } catch (error) {
    const token = (
      error as { token?: { image?: string; startLine?: number; startColumn?: number } }
    ).token;
    const at =
      token?.startLine && token.startColumn
        ? { line: token.startLine, column: token.startColumn }
        : START;
    const message = token?.image
      ? `Syntax error near "${token.image}"`
      : firstLine(errorMessage(error));
    return emptyResult(
      'postgres',
      DEFAULT_NAMESPACE.postgres,
      [{ severity: 'error', code: 'syntax-error', message, ...at }],
      options,
    );
  }

  const datasource = ast.list.find((b) => b.type === 'datasource');
  const providerAssignment = datasource?.assignments.find(
    (a) => a.type === 'assignment' && a.key === 'provider',
  );
  const provider =
    providerAssignment?.type === 'assignment' ? unquote(providerAssignment.value) : null;
  const dialect = provider ? PROVIDERS[provider] : undefined;
  const draft = new DraftSchema(dialect ?? 'postgres', DEFAULT_NAMESPACE[dialect ?? 'postgres']);
  if (!dialect) {
    draft.report(
      'warning',
      'unsupported-feature',
      provider
        ? `Datasource provider "${provider}" is not supported; assuming postgresql`
        : 'No datasource provider found; assuming postgresql',
      datasource ? loc(datasource) : START,
    );
  }
  new PrismaConverter(draft, ast).run();
  return finalize(draft, options);
}

class PrismaConverter {
  private readonly enums = new Map<string, EnumInfo>();
  private readonly models = new Map<string, ModelInfo>();

  constructor(
    private readonly draft: DraftSchema,
    private readonly ast: PrismaSchema,
  ) {}

  run(): void {
    const list = this.ast.list;
    list.forEach((block) => {
      if (block.type === 'enum') this.addEnum(block);
    });
    list.forEach((block, i) => {
      if (block.type === 'model') this.addModel(block, docComment(list, i));
      else if (block.type === 'view' || block.type === 'type') {
        this.draft.report(
          'warning',
          'unsupported-feature',
          `Prisma ${block.type} "${block.name}" is ignored`,
          loc(block),
        );
      }
    });
    for (const info of this.models.values()) this.addRelations(info);
    this.addImplicitManyToMany();
  }

  /** Prisma names Postgres primary keys `{table}_pkey`; MySQL's are always PRIMARY. */
  private pkName(table: DraftTable, attr: { args?: AttributeArgument[] }): string | null {
    const mapped = unquote(arg(attr, 'map'));
    if (mapped) return mapped;
    return this.draft.dialect === 'postgres' ? `${table.name}_pkey` : null;
  }

  private namespaceOf(attrs: readonly BlockAttribute[]): string {
    return (
      unquote(
        arg(
          attrs.find((a) => a.name === 'schema'),
          null,
        ),
      ) ?? this.draft.defaultNamespace
    );
  }

  private addEnum(block: PrismaEnum): void {
    const attrs = block.enumerators.filter((e): e is BlockAttribute => e.type === 'attribute');
    const dbName =
      unquote(
        arg(
          attrs.find((a) => a.name === 'map'),
          null,
        ),
      ) ?? block.name;
    const namespace = this.namespaceOf(attrs);
    const values = new Map<string, string>();
    for (const e of block.enumerators) {
      if (e.type !== 'enumerator') continue;
      const mapped = unquote(
        arg(
          e.attributes?.find((a) => a.name === 'map'),
          null,
        ),
      );
      values.set(e.name, mapped ?? e.name);
    }
    this.enums.set(block.name, { namespace, dbName, values });
    this.draft.addEnum(namespace, dbName, [...values.values()], loc(block));
  }

  private addModel(model: Model, comment: string | null): void {
    const attrs = blockAttrs(model);
    if (attrs.some((a) => a.name === 'ignore')) {
      this.draft.report(
        'info',
        'unsupported-feature',
        `Model "${model.name}" has @@ignore and is skipped`,
        loc(model),
      );
      return;
    }
    const dbName =
      unquote(
        arg(
          attrs.find((a) => a.name === 'map'),
          null,
        ),
      ) ?? model.name;
    const table = this.draft.addTable(this.namespaceOf(attrs), dbName, loc(model));
    if (!table) return;
    table.comment = comment;
    if (dbName !== model.name) table.metadata.prismaName = model.name;

    const columns = new Map<string, string>();
    let idField: string | null = null;
    model.properties.forEach((property, i) => {
      if (property.type !== 'field') return;
      const column = this.addField(table, property, docComment(model.properties, i));
      if (!column) return;
      columns.set(property.name, column.name);
      const id = fieldAttr(property, 'id');
      if (id) {
        idField = property.name;
        this.draft.addPrimaryKey(table, {
          name: this.pkName(table, id),
          columns: [column.name],
          loc: loc(property),
        });
      }
      const unique = fieldAttr(property, 'unique');
      if (unique) {
        table.uniques.push({
          name: unquote(arg(unique, 'map')) ?? prismaName(table, [column.name], 'key'),
          columns: [column.name],
          loc: loc(property),
        });
      }
    });
    this.models.set(model.name, { model, table, columns, idField });

    const toColumns = (value: Value | undefined) =>
      fieldList(value).map((f) => ({ name: columns.get(f.name) ?? f.name, order: f.order }));
    for (const attr of attrs) {
      const at = loc(attr);
      const fieldsArg = arg(attr, 'fields') ?? arg(attr, null);
      switch (attr.name) {
        case 'id':
          this.draft.addPrimaryKey(table, {
            name: this.pkName(table, attr),
            columns: toColumns(fieldsArg).map((c) => c.name),
            loc: at,
          });
          break;
        case 'unique': {
          const cols = toColumns(fieldsArg).map((c) => c.name);
          table.uniques.push({
            name: unquote(arg(attr, 'map')) ?? prismaName(table, cols, 'key'),
            columns: cols,
            loc: at,
          });
          break;
        }
        case 'index':
        case 'fulltext': {
          const type = arg(attr, 'type');
          const cols = toColumns(fieldsArg);
          table.indexes.push({
            name:
              unquote(arg(attr, 'map')) ??
              prismaName(
                table,
                cols.map((c) => c.name),
                'idx',
              ),
            columns: cols.map((c) => ({ ...c, nulls: null })),
            unique: false,
            method:
              attr.name === 'fulltext'
                ? 'fulltext'
                : typeof type === 'string'
                  ? type.toLowerCase()
                  : null,
            where: null,
            loc: at,
          });
          break;
        }
        case 'map':
        case 'schema':
          break;
        default:
          this.draft.report(
            'warning',
            'unsupported-feature',
            `@@${attr.name} on "${model.name}" is ignored`,
            at,
          );
      }
    }
  }

  /** Add a scalar or enum field as a column; relation fields return null (handled later). */
  private addField(table: DraftTable, field: Field, comment: string | null): DraftColumn | null {
    const at = loc(field);
    if (fieldAttr(field, 'ignore')) {
      this.draft.report(
        'info',
        'unsupported-feature',
        `Field "${field.name}" has @ignore and is skipped`,
        at,
      );
      return null;
    }
    const dialect = this.draft.dialect;
    const name = unquote(arg(fieldAttr(field, 'map'), null)) ?? field.name;
    const column = draftColumn(name, '', at, { nullable: field.optional === true, comment });
    if (name !== field.name) column.metadata.prismaName = field.name;

    const type = field.fieldType;
    if (isFunc(type)) {
      // Unsupported("geometry(Point, 4326)")
      column.nativeType = unquote(type.params?.[0]) ?? type.name;
    } else if (SCALARS.has(type)) {
      const scalar = type as Scalar;
      column.nativeType = this.dbAttributeNative(field) ?? PRISMA_NATIVE[dialect][scalar];
      if (dialect === 'sqlite') column.logicalType = SQLITE_LOGICAL[scalar];
    } else if (this.enums.has(type)) {
      const info = this.enums.get(type) as EnumInfo;
      column.enumRef = { namespace: info.namespace, name: info.dbName };
      column.nativeType =
        dialect === 'mysql'
          ? `enum(${[...info.values.values()].map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`
          : dialect === 'sqlite'
            ? 'TEXT'
            : info.dbName;
    } else if (this.ast.list.some((b) => b.type === 'model' && b.name === type)) {
      return null; // relation field
    } else {
      this.draft.report(
        'error',
        'unresolved-reference',
        `Field "${field.name}" has unknown type "${type}"`,
        at,
      );
      return null;
    }
    if (field.array) {
      column.nativeType = `${column.nativeType}[]`;
      column.logicalType = { kind: 'unknown' };
      column.nullable = false;
    }

    if (fieldAttr(field, 'updatedAt')) column.metadata.prismaUpdatedAt = 'true';
    const def = fieldAttr(field, 'default');
    if (def) this.applyDefault(table, column, field, arg(def, null));
    table.columns.push(column);
    return column;
  }

  private dbAttributeNative(field: Field): string | null {
    const attr = attributes(field).find((a) => a.group === 'db');
    if (!attr) return null;
    const base = DB_ATTRIBUTE_NATIVE[attr.name] ?? attr.name.toLowerCase();
    const args = (attr.args ?? []).map((a) => String(a.value as string | number));
    return args.length ? `${base}(${args.join(',')})` : base;
  }

  private applyDefault(
    table: DraftTable,
    column: DraftColumn,
    field: Field,
    value: Value | undefined,
  ): void {
    if (isFunc(value)) {
      switch (value.name) {
        case 'autoincrement':
          column.autoIncrement = true;
          if (this.draft.dialect === 'postgres') {
            column.default = { kind: 'sequence', name: `${table.name}_${column.name}_seq` };
          }
          return;
        case 'now':
          column.default = { kind: 'expression', sql: 'CURRENT_TIMESTAMP' };
          return;
        case 'dbgenerated': {
          const sql = unquote(value.params?.[0]);
          if (sql) {
            column.default = { kind: 'expression', sql };
            return;
          }
          break;
        }
      }
      // uuid(), cuid(), nanoid(), ulid(): generated by Prisma Client, not the database.
      const params = (value.params ?? []).map((p) => String(p as string | number)).join(', ');
      column.metadata.prismaDefault = `${value.name}(${params})`;
      return;
    }
    if (typeof value !== 'string') {
      column.metadata.prismaDefault = JSON.stringify(value);
      return;
    }
    const text = unquote(value);
    if (text !== null) column.default = { kind: 'literal', value: text };
    else if (value === 'true' || value === 'false')
      column.default = { kind: 'literal', value: value === 'true' };
    else if (isNumericLiteral(value)) column.default = { kind: 'literal', value: Number(value) };
    else {
      // An enum value: store the database spelling.
      const type =
        typeof field.fieldType === 'string' ? this.enums.get(field.fieldType) : undefined;
      column.default = { kind: 'literal', value: type?.values.get(value) ?? value };
    }
  }

  private addRelations(info: ModelInfo): void {
    for (const field of fields(info.model)) {
      const relation = fieldAttr(field, 'relation');
      const fkFields = fieldList(arg(relation, 'fields')).map((f) => f.name);
      if (!relation || fkFields.length === 0 || typeof field.fieldType !== 'string') continue;
      const at = loc(field);
      const target = this.models.get(field.fieldType);
      if (!target) {
        this.draft.report(
          'error',
          'unresolved-reference',
          `Relation "${field.name}" targets unknown model "${field.fieldType}"`,
          at,
        );
        continue;
      }
      const references = fieldList(arg(relation, 'references')).map(
        (f) => target.columns.get(f.name) ?? f.name,
      );
      const columns = fkFields.map((f) => info.columns.get(f) ?? f);
      // Prisma's defaults: optional relations SET NULL on delete, required ones RESTRICT.
      const optional = fkFields.some((f) => fields(info.model).find((x) => x.name === f)?.optional);
      const onDelete = arg(relation, 'onDelete');
      const onUpdate = arg(relation, 'onUpdate');
      info.table.foreignKeys.push({
        name: unquote(arg(relation, 'map')) ?? `${info.table.name}_${columns.join('_')}_fkey`,
        columns,
        ref: { namespace: target.table.namespace, name: target.table.name },
        refColumns: references,
        onDelete:
          (typeof onDelete === 'string' && ACTIONS[onDelete]) ||
          (optional ? 'set null' : 'restrict'),
        onUpdate: (typeof onUpdate === 'string' && ACTIONS[onUpdate]) || 'cascade',
        loc: at,
      });
    }
  }

  private relationName(field: Field): string | null {
    const relation = fieldAttr(field, 'relation');
    return unquote(arg(relation, null)) ?? unquote(arg(relation, 'name'));
  }

  /** Implicit m-n relations get a `_AToB` join table, exactly as Prisma Migrate creates it. */
  private addImplicitManyToMany(): void {
    const seen = new Set<string>();
    for (const [modelName, info] of this.models) {
      for (const field of fields(info.model)) {
        if (!field.array || typeof field.fieldType !== 'string') continue;
        const other = this.models.get(field.fieldType);
        if (!other) continue;
        const name = this.relationName(field);
        const back = fields(other.model).find(
          (f) =>
            f !== field &&
            f.array === true &&
            f.fieldType === modelName &&
            this.relationName(f) === name,
        );
        if (!back) continue;
        const [a, b] = [modelName, field.fieldType].sort() as [string, string];
        const tableName = `_${name ?? `${a}To${b}`}`;
        if (seen.has(tableName)) continue;
        seen.add(tableName);
        this.addJoinTable(
          tableName,
          this.models.get(a) as ModelInfo,
          this.models.get(b) as ModelInfo,
          loc(field),
        );
      }
    }
  }

  private addJoinTable(name: string, a: ModelInfo, b: ModelInfo, at: SourceLocation): void {
    const table = this.draft.addTable(a.table.namespace, name, at);
    if (!table) return;
    table.metadata.prismaImplicitManyToMany = 'true';
    for (const [column, side] of [
      ['A', a],
      ['B', b],
    ] as const) {
      const idColumn = side.idField ? side.columns.get(side.idField) : undefined;
      const source = side.table.columns.find((c) => c.name === idColumn);
      if (!source) {
        this.draft.report(
          'error',
          'unresolved-reference',
          `Implicit many-to-many "${name}" needs a single @id on "${side.model.name}"`,
          at,
        );
        return;
      }
      table.columns.push(
        draftColumn(column, source.nativeType, at, {
          nullable: false,
          logicalType: source.logicalType,
          enumRef: source.enumRef,
        }),
      );
      table.foreignKeys.push({
        name: `${name}_${column}_fkey`,
        columns: [column],
        ref: { namespace: side.table.namespace, name: side.table.name },
        refColumns: [source.name],
        onDelete: 'cascade',
        onUpdate: 'cascade',
        loc: at,
      });
    }
    // Prisma 6 gives Postgres join tables a primary key; other databases get a unique index.
    if (this.draft.dialect === 'postgres') {
      table.primaryKey = { name: `${name}_AB_pkey`, columns: ['A', 'B'], loc: at };
    } else {
      table.indexes.push({
        name: `${name}_AB_unique`,
        columns: [
          { name: 'A', order: 'asc', nulls: null },
          { name: 'B', order: 'asc', nulls: null },
        ],
        unique: true,
        method: null,
        where: null,
        loc: at,
      });
    }
    table.indexes.push({
      name: `${name}_B_index`,
      columns: [{ name: 'B', order: 'asc', nulls: null }],
      unique: false,
      method: null,
      where: null,
      loc: at,
    });
  }
}
