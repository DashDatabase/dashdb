import { DB_ATTRIBUTE_NATIVE, PRISMA_NATIVE, type PrismaScalar } from '../parsers/prisma';
import type {
  Column,
  ColumnDefault,
  Enum,
  ForeignKey,
  Id,
  IrDialect,
  ReferentialAction,
  Schema,
  Table,
} from '../ir/types';
import { fromNativeType } from '../ir/types-map';
import { SchemaModel } from './model';
import { NameScope, camelCase, fieldName, modelName, pascalCase, plural } from './naming';
import type { SerializeResult } from './types';

const PROVIDER: Record<IrDialect, string> = {
  postgres: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
};

const ACTION: Record<ReferentialAction, string> = {
  'no action': 'NoAction',
  restrict: 'Restrict',
  cascade: 'Cascade',
  'set null': 'SetNull',
  'set default': 'SetDefault',
};

const INDEX_TYPE: Record<string, string> = {
  btree: 'BTree',
  hash: 'Hash',
  gin: 'Gin',
  gist: 'Gist',
  spgist: 'SpGist',
  brin: 'Brin',
};

const IGNORED_DOC =
  'The underlying table does not contain a valid unique identifier and can therefore currently not be handled by Prisma Client.';

/** Native type base → Prisma scalar and `@db.*` attribute name, per dialect. */
const NATIVE_TO_PRISMA: Record<'postgres' | 'mysql', Record<string, [PrismaScalar, string]>> = {
  postgres: {
    text: ['String', 'Text'],
    varchar: ['String', 'VarChar'],
    'character varying': ['String', 'VarChar'],
    char: ['String', 'Char'],
    character: ['String', 'Char'],
    bpchar: ['String', 'Char'],
    uuid: ['String', 'Uuid'],
    citext: ['String', 'Citext'],
    inet: ['String', 'Inet'],
    xml: ['String', 'Xml'],
    bit: ['String', 'Bit'],
    varbit: ['String', 'VarBit'],
    integer: ['Int', 'Integer'],
    int: ['Int', 'Integer'],
    int4: ['Int', 'Integer'],
    smallint: ['Int', 'SmallInt'],
    int2: ['Int', 'SmallInt'],
    oid: ['Int', 'Oid'],
    bigint: ['BigInt', 'BigInt'],
    int8: ['BigInt', 'BigInt'],
    'double precision': ['Float', 'DoublePrecision'],
    float8: ['Float', 'DoublePrecision'],
    real: ['Float', 'Real'],
    float4: ['Float', 'Real'],
    decimal: ['Decimal', 'Decimal'],
    numeric: ['Decimal', 'Decimal'],
    money: ['Decimal', 'Money'],
    boolean: ['Boolean', 'Boolean'],
    bool: ['Boolean', 'Boolean'],
    timestamp: ['DateTime', 'Timestamp'],
    'timestamp without time zone': ['DateTime', 'Timestamp'],
    timestamptz: ['DateTime', 'Timestamptz'],
    'timestamp with time zone': ['DateTime', 'Timestamptz'],
    date: ['DateTime', 'Date'],
    time: ['DateTime', 'Time'],
    'time without time zone': ['DateTime', 'Time'],
    timetz: ['DateTime', 'Timetz'],
    'time with time zone': ['DateTime', 'Timetz'],
    json: ['Json', 'Json'],
    jsonb: ['Json', 'JsonB'],
    bytea: ['Bytes', 'ByteA'],
  },
  mysql: {
    varchar: ['String', 'VarChar'],
    char: ['String', 'Char'],
    tinytext: ['String', 'TinyText'],
    text: ['String', 'Text'],
    mediumtext: ['String', 'MediumText'],
    longtext: ['String', 'LongText'],
    int: ['Int', 'Int'],
    integer: ['Int', 'Int'],
    tinyint: ['Int', 'TinyInt'],
    smallint: ['Int', 'SmallInt'],
    mediumint: ['Int', 'MediumInt'],
    'int unsigned': ['Int', 'UnsignedInt'],
    'integer unsigned': ['Int', 'UnsignedInt'],
    'tinyint unsigned': ['Int', 'UnsignedTinyInt'],
    'smallint unsigned': ['Int', 'UnsignedSmallInt'],
    'mediumint unsigned': ['Int', 'UnsignedMediumInt'],
    year: ['Int', 'Year'],
    bigint: ['BigInt', 'BigInt'],
    'bigint unsigned': ['BigInt', 'UnsignedBigInt'],
    decimal: ['Decimal', 'Decimal'],
    numeric: ['Decimal', 'Decimal'],
    double: ['Float', 'Double'],
    float: ['Float', 'Float'],
    datetime: ['DateTime', 'DateTime'],
    timestamp: ['DateTime', 'Timestamp'],
    date: ['DateTime', 'Date'],
    time: ['DateTime', 'Time'],
    json: ['Json', 'Json'],
    blob: ['Bytes', 'Blob'],
    tinyblob: ['Bytes', 'TinyBlob'],
    mediumblob: ['Bytes', 'MediumBlob'],
    longblob: ['Bytes', 'LongBlob'],
    binary: ['Bytes', 'Binary'],
    varbinary: ['Bytes', 'VarBinary'],
    bit: ['Bytes', 'Bit'],
  },
};

