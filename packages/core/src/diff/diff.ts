import { validateSchema } from '../ir/schema';
import { DEFAULT_NAMESPACE } from '../serializers/model';
import type { Column, Enum, ForeignKey, Id, Index, Schema, Table } from '../ir/types';
import {
  SchemaView,
  compareStrings,
  nameSimilarity,
  normalizeNativeType,
  normalizeSql,
  qkey,
} from './defs';
import { orderOperations } from './order';
import type {
  ColumnState,
  ColumnTarget,
  DiffOptions,
  DiffResult,
  ForeignKeyDef,
  UniqueDef,
  DiffWarning,
  Operation,
  QName,
  RenameCandidate,
} from './types';

/** Every key MySQL can use as a foreign key's index: primary key, uniques and indexes. */
function keysOf(table: Table): (readonly Id[])[] {
  return [
    table.primaryKey?.columns ?? [],
    ...table.uniques.map((u) => u.columns),
    ...table.indexes.map((i) => i.columns.map((c) => c.column)),
  ];
}

/** Whether `key` starts with `columns` (so MySQL can use it for a foreign key on them). */
const covers = (key: readonly Id[], columns: readonly Id[]): boolean =>
  columns.every((c, i) => key[i] === c);

export class DiffError extends Error {
  constructor(
    message: string,
    readonly problems: readonly string[] = [],
  ) {
    super(message);
    this.name = 'DiffError';
  }
}

export const tableRenameKey = (from: QName, to: QName): string =>
  `table:${qkey(from)}=>${qkey(to)}`;
export const columnRenameKey = (
  fromTable: QName,
  from: string,
  toTable: QName,
  to: string,
): string => `column:${qkey(fromTable)}.${from}=>${qkey(toTable)}.${to}`;

/**
 * Compare two schemas of the same dialect and return the operations that turn `before` into
 * `after`, in an order that is valid to execute. Elements are matched by id, then by name;
 * likely renames among the rest are returned as candidates and only applied when listed in
 * `options.confirmedRenames`.
 */
export function diffSchemas(before: Schema, after: Schema, options: DiffOptions = {}): DiffResult {
  for (const [label, schema] of [
    ['before', before],
    ['after', after],
  ] as const) {
    const problems = validateSchema(schema).filter((p) => p.code !== 'duplicate-index-name');
    if (problems.length) {
      throw new DiffError(
        `The ${label} schema is not valid IR`,
        problems.map((p) => `${p.code}: ${p.message}`),
      );
    }
  }
  if (before.dialect !== after.dialect) {
    throw new DiffError(`Cannot diff a ${before.dialect} schema against a ${after.dialect} schema`);
  }
  return new Differ(before, after, options).run();
}

/** Match items by id, then by key among those left; returns before id → after id. */
function matchByIdThenKey<T extends { id: Id }>(
  before: readonly T[],
  after: readonly T[],
  key: (item: T, side: 'before' | 'after') => string,
  sameIdAllowed: (b: T, a: T) => boolean = () => true,
): Map<Id, Id> {
  const map = new Map<Id, Id>();
  const taken = new Set<Id>();
  const afterIds = new Map(after.map((a) => [a.id, a]));
  for (const b of before) {
    const a = afterIds.get(b.id);
    if (a && sameIdAllowed(b, a)) {
      map.set(b.id, a.id);
      taken.add(a.id);
    }
  }
  const byKey = new Map<string, T>();
  for (const a of after) if (!taken.has(a.id)) byKey.set(key(a, 'after'), a);
  for (const b of before) {
    if (map.has(b.id)) continue;
    const a = byKey.get(key(b, 'before'));
    if (a && !taken.has(a.id)) {
      map.set(b.id, a.id);
      taken.add(a.id);
    }
  }
  return map;
}

