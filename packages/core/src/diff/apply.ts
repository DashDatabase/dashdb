import { createId } from '../ir/id';
import {
  IR_VERSION,
  type Column,
  type Id,
  type LogicalType,
  type Schema,
  type Table,
} from '../ir/types';
import { DEFAULT_NAMESPACE } from '../serializers/model';
import { SchemaView, qkey } from './defs';
import type {
  CheckDef,
  ColumnDef,
  EnumDef,
  ForeignKeyDef,
  IndexDef,
  KeyDef,
  Operation,
  QName,
  TypeRef,
  UniqueDef,
} from './types';

export class ApplyError extends Error {
  constructor(
    readonly index: number,
    readonly operation: Operation,
    reason: string,
  ) {
    super(`Operation ${index} (${operation.kind}) is invalid here: ${reason}`);
    this.name = 'ApplyError';
  }
}

interface WorkTable {
  namespace: string;
  name: string;
  columns: ColumnDef[];
  primaryKey: KeyDef | null;
  uniques: UniqueDef[];
  checks: CheckDef[];
  indexes: IndexDef[];
  foreignKeys: ForeignKeyDef[];
  comment: string | null;
  metadata: Record<string, string>;
}

interface Work {
  dialect: Schema['dialect'];
  namespaces: string[];
  enums: { namespace: string; name: string; values: string[] }[];
  tables: WorkTable[];
}

class Invalid extends Error {}
const fail = (reason: string): never => {
  throw new Invalid(reason);
};
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const sameSet = (x: readonly string[], y: readonly string[]) => same([...x].sort(), [...y].sort());

/**
 * Replay operations on a schema, checking that each one is valid where it stands: referenced
 * objects exist, names are free, nothing still depends on what is dropped, and every `from`
 * state matches the current state. Throws `ApplyError` naming the first invalid operation.
 * Used to prove that diff output is complete and correctly ordered, and to preview results.
 */
export function applyOperations(schema: Schema, ops: readonly Operation[]): Schema {
  const work = toWork(schema);
  // The dialect's default namespace always exists, listed or not.
  const always = DEFAULT_NAMESPACE[schema.dialect];
  if (!work.namespaces.includes(always)) work.namespaces.push(always);
  ops.forEach((op, index) => {
    try {
      applyOne(work, op);
    } catch (error) {
      if (error instanceof Invalid) throw new ApplyError(index, op, error.message);
      throw error;
    }
  });
  return toSchema(work, schema.dialect);
}

function toWork(schema: Schema): Work {
  const view = new SchemaView(schema);
  return {
    dialect: schema.dialect,
    namespaces: schema.namespaces.map((n) => n.name),
    enums: schema.enums.map((e) => ({ ...view.enumName(e.id), values: [...e.values] })),
    tables: schema.tables.map((t) => {
      const def = view.table(t, true);
      return {
        namespace: def.namespace,
        name: def.name,
        columns: [...def.columns],
        primaryKey: def.primaryKey,
        uniques: [...def.uniques],
        checks: [...def.checks],
        indexes: [...def.indexes],
        foreignKeys: t.foreignKeys.map((fk) => view.foreignKey(fk)),
        comment: def.comment,
        metadata: { ...def.metadata },
      };
    }),
  };
}

function findTable(work: Work, q: QName): WorkTable {
  return (
    work.tables.find((t) => t.namespace === q.namespace && t.name === q.name) ??
    fail(`no table ${qkey(q)}`)
  );
}

function findColumn(table: WorkTable, name: string): ColumnDef {
  return table.columns.find((c) => c.name === name) ?? fail(`no column ${table.name}.${name}`);
}

function findEnum(work: Work, q: QName): Work['enums'][number] {
  return (
    work.enums.find((e) => e.namespace === q.namespace && e.name === q.name) ??
    fail(`no enum ${qkey(q)}`)
  );
}

function requireType(work: Work, type: TypeRef): void {
  if (type.kind === 'enum') findEnum(work, type.enum);
}

