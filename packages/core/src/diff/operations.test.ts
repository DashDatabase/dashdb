import { describe, expect, it } from 'vitest';
import { expectRoundTrip, labels, my, pg } from './__test-utils__/harness';
import type { Operation, OperationKind } from './types';

/*
 * One scenario per operation type. Each goes through expectRoundTrip, so beyond the asserted
 * operations it proves the ops replay strictly to `after` and their inverse back to `before`.
 */

const seen = new Set<OperationKind>();
function ops(before: string, after: string, dialect: 'pg' | 'my' = 'pg'): Operation[] {
  const parse = dialect === 'pg' ? pg : my;
  const result = expectRoundTrip(parse(before), parse(after));
  for (const op of result.operations) seen.add(op.kind);
  return [...result.operations];
}

describe('every operation type', () => {
  it('createNamespace / dropNamespace', () => {
    expect(labels(ops('', 'CREATE SCHEMA app;'))).toEqual(['createNamespace:app']);
    expect(labels(ops('CREATE SCHEMA app;', ''))).toEqual(['dropNamespace:app']);
  });

  it('createEnum / dropEnum', () => {
    expect(ops('', "CREATE TYPE mood AS ENUM ('a');")).toEqual([
      { kind: 'createEnum', enum: { namespace: 'public', name: 'mood', values: ['a'] } },
    ]);
    expect(labels(ops("CREATE TYPE mood AS ENUM ('a');", ''))).toEqual(['dropEnum:mood']);
  });

  it('alterEnumAddValue, anchored before the next existing value', () => {
    const result = ops(
      "CREATE TYPE s AS ENUM ('draft', 'paid'); CREATE TABLE t (x s);",
      "CREATE TYPE s AS ENUM ('draft', 'open', 'paid', 'void'); CREATE TABLE t (x s);",
    );
    expect(result).toMatchObject([
      {
        kind: 'alterEnumAddValue',
        enum: { namespace: 'public', name: 's' },
        value: 'open',
        before: 'paid',
        from: ['draft', 'paid'],
        to: ['draft', 'open', 'paid'],
        columns: [{ table: { namespace: 'public', name: 't' }, column: 'x' }],
      },
      {
        kind: 'alterEnumAddValue',
        enum: { namespace: 'public', name: 's' },
        value: 'void',
        before: null,
        from: ['draft', 'open', 'paid'],
        to: ['draft', 'open', 'paid', 'void'],
        columns: [{ table: { namespace: 'public', name: 't' }, column: 'x' }],
      },
    ]);
  });

  it('recreateEnum for removed or reordered values', () => {
    expect(
      labels(
        ops(
          "CREATE TYPE p AS ENUM ('low', 'high', 'mid');",
          "CREATE TYPE p AS ENUM ('low', 'mid', 'high');",
        ),
      ),
    ).toEqual(['recreateEnum:p']);
  });

  it('createTable / dropTable', () => {
    expect(labels(ops('', 'CREATE TABLE t (id int PRIMARY KEY);'))).toEqual(['createTable:t']);
    expect(labels(ops('CREATE TABLE t (id int PRIMARY KEY);', ''))).toEqual(['dropTable:t']);
  });

  it('addColumn / dropColumn', () => {
    expect(labels(ops('CREATE TABLE t (a int);', 'CREATE TABLE t (a int, b text);'))).toEqual([
      'addColumn:t.b',
    ]);
    expect(labels(ops('CREATE TABLE t (a int, b text);', 'CREATE TABLE t (a int);'))).toEqual([
      'dropColumn:t.b',
    ]);
  });

  it('alterColumnType, nullability, default', () => {
    expect(
      labels(
        ops(
          'CREATE TABLE t (a int, b text, c int);',
          'CREATE TABLE t (a bigint, b text NOT NULL, c int DEFAULT 1);',
        ),
      ),
    ).toEqual(['alterColumnType:t.a', 'alterColumnDefault:t.c', 'alterColumnNullability:t.b']);
  });

  it('addPrimaryKey / dropPrimaryKey', () => {
    expect(labels(ops('CREATE TABLE t (a int);', 'CREATE TABLE t (a int PRIMARY KEY);'))).toEqual([
      'alterColumnNullability:t.a',
      'addPrimaryKey:t',
    ]);
    expect(
      labels(
        ops('CREATE TABLE t (a int NOT NULL PRIMARY KEY);', 'CREATE TABLE t (a int NOT NULL);'),
      ),
    ).toEqual(['dropPrimaryKey:t']);
  });

  it('createIndex / dropIndex', () => {
    expect(
      labels(ops('CREATE TABLE t (a int);', 'CREATE TABLE t (a int); CREATE INDEX t_a ON t (a);')),
    ).toEqual(['createIndex:t_a']);
    expect(
      labels(ops('CREATE TABLE t (a int); CREATE INDEX t_a ON t (a);', 'CREATE TABLE t (a int);')),
    ).toEqual(['dropIndex:t_a']);
  });

  it('addUnique / dropUnique', () => {
    expect(labels(ops('CREATE TABLE t (a int);', 'CREATE TABLE t (a int UNIQUE);'))).toEqual([
      'addUnique:t_a_key',
    ]);
    expect(labels(ops('CREATE TABLE t (a int UNIQUE);', 'CREATE TABLE t (a int);'))).toEqual([
      'dropUnique:t_a_key',
    ]);
  });

  it('addForeignKey / dropForeignKey', () => {
    const base = 'CREATE TABLE u (id int PRIMARY KEY); CREATE TABLE t (u_id int';
    expect(labels(ops(`${base});`, `${base} REFERENCES u);`))).toEqual([
      'addForeignKey:t_u_id_fkey',
    ]);
    expect(labels(ops(`${base} REFERENCES u);`, `${base});`))).toEqual([
      'dropForeignKey:t_u_id_fkey',
    ]);
  });

  it('addCheck / dropCheck', () => {
    expect(labels(ops('CREATE TABLE t (a int);', 'CREATE TABLE t (a int CHECK (a > 0));'))).toEqual(
      ['addCheck:t_a_check'],
    );
    expect(labels(ops('CREATE TABLE t (a int CHECK (a > 0));', 'CREATE TABLE t (a int);'))).toEqual(
      ['dropCheck:t_a_check'],
    );
  });

  it('setComment on tables and columns', () => {
    expect(
      ops(
        "CREATE TABLE t (a int); COMMENT ON TABLE t IS 'old';",
        "CREATE TABLE t (a int); COMMENT ON TABLE t IS 'new'; COMMENT ON COLUMN t.a IS 'A';",
      ),
    ).toMatchObject([
      {
        kind: 'setComment',
        table: { namespace: 'public', name: 't' },
        column: null,
        from: 'old',
        to: 'new',
      },
      {
        kind: 'setComment',
        table: { namespace: 'public', name: 't' },
        column: 'a',
        from: null,
        to: 'A',
      },
    ]);
  });

  it('renameTable / renameColumn (confirmed)', () => {
    const before = pg('CREATE TABLE users (id int, mail text);');
    const after = pg('CREATE TABLE members (id int, email text);');
    const result = expectRoundTrip(before, after, {
      confirmedRenames: [
        'table:public.users=>public.members',
        'column:public.users.mail=>public.members.email',
      ],
    });
    for (const op of result.operations) seen.add(op.kind);
    expect(labels(result.operations)).toEqual([
      'renameTable:users->members',
      'renameColumn:members.mail->email',
    ]);
  });

  it('MySQL ops replay too', () => {
    expect(
      labels(
        ops(
          "CREATE TABLE t (s enum('a'));",
          "CREATE TABLE t (s enum('a','b'), n int NOT NULL DEFAULT 0);",
          'my',
        ),
      ),
    ).toEqual(['alterEnumAddValue:t_s.b', 'addColumn:t.n']);
  });

  it('covers all 26 operation kinds', () => {
    expect([...seen].sort()).toEqual(
      [
        'createNamespace',
        'dropNamespace',
        'createEnum',
        'dropEnum',
        'alterEnumAddValue',
        'recreateEnum',
        'createTable',
        'dropTable',
        'renameTable',
        'addColumn',
        'dropColumn',
        'renameColumn',
        'alterColumnType',
        'alterColumnNullability',
        'alterColumnDefault',
        'addPrimaryKey',
        'dropPrimaryKey',
        'createIndex',
        'dropIndex',
        'addUnique',
        'dropUnique',
        'addForeignKey',
        'dropForeignKey',
        'addCheck',
        'dropCheck',
        'setComment',
      ].sort(),
    );
  });
});
