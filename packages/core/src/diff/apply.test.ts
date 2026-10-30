import { describe, expect, it } from 'vitest';
import { diffCanonical, pg } from './__test-utils__/harness';
import { ApplyError, applyOperations } from './apply';
import type { ColumnDef, Operation, QName, TableDef } from './types';

/*
 * applyOperations is the referee for every ordering test, so each of its preconditions is
 * pinned here: one invalid operation per rule, plus replays that must keep references intact.
 */

const schema = pg(`CREATE TYPE mood AS ENUM ('a', 'b');
CREATE SCHEMA app;
CREATE TABLE u (id int PRIMARY KEY, code text UNIQUE, alt int, m mood);
CREATE UNIQUE INDEX u_alt ON u (alt);
CREATE TABLE t (
  u_id int REFERENCES u, u_code text REFERENCES u (code), u_alt int REFERENCES u (alt),
  x int CHECK (x > 0), y text, CONSTRAINT t_xy UNIQUE (x, y));
CREATE INDEX t_y ON t (y);
COMMENT ON TABLE t IS 'T';`);

const U: QName = { namespace: 'public', name: 'u' };
const T: QName = { namespace: 'public', name: 't' };
const column = (name: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  name,
  nativeType: 'int',
  logicalType: { kind: 'int' },
  nullable: true,
  default: null,
  autoIncrement: false,
  comment: null,
  metadata: {},
  ...extra,
});
const tableDef = (q: QName, extra: Partial<TableDef> = {}): TableDef => ({
  ...q,
  columns: [],
  primaryKey: null,
  uniques: [],
  checks: [],
  indexes: [],
  comment: null,
  metadata: {},
  ...extra,
});
/** Column definitions carried by alter ops; applyOperations does not read them. */
const defs = { before: column('x'), after: column('x') };
const fk = {
  name: 'n',
  columns: ['x'],
  refTable: U,
  refColumns: ['id'],
  onDelete: 'no action',
  onUpdate: 'no action',
} as const;
const mood = { namespace: 'public', name: 'mood' };

