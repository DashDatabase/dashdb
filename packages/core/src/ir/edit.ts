import { createId } from './id';
import {
  IR_VERSION,
  type Check,
  type Column,
  type Enum,
  type ForeignKey,
  type Id,
  type Index,
  type IndexColumn,
  type IrDialect,
  type Metadata,
  type Namespace,
  type PrimaryKey,
  type Schema,
  type Table,
  type UniqueConstraint,
} from './types';

/*
 * Pure, immutable edits over the Schema IR. Each function returns a new Schema that shares every
 * untouched subtree with its input. Edits only require their target ids to exist; semantic rules
 * (unique names, valid references) are left to `validateSchema` so callers can pass through
 * intermediate states.
 */

export type IrElementKind =
  'namespace' | 'table' | 'column' | 'index' | 'unique' | 'foreignKey' | 'check' | 'enum';

export class IrEditError extends Error {
  readonly code = 'not-found';

  constructor(
    readonly kind: IrElementKind,
    readonly id: Id,
  ) {
    super(`No ${kind} with id ${id}`);
    this.name = 'IrEditError';
  }
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type NewNamespace = Optional<Namespace, 'id'>;
export type NewColumn = Optional<
  Column,
  'id' | 'nullable' | 'default' | 'autoIncrement' | 'comment' | 'metadata'
>;
export interface NewTable {
  readonly id?: Id;
  readonly name: string;
  readonly namespace: Id;
  readonly columns?: readonly NewColumn[];
  readonly comment?: string | null;
  readonly metadata?: Metadata;
}
export type NewPrimaryKey = Optional<PrimaryKey, 'id' | 'name'>;
export type NewIndexColumn = Optional<IndexColumn, 'order' | 'nulls'>;
export type NewIndex = Optional<Omit<Index, 'columns'>, 'id' | 'unique' | 'method' | 'where'> & {
  readonly columns: readonly NewIndexColumn[];
};
export type NewUnique = Optional<UniqueConstraint, 'id'>;
export type NewForeignKey = Optional<ForeignKey, 'id' | 'onDelete' | 'onUpdate'>;
export type NewCheck = Optional<Check, 'id'>;
export type NewEnum = Optional<Enum, 'id'>;

export type TablePatch = Partial<Pick<Table, 'name' | 'namespace' | 'comment' | 'metadata'>>;
export type ColumnPatch = Partial<Omit<Column, 'id'>>;
export type EnumPatch = Partial<Pick<Enum, 'name' | 'namespace' | 'values'>>;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function replaceById<T extends { readonly id: Id }>(
  items: readonly T[],
  id: Id,
  kind: IrElementKind,
  update: (item: T) => T,
): readonly T[] {
  if (!items.some((item) => item.id === id)) throw new IrEditError(kind, id);
  return items.map((item) => (item.id === id ? update(item) : item));
}

function removeById<T extends { readonly id: Id }>(
  items: readonly T[],
  id: Id,
  kind: IrElementKind,
): readonly T[] {
  if (!items.some((item) => item.id === id)) throw new IrEditError(kind, id);
  return items.filter((item) => item.id !== id);
}

function updateTableById(schema: Schema, tableId: Id, update: (table: Table) => Table): Schema {
  return { ...schema, tables: replaceById(schema.tables, tableId, 'table', update) };
}

function buildColumn({ id = createId(), ...input }: NewColumn): Column {
  return {
    nullable: true,
    default: null,
    autoIncrement: false,
    comment: null,
    metadata: {},
    ...input,
    id,
  };
}

// ---------------------------------------------------------------------------------------------
// Schema & namespaces
// ---------------------------------------------------------------------------------------------

export function createSchema(dialect: IrDialect, options: { id?: Id } = {}): Schema {
  return {
    id: options.id ?? createId(),
    dialect,
    namespaces: [],
    tables: [],
    enums: [],
    version: IR_VERSION,
  };
}

export function addNamespace(schema: Schema, { id = createId(), ...input }: NewNamespace): Schema {
  return { ...schema, namespaces: [...schema.namespaces, { ...input, id }] };
}

export function renameNamespace(schema: Schema, namespaceId: Id, name: string): Schema {
  return {
    ...schema,
    namespaces: replaceById(schema.namespaces, namespaceId, 'namespace', (ns) => ({ ...ns, name })),
  };
}

// ---------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------

export function addTable(
  schema: Schema,
  { id = createId(), columns = [], comment = null, metadata = {}, ...input }: NewTable,
): Schema {
  const table: Table = {
    ...input,
    id,
    columns: columns.map(buildColumn),
    primaryKey: null,
    indexes: [],
    uniques: [],
    foreignKeys: [],
    checks: [],
    comment,
    metadata,
  };
  return { ...schema, tables: [...schema.tables, table] };
}

export function updateTable(schema: Schema, tableId: Id, patch: TablePatch): Schema {
  return updateTableById(schema, tableId, (table) => ({ ...table, ...patch }));
}

export function renameTable(schema: Schema, tableId: Id, name: string): Schema {
  return updateTable(schema, tableId, { name });
}

/** Remove a table along with every foreign key (in other tables) that references it. */
export function removeTable(schema: Schema, tableId: Id): Schema {
  const remaining = removeById(schema.tables, tableId, 'table');
  return {
    ...schema,
    tables: remaining.map((table) =>
      table.foreignKeys.some((fk) => fk.refTable === tableId)
        ? { ...table, foreignKeys: table.foreignKeys.filter((fk) => fk.refTable !== tableId) }
        : table,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------

export function addColumn(schema: Schema, tableId: Id, column: NewColumn): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    columns: [...table.columns, buildColumn(column)],
  }));
}

