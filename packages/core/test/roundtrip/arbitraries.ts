import fc from 'fast-check';
import { columnRenameKey, tableRenameKey } from '../../src/diff/diff';
import type { MigrationDialect } from '../../src/migrations/types';
import { toMySQLDDL, toPostgresDDL } from '../../src/serializers';
import { parseSql } from './pipeline';

/*
 * Random schemas and random edit sequences for the property test. A small model (tables of
 * typed columns with an index, unique key and foreign keys) is generated, edited, and rendered
 * to DDL for both states; renames are tracked so the diff can be told about them. Both states
 * then go through our own parser and serializer, so the files a failure leaves behind are in
 * the canonical form DashDB writes.
 */

interface ColumnModel {
  name: string;
  /** Name in the before-state; null for columns added by an edit. */
  readonly origin: string | null;
  type: string;
  nullable: boolean;
  dflt: string | null;
}

interface TableModel {
  name: string;
  readonly origin: string | null;
  columns: ColumnModel[];
  index: { name: string; column: string } | null;
  unique: { name: string; column: string } | null;
  fks: { name: string; column: string; ref: TableModel }[];
}

interface Types {
  readonly pool: readonly string[];
  /** Conversions an edit may apply (all succeed on empty tables). */
  readonly retype: Readonly<Record<string, string>>;
  readonly literal: (type: string) => string | null;
  /** Types that may carry an index or unique key without a prefix length. */
  readonly indexable: (type: string) => boolean;
}

const TYPES: Record<MigrationDialect, Types> = {
  postgres: {
    pool: [
      'int',
      'bigint',
      'varchar(40)',
      'text',
      'numeric(10,2)',
      'boolean',
      'timestamptz',
      'date',
    ],
    retype: {
      int: 'bigint',
      bigint: 'int',
      'varchar(40)': 'varchar(80)',
      'varchar(80)': 'text',
      'numeric(10,2)': 'numeric(12,2)',
    },
    literal: (t) =>
      /int/.test(t)
        ? '7'
        : /char|text/.test(t)
          ? "'x'"
          : /numeric/.test(t)
            ? '1.5'
            : t === 'boolean'
              ? 'true'
              : null,
    indexable: () => true,
  },
  mysql: {
    pool: ['int', 'bigint', 'varchar(40)', 'text', 'decimal(10,2)', 'date', 'datetime'],
    retype: {
      int: 'bigint',
      bigint: 'int',
      'varchar(40)': 'varchar(80)',
      'decimal(10,2)': 'decimal(12,2)',
    },
    // MySQL allows no literal default on TEXT.
    literal: (t) =>
      /int/.test(t) ? '7' : /char/.test(t) ? "'x'" : /decimal/.test(t) ? '1.5' : null,
    indexable: (t) => t !== 'text',
  },
};

const columnArb = (dialect: MigrationDialect) =>
  fc.record({
    type: fc.constantFrom(...TYPES[dialect].pool),
    nullable: fc.boolean(),
    withDefault: fc.boolean(),
  });

const tableArb = (dialect: MigrationDialect) =>
  fc.record({
    columns: fc.array(columnArb(dialect), { minLength: 1, maxLength: 5 }),
    index: fc.option(fc.nat(), { nil: null }),
    unique: fc.option(fc.nat(), { nil: null }),
    fk: fc.option(fc.nat(), { nil: null }),
  });

