import { describe, expect, it } from 'vitest';
import { renameColumn, updateColumn } from '../ir/edit';
import type { Schema } from '../ir/types';
import { expectRoundTrip, labels, pg } from './__test-utils__/harness';
import { normalizeNativeType, nameSimilarity } from './defs';
import { DiffError, diffSchemas } from './diff';
import { invertOperations } from './invert';

/* Edge cases proposed by the migration-test-writer review that the scenario suites don't cover. */

const t = (s: Schema) =>
  s.tables[0] ??
  (() => {
    throw new Error('no table');
  })();
const c = (s: Schema, name: string) => t(s).columns.find((x) => x.name === name)?.id ?? '';

describe('edge cases', () => {
  it('breaks a three-way rename cycle with a single temporary name', () => {
    const b = pg('CREATE TABLE t (a int, b int, c int);');
    let a = renameColumn(b, t(b).id, c(b, 'a'), 'b');
    a = renameColumn(a, t(b).id, c(b, 'b'), 'c');
    a = renameColumn(a, t(b).id, c(b, 'c'), 'a');
    const ops = labels(expectRoundTrip(b, a).operations);
    expect(ops).toHaveLength(4);
    expect(ops.filter((o) => o.includes('__dashdb_tmp_'))).toHaveLength(2);
  });

  it('writes comment changes on renamed columns with after-names, and inverts them', () => {
    const b = pg("CREATE TABLE t (a int); COMMENT ON COLUMN t.a IS 'old';");
    let a = renameColumn(b, t(b).id, c(b, 'a'), 'z');
    a = updateColumn(a, t(b).id, c(b, 'a'), { comment: 'new' });
    const result = expectRoundTrip(b, a);
    expect(result.operations).toMatchObject([
      { kind: 'renameColumn', table: { namespace: 'public', name: 't' }, from: 'a', to: 'z' },
      {
        kind: 'setComment',
        table: { namespace: 'public', name: 't' },
        column: 'z',
        from: 'old',
        to: 'new',
      },
    ]);
    expect(invertOperations(result.operations)).toMatchObject([
      { kind: 'renameColumn', table: { namespace: 'public', name: 't' }, from: 'z', to: 'a' },
      {
        kind: 'setComment',
        table: { namespace: 'public', name: 't' },
        column: 'a',
        from: 'new',
        to: 'old',
      },
    ]);
  });

  it('inverts a dropped column to its full definition, with its index restored separately', () => {
    const b = pg(
      "CREATE TABLE t (id int, x text NOT NULL DEFAULT 'd'); CREATE INDEX t_x ON t (x);",
    );
    const result = expectRoundTrip(b, pg('CREATE TABLE t (id int);'));
    expect(labels(invertOperations(result.operations))).toEqual([
      'addColumn:t.x',
      'createIndex:t_x',
    ]);
    expect(invertOperations(result.operations)[0]).toMatchObject({
      column: { name: 'x', nullable: false, default: { kind: 'literal', value: 'd' } },
    });
  });

  it('rejects different dialects and invalid IR without partial results', () => {
    const p = pg('CREATE TABLE t (id int);');
    expect(() => diffSchemas(p, { ...p, dialect: 'mysql' })).toThrow(DiffError);
    const broken: Schema = {
      ...p,
      tables: [{ ...t(p), primaryKey: { id: 'pk', name: null, columns: ['missing'] } }],
    };
    try {
      diffSchemas(p, broken);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DiffError);
      expect((error as DiffError).problems[0]).toMatch(/^pk-missing-column/);
    }
  });

  it('normalizes native type spellings per dialect', () => {
    expect(normalizeNativeType('postgres', 'Character Varying( 20 )')).toBe('varchar(20)');
    expect(normalizeNativeType('postgres', 'int4[]')).toBe('integer[]');
    expect(normalizeNativeType('mysql', 'BIGINT(20) UNSIGNED')).toBe('bigint unsigned');
    expect(normalizeNativeType('mysql', 'boolean')).toBe('tinyint(1)');
    expect(normalizeNativeType('mysql', 'numeric')).toBe('decimal(10,0)');
    expect(normalizeNativeType('sqlite', 'TEXT')).toBe('text');
  });

  it('scores name similarity on normalized names', () => {
    expect(nameSimilarity('Order-Items', 'order_items')).toBe(1);
    expect(nameSimilarity('', '')).toBe(1);
    expect(nameSimilarity('abc', 'xyz')).toBe(0);
  });
});

describe('column definitions on operations', () => {
  it('carry the full before/after column, swapped by inversion', () => {
    const result = expectRoundTrip(
      pg("CREATE TYPE m AS ENUM ('a'); CREATE TABLE t (x int, e m);"),
      pg("CREATE TYPE m AS ENUM ('a', 'b'); CREATE TABLE t (x bigint NOT NULL, e m NOT NULL);"),
    );
    const alter = result.operations.find((o) => o.kind === 'alterColumnType');
    expect(alter).toMatchObject({
      definition: {
        before: { nativeType: 'int', nullable: true },
        after: { nativeType: 'bigint', nullable: false },
      },
    });
    const add = result.operations.find((o) => o.kind === 'alterEnumAddValue');
    expect(add).toMatchObject({
      columns: [{ before: { nullable: true }, after: { nullable: false } }],
    });
    const down = invertOperations(result.operations);
    expect(down.find((o) => o.kind === 'alterColumnType')).toMatchObject({
      definition: { before: { nativeType: 'bigint' }, after: { nativeType: 'int' } },
    });
    expect(down.find((o) => o.kind === 'recreateEnum')).toMatchObject({
      columns: [{ before: { nullable: false }, after: { nullable: true } }],
    });
  });
});