const invalid: [string, Operation, RegExp][] = [
  ['create existing namespace', { kind: 'createNamespace', name: 'app' }, /exists/],
  ['drop missing namespace', { kind: 'dropNamespace', name: 'nope' }, /no namespace/],
  ['drop non-empty namespace', { kind: 'dropNamespace', name: 'public' }, /cannot be dropped/],
  ['create existing enum', { kind: 'createEnum', enum: { ...mood, values: [] } }, /exists/],
  [
    'create enum in missing namespace',
    { kind: 'createEnum', enum: { namespace: 'nope', name: 'e', values: [] } },
    /no namespace/,
  ],
  [
    'drop missing enum',
    { kind: 'dropEnum', enum: { namespace: 'public', name: 'nope', values: [] } },
    /no enum/,
  ],
  [
    'enum values differ',
    { kind: 'recreateEnum', enum: mood, from: ['z'], to: ['a'], columns: [] },
    /has values/,
  ],
  [
    'enum column does not use it',
    {
      kind: 'recreateEnum',
      enum: mood,
      from: ['a', 'b'],
      to: ['a'],
      columns: [{ table: T, column: 'x', ...defs }],
    },
    /does not use/,
  ],
  ['create existing table', { kind: 'createTable', table: tableDef(U) }, /exists/],
  [
    'create table with unknown enum',
    {
      kind: 'createTable',
      table: tableDef(
        { namespace: 'app', name: 'n' },
        {
          columns: [
            column('e', {
              logicalType: { kind: 'enum', enum: { namespace: 'public', name: 'gone' } },
            }),
          ],
        },
      ),
    },
    /no enum/,
  ],
  [
    'create table with index on missing column',
    {
      kind: 'createTable',
      table: tableDef(
        { namespace: 'app', name: 'n' },
        {
          indexes: [
            {
              name: 'i',
              columns: [{ name: 'q', order: 'asc', nulls: null }],
              unique: false,
              method: null,
              where: null,
            },
          ],
        },
      ),
    },
    /no column/,
  ],
  [
    'drop table that has foreign keys',
    { kind: 'dropTable', table: tableDef(T) },
    /still has foreign keys/,
  ],
  [
    'rename onto a missing namespace',
    { kind: 'renameTable', from: T, to: { namespace: 'gone', name: 't' } },
    /no namespace/,
  ],
  [
    'rename missing table',
    { kind: 'renameTable', from: { namespace: 'public', name: 'gone' }, to: T },
    /no table/,
  ],
  ['add existing column', { kind: 'addColumn', table: T, column: column('x') }, /exists/],
  [
    'drop column used by a unique',
    { kind: 'dropColumn', table: T, column: column('y') },
    /still used/,
  ],
  [
    'drop column with its own fk',
    { kind: 'dropColumn', table: T, column: column('u_id') },
    /still used/,
  ],
  [
    'drop referenced column',
    { kind: 'dropColumn', table: U, column: column('code') },
    /still used/,
  ],
  [
    'rename onto an existing column',
    { kind: 'renameColumn', table: T, from: 'x', to: 'y' },
    /exists/,
  ],
  [
    'type differs',
    {
      kind: 'alterColumnType',
      definition: defs,
      table: T,
      column: 'x',
      from: { nativeType: 'text', logicalType: { kind: 'text' } },
      to: { nativeType: 'int', logicalType: { kind: 'int' } },
    },
    /differs/,
  ],
  [
    'type to unknown enum',
    {
      kind: 'alterColumnType',
      definition: defs,
      table: T,
      column: 'x',
      from: { nativeType: 'int', logicalType: { kind: 'int' } },
      to: {
        nativeType: 'e',
        logicalType: { kind: 'enum', enum: { namespace: 'public', name: 'gone' } },
      },
    },
    /no enum/,
  ],
  [
    'default differs',
    {
      kind: 'alterColumnDefault',
      definition: defs,
      table: T,
      column: 'x',
      from: { default: null, autoIncrement: true, identity: null },
      to: { default: null, autoIncrement: false, identity: null },
    },
    /differs/,
  ],
  [
    'second primary key',
    { kind: 'addPrimaryKey', table: U, primaryKey: { name: null, columns: ['id'] } },
    /already has/,
  ],
  [
    'drop missing primary key',
    { kind: 'dropPrimaryKey', table: T, primaryKey: { name: null, columns: [] } },
    /no primary key/,
  ],
  [
    'existing index',
    {
      kind: 'createIndex',
      table: T,
      index: {
        name: 't_y',
        columns: [{ name: 'y', order: 'asc', nulls: null }],
        unique: false,
        method: null,
        where: null,
      },
    },
    /exists/,
  ],
  [
    'drop missing index',
    {
      kind: 'dropIndex',
      table: T,
      index: { name: 'gone', columns: [], unique: false, method: null, where: null },
    },
    /no index/,
  ],
  [
    'drop unique index a foreign key needs',
    {
      kind: 'dropIndex',
      table: U,
      index: { name: 'u_alt', columns: [], unique: true, method: null, where: null },
    },
    /still references/,
  ],
  [
    'existing unique',
    { kind: 'addUnique', table: T, unique: { name: 't_xy', columns: ['x'] } },
    /exists/,
  ],
  [
    'drop missing unique',
    { kind: 'dropUnique', table: T, unique: { name: 'gone', columns: [] } },
    /no unique/,
  ],
  [
    'drop unique a foreign key needs',
    { kind: 'dropUnique', table: U, unique: { name: 'u_code_key', columns: ['code'] } },
    /still references/,
  ],
  [
    'existing foreign key',
    { kind: 'addForeignKey', table: T, foreignKey: { ...fk, name: 't_u_id_fkey' } },
    /exists/,
  ],
  [
    'drop missing foreign key',
    { kind: 'dropForeignKey', table: T, foreignKey: { ...fk, name: 'gone' } },
    /no foreign key/,
  ],
  [
    'existing check',
    { kind: 'addCheck', table: T, check: { name: 't_x_check', expression: 'true' } },
    /exists/,
  ],
  [
    'drop missing check',
    { kind: 'dropCheck', table: T, check: { name: 'gone', expression: 'true' } },
    /no check/,
  ],
  [
    'table comment differs',
    { kind: 'setComment', table: T, column: null, from: 'other', to: 'x', definition: null },
    /differs/,
  ],
  [
    'column comment differs',
    { kind: 'setComment', table: T, column: 'x', from: 'other', to: 'x', definition: defs },
    /differs/,
  ],
];