const editArb = (dialect: MigrationDialect) =>
  fc.oneof(
    fc.record({ kind: fc.constant('addColumn' as const), t: fc.nat(), column: columnArb(dialect) }),
    fc.record({ kind: fc.constant('dropColumn' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('renameColumn' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('retype' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('toggleNull' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('toggleDefault' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('toggleIndex' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('toggleUnique' as const), t: fc.nat(), c: fc.nat() }),
    fc.record({ kind: fc.constant('addFk' as const), t: fc.nat(), ref: fc.nat() }),
    fc.record({ kind: fc.constant('dropFk' as const), t: fc.nat() }),
    fc.record({ kind: fc.constant('renameTable' as const), t: fc.nat() }),
    fc.record({ kind: fc.constant('addTable' as const), table: tableArb(dialect) }),
    fc.record({ kind: fc.constant('dropTable' as const), t: fc.nat() }),
  );

type Generated<A> = A extends fc.Arbitrary<infer T> ? T : never;
type ColumnSpec = Generated<ReturnType<typeof columnArb>>;
type TableSpec = Generated<ReturnType<typeof tableArb>>;
type Edit = Generated<ReturnType<typeof editArb>>;

class Model {
  readonly tables: TableModel[] = [];
  private n = 0;

  constructor(private readonly dialect: MigrationDialect) {}

  private next(prefix: string): string {
    return `${prefix}${String(++this.n)}`;
  }

  column(spec: ColumnSpec, origin: boolean): ColumnModel {
    const name = this.next('c');
    const dflt = spec.withDefault ? TYPES[this.dialect].literal(spec.type) : null;
    return { name, origin: origin ? name : null, type: spec.type, nullable: spec.nullable, dflt };
  }

  addTable(spec: TableSpec, origin: boolean): void {
    const name = this.next('t');
    const table: TableModel = {
      name,
      origin: origin ? name : null,
      columns: spec.columns.map((c) => this.column(c, origin)),
      index: null,
      unique: null,
      fks: [],
    };
    this.tables.push(table);
    if (spec.index !== null) this.toggleIndex(table, spec.index);
    if (spec.unique !== null) this.toggleUnique(table, spec.unique);
    if (spec.fk !== null && this.tables.length > 1) this.addFk(table, spec.fk, origin);
  }

  private indexable(table: TableModel, c: number): ColumnModel | undefined {
    const candidates = table.columns.filter((col) => TYPES[this.dialect].indexable(col.type));
    return candidates[c % Math.max(candidates.length, 1)];
  }

  toggleIndex(table: TableModel, c: number): void {
    if (table.index) table.index = null;
    else {
      const col = this.indexable(table, c);
      if (col) table.index = { name: this.next('ix'), column: col.name };
    }
  }

  toggleUnique(table: TableModel, c: number): void {
    if (table.unique) table.unique = null;
    else {
      const col = this.indexable(table, c);
      if (col) table.unique = { name: this.next('uq'), column: col.name };
    }
  }

  addFk(table: TableModel, ref: number, origin: boolean): void {
    const others = this.tables.filter((t) => t !== table);
    const target = others[ref % others.length];
    if (!target) return;
    const column = this.column({ type: 'int', nullable: true, withDefault: false }, origin);
    table.columns.push(column);
    table.fks.push({ name: this.next('fk'), column: column.name, ref: target });
  }

  /** Columns no key refers to (safe to drop or retype). */
  private free(table: TableModel): ColumnModel[] {
    const used = new Set([
      table.index?.column,
      table.unique?.column,
      ...table.fks.map((f) => f.column),
    ]);
    return table.columns.filter((c) => !used.has(c.name));
  }

  apply(edit: Edit): void {
    const pick = <T>(items: readonly T[], i: number): T | undefined =>
      items[i % Math.max(items.length, 1)];
    const table = 't' in edit ? pick(this.tables, edit.t) : undefined;
    switch (edit.kind) {
      case 'addColumn':
        table?.columns.push(this.column(edit.column, false));
        return;
      case 'dropColumn': {
        const col = table && pick(this.free(table), edit.c);
        if (table && col && table.columns.length > 1)
          table.columns = table.columns.filter((c) => c !== col);
        return;
      }
      case 'renameColumn': {
        const col = table && pick(table.columns, edit.c);
        if (!table || !col) return;
        const name = this.next('c');
        for (const ref of [table.index, table.unique, ...table.fks])
          if (ref?.column === col.name) ref.column = name;
        col.name = name;
        return;
      }
      case 'retype': {
        const col = table && pick(this.free(table), edit.c);
        const to = col && TYPES[this.dialect].retype[col.type];
        if (col && to) {
          col.type = to;
          if (col.dflt !== null) col.dflt = TYPES[this.dialect].literal(to);
        }
        return;
      }
      case 'toggleNull': {
        const col = table && pick(this.free(table), edit.c);
        if (col) col.nullable = !col.nullable;
        return;
      }
      case 'toggleDefault': {
        const col = table && pick(table.columns, edit.c);
        if (col) col.dflt = col.dflt === null ? TYPES[this.dialect].literal(col.type) : null;
        return;
      }
      case 'toggleIndex':
        if (table) this.toggleIndex(table, edit.c);
        return;
      case 'toggleUnique':
        if (table) this.toggleUnique(table, edit.c);
        return;
      case 'addFk':
        if (table) this.addFk(table, edit.ref, false);
        return;
      case 'dropFk':
        if (table) table.fks.pop();
        return;
      case 'renameTable':
        if (table) table.name = this.next('t');
        return;
      case 'addTable':
        this.addTable(edit.table, false);
        return;
      case 'dropTable': {
        const referenced = new Set(
          this.tables.flatMap((t) => t.fks.filter((f) => f.ref !== t).map((f) => f.ref)),
        );
        if (table && !referenced.has(table) && this.tables.length > 1)
          this.tables.splice(this.tables.indexOf(table), 1);
        return;
      }
    }
  }

  ddl(): string {
    const my = this.dialect === 'mysql';
    const lines: string[] = [];
    for (const t of this.tables) {
      const cols = [
        `id int NOT NULL PRIMARY KEY`,
        ...t.columns.map(
          (c) =>
            `${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'}${c.dflt === null ? '' : ` DEFAULT ${c.dflt}`}`,
        ),
        ...(t.unique ? [`CONSTRAINT ${t.unique.name} UNIQUE (${t.unique.column})`] : []),
      ];
      lines.push(
        `CREATE TABLE ${t.name} (\n  ${cols.join(',\n  ')}\n)${my ? ' ENGINE=InnoDB' : ''};`,
      );
      if (t.index) lines.push(`CREATE INDEX ${t.index.name} ON ${t.name} (${t.index.column});`);
    }
    for (const t of this.tables)
      for (const fk of t.fks)
        lines.push(
          `ALTER TABLE ${t.name} ADD CONSTRAINT ${fk.name} FOREIGN KEY (${fk.column}) REFERENCES ${fk.ref.name} (id);`,
        );
    return lines.join('\n');
  }

  renames(): string[] {
    const ns = this.dialect === 'postgres' ? 'public' : 'default';
    const q = (name: string) => ({ namespace: ns, name });
    return this.tables.flatMap((t) => {
      if (t.origin === null) return [];
      const keys = t.name === t.origin ? [] : [tableRenameKey(q(t.origin), q(t.name))];
      for (const c of t.columns)
        if (c.origin !== null && c.origin !== c.name)
          keys.push(columnRenameKey(q(t.origin), c.origin, q(t.name), c.name));
      return keys;
    });
  }
}

export interface GeneratedCase {
  readonly before: string;
  readonly after: string;
  readonly renames: string[];
}

/** DDL as DashDB writes it: parsed by our parser, printed by our serializer. */
function canonical(dialect: MigrationDialect, ddl: string): string {
  const schema = parseSql(dialect, ddl);
  return (dialect === 'postgres' ? toPostgresDDL(schema) : toMySQLDDL(schema)).code;
}

export const caseArb = (dialect: MigrationDialect): fc.Arbitrary<GeneratedCase> =>
  fc
    .record({
      tables: fc.array(tableArb(dialect), { minLength: 1, maxLength: 4 }),
      edits: fc.array(editArb(dialect), { minLength: 1, maxLength: 6 }),
    })
    .map(({ tables, edits }) => {
      const model = new Model(dialect);
      for (const t of tables) model.addTable(t, true);
      const before = canonical(dialect, model.ddl());
      for (const e of edits) model.apply(e);
      return { before, after: canonical(dialect, model.ddl()), renames: model.renames() };
    });
