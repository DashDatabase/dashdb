import { describe, expect, it } from 'vitest';
import { renameColumn } from '../ir/edit';
import type { Schema } from '../ir/types';
import { expectRoundTrip, labels, pg } from './__test-utils__/harness';
import { diffSchemas } from './diff';
import { orderOperations } from './order';
import type { Operation } from './types';

const tableId = (s: Schema, name: string) => s.tables.find((t) => t.name === name)?.id ?? '';
const columnId = (s: Schema, table: string, name: string) =>
  s.tables.find((t) => t.name === table)?.columns.find((c) => c.name === name)?.id ?? '';

describe('rename candidates', () => {
  it('sorts several candidates by score, then key', () => {
    const b = pg('CREATE TABLE t (id int, colour text, size_cm int, weight_g int);');
    const a = pg('CREATE TABLE t (id int, color text, size_mm int, weight_kg int);');
    const result = diffSchemas(b, a);
    // weight_g→weight_kg is closest (0.875 + 0.2); the tie between the other two goes by key.
    expect(result.renameCandidates.map((c) => [c.to.column, c.score])).toEqual([
      ['weight_kg', 1.075],
      ['color', 1.033],
      ['size_mm', 1.033],
    ]);
  });

  it('needs a structural signal besides a similar name', () => {
    const tables = diffSchemas(
      pg('CREATE TABLE a (x int); CREATE TABLE orders (p int, q int);'),
      pg('CREATE TABLE ordrs (r text, s text); CREATE TABLE b (y int);'),
    );
    expect(tables.renameCandidates).toEqual([]);
    const columns = diffSchemas(
      pg('CREATE TABLE t (amount int, a int, b int);'),
      pg('CREATE TABLE t (a int, b int, amounts int NOT NULL);'),
    );
    expect(columns.renameCandidates).toEqual([]);
  });

  it('scores tables without columns as fully shared', () => {
    const b: Schema = { ...pg('CREATE TABLE logs (x int);'), tables: [] };
    const empty = (s: Schema, name: string): Schema => {
      const base = pg(`CREATE TABLE ${name} (x int);`);
      return {
        ...s,
        namespaces: base.namespaces,
        tables: base.tables.map((t) => ({
          ...t,
          columns: [],
          namespace: base.namespaces[0]?.id ?? '',
        })),
      };
    };
    const result = diffSchemas(empty(b, 'logs'), empty(b, 'log'));
    expect(result.renameCandidates[0]?.reasons).toEqual([
      'similar-name 0.75',
      'same-position',
      'shared-columns',
    ]);
  });

  it('warns about conflicting confirmed table renames and applies only the first', () => {
    const b = pg('CREATE TABLE items (id int); CREATE TABLE item (id int);');
    const a = pg('CREATE TABLE items2 (id int);');
    const result = diffSchemas(b, a, {
      confirmedRenames: ['table:public.item=>public.items2', 'table:public.items=>public.items2'],
    });
    expect(labels(result.operations)).toEqual(['dropTable:items', 'renameTable:item->items2']);
    expect(result.warnings.map((w) => w.code)).toContain('invalid-rename');
  });
});