const SCALAR_FOR_LOGICAL: Record<string, PrismaScalar> = {
  int: 'Int',
  bigint: 'BigInt',
  decimal: 'Decimal',
  text: 'String',
  varchar: 'String',
  uuid: 'String',
  boolean: 'Boolean',
  json: 'Json',
  timestamp: 'DateTime',
  date: 'DateTime',
  bytes: 'Bytes',
};

interface FieldType {
  /** `String`, `Role`, `Unsupported("point")`. */
  readonly type: string;
  readonly scalar: PrismaScalar | 'enum' | 'unsupported';
  readonly list: boolean;
  readonly dbAttribute: string | null;
}

interface FieldLine {
  readonly docs: string[];
  readonly name: string;
  readonly type: string;
  readonly attributes: string[];
}

interface ModelInfo {
  readonly table: Table;
  readonly name: string;
  readonly fields: Map<Id, string>;
  readonly scope: NameScope;
  readonly ignored: boolean;
  readonly lines: FieldLine[];
  readonly relationLines: FieldLine[];
  /** Columns whose Prisma type has a default operator class for GIN (lists and Json). */
  readonly defaultOpsColumns: Set<Id>;
}

/** Index types that need an operator class. */
const OPCLASS_INDEXES = new Set(['gin', 'gist', 'spgist']);

/** Split `varchar(255)` / `bigint(20) unsigned` into a base (`bigint unsigned`) and its arguments. */
function splitNative(native: string): { base: string; args: string[] } {
  const open = native.indexOf('(');
  const close = native.lastIndexOf(')');
  if (open === -1 || close < open) return { base: native.trim().toLowerCase(), args: [] };
  const base = `${native.slice(0, open)} ${native.slice(close + 1)}`
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(' ');
  const args = native
    .slice(open + 1, close)
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  return { base, args };
}

const quote = (s: string) => JSON.stringify(s);
const isIdentifier = (s: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s);

/**
 * Render the schema as a Prisma schema: datasource, enums, and one model per table with both
 * sides of every relation. Names become idiomatic (`order_items` → `OrderItem`) with
 * `@@map`/`@map` back to the database names; things Prisma cannot express become warnings.
 */
export function toPrisma(schema: Schema): SerializeResult {
  return new PrismaWriter(schema).write();
}

class PrismaWriter {
  private readonly model: SchemaModel;
  private readonly dialect: IrDialect;
  private readonly topScope = new NameScope();
  private readonly enumNames = new Map<Id, string>();
  /** Enum id → database value → Prisma value identifier. */
  private readonly enumValues = new Map<Id, Map<string, string>>();
  private readonly models = new Map<Id, ModelInfo>();
  private readonly multiSchema: boolean;