describe('applyOperations preconditions', () => {
  it.each(invalid)('rejects: %s', (_label, op, message) => {
    expect(() => applyOperations(schema, [op])).toThrow(message);
    expect(() => applyOperations(schema, [op])).toThrow(ApplyError);
  });

  it('rethrows unexpected errors untouched', () => {
    expect(() => applyOperations(schema, [{ kind: 'addColumn' } as Operation])).toThrow(TypeError);
  });

  it('refuses to drop a namespace that still holds objects', () => {
    expect(() =>
      applyOperations(schema, [
        { kind: 'createTable', table: tableDef({ namespace: 'app', name: 'n' }) },
        { kind: 'dropNamespace', name: 'app' },
      ]),
    ).toThrow(/Operation 1 \(dropNamespace\).*not empty/);
    expect(() =>
      applyOperations(schema, [
        { kind: 'createEnum', enum: { namespace: 'app', name: 'e', values: ['x'] } },
        { kind: 'dropNamespace', name: 'app' },
      ]),
    ).toThrow(/not empty/);
  });

  it('renames a table nothing references without touching other foreign keys', () => {
    const renamed = applyOperations(schema, [
      { kind: 'renameTable', from: T, to: { namespace: 'public', name: 't2' } },
    ]);
    expect(renamed.tables.map((t) => t.name)).toEqual(['u', 't2']);
  });

  it('allows dropping one of two keys covering the same referenced columns', () => {
    const s = pg(
      'CREATE TABLE u (id int PRIMARY KEY, CONSTRAINT u_id_key UNIQUE (id)); CREATE TABLE t (u_id int REFERENCES u);',
    );
    expect(() =>
      applyOperations(s, [
        { kind: 'dropUnique', table: U, unique: { name: 'u_id_key', columns: ['id'] } },
      ]),
    ).not.toThrow();
  });

  it('keeps references intact through renames', () => {
    const renamed = applyOperations(schema, [
      { kind: 'renameTable', from: U, to: { namespace: 'app', name: 'users' } },
      { kind: 'renameColumn', table: T, from: 'y', to: 'why' },
      { kind: 'renameColumn', table: { namespace: 'app', name: 'users' }, from: 'code', to: 'c' },
      { kind: 'setComment', table: T, column: 'x', from: null, to: 'X', definition: defs },
    ]);
    const expected = pg(`CREATE TYPE mood AS ENUM ('a', 'b');
CREATE SCHEMA app;
CREATE TABLE app.users (id int PRIMARY KEY, c text, alt int, m mood, CONSTRAINT u_code_key UNIQUE (c));
CREATE UNIQUE INDEX u_alt ON app.users (alt);
CREATE TABLE t (
  u_id int, u_code text, u_alt int, x int CHECK (x > 0), why text, CONSTRAINT t_xy UNIQUE (x, why),
  CONSTRAINT t_u_id_fkey FOREIGN KEY (u_id) REFERENCES app.users (id),
  CONSTRAINT t_u_code_fkey FOREIGN KEY (u_code) REFERENCES app.users (c),
  CONSTRAINT t_u_alt_fkey FOREIGN KEY (u_alt) REFERENCES app.users (alt));
CREATE INDEX t_y ON t (why);
COMMENT ON TABLE t IS 'T';
COMMENT ON COLUMN t.x IS 'X';`);
    expect(diffCanonical(renamed)).toEqual(diffCanonical(expected));
  });
});