function requireColumns(table: WorkTable, names: readonly string[]): void {
  for (const n of names) findColumn(table, n);
}

function requireNamespace(work: Work, namespace: string): void {
  if (!work.namespaces.includes(namespace)) fail(`no namespace ${namespace}`);
}

/** Column sets that can be referenced by a foreign key. */
function keysOf(table: WorkTable): string[][] {
  return [
    ...(table.primaryKey ? [[...table.primaryKey.columns]] : []),
    ...table.uniques.map((u) => [...u.columns]),
    ...table.indexes.filter((i) => i.unique && !i.where).map((i) => i.columns.map((c) => c.name)),
  ];
}

function inboundForeignKeys(work: Work, table: WorkTable): ForeignKeyDef[] {
  return work.tables.flatMap((t) =>
    t.foreignKeys.filter(
      (fk) => fk.refTable.namespace === table.namespace && fk.refTable.name === table.name,
    ),
  );
}

/** Refuse to remove a key that a foreign key needs, unless another key covers the same columns. */
function requireKeyNotNeeded(work: Work, table: WorkTable, columns: readonly string[]): void {
  const covered = keysOf(table).filter((k) => sameSet(k, columns)).length;
  if (covered > 1) return;
  if (inboundForeignKeys(work, table).some((fk) => sameSet(fk.refColumns, columns))) {
    fail(`a foreign key still references ${table.name}(${columns.join(', ')})`);
  }
}

function usesEnum(type: TypeRef, q: QName): boolean {
  return type.kind === 'enum' && qkey(type.enum) === qkey(q);
}