class Differ {
  private readonly b: SchemaView;
  private readonly a: SchemaView;
  private readonly ops: Operation[] = [];
  private readonly warnings: DiffWarning[] = [];
  private readonly candidates: RenameCandidate[] = [];
  private readonly confirmed: Set<string>;
  private readonly usedKeys = new Set<string>();
  private readonly threshold: number;
  private readonly tableMap = new Map<Id, Id>();
  private readonly columnMaps = new Map<Id, Map<Id, Id>>();
  private readonly enumMap = new Map<Id, Id>();
  private enumsMatched = false;

  constructor(
    private readonly before: Schema,
    private readonly after: Schema,
    options: DiffOptions,
  ) {
    this.b = new SchemaView(before);
    this.a = new SchemaView(after);
    this.confirmed = new Set(options.confirmedRenames ?? []);
    this.threshold = options.renameThreshold ?? 0.6;
  }

  run(): DiffResult {
    this.matchTables();
    for (const [bId, aId] of this.tableMap)
      this.matchColumns(this.b.model.table(bId), this.a.model.table(aId));
    for (const key of this.confirmed) {
      if (!this.usedKeys.has(key))
        this.warn('invalid-rename', `Rename "${key}" does not match an unmatched pair; ignored`);
    }
    this.matchEnums();
    this.enumsMatched = true;

    this.diffNamespaces();
    this.diffEnums();
    this.diffTables();

    const sortCandidates = [...this.candidates].sort(
      (x, y) => y.score - x.score || compareStrings(x.key, y.key),
    );
    return {
      operations: orderOperations(this.ops),
      renameCandidates: sortCandidates,
      warnings: this.warnings,
    };
  }

  private warn(code: DiffWarning['code'], message: string): void {
    this.warnings.push({ code, message });
  }

  // -------------------------------------------------------------------------------------------
  // Matching
  // -------------------------------------------------------------------------------------------

  private matchTables(): void {
    const key = (t: Table, side: 'before' | 'after') =>
      qkey((side === 'before' ? this.b : this.a).tableName(t));
    for (const [bId, aId] of matchByIdThenKey(this.before.tables, this.after.tables, key))
      this.tableMap.set(bId, aId);

    const matchedAfter = new Set(this.tableMap.values());
    const unmatchedBefore = this.before.tables.filter((t) => !this.tableMap.has(t.id));
    const unmatchedAfter = this.after.tables.filter((t) => !matchedAfter.has(t.id));

    const scored: { b: Table; a: Table; candidate: RenameCandidate }[] = [];
    for (const b of unmatchedBefore) {
      for (const a of unmatchedAfter) {
        const from = this.b.tableName(b);
        const to = this.a.tableName(a);
        const similarity = nameSimilarity(b.name, a.name);
        const samePosition = this.before.tables.indexOf(b) === this.after.tables.indexOf(a);
        const sharedColumns = this.sharedColumns(b, a) >= 0.5;
        if (similarity < this.threshold || !(samePosition || sharedColumns)) continue;
        scored.push({
          b,
          a,
          candidate: candidate(
            'table',
            tableRenameKey(from, to),
            from,
            to,
            similarity,
            samePosition,
            sharedColumns,
            'shared-columns',
          ),
        });
      }
    }
    this.candidates.push(...greedy(scored));

    // Confirmed renames: any unmatched pair whose key the caller listed, applied in key order
    // so conflicts resolve the same way whatever the input order.
    const pairs = unmatchedBefore.flatMap((b) =>
      unmatchedAfter.map((a) => ({
        b,
        a,
        key: tableRenameKey(this.b.tableName(b), this.a.tableName(a)),
      })),
    );
    this.applyConfirmed(pairs, this.tableMap);
  }

  /** Share of columns present in both tables with the same name and type. */
  private sharedColumns(b: Table, a: Table): number {
    const longest = Math.max(b.columns.length, a.columns.length);
    if (longest === 0) return 1;
    const shared = b.columns.filter((bc) =>
      a.columns.some((ac) => ac.name === bc.name && this.sameType(bc, ac)),
    ).length;
    return shared / longest;
  }

