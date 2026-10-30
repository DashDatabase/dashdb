import type {
  Check,
  Column,
  ForeignKey,
  Id,
  Index,
  LogicalType,
  PrimaryKey,
  Schema,
  Table,
  UniqueConstraint,
} from './types';

export interface MergeOptions {
  /**
   * What the edited text looked like before the edit, parsed: usually the parse of the
   * serializer's own output. With a base the merge is three-way: only what differs between
   * `base` and `parsed` is taken from `parsed`, and everything else (including elements the
   * format cannot express, such as CHECK constraints in Prisma) is kept from `current`.
   * Without one, `parsed` wins wherever it says anything.
   */
  readonly base?: Schema | null;
}

/**
 * Merges a freshly parsed schema into the current one, keeping the current ids of every element
 * that can be matched by name (so layout, selection and history keyed by id survive an edit made
 * in code). A column that disappears while exactly one appears in its place, or a table replaced
 * by one with mostly the same columns, counts as a rename and keeps its id too.
 *
 * Unchanged elements are returned by reference, and if nothing changed `current` itself is
 * returned, so callers can detect a no-op with `===`. The result keeps `current`'s id and dialect.
 */
export function mergeSchema(current: Schema, parsed: Schema, options: MergeOptions = {}): Schema {
  const base = options.base ?? null;
  // Rewrite `parsed` and `base` into current ids first, so every comparison below (including
  // references such as FK targets and enum types) is like for like.
  const parsedIds = matchIds(current, parsed, base);
  const parsedIn = remap(parsed, parsedIds);
  const baseIn = base ? remap(base, matchIds(current, base, null)) : null;

  const namespaces = mergeList(
    current.namespaces,
    baseIn?.namespaces ?? null,
    parsedIn.namespaces,
    (c, b, p) => pick(c, b, p),
  );
  const enums = mergeList(current.enums, baseIn?.enums ?? null, parsedIn.enums, (c, b, p) =>
    pick(c, b, p),
  );
  const tables = prune(
    mergeList(current.tables, baseIn?.tables ?? null, parsedIn.tables, mergeTable),
  );

  return share(current, { ...current, namespaces, enums, tables });
}

/**
 * Drops constraints kept from `current` that point at columns or tables the edit removed (an
 * index the format cannot express, on a column the user just deleted), so the merge never
 * produces dangling references.
 */
function prune(tables: readonly Table[]): readonly Table[] {
  const columnsOf = new Map(tables.map((t) => [t.id, new Set(t.columns.map((c) => c.id))]));
  return tables.map((table) => {
    const own = new Set(table.columns.map((c) => c.id));
    const has = (ids: readonly Id[]) => ids.every((id) => own.has(id));
    const indexes = table.indexes.filter((ix) => has(ix.columns.map((c) => c.column)));
    const uniques = table.uniques.filter((u) => has(u.columns));
    const foreignKeys = table.foreignKeys.filter((fk) => {
      const target = columnsOf.get(fk.refTable);
      return has(fk.columns) && !!target && fk.refColumns.every((id) => target.has(id));
    });
    const primaryKey = table.primaryKey && has(table.primaryKey.columns) ? table.primaryKey : null;
    if (
      indexes.length === table.indexes.length &&
      uniques.length === table.uniques.length &&
      foreignKeys.length === table.foreignKeys.length &&
      primaryKey === table.primaryKey
    ) {
      return table;
    }
    return { ...table, indexes, uniques, foreignKeys, primaryKey };
  });
}

// ---------------------------------------------------------------------------------------------
// Matching: map ids in `other` (parsed or base) onto ids in `current`.

type IdMap = Map<Id, Id>;

interface Named {
  readonly id: Id;
  readonly name: string;
}

function byName<T extends Named>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.name, item]));
}

function columnNames(table: Table): Set<string> {
  return new Set(table.columns.map((c) => c.name));
}

/** Share of column names two tables have in common (Jaccard index). */
function overlap(a: Table, b: Table): number {
  const left = columnNames(a);
  const right = columnNames(b);
  let shared = 0;
  for (const name of left) if (right.has(name)) shared++;
  const total = left.size + right.size - shared;
  return shared / Math.max(1, total);
}