describe('dependent keys and comparisons', () => {
  it('re-adds foreign keys that depend on a dropped unique index', () => {
    const b = pg(
      'CREATE TABLE u (k int); CREATE UNIQUE INDEX u_k ON u (k); CREATE TABLE t (k int REFERENCES u (k));',
    );
    const a = pg(
      'CREATE TABLE u (k int); CREATE UNIQUE INDEX u_k2 ON u (k); CREATE TABLE t (k int REFERENCES u (k));',
    );
    expect(labels(expectRoundTrip(b, a).operations)).toEqual([
      'dropForeignKey:t_k_fkey',
      'dropIndex:u_k',
      'createIndex:u_k2',
      'addForeignKey:t_k_fkey',
    ]);
  });

  it('lists every surviving column of a changed enum, sorted', () => {
    const b = pg("CREATE TYPE m AS ENUM ('a'); CREATE TABLE z (m m); CREATE TABLE y (m m, n m);");
    const a = pg(
      "CREATE TYPE m AS ENUM ('a', 'b'); CREATE TABLE z (m m); CREATE TABLE y (m m, n m);",
    );
    const op = expectRoundTrip(b, a).operations[0] as Extract<
      Operation,
      { kind: 'alterEnumAddValue' }
    >;
    expect(op.columns.map((c) => `${c.table.name}.${c.column}`)).toEqual(['y.m', 'y.n', 'z.m']);
  });

  it('treats a same-named index or key over a replaced column as changed', () => {
    const b = pg('CREATE TABLE t (a int, b int, PRIMARY KEY (a)); CREATE INDEX t_i ON t (a);');
    const a = pg('CREATE TABLE t (c int, b int, PRIMARY KEY (c)); CREATE INDEX t_i ON t (c);');
    expect(labels(expectRoundTrip(b, a).operations)).toEqual([
      'dropIndex:t_i',
      'dropPrimaryKey:t',
      'dropColumn:t.a',
      'addColumn:t.c',
      'addPrimaryKey:t',
      'createIndex:t_i',
    ]);
  });
});

describe('orderOperations', () => {
  it('keeps input order for operations with the same rank and key', () => {
    const t = { namespace: 'public', name: 't' };
    const ops: Operation[] = [
      { kind: 'setComment', table: t, column: null, from: null, to: 'a', definition: null },
      { kind: 'setComment', table: t, column: null, from: 'a', to: 'b', definition: null },
    ];
    expect(orderOperations(ops)).toEqual(ops);
  });

  it('sequences column renames table by table', () => {
    const b = pg('CREATE TABLE b (x int); CREATE TABLE a (y int);');
    let after = renameColumn(b, tableId(b, 'b'), columnId(b, 'b', 'x'), 'x2');
    after = renameColumn(after, tableId(b, 'a'), columnId(b, 'a', 'y'), 'y2');
    expect(labels(expectRoundTrip(b, after).operations)).toEqual([
      'renameColumn:a.y->y2',
      'renameColumn:b.x->x2',
    ]);
  });
});

describe('remaining paths', () => {
  it('compares strings by code point', async () => {
    const { compareStrings } = await import('./defs');
    expect([
      compareStrings('a', 'b'),
      compareStrings('b', 'a'),
      compareStrings('a', 'a'),
      compareStrings('Z', 'a'),
    ]).toEqual([-1, 1, 0, -1]);
  });

  it('weighs constraint membership when scoring column candidates', () => {
    const b = pg(`CREATE TABLE p (id int PRIMARY KEY);
CREATE TABLE t (key_a int PRIMARY KEY, ref_a int REFERENCES p, uq_a int UNIQUE, ix_a int, colour text);
CREATE INDEX t_ix ON t (ix_a);`);
    const a = pg(`CREATE TABLE p (id int PRIMARY KEY);
CREATE TABLE t (key_b int PRIMARY KEY, ref_b int REFERENCES p, uq_b int UNIQUE, ix_b int, color text NOT NULL);
CREATE INDEX t_ix ON t (ix_b);`);
    const reasons = (column: string) =>
      diffSchemas(b, a).renameCandidates.find((c) => c.to.column === column)?.reasons;
    expect(reasons('key_b')).toEqual(['similar-name 0.75', 'same-position', 'same-constraints']);
    expect(reasons('color')).toEqual(['similar-name 0.83', 'same-position']);
  });

  it('warns only when a column becomes NOT NULL', () => {
    const result = expectRoundTrip(
      pg('CREATE TABLE t (a int NOT NULL);'),
      pg('CREATE TABLE t (a int);'),
    );
    expect(labels(result.operations)).toEqual(['alterColumnNullability:t.a']);
    expect(result.warnings).toEqual([]);
  });
});