  constructor(private readonly schema: Schema) {
    this.model = new SchemaModel(schema);
    this.dialect = schema.dialect;
    const names = schema.namespaces.map((n) => n.name);
    this.multiSchema = this.dialect === 'postgres' && names.some((n) => n !== 'public');
    if (this.dialect === 'mysql' && names.some((n) => n !== 'default') && names.length > 1) {
      this.model.warn(
        'unsupported-feature',
        '',
        'Prisma cannot place MySQL tables in several databases; namespaces dropped',
      );
    }
  }

  write(): SerializeResult {
    const enums = this.model.sortedEnums();
    for (const en of enums) this.nameEnum(en);
    const tables = this.model.sortedTables();
    const joinTables = tables.filter((t) => this.isImplicitJoinTable(t));
    const modelTables = tables.filter((t) => !joinTables.includes(t));
    for (const table of modelTables) this.nameModel(table);
    for (const info of this.models.values()) this.addScalarFields(info);
    for (const info of this.models.values()) this.addRelations(info);
    for (const table of joinTables) this.addImplicitManyToMany(table);

    const blocks = [
      this.header(),
      ...enums.map((e) => this.enumBlock(e)),
      ...modelTables.map((t) => this.modelBlock(t)),
    ];
    return { code: `${blocks.join('\n\n')}\n`, warnings: this.model.warnings };
  }

  // -------------------------------------------------------------------------------------------
  // Naming
  // -------------------------------------------------------------------------------------------

  private nameEnum(en: Enum): void {
    const preferred = /^[A-Z][A-Za-z0-9]*$/.test(en.name) ? en.name : pascalCase(en.name) || 'Enum';
    this.enumNames.set(
      en.id,
      this.topScope.claim(/^\d/.test(preferred) ? `E${preferred}` : preferred),
    );
    const scope = new NameScope();
    const values = new Map<string, string>();
    for (const value of en.values) {
      const sanitized = value.replace(/[^A-Za-z0-9_]/g, '_');
      const preferredValue = isIdentifier(value)
        ? value
        : /^[A-Za-z]/.test(sanitized)
          ? sanitized
          : `v${sanitized}`;
      values.set(value, scope.claim(preferredValue));
    }
    this.enumValues.set(en.id, values);
  }

  private nameModel(table: Table): void {
    let preferred = table.metadata.prismaName ?? modelName(table.name);
    if (/^\d/.test(preferred)) preferred = `M${preferred}`;
    if (this.topScope.has(preferred) && this.multiSchema) {
      // Same table name in two schemas: prefix the schema.
      preferred = `${pascalCase(this.model.namespaceName(table.namespace))}${preferred}`;
    }
    const name = this.topScope.claim(preferred);
    const hasKey =
      table.primaryKey !== null || table.uniques.length > 0 || table.indexes.some((i) => i.unique);
    if (!hasKey) {
      this.model.warn(
        'unsupported-feature',
        this.model.qualified(table),
        'No primary key or unique constraint; model is @@ignore-d',
      );
    }
    this.models.set(table.id, {
      table,
      name,
      fields: new Map(),
      scope: new NameScope(),
      ignored: !hasKey,
      lines: [],
      relationLines: [],
      defaultOpsColumns: new Set(),
    });
  }

  // -------------------------------------------------------------------------------------------
  // Fields
  // -------------------------------------------------------------------------------------------

