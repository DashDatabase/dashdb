import * as estree from 'prettier/plugins/estree';
import * as typescript from 'prettier/plugins/typescript';
import { format } from 'prettier/standalone';
import type { Column, ColumnDefault, Enum, ForeignKey, Id, Schema, Table } from '../ir/types';
import { SchemaModel } from './model';
import { NameScope, camelCase, fieldName, plural, singular } from './naming';
import { CLIENT_GENERATED } from './prisma-client';
import type { SerializeResult } from './types';

type Core = 'pg' | 'mysql';

const TS_RESERVED = [
  ...'break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await'.split(
    ' ',
  ),
  'sql',
  'relations',
];

/** A column builder call without modifiers, e.g. `varchar('email', { length: 255 })`. */
interface Builder {
  readonly fn: string;
  readonly options?: string;
  /** For enum columns, the enum constant or inline mysqlEnum values. */
  readonly enumValues?: readonly string[];
  readonly array?: boolean;
  /** How literal defaults are written for this builder. */
  readonly literal: 'string' | 'number' | 'boolean' | 'sql';
}

const str = (s: string) => JSON.stringify(s);
const sqlTemplate = (s: string) =>
  `sql\`${s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;

function splitNative(native: string): { base: string; args: number[] } {
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
    .map((a) => Number(a.trim()))
    .filter((n) => Number.isFinite(n));
  return { base, args };
}

/**
 * Render the schema as a Drizzle ORM schema module (`drizzle-orm/pg-core` or `mysql-core`),
 * including `relations()` for every table, formatted with prettier.
 */
export async function toDrizzle(schema: Schema): Promise<SerializeResult> {
  const model = new SchemaModel(schema);
  if (schema.dialect === 'sqlite') {
    model.warn('unsupported-feature', '', 'Drizzle output supports postgres and mysql only');
    return { code: '', warnings: model.warnings };
  }
  const writer = new DrizzleWriter(model, schema.dialect === 'postgres' ? 'pg' : 'mysql');
  const raw = writer.write();
  const code = await format(raw, {
    parser: 'typescript',
    plugins: [typescript, estree],
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'all',
  });
  return { code, warnings: model.warnings };
}

class DrizzleWriter {
  private readonly coreImports = new Set<string>();
  private readonly ormImports = new Set<string>();
  private readonly scope = new NameScope(TS_RESERVED);
  private readonly tableVars = new Map<Id, string>();
  private readonly columnKeys = new Map<Id, Map<Id, string>>();
  private readonly enumVars = new Map<Id, string>();
  private readonly schemaVars = new Map<string, string>();
  private readonly customTypes = new Map<string, string>();
  private readonly preamble: string[] = [];

  constructor(
    private readonly model: SchemaModel,
    private readonly core: Core,
  ) {}

  private use(name: string): string {
    this.coreImports.add(name);
    return name;
  }

  write(): string {
    const body: string[] = [];
    const defaultNamespace = this.core === 'pg' ? 'public' : 'default';
    for (const ns of [...this.model.schema.namespaces].map((n) => n.name).sort()) {
      if (ns === defaultNamespace) continue;
      const v = this.scope.claim(`${camelCase(ns) || 'db'}Schema`);
      this.schemaVars.set(ns, v);
      body.push(
        `export const ${v} = ${this.use(this.core === 'pg' ? 'pgSchema' : 'mysqlSchema')}(${str(ns)});`,
      );
    }
    if (this.core === 'pg') {
      for (const en of this.model.sortedEnums()) body.push(this.enumDecl(en));
    }

    const tables = this.model.sortedTables();
    for (const table of tables) {
      this.tableVars.set(table.id, this.scope.claim(camelCase(table.name) || 'table'));
      const keys = new Map<Id, string>();
      const local = new NameScope();
      for (const c of table.columns)
        keys.set(c.id, local.claim(fieldName(c.name).replace(/^(\d)/, '_$1')));
      this.columnKeys.set(table.id, keys);
    }
    for (const table of tables) body.push(this.tableDecl(table));
    for (const table of tables) {
      const rel = this.relationsDecl(table);
      if (rel) body.push(rel);
    }

    const imports = [
      `import { ${[...this.ormImports].sort().join(', ')} } from 'drizzle-orm';`,
      `import { ${[...this.coreImports].sort().join(', ')} } from 'drizzle-orm/${this.core}-core';`,
    ].filter((line) => !line.startsWith('import {  }'));
    return [
      '// Generated by DashDB. Edit the schema in DashDB, not this file.',
      ...imports,
      '',
      ...this.preamble,
      ...body,
    ].join('\n\n');
  }

  private enumDecl(en: Enum): string {
    const v = this.scope.claim(`${camelCase(en.name) || 'enum'}Enum`);
    this.enumVars.set(en.id, v);
    const ns = this.model.namespaceName(en.namespace);
    const fn = this.schemaVars.get(ns)
      ? `${this.schemaVars.get(ns) ?? ''}.enum`
      : this.use('pgEnum');
    return `export const ${v} = ${fn}(${str(en.name)}, [${en.values.map(str).join(', ')}]);`;
  }

  private col(table: Table, id: Id): string {
    return this.columnKeys.get(table.id)?.get(id) ?? 'unknown';
  }

  private tableDecl(table: Table): string {
    const v = this.tableVars.get(table.id) ?? '';
    const ns = this.model.namespaceName(table.namespace);
    const schemaVar = this.schemaVars.get(ns);
    const fn = schemaVar
      ? `${schemaVar}.table`
      : this.use(this.core === 'pg' ? 'pgTable' : 'mysqlTable');
    const element = this.model.qualified(table);
    const pk = table.primaryKey;
    const inlinePk = pk && pk.name === null && pk.columns.length === 1 ? pk.columns[0] : undefined;

    const columns = table.columns.map((c) => {
      const doc = c.comment === null ? '' : `/** ${c.comment.replace(/\*\//g, '*\\/')} */\n`;
      return `${doc}${this.col(table, c.id)}: ${this.columnExpr(table, c, c.id === inlinePk, `${element}.${c.name}`)},`;
    });

    const extras: string[] = [];
    const t = (id: Id) => `t.${this.col(table, id)}`;
    if (pk && pk.columns[0] !== inlinePk) {
      const name = pk.name === null ? '' : `name: ${str(pk.name)}, `;
      extras.push(
        `${this.use('primaryKey')}({ ${name}columns: [${pk.columns.map(t).join(', ')}] })`,
      );
    }
    for (const u of table.uniques)
      extras.push(`${this.use('unique')}(${str(u.name)}).on(${u.columns.map(t).join(', ')})`);
    for (const index of table.indexes) {
      const where = `${element}.${index.name}`;
      const fnName = this.use(index.unique ? 'uniqueIndex' : 'index');
      if (this.core === 'mysql') {
        if (index.method === 'fulltext' || index.method === 'spatial') {
          this.model.warn(
            'unsupported-feature',
            where,
            `Drizzle has no ${index.method} indexes; written as a plain index`,
          );
        }
        if (index.columns.some((c) => c.order === 'desc'))
          this.model.warn('unsupported-feature', where, 'Index sort order dropped');
        const using =
          index.method === 'btree' || index.method === 'hash' ? `.using(${str(index.method)})` : '';
        extras.push(
          `${fnName}(${str(index.name)}).on(${index.columns.map((c) => t(c.column)).join(', ')})${using}`,
        );
        continue;
      }
      const cols = index.columns
        .map(
          (c) =>
            `${t(c.column)}${c.order === 'desc' ? '.desc()' : ''}${c.nulls === 'first' ? '.nullsFirst()' : c.nulls === 'last' ? '.nullsLast()' : ''}`,
        )
        .join(', ');
      const on = index.method ? `.using(${str(index.method)}, ${cols})` : `.on(${cols})`;
      const whereSql = index.where ? `.where(${this.sql(index.where)})` : '';
      extras.push(`${fnName}(${str(index.name)})${on}${whereSql}`);
    }
    for (const check of table.checks)
      extras.push(`${this.use('check')}(${str(check.name)}, ${this.sql(check.expression)})`);
    for (const fk of table.foreignKeys) extras.push(this.foreignKeyExpr(table, fk));

    const doc = table.comment === null ? '' : `/** ${table.comment.replace(/\*\//g, '*\\/')} */\n`;
    const third = extras.length ? `, (t) => [\n${extras.join(',\n')},\n]` : '';
    return `${doc}export const ${v} = ${fn}(${str(table.name)}, {\n${columns.join('\n')}\n}${third});`;
  }

  private foreignKeyExpr(table: Table, fk: ForeignKey): string {
    const target = this.model.table(fk.refTable);
    const self = target.id === table.id;
    const targetVar = self ? 't' : (this.tableVars.get(target.id) ?? '');
    const local = fk.columns.map((id) => `t.${this.col(table, id)}`).join(', ');
    const remote = fk.refColumns.map((id) => `${targetVar}.${this.col(target, id)}`).join(', ');
    const actions =
      (fk.onDelete === 'no action' ? '' : `.onDelete(${str(fk.onDelete)})`) +
      (fk.onUpdate === 'no action' ? '' : `.onUpdate(${str(fk.onUpdate)})`);
    return `${this.use('foreignKey')}({ name: ${str(fk.name)}, columns: [${local}], foreignColumns: [${remote}] })${actions}`;
  }

  private sql(expression: string): string {
    this.ormImports.add('sql');
    return sqlTemplate(expression);
  }

  // -------------------------------------------------------------------------------------------
  // Columns
  // -------------------------------------------------------------------------------------------

  private columnExpr(table: Table, column: Column, inlinePk: boolean, element: string): string {
    const builder = this.builder(table, column, element);
    const name = str(column.name);
    let call: string;
    if (builder.enumValues && this.core === 'mysql') {
      call = `${this.use('mysqlEnum')}(${name}, [${builder.enumValues.map(str).join(', ')}])`;
    } else {
      call = `${builder.fn}(${name}${builder.options ? `, ${builder.options}` : ''})`;
    }
    if (builder.array) call += '.array()';

    const mods: string[] = [];
    if (inlinePk) mods.push('.primaryKey()');
    if (!column.nullable && !inlinePk) mods.push('.notNull()');
    const serial = /^(small|big)?serial$/.test(builder.fn);
    if (column.metadata.generated) {
      mods.push(`.generatedAlwaysAs(${this.sql(column.metadata.generated)})`);
    } else if (this.core === 'pg' && column.autoIncrement && !serial && column.default === null) {
      mods.push(
        column.metadata.identity === 'always'
          ? '.generatedAlwaysAsIdentity()'
          : '.generatedByDefaultAsIdentity()',
      );
    } else if (this.core === 'mysql' && column.autoIncrement) {
      mods.push('.autoincrement()');
    }
    if (column.default && !serial) mods.push(this.defaultExpr(column.default, builder, element));
    if (this.core === 'mysql' && column.metadata.onUpdate) mods.push('.onUpdateNow()');
    mods.push(...this.clientHooks(column, element));
    return call + mods.join('');
  }

  /**
   * Values Prisma Client fills in itself (`@default(uuid())`, `@updatedAt`) have no database
   * default; Drizzle's `$defaultFn` / `$onUpdate` do the same job in application code.
   */
  private clientHooks(column: Column, element: string): string[] {
    const hooks: string[] = [];
    const generator = column.default === null ? column.metadata.prismaDefault : undefined;
    if (generator === 'uuid()' || generator === 'uuid(4)') {
      hooks.push('.$defaultFn(() => crypto.randomUUID())');
    } else if (generator && CLIENT_GENERATED.test(generator)) {
      this.model.warn(
        'unsupported-feature',
        element,
        `Prisma Client generates ${generator} values; add .$defaultFn() with a library that does the same`,
      );
    }
    if (column.metadata.prismaUpdatedAt) hooks.push('.$onUpdate(() => new Date())');
    return hooks;
  }

  private defaultExpr(def: ColumnDefault, builder: Builder, element: string): string {
    switch (def.kind) {
      case 'sequence':
        return `.default(${this.sql(`nextval('${def.name.replace(/'/g, "''")}'::regclass)`)})`;
      case 'expression':
        // Only timestamp builders have defaultNow() (mysql datetime does not).
        if (
          /^(current_timestamp|now\(\))$/i.test(def.sql.trim()) &&
          builder.fn === 'timestamp' &&
          !builder.array
        ) {
          return '.defaultNow()';
        }
        return `.default(${this.sql(def.sql)})`;
      case 'literal': {
        const value = def.value;
        if (value === null) return `.default(${this.sql('NULL')})`;
        if (builder.array)
          return `.default(${this.sql(typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value))})`;
        if (builder.literal === 'string' && typeof value === 'string')
          return `.default(${str(value)})`;
        if (builder.literal === 'number' && typeof value === 'number')
          return `.default(${String(value)})`;
        if (builder.literal === 'boolean' && typeof value === 'boolean')
          return `.default(${String(value)})`;
        if (builder.literal === 'string' && typeof value === 'number')
          return `.default(${str(String(value))})`;
        if (builder.literal === 'boolean' && (value === 0 || value === 1))
          return `.default(${String(value === 1)})`;
        if (builder.literal !== 'sql')
          this.model.warn(
            'lossy-type',
            element,
            `Default ${JSON.stringify(value)} written as raw SQL`,
          );
        const literal =
          typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value);
        return `.default(${this.sql(literal)})`;
      }
    }
  }

  private builder(table: Table, column: Column, element: string): Builder {
    const logical = column.logicalType;
    if (logical.kind === 'enum') {
      const en = this.model.enum(logical.enumId);
      if (this.core === 'mysql')
        return { fn: 'mysqlEnum', enumValues: en.values, literal: 'string' };
      return { fn: this.enumVars.get(en.id) ?? 'text', literal: 'string' };
    }
    let native = column.nativeType;
    let array = false;
    if (this.core === 'pg' && native.endsWith('[]')) {
      native = native.slice(0, -2);
      array = true;
    }
    if (this.model.schema.dialect !== (this.core === 'pg' ? 'postgres' : 'mysql'))
      native = native.toLowerCase();
    const { base, args } = splitNative(native);
    const found =
      this.core === 'pg'
        ? this.pgBuilder(table, column, base, args)
        : this.mysqlBuilder(base, args);
    if (found) return { ...found, array };
    return { fn: this.customType(column.nativeType, element), literal: 'sql', array: false };
  }

  private pgBuilder(
    table: Table,
    column: Column,
    base: string,
    args: number[],
  ): Omit<Builder, 'array'> | null {
    const [p, s] = args;
    const seq =
      column.default?.kind === 'sequence' &&
      column.default.name === `${table.name}_${column.name}_seq`;
    const serial = column.autoIncrement && seq;
    switch (base) {
      case 'integer':
      case 'int':
      case 'int4':
        return { fn: this.use(serial ? 'serial' : 'integer'), literal: 'number' };
      case 'smallint':
      case 'int2':
        return { fn: this.use(serial ? 'smallserial' : 'smallint'), literal: 'number' };
      case 'bigint':
      case 'int8':
        return {
          fn: this.use(serial ? 'bigserial' : 'bigint'),
          options: "{ mode: 'number' }",
          literal: 'number',
        };
      case 'numeric':
      case 'decimal':
        return {
          fn: this.use('numeric'),
          options:
            p === undefined
              ? undefined
              : `{ precision: ${p}${s === undefined ? '' : `, scale: ${s}`} }`,
          literal: 'string',
        };
      case 'real':
      case 'float4':
        return { fn: this.use('real'), literal: 'number' };
      case 'double precision':
      case 'float8':
        return { fn: this.use('doublePrecision'), literal: 'number' };
      case 'text':
        return { fn: this.use('text'), literal: 'string' };
      case 'varchar':
      case 'character varying':
        return {
          fn: this.use('varchar'),
          options: p === undefined ? undefined : `{ length: ${p} }`,
          literal: 'string',
        };
      case 'char':
      case 'character':
        return {
          fn: this.use('char'),
          options: p === undefined ? undefined : `{ length: ${p} }`,
          literal: 'string',
        };
      case 'boolean':
      case 'bool':
        return { fn: this.use('boolean'), literal: 'boolean' };
      case 'uuid':
        return { fn: this.use('uuid'), literal: 'string' };
      case 'json':
        return { fn: this.use('json'), literal: 'sql' };
      case 'jsonb':
        return { fn: this.use('jsonb'), literal: 'sql' };
      case 'date':
        return { fn: this.use('date'), literal: 'string' };
      case 'time':
      case 'time without time zone':
        return {
          fn: this.use('time'),
          options: p === undefined ? undefined : `{ precision: ${p} }`,
          literal: 'string',
        };
      case 'interval':
        return { fn: this.use('interval'), literal: 'string' };
      case 'inet':
        return { fn: this.use('inet'), literal: 'string' };
      case 'timestamp':
      case 'timestamp without time zone':
      case 'timestamptz':
      case 'timestamp with time zone': {
        const tz = base === 'timestamptz' || base.includes('with time zone');
        const opts = [
          tz ? 'withTimezone: true' : '',
          p === undefined ? '' : `precision: ${p}`,
        ].filter(Boolean);
        return {
          fn: this.use('timestamp'),
          options: opts.length ? `{ ${opts.join(', ')} }` : undefined,
          literal: 'sql',
        };
      }
      default:
        return null;
    }
  }

  private mysqlBuilder(base: string, args: number[]): Omit<Builder, 'array'> | null {
    const [p, s] = args;
    const unsigned = base.endsWith(' unsigned');
    const core = unsigned ? base.slice(0, -' unsigned'.length) : base;
    const intOptions = unsigned ? '{ unsigned: true }' : undefined;
    switch (core) {
      case 'tinyint':
        if (p === 1 && !unsigned) return { fn: this.use('boolean'), literal: 'boolean' };
        return { fn: this.use('tinyint'), options: intOptions, literal: 'number' };
      case 'boolean':
      case 'bool':
        return { fn: this.use('boolean'), literal: 'boolean' };
      case 'smallint':
      case 'mediumint':
      case 'int':
        return { fn: this.use(core), options: intOptions, literal: 'number' };
      case 'integer':
        return { fn: this.use('int'), options: intOptions, literal: 'number' };
      case 'bigint':
        return {
          fn: this.use('bigint'),
          options: `{ mode: 'number'${unsigned ? ', unsigned: true' : ''} }`,
          literal: 'number',
        };
      case 'decimal':
      case 'numeric':
        return {
          fn: this.use('decimal'),
          options:
            p === undefined
              ? undefined
              : `{ precision: ${p}${s === undefined ? '' : `, scale: ${s}`} }`,
          literal: 'string',
        };
      case 'double':
        return { fn: this.use('double'), literal: 'number' };
      case 'float':
        return { fn: this.use('float'), literal: 'number' };
      case 'varchar':
        return { fn: this.use('varchar'), options: `{ length: ${p ?? 255} }`, literal: 'string' };
      case 'char':
        return {
          fn: this.use('char'),
          options: p === undefined ? undefined : `{ length: ${p} }`,
          literal: 'string',
        };
      case 'text':
      case 'tinytext':
      case 'mediumtext':
      case 'longtext':
        return { fn: this.use(core), literal: 'string' };
      case 'json':
        return { fn: this.use('json'), literal: 'sql' };
      case 'date':
        return { fn: this.use('date'), literal: 'sql' };
      case 'datetime':
        return {
          fn: this.use('datetime'),
          options: p === undefined ? undefined : `{ fsp: ${p} }`,
          literal: 'sql',
        };
      case 'timestamp':
        return {
          fn: this.use('timestamp'),
          options: p === undefined ? undefined : `{ fsp: ${p} }`,
          literal: 'sql',
        };
      case 'time':
        return { fn: this.use('time'), literal: 'string' };
      case 'year':
        return { fn: this.use('year'), literal: 'number' };
      case 'binary':
      case 'varbinary':
        return {
          fn: this.use(core),
          options: p === undefined ? undefined : `{ length: ${p} }`,
          literal: 'sql',
        };
      default:
        return null;
    }
  }

  /** A `customType` for natives Drizzle has no builder for, declared once per type. */
  private customType(native: string, element: string): string {
    const existing = this.customTypes.get(native);
    if (existing) return existing;
    this.model.warn('lossy-type', element, `"${native}" has no Drizzle builder; using customType`);
    const v = this.scope.claim(`${camelCase(native.replace(/\W+/g, ' ')) || 'custom'}Type`);
    this.customTypes.set(native, v);
    this.preamble.push(
      `const ${v} = ${this.use('customType')}<{ data: string }>({ dataType() { return ${str(native)}; } });`,
    );
    return v;
  }

  // -------------------------------------------------------------------------------------------
  // relations()
  // -------------------------------------------------------------------------------------------

  private ambiguous(a: Id, b: Id): boolean {
    if (a === b) return true;
    let count = 0;
    for (const table of this.model.schema.tables) {
      for (const fk of table.foreignKeys) {
        if ((table.id === a && fk.refTable === b) || (table.id === b && fk.refTable === a)) count++;
      }
    }
    return count > 1;
  }

  private isKey(table: Table, columns: readonly Id[]): boolean {
    const wanted = [...columns].sort().join('|');
    const sets = [
      ...(table.primaryKey ? [table.primaryKey.columns] : []),
      ...table.uniques.map((u) => u.columns),
      ...table.indexes.filter((i) => i.unique).map((i) => i.columns.map((c) => c.column)),
    ];
    return sets.some((set) => [...set].sort().join('|') === wanted);
  }

  /** Relation property names, shared by both ends so `relationName`s line up. */
  private relationNames = new Map<
    ForeignKey,
    { forward: string; back: string; relationName: string | null }
  >();

  private namesFor(
    owner: Table,
    fk: ForeignKey,
  ): { forward: string; back: string; relationName: string | null } {
    const cached = this.relationNames.get(fk);
    if (cached) return cached;
    const target = this.model.table(fk.refTable);
    const ownerVar = this.tableVars.get(owner.id) ?? '';
    const targetVar = this.tableVars.get(target.id) ?? '';
    const [only] = fk.columns;
    const key = only && fk.columns.length === 1 ? this.col(owner, only) : '';
    const stripped = key.replace(/_?[iI]d$/, '');
    const forward = stripped && stripped !== key ? stripped : camelCase(targetVar);
    const oneToOne = this.isKey(owner, fk.columns);
    // Table variables are usually plural already (`posts`): singularize before pluralizing,
    // so the back-relation is `posts`, not `postses`, and a one-to-one one is `profile`.
    const ownerNoun = singular(camelCase(ownerVar));
    const back =
      owner.id === target.id ? `${plural(forward)}Of` : oneToOne ? ownerNoun : plural(ownerNoun);
    const relationName = this.ambiguous(owner.id, target.id) ? `${ownerVar}_${forward}` : null;
    const names = { forward, back, relationName };
    this.relationNames.set(fk, names);
    return names;
  }

  private relationsDecl(table: Table): string | null {
    const v = this.tableVars.get(table.id) ?? '';
    const keys = new NameScope(this.columnKeys.get(table.id)?.values());
    const entries: string[] = [];
    let usesOne = false;
    let usesMany = false;

    for (const fk of table.foreignKeys) {
      const target = this.model.table(fk.refTable);
      const { forward, relationName } = this.namesFor(table, fk);
      const targetVar = this.tableVars.get(target.id) ?? '';
      const fields = fk.columns.map((id) => `${v}.${this.col(table, id)}`).join(', ');
      const references = fk.refColumns
        .map((id) => `${targetVar}.${this.col(target, id)}`)
        .join(', ');
      const rn = relationName ? `, relationName: ${str(relationName)}` : '';
      entries.push(
        `${keys.claim(forward)}: one(${targetVar}, { fields: [${fields}], references: [${references}]${rn} }),`,
      );
      usesOne = true;
    }
    for (const { owner, fk } of this.model.inbound(table)) {
      const { back, relationName } = this.namesFor(owner, fk);
      const ownerVar = this.tableVars.get(owner.id) ?? '';
      const rn = relationName ? `, { relationName: ${str(relationName)} }` : '';
      if (this.isKey(owner, fk.columns)) {
        entries.push(`${keys.claim(back)}: one(${ownerVar}${rn}),`);
        usesOne = true;
      } else {
        entries.push(`${keys.claim(back)}: many(${ownerVar}${rn}),`);
        usesMany = true;
      }
    }
    if (!entries.length) return null;
    this.ormImports.add('relations');
    const helpers = [usesOne ? 'one' : '', usesMany ? 'many' : ''].filter(Boolean).join(', ');
    const relVar = this.scope.claim(`${v}Relations`);
    return `export const ${relVar} = relations(${v}, ({ ${helpers} }) => ({\n${entries.join('\n')}\n}));`;
  }
}
