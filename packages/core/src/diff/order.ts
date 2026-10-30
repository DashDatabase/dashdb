import { compareStrings, qkey } from './defs';
import type { ColumnDefs, Operation, OperationKind, QName } from './types';

/*
 * Ordering is a topological sort over a fixed dependency graph between operation kinds,
 * linearized into ranks: every edge points from a lower rank to a higher one.
 *
 *   createNamespace  → everything that places objects in it (renames into it included)
 *   dropForeignKey   → dropIndex/dropUnique/dropPrimaryKey it depends on → dropColumn → dropTable
 *   drops            → renames (a dropped name may be reused by a rename)
 *   renames          → createEnum/createTable/addColumn/alter* (which use after-names)
 *   createEnum, enum value changes → createTable/addColumn/alterColumnType that use the enum
 *   alterColumnType  → dropEnum (no column may still use it)
 *   createTable/addColumn → addPrimaryKey/addUnique/addCheck/createIndex → addForeignKey
 *   dropTable/rename out → dropNamespace
 *
 * Within a rank operations are sorted by a stable key; renames are additionally sequenced so
 * that a name is free before it is taken, using a temporary name to break cycles (a↔b).
 */

const RANK: Record<OperationKind, number> = {
  createNamespace: 5,
  dropForeignKey: 10,
  dropIndex: 11,
  dropUnique: 12,
  dropCheck: 13,
  dropPrimaryKey: 14,
  dropColumn: 20,
  dropTable: 21,
  renameTable: 30,
  renameColumn: 31,
  createEnum: 41,
  alterEnumAddValue: 42,
  recreateEnum: 43,
  createTable: 50,
  addColumn: 51,
  alterColumnType: 52,
  alterColumnDefault: 53,
  alterColumnNullability: 54,
  dropEnum: 60,
  addPrimaryKey: 70,
  addUnique: 71,
  addCheck: 72,
  createIndex: 73,
  addForeignKey: 80,
  setComment: 90,
  dropNamespace: 91,
};

/** Prefix for temporary names used to break rename cycles. */
export const TEMP_PREFIX = '__dashdb_tmp_';

type Sortable = Exclude<Operation, { kind: 'renameTable' | 'renameColumn' }>;

/** Renames are sequenced separately (see sequenceRenames), so they never need a sort key. */
function sortKey(op: Sortable): string {
  const pad = (n: number) => String(n).padStart(6, '0');
  switch (op.kind) {
    case 'createNamespace':
    case 'dropNamespace':
      return op.name;
    case 'createEnum':
    case 'dropEnum':
      return qkey(op.enum);
    case 'alterEnumAddValue':
      return `${qkey(op.enum)}#${pad(op.to.indexOf(op.value))}`;
    case 'recreateEnum':
      return qkey(op.enum);
    case 'createTable':
    case 'dropTable':
      return qkey(op.table);
    case 'addColumn':
    case 'dropColumn':
      return `${qkey(op.table)}.${op.column.name}`;
    case 'alterColumnType':
    case 'alterColumnNullability':
    case 'alterColumnDefault':
      return `${qkey(op.table)}.${op.column}`;
    case 'addPrimaryKey':
    case 'dropPrimaryKey':
      return qkey(op.table);
    case 'createIndex':
    case 'dropIndex':
      return `${qkey(op.table)}.${op.index.name}`;
    case 'addUnique':
    case 'dropUnique':
      return `${qkey(op.table)}.${op.unique.name}`;
    case 'addForeignKey':
    case 'dropForeignKey':
      return `${qkey(op.table)}.${op.foreignKey.name}`;
    case 'addCheck':
    case 'dropCheck':
      return `${qkey(op.table)}.${op.check.name}`;
    case 'setComment':
      return `${qkey(op.table)}.${op.column ?? ''}`;
  }
}

export interface Rename<T> {
  from: T;
  to: T;
  /** Carried along unchanged (renameColumn definitions). */
  definition?: ColumnDefs;
}