  private addScalarFields(info: ModelInfo): void {
    const table = info.table;
    for (const column of table.columns) {
      let preferred = column.metadata.prismaName ?? fieldName(column.name);
      if (/^\d/.test(preferred)) preferred = `f${preferred}`;
      info.fields.set(column.id, info.scope.claim(preferred));
    }
    const pk = table.primaryKey;
    for (const column of table.columns) {
      const element = `${this.model.qualified(table)}.${column.name}`;
      const name = info.fields.get(column.id) ?? column.name;
      const fieldType = this.fieldType(column, element);
      const attributes: string[] = [];
      if (pk?.columns.length === 1 && pk.columns[0] === column.id) {
        attributes.push(`@id${this.mapArg(pk.name, this.defaultPkName(table))}`);
      }
      const def = this.defaultAttribute(table, column, fieldType, element);
      if (def) attributes.push(def);
      const unique = table.uniques.find(
        (u) => u.columns.length === 1 && u.columns[0] === column.id,
      );
      if (unique && !(pk?.columns.length === 1 && pk.columns[0] === column.id)) {
        attributes.push(`@unique${this.mapArg(unique.name, `${table.name}_${column.name}_key`)}`);
      }
      if (column.metadata.prismaUpdatedAt) attributes.push('@updatedAt');
      if (name !== column.name) attributes.push(`@map(${quote(column.name)})`);
      if (fieldType.dbAttribute) attributes.push(fieldType.dbAttribute);
      for (const key of ['generated', 'onUpdate'] as const) {
        if (column.metadata[key])
          this.model.warn(
            'unsupported-feature',
            element,
            `Prisma cannot express "${key}"; dropped`,
          );
      }

      if (fieldType.list || fieldType.scalar === 'Json') info.defaultOpsColumns.add(column.id);
      const nullable = column.nullable && !fieldType.list;
      if (column.nullable && fieldType.list) {
        this.model.warn(
          'lossy-type',
          element,
          'Prisma lists cannot be optional; written as required',
        );
      }
      info.lines.push({
        docs: column.comment === null ? [] : column.comment.split('\n'),
        name,
        type: `${fieldType.type}${fieldType.list ? '[]' : nullable ? '?' : ''}`,
        attributes,
      });
    }
  }

  private fieldType(column: Column, element: string): FieldType {
    const logical = column.logicalType;
    if (logical.kind === 'enum') {
      return {
        type: this.enumNames.get(logical.enumId) ?? 'String',
        scalar: 'enum',
        list: false,
        dbAttribute: null,
      };
    }
    if (this.dialect === 'sqlite') {
      const scalar =
        SCALAR_FOR_LOGICAL[logical.kind] ??
        (/^(real|float|double)/i.test(column.nativeType) ? 'Float' : undefined);
      return scalar
        ? { type: scalar, scalar, list: false, dbAttribute: null }
        : {
            type: `Unsupported(${quote(column.nativeType)})`,
            scalar: 'unsupported',
            list: false,
            dbAttribute: null,
          };
    }
    const dialect = this.dialect;
    let native = column.nativeType;
    let list = false;
    if (dialect === 'postgres' && native.endsWith('[]')) {
      native = native.slice(0, -2);
      list = true;
    }
    const { base, args } = splitNative(native);
    const mapped = NATIVE_TO_PRISMA[dialect][base];
    if (!mapped) {
      return {
        type: `Unsupported(${quote(column.nativeType)})`,
        scalar: 'unsupported',
        list: false,
        dbAttribute: null,
      };
    }
    const attribute = mapped[1];
    let scalar = mapped[0];
    if (dialect === 'mysql' && base === 'tinyint' && args[0] === '1') scalar = 'Boolean';
    if (native === PRISMA_NATIVE[dialect][scalar])
      return { type: scalar, scalar, list, dbAttribute: null };
    // Aliases of the scalar's default type (`int` for `integer`) need no attribute either.
    const fallback = splitNative(PRISMA_NATIVE[dialect][scalar]);
    if (
      NATIVE_TO_PRISMA[dialect][fallback.base]?.[1] === attribute &&
      args.join(',') === fallback.args.join(',')
    ) {
      return { type: scalar, scalar, list, dbAttribute: null };
    }

    // Prisma spells the attribute's SQL as its lowercased name (or a known exception).
    const sqlName = DB_ATTRIBUTE_NATIVE[attribute] ?? attribute.toLowerCase();
    const attrArgs = this.attributeArgs(attribute, args);
    const rendered = `${sqlName}${attrArgs.length ? `(${attrArgs.join(',')})` : ''}`;
    // A different spelling of the same type (`numeric(12,2)` → `@db.Decimal(12, 2)`) loses nothing.
    // Both sides come from fromNativeType, so their JSON is a faithful equality check.
    const same =
      JSON.stringify(fromNativeType(dialect, rendered, { enums: [] })) ===
      JSON.stringify(fromNativeType(dialect, native, { enums: [] }));
    if (rendered !== native && !same) {
      this.model.warn('lossy-type', element, `"${native}" is written as @db.${attribute}`);
    }
    return {
      type: scalar,
      scalar,
      list,
      dbAttribute: `@db.${attribute}${attrArgs.length ? `(${attrArgs.join(', ')})` : ''}`,
    };
  }

