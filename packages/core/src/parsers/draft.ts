import { createId as defaultCreateId } from '../ir/id';
import { validateSchema } from '../ir/schema';
import { fromNativeType } from '../ir/types-map';
import {
  IR_VERSION,
  type Check,
  type Column,
  type ColumnDefault,
  type Enum,
  type ForeignKey,
  type Id,
  type Index,
  type IrDialect,
  type LogicalType,
  type Namespace,
  type PrimaryKey,
  type ReferentialAction,
  type Schema,
  type Table,
  type UniqueConstraint,
} from '../ir/types';
import { START, sortDiagnostics } from './diagnostics';
import type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  ParseOptions,
  ParseResult,
  SourceLocation,
} from './types';

/*
 * Parsers fill a name-based draft; `finalize` turns it into IR. Keeping references as names
 * until the end lets sources declare things in any order (forward FKs, ALTER TABLE after
 * CREATE TABLE, Prisma relations to later models) and keeps id assignment, reference
 * resolution, type mapping and validation in one place.
 */

export interface TableRef {
  /** `null` means unqualified: resolved in the owning table's namespace, then the default. */
  readonly namespace: string | null;
  readonly name: string;
}

export interface DraftColumn {
  name: string;
  nativeType: string;
  /** Set when the source knows the logical type better than the native string does. */
  logicalType?: LogicalType;
  /** Explicit enum reference; otherwise postgres-style type names are tried as enum names. */
  enumRef?: TableRef;
  nullable: boolean;
  default: ColumnDefault | null;
  autoIncrement: boolean;
  comment: string | null;
  metadata: Record<string, string>;
  loc: SourceLocation;
}

export interface DraftPrimaryKey {
  name: string | null;
  columns: string[];
  loc: SourceLocation;
}

export interface DraftIndex {
  name: string | null;
  columns: { name: string; order: 'asc' | 'desc'; nulls: 'first' | 'last' | null }[];
  unique: boolean;
  method: string | null;
  where: string | null;
  loc: SourceLocation;
}

export interface DraftUnique {
  name: string | null;
  columns: string[];
  loc: SourceLocation;
}

export interface DraftCheck {
  name: string | null;
  expression: string;
  /** For column-level checks; used only to derive a default name. */
  column?: string;
  loc: SourceLocation;
}

export interface DraftForeignKey {
  name: string | null;
  columns: string[];
  ref: TableRef;
  /** `null` references the target table's primary key. */
  refColumns: string[] | null;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
  loc: SourceLocation;
}

export interface DraftTable {
  namespace: string;
  name: string;
  columns: DraftColumn[];
  primaryKey: DraftPrimaryKey | null;
  indexes: DraftIndex[];
  uniques: DraftUnique[];
  foreignKeys: DraftForeignKey[];
  checks: DraftCheck[];
  comment: string | null;
  metadata: Record<string, string>;
  loc: SourceLocation;
}

export interface DraftEnum {
  namespace: string;
  name: string;
  values: string[];
  loc: SourceLocation;
}

export function draftColumn(
  name: string,
  nativeType: string,
  loc: SourceLocation,
  extra: Partial<DraftColumn> = {},
): DraftColumn {
  return {
    name,
    nativeType,
    nullable: true,
    default: null,
    autoIncrement: false,
    comment: null,
    metadata: {},
    loc,
    ...extra,
  };
}

