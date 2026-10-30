import type {
  Column,
  Enum,
  ForeignKey,
  Id,
  IrDialect,
  Namespace,
  Schema,
  Table,
} from '../ir/types';
import type { SerializeWarning, SerializeWarningCode } from './types';

/** Each dialect's unnamed default namespace, as the parsers name it. */
export const DEFAULT_NAMESPACE: Record<IrDialect, string> = {
  postgres: 'public',
  mysql: 'default',
  sqlite: 'main',
};

/**
 * Read-only lookups over a Schema plus the warning sink every serializer shares. Serializers
 * walk the IR through this so they never resolve ids by hand.
 */
export class SchemaModel {
  readonly warnings: SerializeWarning[] = [];
  private readonly tablesById = new Map<Id, Table>();
  private readonly columnsById = new Map<Id, Column>();
  private readonly enumsById = new Map<Id, Enum>();
  private readonly namespacesById = new Map<Id, Namespace>();

  constructor(readonly schema: Schema) {
    for (const ns of schema.namespaces) this.namespacesById.set(ns.id, ns);
    for (const en of schema.enums) this.enumsById.set(en.id, en);
    for (const table of schema.tables) {
      this.tablesById.set(table.id, table);
      for (const column of table.columns) this.columnsById.set(column.id, column);
    }
  }

  warn(code: SerializeWarningCode, element: string, message: string): void {
    this.warnings.push({ code, element, message });
  }

  table(id: Id): Table {
    const table = this.tablesById.get(id);
    if (!table) throw new Error(`Unknown table ${id}`);
    return table;
  }

  column(id: Id): Column {
    const column = this.columnsById.get(id);
    if (!column) throw new Error(`Unknown column ${id}`);
    return column;
  }

  columnName(id: Id): string {
    return this.column(id).name;
  }

  enum(id: Id): Enum {
    const en = this.enumsById.get(id);
    if (!en) throw new Error(`Unknown enum ${id}`);
    return en;
  }

  namespaceName(id: Id): string {
    return this.namespacesById.get(id)?.name ?? '';
  }

  /**
   * The namespace as the target dialect sees it: each dialect's unnamed default namespace
   * (Postgres `public`, the MySQL parser's `default`, SQLite `main`) maps to the target's.
   */
  targetNamespace(id: Id, target: IrDialect): string {
    const name = this.namespaceName(id);
    if (this.schema.dialect === target) return name;
    const sourceDefault = DEFAULT_NAMESPACE[this.schema.dialect];
    return name === sourceDefault ? DEFAULT_NAMESPACE[target] : name;
  }

  qualified(table: Table): string {
    return `${this.namespaceName(table.namespace)}.${table.name}`;
  }

  /** Enums sorted by (namespace, name). */
  sortedEnums(): Enum[] {
    return [...this.schema.enums].sort((a, b) =>
      compareKeys(
        [this.namespaceName(a.namespace), a.name],
        [this.namespaceName(b.namespace), b.name],
      ),
    );
  }

  /**
   * Tables in dependency order: a table comes after the tables its foreign keys reference.
   * Self-references are ignored, ties and cycles are broken by qualified name, so the order
   * depends only on the schema's content, never on the input order.
   */
  sortedTables(): Table[] {
    const byName = [...this.schema.tables].sort((a, b) => compareKeys(this.key(a), this.key(b)));
    const deps = new Map<Id, Set<Id>>(
      byName.map((t) => [
        t.id,
        new Set(
          t.foreignKeys
            .map((fk) => fk.refTable)
            .filter((ref) => ref !== t.id && this.tablesById.has(ref)),
        ),
      ]),
    );
    const done = new Set<Id>();
    const result: Table[] = [];
    while (result.length < byName.length) {
      const ready = byName.find(
        (t) => !done.has(t.id) && [...(deps.get(t.id) ?? [])].every((d) => done.has(d)),
      );
      // In a cycle nothing is ready; take the first remaining table by name.
      const next = ready ?? byName.find((t) => !done.has(t.id));
      if (!next) break;
      done.add(next.id);
      result.push(next);
    }
    return result;
  }

  /** Foreign keys from other tables (and self-references) that point at `table`. */
  inbound(table: Table): { owner: Table; fk: ForeignKey }[] {
    return this.sortedTables().flatMap((owner) =>
      owner.foreignKeys.filter((fk) => fk.refTable === table.id).map((fk) => ({ owner, fk })),
    );
  }

  private key(table: Table): [string, string] {
    return [this.namespaceName(table.namespace), table.name];
  }
}

function compareKeys(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