function applyOne(work: Work, op: Operation): void {
  switch (op.kind) {
    case 'createNamespace':
      if (work.namespaces.includes(op.name)) fail(`namespace ${op.name} exists`);
      work.namespaces.push(op.name);
      return;
    case 'dropNamespace':
      requireNamespace(work, op.name);
      if (op.name === DEFAULT_NAMESPACE[work.dialect])
        fail(`the default namespace ${op.name} cannot be dropped`);
      if (
        work.tables.some((t) => t.namespace === op.name) ||
        work.enums.some((e) => e.namespace === op.name)
      ) {
        fail(`namespace ${op.name} is not empty`);
      }
      work.namespaces = work.namespaces.filter((n) => n !== op.name);
      return;
    case 'createEnum':
      requireNamespace(work, op.enum.namespace);
      if (work.enums.some((e) => qkey(e) === qkey(op.enum))) fail(`enum ${qkey(op.enum)} exists`);
      work.enums.push({
        namespace: op.enum.namespace,
        name: op.enum.name,
        values: [...op.enum.values],
      });
      return;
    case 'dropEnum': {
      findEnum(work, op.enum);
      if (work.tables.some((t) => t.columns.some((c) => usesEnum(c.logicalType, op.enum)))) {
        fail(`enum ${qkey(op.enum)} is still used`);
      }
      work.enums = work.enums.filter((e) => qkey(e) !== qkey(op.enum));
      return;
    }
    case 'alterEnumAddValue':
    case 'recreateEnum': {
      const en = findEnum(work, op.enum);
      if (!same(en.values, op.from))
        fail(`enum ${qkey(op.enum)} has values ${en.values.join(',')}`);
      for (const target of op.columns) {
        if (
          !usesEnum(findColumn(findTable(work, target.table), target.column).logicalType, op.enum)
        ) {
          fail(`${target.column} does not use ${qkey(op.enum)}`);
        }
      }
      en.values = [...op.to];
      return;
    }
    case 'createTable': {
      requireNamespace(work, op.table.namespace);
      if (work.tables.some((t) => qkey(t) === qkey(op.table)))
        fail(`table ${qkey(op.table)} exists`);
      const table: WorkTable = {
        namespace: op.table.namespace,
        name: op.table.name,
        columns: [...op.table.columns],
        primaryKey: op.table.primaryKey,
        uniques: [...op.table.uniques],
        checks: [...op.table.checks],
        indexes: [...op.table.indexes],
        foreignKeys: [],
        comment: op.table.comment,
        metadata: { ...op.table.metadata },
      };
      for (const c of table.columns) requireType(work, c.logicalType);
      requireColumns(table, [
        ...(table.primaryKey?.columns ?? []),
        ...table.uniques.flatMap((u) => u.columns),
        ...table.indexes.flatMap((i) => i.columns.map((c) => c.name)),
      ]);
      work.tables.push(table);
      return;
    }
    case 'dropTable': {
      const table = findTable(work, op.table);
      if (table.foreignKeys.length) fail(`table ${qkey(op.table)} still has foreign keys`);
      if (inboundForeignKeys(work, table).length)
        fail(`table ${qkey(op.table)} is still referenced`);
      work.tables = work.tables.filter((t) => t !== table);
      return;
    }
    case 'renameTable': {
      const table = findTable(work, op.from);
      requireNamespace(work, op.to.namespace);
      if (work.tables.some((t) => qkey(t) === qkey(op.to))) fail(`table ${qkey(op.to)} exists`);
      for (const t of work.tables) {
        t.foreignKeys = t.foreignKeys.map((fk) =>
          qkey(fk.refTable) === qkey(op.from) ? { ...fk, refTable: op.to } : fk,
        );
      }
      table.namespace = op.to.namespace;
      table.name = op.to.name;
      return;
    }
    case 'addColumn': {
      const table = findTable(work, op.table);
      if (table.columns.some((c) => c.name === op.column.name))
        fail(`column ${op.column.name} exists`);
      requireType(work, op.column.logicalType);
      table.columns.push(op.column);
      return;
    }
    case 'dropColumn': {
      const table = findTable(work, op.table);
      const name = op.column.name;
      findColumn(table, name);
      const used =
        table.primaryKey?.columns.includes(name) === true ||
        table.uniques.some((u) => u.columns.includes(name)) ||
        table.indexes.some((i) => i.columns.some((c) => c.name === name)) ||
        // A column a foreign key references is part of a key, so the checks above cover it.
        table.foreignKeys.some((fk) => fk.columns.includes(name));
      if (used) fail(`column ${table.name}.${name} is still used by a key, index or foreign key`);
      table.columns = table.columns.filter((c) => c.name !== name);
      return;
    }
    case 'renameColumn': {
      const table = findTable(work, op.table);
      const column = findColumn(table, op.from);
      if (table.columns.some((c) => c.name === op.to)) fail(`column ${op.to} exists`);
      const rename = (n: string) => (n === op.from ? op.to : n);
      table.columns = table.columns.map((c) => (c === column ? { ...c, name: op.to } : c));
      if (table.primaryKey)
        table.primaryKey = { ...table.primaryKey, columns: table.primaryKey.columns.map(rename) };
      table.uniques = table.uniques.map((u) => ({ ...u, columns: u.columns.map(rename) }));
      table.indexes = table.indexes.map((i) => ({
        ...i,
        columns: i.columns.map((c) => ({ ...c, name: rename(c.name) })),
      }));
      table.foreignKeys = table.foreignKeys.map((fk) => ({
        ...fk,
        columns: fk.columns.map(rename),
      }));
      for (const t of work.tables) {
        t.foreignKeys = t.foreignKeys.map((fk) =>
          qkey(fk.refTable) === qkey(table) ? { ...fk, refColumns: fk.refColumns.map(rename) } : fk,
        );
      }
      return;
    }
    case 'alterColumnType':
    case 'alterColumnNullability':
    case 'alterColumnDefault':
      alterColumn(work, op);
      return;
    case 'addPrimaryKey': {
      const table = findTable(work, op.table);
      if (table.primaryKey) fail(`table ${table.name} already has a primary key`);
      requireColumns(table, op.primaryKey.columns);
      table.primaryKey = op.primaryKey;
      return;
    }
    case 'dropPrimaryKey': {
      const table = findTable(work, op.table);
      const pk = table.primaryKey ?? fail(`table ${table.name} has no primary key`);
      requireKeyNotNeeded(work, table, pk.columns);
      table.primaryKey = null;
      return;
    }
    case 'createIndex': {
      const table = findTable(work, op.table);
      if (table.indexes.some((i) => i.name === op.index.name))
        fail(`index ${op.index.name} exists`);
      requireColumns(
        table,
        op.index.columns.map((c) => c.name),
      );
      table.indexes.push(op.index);
      return;
    }
    case 'dropIndex': {
      const table = findTable(work, op.table);
      const index =
        table.indexes.find((i) => i.name === op.index.name) ?? fail(`no index ${op.index.name}`);
      if (index.unique)
        requireKeyNotNeeded(
          work,
          table,
          index.columns.map((c) => c.name),
        );
      table.indexes = table.indexes.filter((i) => i !== index);
      return;
    }
    case 'addUnique': {
      const table = findTable(work, op.table);
      if (table.uniques.some((u) => u.name === op.unique.name))
        fail(`unique ${op.unique.name} exists`);
      requireColumns(table, op.unique.columns);
      table.uniques.push(op.unique);
      return;
    }
    case 'dropUnique': {
      const table = findTable(work, op.table);
      const unique =
        table.uniques.find((u) => u.name === op.unique.name) ?? fail(`no unique ${op.unique.name}`);
      requireKeyNotNeeded(work, table, unique.columns);
      table.uniques = table.uniques.filter((u) => u !== unique);
      return;
    }
    case 'addForeignKey': {
      const table = findTable(work, op.table);
      if (table.foreignKeys.some((f) => f.name === op.foreignKey.name))
        fail(`foreign key ${op.foreignKey.name} exists`);
      requireColumns(table, op.foreignKey.columns);
      const target = findTable(work, op.foreignKey.refTable);
      requireColumns(target, op.foreignKey.refColumns);
      if (!keysOf(target).some((k) => sameSet(k, op.foreignKey.refColumns))) {
        fail(
          `${target.name}(${op.foreignKey.refColumns.join(', ')}) is not a primary or unique key`,
        );
      }
      table.foreignKeys.push(op.foreignKey);
      return;
    }
    case 'dropForeignKey': {
      const table = findTable(work, op.table);
      if (!table.foreignKeys.some((f) => f.name === op.foreignKey.name))
        fail(`no foreign key ${op.foreignKey.name}`);
      table.foreignKeys = table.foreignKeys.filter((f) => f.name !== op.foreignKey.name);
      return;
    }
    case 'addCheck': {
      const table = findTable(work, op.table);
      if (table.checks.some((c) => c.name === op.check.name)) fail(`check ${op.check.name} exists`);
      table.checks.push(op.check);
      return;
    }
    case 'dropCheck': {
      const table = findTable(work, op.table);
      if (!table.checks.some((c) => c.name === op.check.name)) fail(`no check ${op.check.name}`);
      table.checks = table.checks.filter((c) => c.name !== op.check.name);
      return;
    }
    case 'setComment': {
      const table = findTable(work, op.table);
      if (op.column === null) {
        if (table.comment !== op.from) fail('comment differs from the expected one');
        table.comment = op.to;
        return;
      }
      const column = findColumn(table, op.column);
      if (column.comment !== op.from) fail('comment differs from the expected one');
      table.columns = table.columns.map((c) => (c === column ? { ...c, comment: op.to } : c));
      return;
    }
  }
}

