import { describe, expect, it } from 'vitest';
import { DraftSchema, draftColumn, emptyResult, finalize } from './draft';

const at = { line: 3, column: 1 };
const readable = { createId: (hint: string) => hint };

function blog(): DraftSchema {
  const draft = new DraftSchema('postgres', 'public');
  const users = draft.addTable('public', 'users', at);
  if (!users) throw new Error('unreachable');
  users.columns.push(draftColumn('id', 'integer', at, { nullable: true }));
  users.primaryKey = { name: null, columns: ['id'], loc: at };
  return draft;
}

describe('finalize', () => {
  it('uses nanoid ids by default', () => {
    const { schema } = finalize(blog());
    expect(schema.id).toMatch(/^[\w-]{21}$/);
    expect(schema.tables[0]?.id).not.toBe(schema.id);
  });

  it('passes readable hints to a custom id factory and dedupes them', () => {
    const draft = blog();
    const users = draft.tables[0];
    users?.columns.push(draftColumn('id', 'integer', at));
    const { schema, diagnostics } = finalize(draft, readable);
    expect(schema.tables[0]?.columns.map((c) => c.id)).toEqual([
      'column:public.users.id',
      'column:public.users.id#2',
    ]);
    // The duplicate itself is a source problem, surfaced from validation.
    expect(diagnostics.map((d) => d.code)).toEqual(['ir-duplicate-column-name']);
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', line: 3, column: 1 });
  });

  it('makes primary key columns NOT NULL', () => {
    const { schema } = finalize(blog(), readable);
    expect(schema.tables[0]?.columns[0]?.nullable).toBe(false);
  });

  it('drops an unused default namespace but keeps it when nothing else exists', () => {
    const draft = new DraftSchema('postgres', 'public');
    draft.addTable('auth', 'accounts', at);
    expect(finalize(draft, readable).schema.namespaces.map((n) => n.name)).toEqual(['auth']);
    expect(emptyResult('postgres', 'public', [], readable).schema.namespaces).toEqual([
      { id: 'namespace:public', name: 'public' },
    ]);
  });

  it('reports and drops foreign keys to unknown tables or columns', () => {
    const draft = blog();
    const posts = draft.addTable('public', 'posts', at);
    if (!posts) throw new Error('unreachable');
    posts.columns.push(draftColumn('author_id', 'integer', at));
    const fk = {
      columns: ['author_id'],
      onDelete: 'no action' as const,
      onUpdate: 'no action' as const,
      loc: at,
    };
    posts.foreignKeys.push(
      { ...fk, name: 'to_ghost', ref: { namespace: null, name: 'ghosts' }, refColumns: ['id'] },
      { ...fk, name: 'to_bad_col', ref: { namespace: null, name: 'users' }, refColumns: ['nope'] },
      {
        ...fk,
        name: 'bad_local',
        columns: ['nope'],
        ref: { namespace: null, name: 'users' },
        refColumns: ['id'],
      },
      { ...fk, name: 'to_pk', ref: { namespace: 'public', name: 'users' }, refColumns: null },
    );
    const { schema, diagnostics } = finalize(draft, readable);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Foreign key "to_ghost" references unknown table "ghosts"',
      'Foreign key "to_bad_col" references unknown column "nope" in "users"',
      'Foreign key "bad_local" references unknown column "nope" in "posts"',
    ]);
    expect(schema.tables[1]?.foreignKeys.map((f) => [f.name, f.refColumns])).toEqual([
      ['to_pk', ['column:public.users.id']],
    ]);
  });

  it('reports a PK-less target when referenced columns are omitted', () => {
    const draft = new DraftSchema('mysql', 'db');
    const a = draft.addTable('db', 'a', at);
    draft.addTable('db', 'b', at);
    a?.columns.push(draftColumn('b_id', 'int', at));
    a?.foreignKeys.push({
      name: null,
      columns: ['b_id'],
      ref: { namespace: null, name: 'b' },
      refColumns: null,
      onDelete: 'no action',
      onUpdate: 'no action',
      loc: at,
    });
    expect(finalize(draft, readable).diagnostics.map((d) => d.message)).toEqual([
      'Foreign key omits referenced columns but "b" has no primary key',
    ]);
  });

  it('names unnamed constraints like each database would', () => {
    const build = (dialect: 'postgres' | 'mysql') => {
      const draft = new DraftSchema(dialect, 'public');
      const t = draft.addTable('public', 't', at);
      if (!t) throw new Error('unreachable');
      t.columns.push(draftColumn('a', 'int', at), draftColumn('b', 'int', at));
      t.uniques.push({ name: null, columns: ['a', 'b'], loc: at });
      t.indexes.push({
        name: null,
        columns: [{ name: 'b', order: 'asc', nulls: null }],
        unique: false,
        method: null,
        where: null,
        loc: at,
      });
      t.checks.push(
        { name: null, expression: 'a > 0', column: 'a', loc: at },
        { name: null, expression: 'a < b', loc: at },
      );
      t.foreignKeys.push({
        name: null,
        columns: ['a'],
        ref: { namespace: null, name: 't' },
        refColumns: ['b'],
        onDelete: 'no action',
        onUpdate: 'no action',
        loc: at,
      });
      const table = finalize(draft, readable).schema.tables[0];
      return [
        table?.uniques[0]?.name,
        table?.indexes[0]?.name,
        table?.checks.map((c) => c.name),
        table?.foreignKeys[0]?.name,
      ];
    };
    expect(build('postgres')).toEqual([
      't_a_b_key',
      't_b_idx',
      ['t_a_check', 't_check'],
      't_a_fkey',
    ]);
    expect(build('mysql')).toEqual(['a', 'b', ['t_chk_1', 't_chk_2'], 't_ibfk_1']);
  });

  it('resolves enum references and reports missing ones', () => {
    const draft = new DraftSchema('postgres', 'public');
    draft.addEnum('public', 'mood', ['happy'], at);
    draft.addEnum('public', 'mood', ['dup'], at);
    const t = draft.addTable('public', 't', at);
    t?.columns.push(
      draftColumn('a', 'mood', at),
      draftColumn('b', '"mood"', at),
      draftColumn('c', 'public.mood', at),
      draftColumn('d', 'x', at, { enumRef: { namespace: null, name: 'gone' } }),
      draftColumn('e', 'a.b.c', at),
    );
    const { schema, diagnostics } = finalize(draft, readable);
    expect(schema.tables[0]?.columns.map((c) => c.logicalType)).toEqual([
      { kind: 'enum', enumId: 'enum:public.mood' },
      { kind: 'enum', enumId: 'enum:public.mood' },
      { kind: 'enum', enumId: 'enum:public.mood' },
      { kind: 'unknown' },
      { kind: 'unknown' },
    ]);
    expect(diagnostics.map((d) => d.code)).toEqual([
      'duplicate-definition',
      'unresolved-reference',
      'unknown-type',
    ]);
  });

  it('keeps sqlite types as unknown unless the source supplied a logical type', () => {
    const draft = new DraftSchema('sqlite', 'main');
    const t = draft.addTable('main', 't', at);
    t?.columns.push(
      draftColumn('a', 'INTEGER', at, { logicalType: { kind: 'int' } }),
      draftColumn('b', 'BLOB', at),
    );
    expect(
      finalize(draft, readable).schema.tables[0]?.columns.map((c) => c.logicalType.kind),
    ).toEqual(['int', 'unknown']);
  });

  it('ignores duplicate table definitions with a diagnostic', () => {
    const draft = new DraftSchema('postgres', 'public');
    draft.addTable('public', 't', at);
    expect(draft.addTable('public', 't', at, { ifNotExists: true })).toBeNull();
    expect(draft.addTable('public', 't', at)).toBeNull();
    expect(draft.diagnostics.map((d) => d.severity)).toEqual(['info', 'warning']);
  });

  it('merges column-level primary keys and warns on a second table-level one', () => {
    const draft = new DraftSchema('postgres', 'public');
    const t = draft.addTable('public', 't', at);
    if (!t) throw new Error('unreachable');
    draft.addPrimaryKey(t, { name: null, columns: ['a'], loc: at }, true);
    draft.addPrimaryKey(t, { name: null, columns: ['b'], loc: at }, true);
    expect(t.primaryKey?.columns).toEqual(['a', 'b']);
    draft.addPrimaryKey(t, { name: 'pk', columns: ['c'], loc: at });
    expect(t.primaryKey).toEqual({ name: 'pk', columns: ['c'], loc: at });
    expect(draft.diagnostics.map((d) => d.code)).toEqual(['duplicate-definition']);
  });
});