  private matchColumns(bt: Table, at: Table): void {
    const map = new Map<Id, Id>();
    this.columnMaps.set(bt.id, map);
    for (const [bId, aId] of matchByIdThenKey(bt.columns, at.columns, (c) => c.name))
      map.set(bId, aId);

    const matchedAfter = new Set(map.values());
    const unmatchedBefore = bt.columns.filter((c) => !map.has(c.id));
    const unmatchedAfter = at.columns.filter((c) => !matchedAfter.has(c.id));
    const fromTable = this.b.tableName(bt);
    const toTable = this.a.tableName(at);

    const scored: { b: Column; a: Column; candidate: RenameCandidate }[] = [];
    for (const b of unmatchedBefore) {
      for (const a of unmatchedAfter) {
        const similarity = nameSimilarity(b.name, a.name);
        if (!this.sameType(b, a) || similarity < this.threshold) continue;
        const samePosition = bt.columns.indexOf(b) === at.columns.indexOf(a);
        const sameConstraints = this.constraintSignature(bt, b) === this.constraintSignature(at, a);
        if (!samePosition && !sameConstraints) continue;
        const key = columnRenameKey(fromTable, b.name, toTable, a.name);
        scored.push({
          b,
          a,
          candidate: candidate(
            'column',
            key,
            { ...fromTable, column: b.name },
            { ...toTable, column: a.name },
            similarity,
            samePosition,
            sameConstraints,
            'same-constraints',
          ),
        });
      }
    }
    this.candidates.push(...greedy(scored));

    const pairs = unmatchedBefore.flatMap((b) =>
      unmatchedAfter.map((a) => ({
        b,
        a,
        key: columnRenameKey(fromTable, b.name, toTable, a.name),
      })),
    );
    this.applyConfirmed(pairs, map);
  }

  /** Add confirmed pairs to `map` in key order; a pair whose side is already taken is a conflict. */
  private applyConfirmed(
    pairs: { b: { id: Id }; a: { id: Id }; key: string }[],
    map: Map<Id, Id>,
  ): void {
    const takenAfter = new Set<Id>();
    const confirmed = pairs
      .filter((p) => this.confirmed.has(p.key))
      .sort((x, y) => compareStrings(x.key, y.key));
    for (const { b, a, key } of confirmed) {
      this.usedKeys.add(key);
      if (map.has(b.id) || takenAfter.has(a.id)) {
        this.warn(
          'invalid-rename',
          `Rename "${key}" conflicts with another confirmed rename; ignored`,
        );
        continue;
      }
      map.set(b.id, a.id);
      takenAfter.add(a.id);
    }
  }

  /** Nullability, default, and membership in PK / unique / index / FK. */
  private constraintSignature(table: Table, column: Column): string {
    const inKey = (ids: readonly Id[]) => ids.includes(column.id);
    return JSON.stringify([
      column.nullable,
      this.defaultKey(column),
      table.primaryKey ? inKey(table.primaryKey.columns) : false,
      table.uniques.some((u) => inKey(u.columns)),
      table.indexes.some((i) => i.columns.some((c) => c.column === column.id)),
      table.foreignKeys.some((f) => inKey(f.columns)),
    ]);
  }