export function updateColumn(
  schema: Schema,
  tableId: Id,
  columnId: Id,
  patch: ColumnPatch,
): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    columns: replaceById(table.columns, columnId, 'column', (column) => ({ ...column, ...patch })),
  }));
}

export function renameColumn(schema: Schema, tableId: Id, columnId: Id, name: string): Schema {
  return updateColumn(schema, tableId, columnId, { name });
}

/**
 * Remove a column. It is dropped from the primary key (which disappears if left empty), and every
 * index, unique constraint and foreign key that uses it, including inbound foreign keys from
 * other tables, is removed.
 */
export function removeColumn(schema: Schema, tableId: Id, columnId: Id): Schema {
  const withoutColumn = updateTableById(schema, tableId, (table) => {
    const pkColumns = table.primaryKey?.columns.filter((id) => id !== columnId) ?? [];
    return {
      ...table,
      columns: removeById(table.columns, columnId, 'column'),
      primaryKey:
        table.primaryKey && pkColumns.length > 0
          ? { ...table.primaryKey, columns: pkColumns }
          : null,
      indexes: table.indexes.filter((index) => !index.columns.some((c) => c.column === columnId)),
      uniques: table.uniques.filter((unique) => !unique.columns.includes(columnId)),
      foreignKeys: table.foreignKeys.filter((fk) => !fk.columns.includes(columnId)),
    };
  });
  const isInbound = (fk: ForeignKey) => fk.refTable === tableId && fk.refColumns.includes(columnId);
  return {
    ...withoutColumn,
    tables: withoutColumn.tables.map((table) =>
      table.foreignKeys.some(isInbound)
        ? { ...table, foreignKeys: table.foreignKeys.filter((fk) => !isInbound(fk)) }
        : table,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Constraints & indexes
// ---------------------------------------------------------------------------------------------

export function setPrimaryKey(
  schema: Schema,
  tableId: Id,
  primaryKey: NewPrimaryKey | null,
): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    primaryKey: primaryKey && { name: null, ...primaryKey, id: primaryKey.id ?? createId() },
  }));
}

export function addIndex(
  schema: Schema,
  tableId: Id,
  { id = createId(), columns, ...input }: NewIndex,
): Schema {
  const index: Index = {
    unique: false,
    method: null,
    where: null,
    ...input,
    id,
    columns: columns.map((c) => ({ order: 'asc', nulls: null, ...c })),
  };
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    indexes: [...table.indexes, index],
  }));
}

export function removeIndex(schema: Schema, tableId: Id, indexId: Id): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    indexes: removeById(table.indexes, indexId, 'index'),
  }));
}

export function addUnique(
  schema: Schema,
  tableId: Id,
  { id = createId(), ...input }: NewUnique,
): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    uniques: [...table.uniques, { ...input, id }],
  }));
}

export function removeUnique(schema: Schema, tableId: Id, uniqueId: Id): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    uniques: removeById(table.uniques, uniqueId, 'unique'),
  }));
}

export function addForeignKey(
  schema: Schema,
  tableId: Id,
  { id = createId(), ...input }: NewForeignKey,
): Schema {
  const fk: ForeignKey = { onDelete: 'no action', onUpdate: 'no action', ...input, id };
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    foreignKeys: [...table.foreignKeys, fk],
  }));
}

export function removeForeignKey(schema: Schema, tableId: Id, foreignKeyId: Id): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    foreignKeys: removeById(table.foreignKeys, foreignKeyId, 'foreignKey'),
  }));
}

export function addCheck(
  schema: Schema,
  tableId: Id,
  { id = createId(), ...input }: NewCheck,
): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    checks: [...table.checks, { ...input, id }],
  }));
}

export function removeCheck(schema: Schema, tableId: Id, checkId: Id): Schema {
  return updateTableById(schema, tableId, (table) => ({
    ...table,
    checks: removeById(table.checks, checkId, 'check'),
  }));
}

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

export function addEnum(schema: Schema, { id = createId(), ...input }: NewEnum): Schema {
  return { ...schema, enums: [...schema.enums, { ...input, id }] };
}

export function updateEnum(schema: Schema, enumId: Id, patch: EnumPatch): Schema {
  return {
    ...schema,
    enums: replaceById(schema.enums, enumId, 'enum', (en) => ({ ...en, ...patch })),
  };
}

/**
 * Remove an enum. Columns typed with it are left as they are; `validateSchema` reports them as
 * `enum-missing` until they are retyped.
 */
export function removeEnum(schema: Schema, enumId: Id): Schema {
  return { ...schema, enums: removeById(schema.enums, enumId, 'enum') };
}