export class DraftSchema {
  readonly namespaces: string[] = [];
  readonly tables: DraftTable[] = [];
  readonly enums: DraftEnum[] = [];
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    public dialect: IrDialect,
    public defaultNamespace: string,
  ) {}

  report(
    severity: DiagnosticSeverity,
    code: DiagnosticCode,
    message: string,
    loc: SourceLocation = START,
  ): void {
    this.diagnostics.push({ severity, code, message, line: loc.line, column: loc.column });
  }

  ensureNamespace(name: string): string {
    if (!this.namespaces.includes(name)) this.namespaces.push(name);
    return name;
  }

  findTable(ref: TableRef, from?: string): DraftTable | undefined {
    const candidates = ref.namespace
      ? [ref.namespace]
      : [from ?? this.defaultNamespace, this.defaultNamespace];
    for (const namespace of candidates) {
      const found = this.tables.find((t) => t.namespace === namespace && t.name === ref.name);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Add a table; returns `null` (with a diagnostic) when one with the same name already exists in
   * that namespace.
   */
  addTable(
    namespace: string,
    name: string,
    loc: SourceLocation,
    options: { ifNotExists?: boolean } = {},
  ): DraftTable | null {
    this.ensureNamespace(namespace);
    if (this.findTable({ namespace, name })) {
      this.report(
        options.ifNotExists ? 'info' : 'warning',
        'duplicate-definition',
        `Table "${namespace}.${name}" is already defined; this definition is ignored`,
        loc,
      );
      return null;
    }
    const table: DraftTable = {
      namespace,
      name,
      columns: [],
      primaryKey: null,
      indexes: [],
      uniques: [],
      foreignKeys: [],
      checks: [],
      comment: null,
      metadata: {},
      loc,
    };
    this.tables.push(table);
    return table;
  }

  addEnum(namespace: string, name: string, values: string[], loc: SourceLocation): void {
    this.ensureNamespace(namespace);
    if (this.enums.some((e) => e.namespace === namespace && e.name === name)) {
      this.report(
        'warning',
        'duplicate-definition',
        `Enum "${namespace}.${name}" is already defined`,
        loc,
      );
      return;
    }
    this.enums.push({ namespace, name, values, loc });
  }

  /** Merge a primary key declaration (column-level ones accumulate into one key). */
  addPrimaryKey(table: DraftTable, pk: DraftPrimaryKey, merge = false): void {
    if (table.primaryKey && merge) {
      table.primaryKey.columns.push(...pk.columns);
      return;
    }
    if (table.primaryKey) {
      this.report(
        'warning',
        'duplicate-definition',
        `Table "${table.name}" already has a primary key; the later one wins`,
        pk.loc,
      );
    }
    table.primaryKey = pk;
  }
}

// ---------------------------------------------------------------------------------------------
// finalize
// ---------------------------------------------------------------------------------------------

export type NameKind = 'unique' | 'foreignKey' | 'check' | 'index';

/** Default constraint/index names, following each database's own conventions. */
export function defaultName(
  dialect: IrDialect,
  kind: NameKind,
  table: string,
  columns: readonly string[],
  ordinal: number,
): string {
  const cols = columns.join('_');
  if (dialect === 'mysql') {
    switch (kind) {
      case 'unique':
      case 'index':
        return columns[0] ?? `${table}_${kind}_${ordinal}`;
      case 'foreignKey':
        return `${table}_ibfk_${ordinal}`;
      case 'check':
        return `${table}_chk_${ordinal}`;
    }
  }
  switch (kind) {
    case 'unique':
      return `${table}_${cols}_key`;
    case 'foreignKey':
      return `${table}_${cols}_fkey`;
    case 'check':
      return cols ? `${table}_${cols}_check` : `${table}_check`;
    case 'index':
      return `${table}_${cols}_idx`;
  }
}

function mappableDialect(dialect: IrDialect): 'postgres' | 'mysql' | null {
  return dialect === 'sqlite' ? null : dialect;
}

/** Split `schema.name` / `"Quoted"` type names into a reference. */
function typeNameRef(nativeType: string): TableRef | null {
  const parts = nativeType.split('.').map((p) => p.trim().replace(/^"(.*)"$/, '$1'));
  if (parts.length === 1 && parts[0]) return { namespace: null, name: parts[0] };
  if (parts.length === 2 && parts[0] && parts[1]) return { namespace: parts[0], name: parts[1] };
  return null;
}

export function finalize(draft: DraftSchema, options: ParseOptions = {}): ParseResult {
  const make = options.createId ?? (() => defaultCreateId());
  const used = new Map<string, number>();
  const id = (hint: string): Id => {
    const count = (used.get(hint) ?? 0) + 1;
    used.set(hint, count);
    return make(count === 1 ? hint : `${hint}#${count}`);
  };

  // Every referenced namespace exists, in first-seen order.
  draft.ensureNamespace(draft.defaultNamespace);
  for (const t of draft.tables) draft.ensureNamespace(t.namespace);
  for (const e of draft.enums) draft.ensureNamespace(e.namespace);
  // The default namespace is only kept when something lives in it (or nothing exists at all).
  const namespaceNames = draft.namespaces.filter(
    (ns) =>
      ns !== draft.defaultNamespace ||
      draft.namespaces.length === 1 ||
      draft.tables.some((t) => t.namespace === ns) ||
      draft.enums.some((e) => e.namespace === ns),
  );
  const namespaceIds = new Map<string, Id>();
  const namespaces: Namespace[] = namespaceNames.map((name) => {
    const nsId = id(`namespace:${name}`);
    namespaceIds.set(name, nsId);
    return { id: nsId, name };
  });
  const nsId = (name: string): Id => namespaceIds.get(name) ?? '';

  const enumIds = new Map<DraftEnum, Id>();
  const enums: Enum[] = draft.enums.map((e) => {
    const enumId = id(`enum:${e.namespace}.${e.name}`);
    enumIds.set(e, enumId);
    return { id: enumId, name: e.name, namespace: nsId(e.namespace), values: e.values };
  });
  const findEnum = (ref: TableRef, from: string): DraftEnum | undefined => {
    const candidates = ref.namespace ? [ref.namespace] : [from, draft.defaultNamespace];
    for (const namespace of candidates) {
      const found = draft.enums.find((e) => e.namespace === namespace && e.name === ref.name);
      if (found) return found;
    }
    return undefined;
  };

  // Pass 1: tables and columns, so FKs can resolve against any table.
  const columnIdLists = new Map<DraftTable, Id[]>();
  const columnIds = new Map<DraftTable, Map<string, Id>>();
  const tableIds = new Map<DraftTable, Id>();
  for (const table of draft.tables) {
    const qualified = `${table.namespace}.${table.name}`;
    tableIds.set(table, id(`table:${qualified}`));
    const list = table.columns.map((c) => id(`column:${qualified}.${c.name}`));
    columnIdLists.set(table, list);
    // Name lookups use the first column with a given name; duplicates are reported by validation.
    const byName = new Map<string, Id>();
    table.columns.forEach((c, i) => {
      if (!byName.has(c.name)) byName.set(c.name, list[i] ?? '');
    });
    columnIds.set(table, byName);
  }

  const resolveColumns = (
    table: DraftTable,
    names: readonly string[],
    what: string,
    loc: SourceLocation,
  ): Id[] | null => {
    const ids = columnIds.get(table);
    const resolved: Id[] = [];
    for (const name of names) {
      const columnId = ids?.get(name);
      if (columnId === undefined) {
        draft.report(
          'error',
          'unresolved-reference',
          `${what} references unknown column "${name}" in "${table.name}"`,
          loc,
        );
        return null;
      }
      resolved.push(columnId);
    }
    return resolved;
  };

  const tables: Table[] = draft.tables.map((table) => {
    const qualified = `${table.namespace}.${table.name}`;
    const ids = columnIdLists.get(table) ?? [];
    const pkNames = new Set(table.primaryKey?.columns ?? []);

    const columns: Column[] = table.columns.map((c, i) => ({
      id: ids[i] ?? '',
      name: c.name,
      logicalType: resolveLogicalType(c, table),
      nativeType: c.nativeType,
      // Every SQL dialect makes primary key columns NOT NULL implicitly.
      nullable: pkNames.has(c.name) ? false : c.nullable,
      default: c.default,
      autoIncrement: c.autoIncrement,
      comment: c.comment,
      metadata: c.metadata,
    }));

    let primaryKey: PrimaryKey | null = null;
    if (table.primaryKey) {
      const pkColumns = resolveColumns(
        table,
        table.primaryKey.columns,
        'Primary key',
        table.primaryKey.loc,
      );
      if (pkColumns && pkColumns.length > 0) {
        primaryKey = { id: id(`pk:${qualified}`), name: table.primaryKey.name, columns: pkColumns };
      }
    }

    const indexes: Index[] = [];
    table.indexes.forEach((index, i) => {
      const resolved = resolveColumns(
        table,
        index.columns.map((c) => c.name),
        'Index',
        index.loc,
      );
      if (!resolved) return;
      const name =
        index.name ??
        defaultName(
          draft.dialect,
          'index',
          table.name,
          index.columns.map((c) => c.name),
          i + 1,
        );
      indexes.push({
        id: id(`index:${qualified}.${name}`),
        name,
        columns: index.columns.map((c, j) => ({
          column: resolved[j] ?? '',
          order: c.order,
          nulls: c.nulls,
        })),
        unique: index.unique,
        method: index.method,
        where: index.where,
      });
    });

    const uniques: UniqueConstraint[] = [];
    table.uniques.forEach((unique, i) => {
      const resolved = resolveColumns(table, unique.columns, 'Unique constraint', unique.loc);
      if (!resolved) return;
      const name =
        unique.name ?? defaultName(draft.dialect, 'unique', table.name, unique.columns, i + 1);
      uniques.push({ id: id(`unique:${qualified}.${name}`), name, columns: resolved });
    });

    const checks: Check[] = table.checks.map((check, i) => {
      const name =
        check.name ??
        defaultName(draft.dialect, 'check', table.name, check.column ? [check.column] : [], i + 1);
      return { id: id(`check:${qualified}.${name}`), name, expression: check.expression };
    });

    const foreignKeys: ForeignKey[] = [];
    table.foreignKeys.forEach((fk, i) => {
      const target = draft.findTable(fk.ref, table.namespace);
      const label = fk.name ? `Foreign key "${fk.name}"` : 'Foreign key';
      if (!target) {
        const refName = fk.ref.namespace ? `${fk.ref.namespace}.${fk.ref.name}` : fk.ref.name;
        draft.report(
          'error',
          'unresolved-reference',
          `${label} references unknown table "${refName}"`,
          fk.loc,
        );
        return;
      }
      const refNames = fk.refColumns ?? target.primaryKey?.columns ?? null;
      if (!refNames) {
        draft.report(
          'error',
          'unresolved-reference',
          `${label} omits referenced columns but "${target.name}" has no primary key`,
          fk.loc,
        );
        return;
      }
      const local = resolveColumns(table, fk.columns, label, fk.loc);
      const remote = local && resolveColumns(target, refNames, label, fk.loc);
      if (!local || !remote) return;
      const name =
        fk.name ?? defaultName(draft.dialect, 'foreignKey', table.name, fk.columns, i + 1);
      foreignKeys.push({
        id: id(`fk:${qualified}.${name}`),
        name,
        columns: local,
        refTable: tableIds.get(target) ?? '',
        refColumns: remote,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      });
    });

    return {
      id: tableIds.get(table) ?? '',
      name: table.name,
      namespace: nsId(table.namespace),
      columns,
      primaryKey,
      indexes,
      uniques,
      foreignKeys,
      checks,
      comment: table.comment,
      metadata: table.metadata,
    };
  });

  function resolveLogicalType(column: DraftColumn, table: DraftTable): LogicalType {
    if (column.enumRef) {
      const target = findEnum(column.enumRef, table.namespace);
      if (target) return { kind: 'enum', enumId: enumIds.get(target) ?? '' };
      draft.report(
        'error',
        'unresolved-reference',
        `Column "${table.name}.${column.name}" references unknown enum "${column.enumRef.name}"`,
        column.loc,
      );
      return { kind: 'unknown' };
    }
    if (column.logicalType) return column.logicalType;
    if (draft.dialect !== 'mysql') {
      const ref = typeNameRef(column.nativeType);
      const target = ref && findEnum(ref, table.namespace);
      if (target) return { kind: 'enum', enumId: enumIds.get(target) ?? '' };
    }
    const dialect = mappableDialect(draft.dialect);
    const mapped = dialect && fromNativeType(dialect, column.nativeType, { enums: [] });
    if (mapped) return mapped;
    draft.report(
      'info',
      'unknown-type',
      `Type "${column.nativeType}" of "${table.name}.${column.name}" has no logical equivalent; it is kept as a native type`,
      column.loc,
    );
    return { kind: 'unknown' };
  }

  const schema: Schema = {
    id: id('schema'),
    dialect: draft.dialect,
    namespaces,
    tables,
    enums,
    version: IR_VERSION,
  };

  // Semantic problems the source itself contains (e.g. duplicate column names) become warnings.
  for (const problem of validateSchema(schema)) {
    const tableIndex = problem.path[0] === 'tables' ? problem.path[1] : undefined;
    const loc = typeof tableIndex === 'number' ? draft.tables[tableIndex]?.loc : undefined;
    draft.report('warning', `ir-${problem.code}`, problem.message, loc);
  }

  return { schema, diagnostics: sortDiagnostics(draft.diagnostics) };
}

/** Result for inputs that could not be parsed at all. */
export function emptyResult(
  dialect: IrDialect,
  defaultNamespace: string,
  diagnostics: readonly Diagnostic[],
  options: ParseOptions,
): ParseResult {
  const draft = new DraftSchema(dialect, defaultNamespace);
  draft.diagnostics.push(...diagnostics);
  return finalize(draft, options);
}