  private matchEnums(): void {
    if (this.before.dialect === 'mysql') {
      // MySQL enums are per column (named `<table>_<column>`): they follow their column.
      for (const [bt, columns] of this.columnMaps) {
        const table = this.b.model.table(bt);
        const afterTable = this.a.model.table(this.tableMap.get(bt) as Id);
        for (const [bc, ac] of columns) {
          const bType = table.columns.find((c) => c.id === bc)?.logicalType;
          const aType = afterTable.columns.find((c) => c.id === ac)?.logicalType;
          if (bType?.kind === 'enum' && aType?.kind === 'enum' && !this.enumMap.has(bType.enumId)) {
            this.enumMap.set(bType.enumId, aType.enumId);
          }
        }
      }
      return;
    }
    // Enums have no rename operation, so an enum renamed by id is a different enum.
    const key = (e: Enum, side: 'before' | 'after') =>
      qkey(side === 'before' ? this.b.enumName(e.id) : this.a.enumName(e.id));
    const sameName = (b: Enum, a: Enum) =>
      qkey(this.b.enumName(b.id)) === qkey(this.a.enumName(a.id));
    for (const [bId, aId] of matchByIdThenKey(this.before.enums, this.after.enums, key, sameName))
      this.enumMap.set(bId, aId);
  }

  // -------------------------------------------------------------------------------------------
  // Comparisons
  // -------------------------------------------------------------------------------------------

  private sameType(b: Column, a: Column): boolean {
    const bt = b.logicalType;
    const at = a.logicalType;
    if (bt.kind === 'enum' || at.kind === 'enum') {
      if (bt.kind !== 'enum' || at.kind !== 'enum') return false;
      const mapped = this.enumMap.get(bt.enumId);
      if (mapped !== undefined) return mapped === at.enumId;
      // While columns are still being matched (MySQL enums follow their columns), equal values
      // count as the same type; once enums are matched, an unmatched enum is a different type.
      return (
        !this.enumsMatched &&
        JSON.stringify(this.b.model.enum(bt.enumId).values) ===
          JSON.stringify(this.a.model.enum(at.enumId).values)
      );
    }
    const dialect = this.before.dialect;
    return (
      normalizeNativeType(dialect, b.nativeType) === normalizeNativeType(dialect, a.nativeType)
    );
  }

  private defaultKey(column: Column): string {
    const def = column.default;
    if (def?.kind !== 'expression') return JSON.stringify(def);
    const sql = normalizeSql(def.sql).toLowerCase();
    return JSON.stringify({ kind: 'expression', sql: sql === 'now()' ? 'current_timestamp' : sql });
  }