  /** Only some attributes take arguments; MySQL display widths (`int(11)`) are dropped. */
  private attributeArgs(attribute: string, args: string[]): string[] {
    const takesArgs =
      /^(VarChar|Char|Bit|VarBit|Decimal|Timestamp|Timestamptz|Time|Timetz|DateTime|Binary|VarBinary)$/;
    return takesArgs.test(attribute) ? args : [];
  }

  private defaultPkName(table: Table): string | null {
    return this.dialect === 'postgres' ? `${table.name}_pkey` : null;
  }

  /** `(map: "x")` unless `name` is what Prisma would generate anyway. */
  private mapArg(name: string | null, conventional: string | null): string {
    return name === null || name === conventional ? '' : `(map: ${quote(name)})`;
  }

  private defaultAttribute(
    table: Table,
    column: Column,
    type: FieldType,
    element: string,
  ): string | null {
    const raw = column.metadata.prismaDefault;
    if (raw) return `@default(${raw})`;
    const def = column.default;
    if (column.autoIncrement) {
      const conventional = `${table.name}_${column.name}_seq`;
      if (def === null || (def.kind === 'sequence' && def.name === conventional))
        return '@default(autoincrement())';
    }
    if (!def) return null;
    // `DEFAULT NULL` on a nullable column is what Prisma does anyway: no attribute needed.
    if (def.kind === 'literal' && def.value === null && column.nullable) return null;
    if (type.list) {
      // Postgres spells an empty array '{}'; Prisma lists take list literals.
      if (def.kind === 'literal' && def.value === '{}') return '@default([])';
      this.model.warn(
        'lossy-type',
        element,
        'Only empty-list defaults are written for Prisma lists; dropped',
      );
      return null;
    }
    return `@default(${this.defaultValue(column, def, type, element)})`;
  }