/**
 * Renames are a simultaneous mapping (a→b and b→a is a swap). The only chains composed are
 * those through temporary names (a→tmp, tmp→b becomes a→b), so an already-sequenced list
 * can be passed back in and yields its net effect.
 */
export function netRenames<T>(
  renames: readonly Rename<T>[],
  key: (t: T) => string,
  isTemp: (t: T) => boolean,
): Rename<T>[] {
  const result: Rename<T>[] = [];
  for (const r of renames) {
    const previous = isTemp(r.from) ? result.find((p) => key(p.to) === key(r.from)) : undefined;
    if (previous) previous.to = r.to;
    else result.push({ ...r });
  }
  return result.filter((r) => key(r.from) !== key(r.to));
}

export const isTempTable = (q: QName): boolean => q.name.startsWith(TEMP_PREFIX);
export const isTempColumn = (name: string): boolean => name.startsWith(TEMP_PREFIX);

/** Sequence renames so every target name is free when taken; break cycles with temp names. */
function sequenceRenames<T>(
  renames: Rename<T>[],
  key: (t: T) => string,
  temp: (t: T, n: number) => T,
): Rename<T>[] {
  const pending = [...renames].sort((a, b) => compareStrings(key(a.from), key(b.from)));
  const out: Rename<T>[] = [];
  let tempCount = 0;
  while (pending.length) {
    const ready = pending.findIndex(
      (r) => !pending.some((o) => o !== r && key(o.from) === key(r.to)),
    );
    if (ready !== -1) {
      out.push(...pending.splice(ready, 1));
      continue;
    }
    // Every target is still taken: we are in a cycle. Park the first one under a temp name.
    const first = pending[0] as Rename<T>;
    const parked = temp(first.from, ++tempCount);
    out.push({
      from: first.from,
      to: parked,
      ...(first.definition ? { definition: first.definition } : {}),
    });
    first.from = parked;
  }
  return out;
}

/** Order operations so that each one is valid when it runs (see the graph above). */
export function orderOperations(ops: readonly Operation[]): Operation[] {
  const sorted = ops
    .filter((op): op is Sortable => op.kind !== 'renameTable' && op.kind !== 'renameColumn')
    .map((op, i) => ({ op, i, rank: RANK[op.kind], key: sortKey(op) }))
    .sort((a, b) => a.rank - b.rank || compareStrings(a.key, b.key) || a.i - b.i)
    .map((x) => x.op);

  const tableRenames = netRenames(
    ops.flatMap((op) => (op.kind === 'renameTable' ? [{ from: op.from, to: op.to }] : [])),
    qkey,
    isTempTable,
  );
  const tableOps: Operation[] = sequenceRenames(tableRenames, qkey, (t, n) => ({
    namespace: t.namespace,
    name: `${TEMP_PREFIX}${n}`,
  })).map((r) => ({ kind: 'renameTable', from: r.from, to: r.to }));

  const byTable = new Map<string, { table: QName; renames: Rename<string>[] }>();
  for (const op of ops) {
    if (op.kind !== 'renameColumn') continue;
    const entry = byTable.get(qkey(op.table)) ?? { table: op.table, renames: [] };
    entry.renames.push({
      from: op.from,
      to: op.to,
      ...(op.definition ? { definition: op.definition } : {}),
    });
    byTable.set(qkey(op.table), entry);
  }
  const columnOps: Operation[] = [...byTable.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .flatMap(([, { table, renames }]) =>
      sequenceRenames(
        netRenames(renames, String, isTempColumn),
        String,
        (_c, n) => `${TEMP_PREFIX}${n}`,
      ).map((r): Operation => ({
        kind: 'renameColumn',
        table,
        from: r.from,
        to: r.to,
        ...(r.definition ? { definition: r.definition } : {}),
      })),
    );

  const at = sorted.findIndex((op) => RANK[op.kind] > RANK.renameColumn);
  const insertAt = at === -1 ? sorted.length : at;
  return [...sorted.slice(0, insertAt), ...tableOps, ...columnOps, ...sorted.slice(insertAt)];
}