function alterColumn(
  work: Work,
  op: Extract<
    Operation,
    { kind: 'alterColumnType' | 'alterColumnNullability' | 'alterColumnDefault' }
  >,
): void {
  const table = findTable(work, op.table);
  const column = findColumn(table, op.column);
  let next: ColumnDef;
  if (op.kind === 'alterColumnType') {
    if (!same({ nativeType: column.nativeType, logicalType: column.logicalType }, op.from))
      fail('type differs from the expected one');
    requireType(work, op.to.logicalType);
    next = { ...column, nativeType: op.to.nativeType, logicalType: op.to.logicalType };
  } else if (op.kind === 'alterColumnNullability') {
    if (column.nullable !== op.from) fail('nullability differs from the expected one');
    next = { ...column, nullable: op.to };
  } else {
    const current = {
      default: column.default,
      autoIncrement: column.autoIncrement,
      identity: column.metadata.identity ?? null,
    };
    if (!same(current, op.from)) fail('default differs from the expected one');
    const metadata: Record<string, string> = { ...column.metadata };
    delete metadata.identity;
    next = {
      ...column,
      default: op.to.default,
      autoIncrement: op.to.autoIncrement,
      metadata: op.to.identity === null ? metadata : { ...metadata, identity: op.to.identity },
    };
  }
  table.columns = table.columns.map((c) => (c === column ? next : c));
}