  private defaultValue(
    column: Column,
    def: ColumnDefault,
    type: FieldType,
    element: string,
  ): string {
    const generated = (sql: string) => `dbgenerated(${quote(sql)})`;
    switch (def.kind) {
      case 'sequence':
        return generated(`nextval('${def.name.replace(/'/g, "''")}'::regclass)`);
      case 'expression':
        return /^(current_timestamp|now\(\))$/i.test(def.sql.trim()) ? 'now()' : generated(def.sql);
      case 'literal': {
        const value = def.value;
        if (value === null) {
          // Prisma has no NULL default; a nullable column without a default behaves the same.
          return generated('NULL');
        }
        if (
          type.scalar === 'enum' &&
          typeof value === 'string' &&
          column.logicalType.kind === 'enum'
        ) {
          const id = this.enumValues.get(column.logicalType.enumId)?.get(value);
          if (id) return id;
        }
        if ((type.scalar === 'String' || type.scalar === 'Json') && typeof value === 'string')
          return quote(value);
        if (
          ['Int', 'BigInt', 'Float', 'Decimal'].includes(type.scalar) &&
          typeof value === 'number'
        )
          return String(value);
        if (type.scalar === 'Boolean' && typeof value === 'boolean') return String(value);
        if (type.scalar === 'Boolean' && (value === 0 || value === 1)) return String(value === 1);
        if (
          type.scalar === 'DateTime' &&
          typeof value === 'string' &&
          !Number.isNaN(Date.parse(value))
        ) {
          return quote(new Date(value).toISOString());
        }
        this.model.warn(
          'lossy-type',
          element,
          `Default ${JSON.stringify(value)} does not fit ${type.type}; written as dbgenerated()`,
        );
        return generated(
          typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value),
        );
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Relations
  // -------------------------------------------------------------------------------------------

  /** Number of relations (FKs + implicit m-n) between each unordered pair of tables. */
  private pairCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    const bump = (a: Id, b: Id) => {
      const key = [a, b].sort().join('|');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (const table of this.schema.tables) {
      if (this.isImplicitJoinTable(table)) {
        const [a, b] = table.foreignKeys;
        if (a && b) bump(a.refTable, b.refTable);
      } else {
        for (const fk of table.foreignKeys) bump(table.id, fk.refTable);
      }
    }
    return counts;
  }

  private needsRelationName(a: Id, b: Id): boolean {
    return a === b || (this.pairCounts().get([a, b].sort().join('|')) ?? 0) > 1;
  }

  private columnSetsOf(table: Table): Id[][] {
    return [
      ...(table.primaryKey ? [table.primaryKey.columns] : []),
      ...table.uniques.map((u) => u.columns),
      ...table.indexes.filter((i) => i.unique).map((i) => i.columns.map((c) => c.column)),
    ].map((cols) => [...cols]);
  }

  private isKey(table: Table, columns: readonly Id[]): boolean {
    const wanted = [...columns].sort().join('|');
    return this.columnSetsOf(table).some((set) => set.sort().join('|') === wanted);
  }

  private addRelations(owner: ModelInfo): void {
    for (const fk of owner.table.foreignKeys) {
      const target = this.models.get(fk.refTable);
      const element = `${this.model.qualified(owner.table)}.${fk.name}`;
      if (!target) {
        this.model.warn(
          'unsupported-feature',
          element,
          'Foreign key to a table that is not a model; dropped',
        );
        continue;
      }
      if (!this.isKey(target.table, fk.refColumns)) {
        this.model.warn(
          'unsupported-feature',
          element,
          'Prisma relations must reference a unique key; foreign key dropped',
        );
        continue;
      }
      this.addRelation(owner, target, fk);
    }
  }

  private addRelation(owner: ModelInfo, target: ModelInfo, fk: ForeignKey): void {
    const fieldNames = fk.columns.map((id) => owner.fields.get(id) ?? '');
    const refNames = fk.refColumns.map((id) => target.fields.get(id) ?? '');
    const [only] = fieldNames;
    const stripped = fk.columns.length === 1 && only ? only.replace(/_?[iI]d$/, '') : '';
    const forward = owner.scope.claim(
      stripped && stripped !== only ? stripped : camelCase(target.name),
    );
    const optional = fk.columns.some((id) => this.model.column(id).nullable);
    const oneToOne = this.isKey(owner.table, fk.columns);
    const backPreferred = oneToOne ? camelCase(owner.name) : plural(camelCase(owner.name));
    const relationName = this.needsRelationName(owner.table.id, target.table.id)
      ? `${owner.name}${pascalCase(forward)}`
      : null;
    // With several relations between the same models, say which one: `transfersFrom`, `transfersTo`.
    const back = target.scope.claim(
      relationName ? `${backPreferred}${pascalCase(forward)}` : backPreferred,
    );

    const args = [
      ...(relationName ? [quote(relationName)] : []),
      `fields: [${fieldNames.join(', ')}]`,
      `references: [${refNames.join(', ')}]`,
    ];
    // Prisma's defaults: optional relations SET NULL on delete, required ones RESTRICT; updates CASCADE.
    if (fk.onDelete !== (optional ? 'set null' : 'restrict'))
      args.push(`onDelete: ${ACTION[fk.onDelete]}`);
    if (fk.onUpdate !== 'cascade') args.push(`onUpdate: ${ACTION[fk.onUpdate]}`);
    const conventional = `${owner.table.name}_${fk.columns.map((id) => this.model.columnName(id)).join('_')}_fkey`;
    if (fk.name !== conventional) args.push(`map: ${quote(fk.name)}`);

    const ignoreFlag = (other: ModelInfo) => (other.ignored ? ['@ignore'] : []);
    owner.relationLines.push({
      docs: [],
      name: forward,
      type: `${target.name}${optional ? '?' : ''}`,
      attributes: [`@relation(${args.join(', ')})`, ...ignoreFlag(target)],
    });
    target.relationLines.push({
      docs: [],
      name: back,
      type: oneToOne ? `${owner.name}?` : `${owner.name}[]`,
      attributes: [
        ...(relationName ? [`@relation(${quote(relationName)})`] : []),
        ...ignoreFlag(owner),
      ],
    });
  }

  /** A `_AToB` table Prisma created for an implicit many-to-many relation. */
  private isImplicitJoinTable(table: Table): boolean {
    if (table.metadata.prismaImplicitManyToMany !== 'true') return false;
    const names = table.columns.map((c) => c.name).join(',');
    return names === 'A,B' && table.foreignKeys.length === 2;
  }

  private addImplicitManyToMany(table: Table): void {
    const [fkA, fkB] = table.foreignKeys;
    const a = fkA && this.models.get(fkA.refTable);
    const b = fkB && this.models.get(fkB.refTable);
    if (!a || !b) {
      this.model.warn(
        'unsupported-feature',
        this.model.qualified(table),
        'Implicit many-to-many between unknown models; dropped',
      );
      return;
    }
    const defaultName = `_${a.name}To${b.name}`;
    const relationName =
      table.name !== defaultName || this.needsRelationName(a.table.id, b.table.id)
        ? table.name.replace(/^_/, '')
        : null;
    const attrs = relationName ? [`@relation(${quote(relationName)})`] : [];
    const onA = a.scope.claim(plural(camelCase(b.name)));
    const onB = b.scope.claim(
      a === b ? `${plural(camelCase(a.name))}Related` : plural(camelCase(a.name)),
    );
    a.relationLines.push({ docs: [], name: onA, type: `${b.name}[]`, attributes: attrs });
    b.relationLines.push({ docs: [], name: onB, type: `${a.name}[]`, attributes: attrs });
  }

  // -------------------------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------------------------

  private header(): string {
    const lines = [`  provider = ${quote(PROVIDER[this.dialect])}`];
    if (this.multiSchema) {
      const schemas = [...this.schema.namespaces].map((n) => quote(n.name)).sort();
      lines.push(`  schemas  = [${schemas.join(', ')}]`);
    }
    return `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n${lines.join('\n')}\n}`;
  }

  private schemaAttr(namespace: Id): string[] {
    return this.multiSchema ? [`@@schema(${quote(this.model.namespaceName(namespace))})`] : [];
  }

  private enumBlock(en: Enum): string {
    const name = this.enumNames.get(en.id) ?? en.name;
    const values = this.enumValues.get(en.id) ?? new Map<string, string>();
    const width = Math.max(0, ...en.values.map((v) => (values.get(v) ?? v).length));
    const lines = en.values.map((v) => {
      const id = values.get(v) ?? v;
      return id === v ? `  ${id}` : `  ${id.padEnd(width)} @map(${quote(v)})`;
    });
    const attrs = [
      ...(name === en.name ? [] : [`@@map(${quote(en.name)})`]),
      ...this.schemaAttr(en.namespace),
    ];
    return `enum ${name} {\n${lines.join('\n')}${attrs.length ? `\n\n${attrs.map((a) => `  ${a}`).join('\n')}` : ''}\n}`;
  }

  private modelBlock(table: Table): string {
    const info = this.models.get(table.id);
    if (!info) return '';
    const element = this.model.qualified(table);
    const field = (id: Id) => info.fields.get(id) ?? '';
    const blockAttrs: string[] = [];
    const pk = table.primaryKey;
    if (pk && pk.columns.length > 1) {
      blockAttrs.push(
        `@@id([${pk.columns.map(field).join(', ')}]${this.mapArgInline(pk.name, this.defaultPkName(table))})`,
      );
    }
    for (const unique of table.uniques) {
      if (unique.columns.length === 1) continue;
      const conventional = `${table.name}_${unique.columns.map((id) => this.model.columnName(id)).join('_')}_key`;
      blockAttrs.push(
        `@@unique([${unique.columns.map(field).join(', ')}]${this.mapArgInline(unique.name, conventional)})`,
      );
    }
    for (const index of table.indexes) {
      const where = `${element}.${index.name}`;
      if (index.where)
        this.model.warn(
          'unsupported-feature',
          where,
          'Prisma has no partial indexes; WHERE dropped',
        );
      if (index.columns.some((c) => c.nulls))
        this.model.warn('unsupported-feature', where, 'Prisma has no NULLS FIRST/LAST; dropped');
      const cols = index.columns
        .map((c) => `${field(c.column)}${c.order === 'desc' ? '(sort: Desc)' : ''}`)
        .join(', ');
      const conventional = `${table.name}_${index.columns.map((c) => this.model.columnName(c.column)).join('_')}_${index.unique ? 'key' : 'idx'}`;
      const map = this.mapArgInline(index.name, conventional);
      if (index.method === 'fulltext') {
        blockAttrs.push(`@@fulltext([${cols}]${map})`);
        continue;
      }
      const type = index.method ? INDEX_TYPE[index.method] : undefined;
      if (index.method && !type)
        this.model.warn(
          'unsupported-feature',
          where,
          `Prisma has no "${index.method}" index type; dropped`,
        );
      if (
        OPCLASS_INDEXES.has(index.method ?? '') &&
        !index.columns.every((c) => info.defaultOpsColumns.has(c.column))
      ) {
        // The IR does not keep operator classes, and Prisma requires one unless the type has a default.
        this.model.warn(
          'unsupported-feature',
          where,
          `${index.method ?? ''} index needs an operator class Prisma cannot infer; dropped`,
        );
        continue;
      }
      if (index.unique) {
        this.model.warn('renamed', where, 'Unique index written as @@unique (a unique constraint)');
        blockAttrs.push(`@@unique([${cols}]${map})`);
      } else {
        blockAttrs.push(`@@index([${cols}]${map}${type ? `, type: ${type}` : ''})`);
      }
    }
    for (const check of table.checks) {
      this.model.warn(
        'unsupported-feature',
        `${element}.${check.name}`,
        'Prisma has no CHECK constraints; dropped',
      );
    }
    if (info.name !== table.name) blockAttrs.push(`@@map(${quote(table.name)})`);
    blockAttrs.push(...this.schemaAttr(table.namespace));
    if (info.ignored) blockAttrs.push('@@ignore');

    const docs = [
      ...(info.ignored ? [IGNORED_DOC] : []),
      ...(table.comment === null ? [] : table.comment.split('\n')),
    ];
    const body = alignFields([...info.lines, ...info.relationLines]);
    const attrBlock = blockAttrs.length ? `\n\n${blockAttrs.map((a) => `  ${a}`).join('\n')}` : '';
    return `${docs.map((d) => `/// ${d}\n`).join('')}model ${info.name} {\n${body}${attrBlock}\n}`;
  }

  private mapArgInline(name: string | null, conventional: string | null): string {
    return name === null || name === conventional ? '' : `, map: ${quote(name)}`;
  }
}

/** Align names, types and attributes in columns, as `prisma format` does. */
function alignFields(lines: readonly FieldLine[]): string {
  const nameWidth = Math.max(0, ...lines.map((l) => l.name.length));
  const typeWidth = Math.max(0, ...lines.map((l) => l.type.length));
  return lines
    .map((l) => {
      const docs = l.docs.map((d) => `  /// ${d}\n`).join('');
      const text = `  ${l.name.padEnd(nameWidth)} ${l.type.padEnd(typeWidth)} ${l.attributes.join(' ')}`;
      return docs + text.trimEnd();
    })
    .join('\n');
}