const RENAME_OVERLAP = 0.5;

function matchIds(current: Schema, other: Schema, base: Schema | null): IdMap {
  const ids: IdMap = new Map();
  const nsName = namespaceNames(current, other);

  const currentNs = byName(current.namespaces);
  for (const ns of other.namespaces) {
    const match = currentNs.get(ns.name);
    if (match) ids.set(ns.id, match.id);
  }

  const qualified = (schema: Schema, item: { namespace: Id; name: string }) =>
    JSON.stringify([nsName(schema, item.namespace), item.name]);

  const currentEnums = new Map(current.enums.map((e) => [qualified(current, e), e]));
  for (const en of other.enums) {
    const match = currentEnums.get(qualified(other, en));
    if (match) ids.set(en.id, match.id);
  }

  // Tables by qualified name, then renames among the leftovers.
  const currentTables = new Map(current.tables.map((t) => [qualified(current, t), t]));
  const pairs: [Table, Table][] = [];
  const unmatched: Table[] = [];
  for (const table of other.tables) {
    const match = currentTables.get(qualified(other, table));
    if (match) {
      pairs.push([match, table]);
      currentTables.delete(qualified(current, match));
    } else unmatched.push(table);
  }
  // Only a table the edit removed can be renamed: one the base still had (when there is a base).
  const baseNames = base ? new Set(base.tables.map((t) => qualified(base, t))) : null;
  const removed = [...currentTables.values()].filter(
    (t) => !baseNames || baseNames.has(qualified(current, t)),
  );
  for (const [from, to] of pairRenames(removed, unmatched, current, other, nsName)) {
    pairs.push([from, to]);
  }

  for (const [cur, oth] of pairs) {
    ids.set(oth.id, cur.id);
    matchTable(cur, oth, ids);
  }
  return ids;
}

/** Namespace name by id, for either schema. */
function namespaceNames(...schemas: Schema[]): (schema: Schema, id: Id) => string | undefined {
  const names = new Map(
    schemas.map((schema) => [schema, new Map(schema.namespaces.map((n) => [n.id, n.name]))]),
  );
  return (schema, id) => names.get(schema)?.get(id);
}