function toSchema(work: Work, dialect: Schema['dialect']): Schema {
  const nsIds = new Map(work.namespaces.map((n) => [n, createId()]));
  const nsId = (n: string): Id => nsIds.get(n) as Id;
  const enumIds = new Map(work.enums.map((e) => [qkey(e), createId()]));
  const logical = (t: TypeRef): LogicalType =>
    t.kind === 'enum' ? { kind: 'enum', enumId: enumIds.get(qkey(t.enum)) as Id } : t;

  const columnIds = new Map<string, Map<string, Id>>();
  const tableIds = new Map<string, Id>();
  for (const t of work.tables) {
    tableIds.set(qkey(t), createId());
    columnIds.set(qkey(t), new Map(t.columns.map((c) => [c.name, createId()])));
  }
  const col = (t: QName, name: string): Id => columnIds.get(qkey(t))?.get(name) as Id;

  const tables: Table[] = work.tables.map((t) => ({
    id: tableIds.get(qkey(t)) as Id,
    name: t.name,
    namespace: nsId(t.namespace),
    columns: t.columns.map((c): Column => ({
      id: col(t, c.name),
      name: c.name,
      logicalType: logical(c.logicalType),
      nativeType: c.nativeType,
      nullable: c.nullable,
      default: c.default,
      autoIncrement: c.autoIncrement,
      comment: c.comment,
      metadata: c.metadata,
    })),
    primaryKey: t.primaryKey && {
      id: createId(),
      name: t.primaryKey.name,
      columns: t.primaryKey.columns.map((n) => col(t, n)),
    },
    indexes: t.indexes.map((i) => ({
      id: createId(),
      name: i.name,
      columns: i.columns.map((c) => ({ column: col(t, c.name), order: c.order, nulls: c.nulls })),
      unique: i.unique,
      method: i.method,
      where: i.where,
    })),
    uniques: t.uniques.map((u) => ({
      id: createId(),
      name: u.name,
      columns: u.columns.map((n) => col(t, n)),
    })),
    foreignKeys: t.foreignKeys.map((fk) => ({
      id: createId(),
      name: fk.name,
      columns: fk.columns.map((n) => col(t, n)),
      refTable: tableIds.get(qkey(fk.refTable)) as Id,
      refColumns: fk.refColumns.map((n) => col(fk.refTable, n)),
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
    })),
    checks: t.checks.map((c) => ({ id: createId(), name: c.name, expression: c.expression })),
    comment: t.comment,
    metadata: t.metadata,
  }));

  return {
    id: createId(),
    dialect,
    namespaces: work.namespaces.map((n) => ({ id: nsId(n), name: n })),
    tables,
    enums: work.enums.map((e: EnumDef) => ({
      id: enumIds.get(qkey(e)) as Id,
      name: e.name,
      namespace: nsId(e.namespace),
      values: e.values,
    })),
    version: IR_VERSION,
  };
}