  private state(column: Column): ColumnState {
    return {
      default: column.default,
      autoIncrement: column.autoIncrement,
      identity: column.metadata.identity ?? null,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Namespaces & enums
  // -------------------------------------------------------------------------------------------

  /** The dialect's default namespace always exists, whether or not a schema lists it. */
  private diffNamespaces(): void {
    const always = DEFAULT_NAMESPACE[this.before.dialect];
    const before = new Set(this.before.namespaces.map((n) => n.name).filter((n) => n !== always));
    const after = new Set(this.after.namespaces.map((n) => n.name).filter((n) => n !== always));
    for (const name of after)
      if (!before.has(name)) this.ops.push({ kind: 'createNamespace', name });
    for (const name of before) if (!after.has(name)) this.ops.push({ kind: 'dropNamespace', name });
  }

  /** After-side columns of kept tables that already used the enum before. */
  private enumColumns(afterEnumId: Id): ColumnTarget[] {
    const targets: ColumnTarget[] = [];
    for (const [bt, at] of this.tableMap) {
      const beforeTable = this.b.model.table(bt);
      const afterTable = this.a.model.table(at);
      // after column id → before column, for the columns that existed before.
      const kept = new Map(
        [...(this.columnMaps.get(bt) as Map<Id, Id>)].map(([b, a]) => [
          a,
          beforeTable.columns.find((c) => c.id === b) as Column,
        ]),
      );
      for (const c of afterTable.columns) {
        const before = kept.get(c.id);
        if (c.logicalType.kind === 'enum' && c.logicalType.enumId === afterEnumId && before) {
          targets.push({
            table: this.a.tableName(afterTable),
            column: c.name,
            before: this.b.column(before),
            after: this.a.column(c),
          });
        }
      }
    }
    return targets.sort((x, y) =>
      compareStrings(`${qkey(x.table)}.${x.column}`, `${qkey(y.table)}.${y.column}`),
    );
  }

  private diffEnums(): void {
    const matchedAfter = new Set(this.enumMap.values());
    for (const en of this.before.enums) {
      if (!this.enumMap.has(en.id))
        this.ops.push({ kind: 'dropEnum', enum: { ...this.b.enumName(en.id), values: en.values } });
    }
    for (const en of this.after.enums) {
      if (!matchedAfter.has(en.id))
        this.ops.push({
          kind: 'createEnum',
          enum: { ...this.a.enumName(en.id), values: en.values },
        });
    }
    for (const [bId, aId] of this.enumMap) {
      const from = this.b.model.enum(bId).values;
      const to = this.a.model.enum(aId).values;
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      const name = this.a.enumName(aId);
      const columns = this.enumColumns(aId);
      if (isSubsequence(from, to)) {
        // Add each new value in order; `before` anchors it to the next value that already exists.
        let current = [...from];
        to.forEach((value, i) => {
          if (current.includes(value)) return;
          const anchor = to.slice(i + 1).find((v) => current.includes(v)) ?? null;
          const next = anchor === null ? [...current, value] : insertBefore(current, anchor, value);
          this.ops.push({
            kind: 'alterEnumAddValue',
            enum: name,
            value,
            before: anchor,
            from: current,
            to: next,
            columns,
          });
          current = next;
        });
      } else {
        const removed = from.filter((v) => !to.includes(v));
        if (removed.length) {
          this.warn(
            'data-loss',
            `Enum ${qkey(name)} loses values ${removed.join(', ')}; rows using them must be converted`,
          );
        }
        this.ops.push({ kind: 'recreateEnum', enum: name, from, to, columns });
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------------------------

  private diffTables(): void {
    const matchedAfter = new Set(this.tableMap.values());
    for (const t of this.before.tables) {
      if (this.tableMap.has(t.id)) continue;
      const def = this.b.table(t, true);
      this.warn('data-loss', `Table ${qkey(def)} is dropped`);
      this.ops.push({ kind: 'dropTable', table: def });
      for (const fk of t.foreignKeys) {
        this.ops.push({
          kind: 'dropForeignKey',
          table: this.b.tableName(t),
          foreignKey: this.b.foreignKey(fk),
        });
      }
    }
    for (const t of this.after.tables) {
      if (matchedAfter.has(t.id)) continue;
      const name = this.a.tableName(t);
      this.ops.push({ kind: 'createTable', table: this.a.table(t, false) });
      for (const index of t.indexes)
        this.ops.push({ kind: 'createIndex', table: name, index: this.a.index(index) });
      for (const fk of t.foreignKeys)
        this.ops.push({ kind: 'addForeignKey', table: name, ...this.fkOp(this.a, t, fk) });
    }

    // Keys that FKs may reference and that this diff drops, and columns whose type changes:
    // foreign keys touching either must be dropped and re-added around the change.
    const droppedKeys = new Set<string>();
    const retyped = new Set<Id>();
    for (const [bId, aId] of this.tableMap) {
      this.diffTable(this.b.model.table(bId), this.a.model.table(aId), droppedKeys, retyped);
    }
    for (const [bId, aId] of this.tableMap) {
      this.diffForeignKeys(this.b.model.table(bId), this.a.model.table(aId), droppedKeys, retyped);
    }
  }

  private mapColumn(table: Table, id: Id): Id | undefined {
    return this.columnMaps.get(table.id)?.get(id);
  }

  private mapColumns(table: Table, ids: readonly Id[]): string {
    return JSON.stringify(ids.map((id) => this.mapColumn(table, id) ?? `?${id}`));
  }

  private diffTable(bt: Table, at: Table, droppedKeys: Set<string>, retyped: Set<Id>): void {
    const from = this.b.tableName(bt);
    const to = this.a.tableName(at);
    if (qkey(from) !== qkey(to)) this.ops.push({ kind: 'renameTable', from, to });
    const columnMap = this.columnMaps.get(bt.id) as Map<Id, Id>;
    const keptAfter = new Set(columnMap.values());

    for (const c of bt.columns) {
      if (columnMap.has(c.id)) continue;
      this.warn('data-loss', `Column ${qkey(from)}.${c.name} is dropped`);
      this.ops.push({ kind: 'dropColumn', table: from, column: this.b.column(c) });
    }
    for (const c of at.columns) {
      if (keptAfter.has(c.id)) continue;
      if (!c.nullable && c.default === null && !c.autoIncrement) {
        this.warn(
          'may-fail',
          `Column ${qkey(to)}.${c.name} is NOT NULL without a default; fails if the table has rows`,
        );
      }
      this.ops.push({ kind: 'addColumn', table: to, column: this.a.column(c) });
    }
    for (const [bId, aId] of columnMap) {
      const bc = bt.columns.find((c) => c.id === bId) as Column;
      const ac = at.columns.find((c) => c.id === aId) as Column;
      const definition = { before: this.b.column(bc), after: this.a.column(ac) };
      if (bc.name !== ac.name)
        this.ops.push({ kind: 'renameColumn', table: to, from: bc.name, to: ac.name, definition });
      if (!this.sameType(bc, ac)) {
        retyped.add(bc.id);
        this.ops.push({
          kind: 'alterColumnType',
          table: to,
          column: ac.name,
          from: { nativeType: bc.nativeType, logicalType: this.b.typeRef(bc.logicalType) },
          to: { nativeType: ac.nativeType, logicalType: this.a.typeRef(ac.logicalType) },
          definition,
        });
      }
      const fromState = this.state(bc);
      const toState = this.state(ac);
      if (
        this.defaultKey(bc) !== this.defaultKey(ac) ||
        fromState.autoIncrement !== toState.autoIncrement ||
        fromState.identity !== toState.identity
      ) {
        this.ops.push({
          kind: 'alterColumnDefault',
          table: to,
          column: ac.name,
          from: fromState,
          to: toState,
          definition,
        });
      }
      if (bc.nullable !== ac.nullable) {
        if (!ac.nullable)
          this.warn(
            'may-fail',
            `Column ${qkey(to)}.${ac.name} becomes NOT NULL; fails if it holds NULLs`,
          );
        this.ops.push({
          kind: 'alterColumnNullability',
          table: to,
          column: ac.name,
          from: bc.nullable,
          to: ac.nullable,
          definition,
        });
      }
      if (bc.comment !== ac.comment) {
        this.ops.push({
          kind: 'setComment',
          table: to,
          column: ac.name,
          from: bc.comment,
          to: ac.comment,
          definition,
        });
      }
    }
    if (bt.comment !== at.comment)
      this.ops.push({
        kind: 'setComment',
        table: to,
        column: null,
        from: bt.comment,
        to: at.comment,
        definition: null,
      });

    // Primary key: an unnamed key matches any name.
    const bpk = bt.primaryKey;
    const apk = at.primaryKey;
    const samePk =
      bpk !== null &&
      apk !== null &&
      this.mapColumns(bt, bpk.columns) === JSON.stringify(apk.columns) &&
      (bpk.name === null || apk.name === null || bpk.name === apk.name);
    if (!samePk) {
      if (bpk) {
        droppedKeys.add(this.keyOf(bt, bpk.columns));
        this.ops.push({
          kind: 'dropPrimaryKey',
          table: from,
          primaryKey: { name: bpk.name, columns: this.b.names(bpk.columns) },
        });
      }
      if (apk)
        this.ops.push({
          kind: 'addPrimaryKey',
          table: to,
          primaryKey: { name: apk.name, columns: this.a.names(apk.columns) },
        });
    }

    this.diffElements(
      bt.uniques,
      at.uniques,
      (b, a) => this.mapColumns(bt, b.columns) === JSON.stringify(a.columns),
      {
        drop: (u) => {
          droppedKeys.add(this.keyOf(bt, u.columns));
          this.ops.push({
            kind: 'dropUnique',
            table: from,
            unique: { name: u.name, columns: this.b.names(u.columns) },
            ...this.soleCover(bt, at, u.columns, 'drop'),
          });
        },
        add: (u) =>
          this.ops.push({
            kind: 'addUnique',
            table: to,
            unique: { name: u.name, columns: this.a.names(u.columns) },
            ...this.soleCover(bt, at, u.columns, 'add'),
          }),
      },
    );
    this.diffElements(
      bt.checks,
      at.checks,
      (b, a) => normalizeSql(b.expression) === normalizeSql(a.expression),
      {
        drop: (c) =>
          this.ops.push({
            kind: 'dropCheck',
            table: from,
            check: { name: c.name, expression: c.expression },
          }),
        add: (c) =>
          this.ops.push({
            kind: 'addCheck',
            table: to,
            check: { name: c.name, expression: c.expression },
          }),
      },
    );
    this.diffElements(bt.indexes, at.indexes, (b, a) => this.sameIndex(bt, b, a), {
      drop: (i) => {
        if (i.unique)
          droppedKeys.add(
            this.keyOf(
              bt,
              i.columns.map((c) => c.column),
            ),
          );
        this.ops.push({
          kind: 'dropIndex',
          table: from,
          index: this.b.index(i),
          ...this.soleCover(
            bt,
            at,
            i.columns.map((c) => c.column),
            'drop',
          ),
        });
      },
      add: (i) =>
        this.ops.push({
          kind: 'createIndex',
          table: to,
          index: this.a.index(i),
          ...this.soleCover(
            bt,
            at,
            i.columns.map((c) => c.column),
            'add',
          ),
        }),
    });
  }

  private keyOf(table: Table, columns: readonly Id[]): string {
    return `${table.id}|${[...columns].sort().join(',')}`;
  }

  private sameIndex(bt: Table, b: Index, a: Index): boolean {
    const method = (m: string | null) => m ?? 'btree';
    return (
      JSON.stringify(
        b.columns.map((c) => [this.mapColumn(bt, c.column) ?? '?', c.order, c.nulls]),
      ) === JSON.stringify(a.columns.map((c) => [c.column, c.order, c.nulls])) &&
      b.unique === a.unique &&
      method(b.method) === method(a.method) &&
      normalizeSql(b.where ?? '') === normalizeSql(a.where ?? '')
    );
  }

  /** Match by id, then by name; unmatched or changed elements are dropped and re-added. */
  private diffElements<T extends { id: Id; name: string }>(
    before: readonly T[],
    after: readonly T[],
    same: (b: T, a: T) => boolean,
    handlers: { drop: (b: T) => void; add: (a: T) => void },
  ): void {
    const map = matchByIdThenKey(before, after, (x) => x.name);
    const kept = new Set<Id>();
    for (const b of before) {
      const aId = map.get(b.id);
      const a = after.find((x) => x.id === aId);
      if (a && a.name === b.name && same(b, a)) kept.add(a.id);
      else handlers.drop(b);
    }
    for (const a of after) if (!kept.has(a.id)) handlers.add(a);
  }

  /** The foreign key's definition, flagged when MySQL backs it with an implicit index. */
  private fkOp(
    view: SchemaView,
    table: Table,
    fk: ForeignKey,
  ): { foreignKey: ForeignKeyDef; implicitIndex?: true } {
    const foreignKey = view.foreignKey(fk);
    if (this.before.dialect !== 'mysql') return { foreignKey };
    const covered = keysOf(table).some((key) => covers(key, fk.columns));
    return covered ? { foreignKey } : { foreignKey, implicitIndex: true };
  }

  /**
   * MySQL: the foreign keys (present before and after) that the added or dropped key is the
   * only explicit index for, on the side where it is missing. `columns` are the key's column
   * ids in `bt` for a drop and in `at` for an add.
   */
  private soleCover(
    bt: Table,
    at: Table,
    columns: readonly Id[],
    side: 'add' | 'drop',
  ): { implicitIndexes?: UniqueDef[] } {
    if (this.before.dialect !== 'mysql') return {};
    const [here, there, view] = side === 'drop' ? [bt, at, this.b] : [at, bt, this.a];
    const found = here.foreignKeys.flatMap((fk) => {
      const other = there.foreignKeys.find((o) => o.name === fk.name);
      if (!other || !covers(columns, fk.columns)) return [];
      return keysOf(there).some((key) => covers(key, other.columns))
        ? []
        : [{ name: fk.name, columns: view.names(fk.columns) }];
    });
    return found.length ? { implicitIndexes: found } : {};
  }

  private diffForeignKeys(bt: Table, at: Table, droppedKeys: Set<string>, retyped: Set<Id>): void {
    const from = this.b.tableName(bt);
    const to = this.a.tableName(at);
    const same = (b: ForeignKey, a: ForeignKey): boolean => {
      const target = this.tableMap.get(b.refTable);
      const refTable = this.b.model.table(b.refTable);
      const touched =
        droppedKeys.has(this.keyOf(refTable, b.refColumns)) ||
        b.columns.some((c) => retyped.has(c)) ||
        b.refColumns.some((c) => retyped.has(c));
      return (
        !touched &&
        target === a.refTable &&
        this.mapColumns(bt, b.columns) === JSON.stringify(a.columns) &&
        this.mapColumns(refTable, b.refColumns) === JSON.stringify(a.refColumns) &&
        b.onDelete === a.onDelete &&
        b.onUpdate === a.onUpdate
      );
    };
    this.diffElements(bt.foreignKeys, at.foreignKeys, same, {
      drop: (fk) =>
        this.ops.push({ kind: 'dropForeignKey', table: from, ...this.fkOp(this.b, bt, fk) }),
      add: (fk) =>
        this.ops.push({ kind: 'addForeignKey', table: to, ...this.fkOp(this.a, at, fk) }),
    });
  }
}

function candidate(
  kind: 'table' | 'column',
  key: string,
  from: RenameCandidate['from'],
  to: RenameCandidate['to'],
  similarity: number,
  samePosition: boolean,
  structural: boolean,
  structuralReason: string,
): RenameCandidate {
  const reasons = [`similar-name ${similarity.toFixed(2)}`];
  if (samePosition) reasons.push('same-position');
  if (structural) reasons.push(structuralReason);
  const score =
    Math.round((similarity + (samePosition ? 0.1 : 0) + (structural ? 0.1 : 0)) * 1000) / 1000;
  return { kind, key, from, to, score, reasons };
}

/** One-to-one assignment, best score first (ties by key). */
function greedy(
  scored: readonly { b: { id: Id }; a: { id: Id }; candidate: RenameCandidate }[],
): RenameCandidate[] {
  const out: RenameCandidate[] = [];
  const usedB = new Set<Id>();
  const usedA = new Set<Id>();
  const sorted = [...scored].sort(
    (x, y) =>
      y.candidate.score - x.candidate.score || compareStrings(x.candidate.key, y.candidate.key),
  );
  for (const s of sorted) {
    if (usedB.has(s.b.id) || usedA.has(s.a.id)) continue;
    usedB.add(s.b.id);
    usedA.add(s.a.id);
    out.push(s.candidate);
  }
  return out;
}

function isSubsequence(sub: readonly string[], full: readonly string[]): boolean {
  let i = 0;
  for (const v of full) if (v === sub[i]) i++;
  return i === sub.length;
}

function insertBefore(values: readonly string[], anchor: string, value: string): string[] {
  const at = values.indexOf(anchor);
  return [...values.slice(0, at), value, ...values.slice(at)];
}