function pairRenames(
  removed: readonly Table[],
  added: readonly Table[],
  current: Schema,
  other: Schema,
  nsName: (schema: Schema, id: Id) => string | undefined,
): [Table, Table][] {
  const pairs: [Table, Table][] = [];
  const free = new Set(removed);
  for (const table of added) {
    const ns = nsName(other, table.namespace);
    const candidates = [...free].filter((t) => nsName(current, t.namespace) === ns);
    let best: Table | undefined;
    let bestScore = RENAME_OVERLAP;
    for (const candidate of candidates) {
      const score = overlap(candidate, table);
      if (score >= bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      pairs.push([best, table]);
      free.delete(best);
    }
  }
  return pairs;
}

function fkSignature(
  fk: ForeignKey,
  columnNames: ReadonlyMap<Id, string>,
  refTable: Id | undefined,
): string {
  return JSON.stringify([
    fk.columns.map((id) => columnNames.get(id)),
    refTable,
    fk.refColumns.length,
  ]);
}

function matchTable(current: Table, other: Table, ids: IdMap): void {
  const currentColumns = byName(current.columns);
  const addedColumns: Column[] = [];
  for (const column of other.columns) {
    const match = currentColumns.get(column.name);
    if (match) {
      ids.set(column.id, match.id);
      currentColumns.delete(column.name);
    } else addedColumns.push(column);
  }
  // One column swapped for one other: a rename.
  const [removedColumn] = currentColumns.values();
  const [addedColumn] = addedColumns;
  if (currentColumns.size === 1 && addedColumns.length === 1 && removedColumn && addedColumn) {
    ids.set(addedColumn.id, removedColumn.id);
  }

  if (current.primaryKey && other.primaryKey) ids.set(other.primaryKey.id, current.primaryKey.id);
  matchByName(current.indexes, other.indexes, ids);
  matchByName(current.uniques, other.uniques, ids);
  matchByName(current.checks, other.checks, ids);

  // Foreign keys by name, then by shape (generated names differ between formats).
  const currentFks = byName(current.foreignKeys);
  const unmatchedFks: ForeignKey[] = [];
  for (const fk of other.foreignKeys) {
    const match = currentFks.get(fk.name);
    if (match) {
      ids.set(fk.id, match.id);
      currentFks.delete(fk.name);
    } else unmatchedFks.push(fk);
  }
  const currentNames = new Map(current.columns.map((c) => [c.id, c.name]));
  const otherNames = new Map(other.columns.map((c) => [c.id, c.name]));
  const leftovers = new Map<string, ForeignKey>();
  for (const fk of currentFks.values()) {
    leftovers.set(fkSignature(fk, currentNames, fk.refTable), fk);
  }
  for (const fk of unmatchedFks) {
    // A target the edit added has no current id, so its key can't match a current FK.
    const signature = fkSignature(fk, otherNames, ids.get(fk.refTable));
    const match = leftovers.get(signature);
    if (match) {
      ids.set(fk.id, match.id);
      leftovers.delete(signature);
    }
  }
}

function matchByName(current: readonly Named[], other: readonly Named[], ids: IdMap): void {
  const names = byName(current);
  for (const item of other) {
    const match = names.get(item.name);
    if (match) ids.set(item.id, match.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Remapping: rewrite every id and reference in a schema through an IdMap.

function remap(schema: Schema, ids: IdMap): Schema {
  const id = (value: Id) => ids.get(value) ?? value;
  const logicalType = (type: LogicalType): LogicalType =>
    type.kind === 'enum' ? { kind: 'enum', enumId: id(type.enumId) } : type;
  return {
    ...schema,
    namespaces: schema.namespaces.map((n) => ({ ...n, id: id(n.id) })),
    enums: schema.enums.map((e) => ({ ...e, id: id(e.id), namespace: id(e.namespace) })),
    tables: schema.tables.map((t) => ({
      ...t,
      id: id(t.id),
      namespace: id(t.namespace),
      columns: t.columns.map((c) => ({
        ...c,
        id: id(c.id),
        logicalType: logicalType(c.logicalType),
      })),
      primaryKey: t.primaryKey
        ? { ...t.primaryKey, id: id(t.primaryKey.id), columns: t.primaryKey.columns.map(id) }
        : null,
      indexes: t.indexes.map((ix) => ({
        ...ix,
        id: id(ix.id),
        columns: ix.columns.map((c) => ({ ...c, column: id(c.column) })),
      })),
      uniques: t.uniques.map((u) => ({ ...u, id: id(u.id), columns: u.columns.map(id) })),
      foreignKeys: t.foreignKeys.map((fk) => ({
        ...fk,
        id: id(fk.id),
        columns: fk.columns.map(id),
        refTable: id(fk.refTable),
        refColumns: fk.refColumns.map(id),
      })),
      checks: t.checks.map((ck) => ({ ...ck, id: id(ck.id) })),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Three-way merge of matched elements (all ids already in current's id space).

interface WithId {
  readonly id: Id;
}

/**
 * Merges one list. Elements only `current` has are kept when the base never had them (the
 * format could not express them) and dropped when the base had them (the user deleted them).
 *
 * Order follows `parsed` when the edit reordered elements (relative to the base) or there is no
 * base; otherwise `current`'s order is kept, since formats emit elements in their own order
 * (Prisma models, for one), and new elements go in after their neighbour in the code.
 */
function mergeList<T extends WithId>(
  current: readonly T[],
  base: readonly T[] | null,
  parsed: readonly T[],
  merge: (current: T | undefined, base: T | undefined, parsed: T) => T,
): readonly T[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const baseById = base ? new Map(base.map((item) => [item.id, item])) : null;
  const parsedIds = new Set(parsed.map((item) => item.id));

  const merged = parsed.map((item) =>
    merge(currentById.get(item.id), baseById?.get(item.id), item),
  );
  if (!base || !baseById) return shareArray(current, merged);

  const kept = current.filter((item) => !parsedIds.has(item.id) && !baseById.has(item.id));
  const inBoth = (id: Id) => currentById.has(id) && baseById.has(id) && parsedIds.has(id);
  const parsedOrder = parsed.map((item) => item.id).filter(inBoth);
  const baseOrder = base.map((item) => item.id).filter(inBoth);
  if (!equal(parsedOrder, baseOrder)) return shareArray(current, [...merged, ...kept]);

  const mergedById = new Map(merged.map((item) => [item.id, item]));
  const result = current.flatMap((item) => {
    const next = mergedById.get(item.id);
    if (next) return [next];
    return kept.includes(item) ? [item] : [];
  });
  let previous: Id | null = null;
  for (const item of merged) {
    if (!currentById.has(item.id)) {
      const at = previous === null ? 0 : result.findIndex((r) => r.id === previous) + 1;
      result.splice(at, 0, item);
    }
    previous = item.id;
  }
  return shareArray(current, result);
}

/**
 * Field-by-field three-way pick: a field the edit did not change (parsed equals base) keeps the
 * current value; otherwise the parsed value wins. Without a current element, parsed is new.
 */
function pick<T extends object>(current: T | undefined, base: T | undefined, parsed: T): T {
  if (!current) return parsed;
  const result: Record<string, unknown> = {};
  // IR elements of one kind share a fixed shape. Only current's keys (already in the store, so
  // validated) are copied, so a stray key in parsed input, `__proto__` included, is never set.
  for (const key of Object.keys(current)) {
    const c = (current as Record<string, unknown>)[key];
    const p = (parsed as Record<string, unknown>)[key];
    const b = base ? (base as Record<string, unknown>)[key] : undefined;
    result[key] = base && equal(p, b) ? c : p;
  }
  return share(current, result as T);
}

function mergeTable(current: Table | undefined, base: Table | undefined, parsed: Table): Table {
  if (!current) return parsed;
  const scalars = pick(
    {
      name: current.name,
      namespace: current.namespace,
      comment: current.comment,
      metadata: current.metadata,
    },
    base && {
      name: base.name,
      namespace: base.namespace,
      comment: base.comment,
      metadata: base.metadata,
    },
    {
      name: parsed.name,
      namespace: parsed.namespace,
      comment: parsed.comment,
      metadata: parsed.metadata,
    },
  );
  const merged: Table = {
    ...current,
    ...scalars,
    columns: mergeList<Column>(current.columns, base?.columns ?? null, parsed.columns, pick),
    primaryKey: mergePrimaryKey(current.primaryKey, base, parsed.primaryKey),
    indexes: mergeList<Index>(current.indexes, base?.indexes ?? null, parsed.indexes, pick),
    uniques: mergeList<UniqueConstraint>(
      current.uniques,
      base?.uniques ?? null,
      parsed.uniques,
      pick,
    ),
    foreignKeys: mergeList<ForeignKey>(
      current.foreignKeys,
      base?.foreignKeys ?? null,
      parsed.foreignKeys,
      pick,
    ),
    checks: mergeList<Check>(current.checks, base?.checks ?? null, parsed.checks, pick),
  };
  return share(current, merged);
}

function mergePrimaryKey(
  current: PrimaryKey | null,
  baseTable: Table | undefined,
  parsed: PrimaryKey | null,
): PrimaryKey | null {
  if (baseTable && equal(baseTable.primaryKey, parsed)) return current;
  if (!current || !parsed) return parsed;
  return pick(current, baseTable?.primaryKey ?? undefined, parsed);
}

// ---------------------------------------------------------------------------------------------
// Structural sharing.

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => equal(item, b[i]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
  );
}

/** `previous` when `next` is deeply equal to it, so unchanged subtrees keep their identity. */
function share<T>(previous: T, next: T): T {
  return equal(previous, next) ? previous : next;
}

function shareArray<T>(previous: readonly T[], next: readonly T[]): readonly T[] {
  return previous.length === next.length && next.every((item, i) => item === previous[i])
    ? previous
    : next;
}
