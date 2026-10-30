import { describe, expect, it } from 'vitest';
import { blogSchema, deepFreeze } from './__fixtures__/schemas';
import {
  IrEditError,
  addCheck,
  addColumn,
  addEnum,
  addForeignKey,
  addIndex,
  addNamespace,
  addTable,
  addUnique,
  createSchema,
  removeCheck,
  removeColumn,
  removeEnum,
  removeForeignKey,
  removeIndex,
  removeTable,
  removeUnique,
  renameColumn,
  renameNamespace,
  renameTable,
  setPrimaryKey,
  updateColumn,
  updateEnum,
  updateTable,
} from './edit';
import { validateSchema } from './schema';
import type { Schema, Table } from './types';

/** Matches any generated id; typed so it can sit inside expected objects. */
const anyId: unknown = expect.any(String);

/** A frozen fixture: any in-place mutation by an edit function throws. */
const frozen = () => deepFreeze(blogSchema());

function table(schema: Schema, id: string): Table {
  const found = schema.tables.find((t) => t.id === id);
  if (!found) throw new Error(`no table ${id}`);
  return found;
}

describe('createSchema', () => {
  it('creates an empty schema with a generated id', () => {
    const schema = createSchema('sqlite');
    expect(schema).toEqual({
      id: anyId,
      dialect: 'sqlite',
      namespaces: [],
      tables: [],
      enums: [],
      version: 1,
    });
    expect(schema.id).toHaveLength(21);
    expect(createSchema('mysql').id).not.toBe(schema.id);
  });

  it('accepts an explicit id', () => {
    expect(createSchema('postgres', { id: 's1' }).id).toBe('s1');
  });
});

describe('namespaces', () => {
  it('adds and renames namespaces', () => {
    const base = deepFreeze(createSchema('postgres', { id: 's' }));
    const added = addNamespace(base, { name: 'public' });
    expect(added.namespaces).toEqual([{ id: anyId, name: 'public' }]);
    const withId = addNamespace(added, { id: 'ns_x', name: 'x' });
    expect(renameNamespace(withId, 'ns_x', 'y').namespaces[1]).toEqual({ id: 'ns_x', name: 'y' });
    expect(base.namespaces).toEqual([]);
  });

  it('throws for an unknown namespace', () => {
    expect(() => renameNamespace(frozen(), 'nope', 'x')).toThrow(IrEditError);
  });
});

describe('tables', () => {
  it('adds a table with defaults and built columns', () => {
    const next = addTable(frozen(), {
      id: 't_tags',
      name: 'tags',
      namespace: 'ns_public',
      columns: [{ name: 'label', logicalType: { kind: 'text' }, nativeType: 'text' }],
    });
    expect(table(next, 't_tags')).toEqual({
      id: 't_tags',
      name: 'tags',
      namespace: 'ns_public',
      columns: [
        {
          id: anyId,
          name: 'label',
          logicalType: { kind: 'text' },
          nativeType: 'text',
          nullable: true,
          default: null,
          autoIncrement: false,
          comment: null,
        },
      ],
      primaryKey: null,
      indexes: [],
      uniques: [],
      foreignKeys: [],
      checks: [],
      comment: null,
    });
    expect(validateSchema(next)).toEqual([]);
  });

  it('generates an id and keeps a given comment', () => {
    const next = addTable(frozen(), { name: 'tags', namespace: 'ns_public', comment: 'Tags' });
    const added = next.tables[2];
    expect(added?.id).toHaveLength(21);
    expect(added?.comment).toBe('Tags');
    expect(added?.columns).toEqual([]);
  });

  it('renames and updates a table, sharing untouched subtrees', () => {
    const before = frozen();
    const renamed = renameTable(before, 't_users', 'accounts');
    expect(table(renamed, 't_users').name).toBe('accounts');
    expect(table(renamed, 't_users').columns).toBe(table(before, 't_users').columns);
    expect(table(renamed, 't_posts')).toBe(table(before, 't_posts'));
    expect(before.tables[0]?.name).toBe('users');

    const updated = updateTable(before, 't_posts', { comment: 'Blog posts' });
    expect(table(updated, 't_posts').comment).toBe('Blog posts');
  });

  it('removes a table and the foreign keys pointing at it', () => {
    const before = frozen();
    const next = removeTable(before, 't_users');
    expect(next.tables.map((t) => t.id)).toEqual(['t_posts']);
    expect(table(next, 't_posts').foreignKeys).toEqual([]);
    expect(validateSchema(next)).toEqual([]);
  });

  it('leaves unrelated tables untouched when removing one', () => {
    const before = frozen();
    const next = removeTable(before, 't_posts');
    expect(table(next, 't_users')).toBe(table(before, 't_users'));
  });

  it('throws IrEditError for unknown tables', () => {
    const error = (() => {
      try {
        renameTable(frozen(), 't_gone', 'x');
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(IrEditError);
    expect(error).toMatchObject({
      code: 'not-found',
      kind: 'table',
      id: 't_gone',
      name: 'IrEditError',
      message: 'No table with id t_gone',
    });
    expect(() => removeTable(frozen(), 't_gone')).toThrow(IrEditError);
  });
});

describe('columns', () => {
  it('adds a column with an explicit id and overrides', () => {
    const next = addColumn(frozen(), 't_posts', {
      id: 'c_title',
      name: 'title',
      logicalType: { kind: 'varchar', length: 200 },
      nativeType: 'varchar(200)',
      nullable: false,
      default: { kind: 'literal', value: '' },
    });
    expect(table(next, 't_posts').columns.at(-1)).toMatchObject({
      id: 'c_title',
      nullable: false,
      default: { kind: 'literal', value: '' },
    });
  });

  it('updates and renames a column', () => {
    const before = frozen();
    const updated = updateColumn(before, 't_posts', 'c_posts_body', {
      nullable: false,
      comment: 'Markdown',
    });
    expect(table(updated, 't_posts').columns[3]).toMatchObject({
      name: 'body',
      nullable: false,
      comment: 'Markdown',
    });
    expect(table(updated, 't_posts').columns[0]).toBe(table(before, 't_posts').columns[0]);

    const renamed = renameColumn(before, 't_posts', 'c_posts_body', 'content');
    expect(table(renamed, 't_posts').columns[3]?.name).toBe('content');
  });

  it('throws for an unknown column', () => {
    expect(() => updateColumn(frozen(), 't_posts', 'c_gone', {})).toThrow(
      /No column with id c_gone/,
    );
    expect(() => removeColumn(frozen(), 't_posts', 'c_gone')).toThrow(IrEditError);
  });

  it('removing a column cascades to the primary key, indexes, uniques and foreign keys', () => {
    let schema = frozen();
    schema = addUnique(schema, 't_posts', {
      id: 'uq',
      name: 'posts_author_status_key',
      columns: ['c_posts_author', 'c_posts_status'],
    });
    schema = removeColumn(schema, 't_posts', 'c_posts_author');
    const posts = table(schema, 't_posts');
    expect(posts.columns.map((c) => c.id)).toEqual([
      'c_posts_id',
      'c_posts_status',
      'c_posts_body',
    ]);
    expect(posts.indexes).toEqual([]);
    expect(posts.uniques).toEqual([]);
    expect(posts.foreignKeys).toEqual([]);
    expect(posts.primaryKey).toEqual({ id: 'pk_posts', name: null, columns: ['c_posts_id'] });
    expect(validateSchema(schema)).toEqual([]);
  });

  it('removing a column shrinks a composite primary key and drops an emptied one', () => {
    let schema = setPrimaryKey(frozen(), 't_posts', {
      id: 'pk',
      columns: ['c_posts_id', 'c_posts_author'],
    });
    schema = removeColumn(schema, 't_posts', 'c_posts_author');
    expect(table(schema, 't_posts').primaryKey?.columns).toEqual(['c_posts_id']);
    schema = removeColumn(schema, 't_posts', 'c_posts_id');
    expect(table(schema, 't_posts').primaryKey).toBeNull();
    // A table without a primary key stays without one.
    schema = removeColumn(schema, 't_posts', 'c_posts_body');
    expect(table(schema, 't_posts').primaryKey).toBeNull();
  });

  it('removing a referenced column drops inbound foreign keys only', () => {
    const before = frozen();
    const afterEmail = removeColumn(before, 't_users', 'c_users_email');
    expect(table(afterEmail, 't_posts')).toBe(table(before, 't_posts'));

    const afterId = removeColumn(before, 't_users', 'c_users_id');
    expect(table(afterId, 't_posts').foreignKeys).toEqual([]);
    expect(table(afterId, 't_users').primaryKey).toBeNull();
    expect(validateSchema(afterId)).toEqual([]);
  });
});

describe('primary keys', () => {
  it('sets, replaces and clears the primary key', () => {
    const set = setPrimaryKey(frozen(), 't_posts', { columns: ['c_posts_id', 'c_posts_author'] });
    expect(table(set, 't_posts').primaryKey).toEqual({
      id: anyId,
      name: null,
      columns: ['c_posts_id', 'c_posts_author'],
    });
    const named = setPrimaryKey(set, 't_posts', {
      id: 'pk_x',
      name: 'posts_pk',
      columns: ['c_posts_id'],
    });
    expect(table(named, 't_posts').primaryKey).toEqual({
      id: 'pk_x',
      name: 'posts_pk',
      columns: ['c_posts_id'],
    });
    expect(table(setPrimaryKey(named, 't_posts', null), 't_posts').primaryKey).toBeNull();
  });
});

describe('indexes', () => {
  it('adds an index with defaults and removes it', () => {
    const added = addIndex(frozen(), 't_posts', {
      id: 'ix_status',
      name: 'posts_status_idx',
      columns: [
        { column: 'c_posts_status' },
        { column: 'c_posts_id', order: 'desc', nulls: 'first' },
      ],
    });
    expect(table(added, 't_posts').indexes[1]).toEqual({
      id: 'ix_status',
      name: 'posts_status_idx',
      columns: [
        { column: 'c_posts_status', order: 'asc', nulls: null },
        { column: 'c_posts_id', order: 'desc', nulls: 'first' },
      ],
      unique: false,
      method: null,
      where: null,
    });
    const generated = addIndex(added, 't_posts', {
      name: 'x',
      unique: true,
      method: 'hash',
      columns: [{ column: 'c_posts_id' }],
    });
    expect(table(generated, 't_posts').indexes[2]).toMatchObject({
      id: anyId,
      unique: true,
      method: 'hash',
    });

    const removed = removeIndex(added, 't_posts', 'ix_status');
    expect(table(removed, 't_posts').indexes.map((i) => i.id)).toEqual(['ix_posts_author']);
    expect(() => removeIndex(added, 't_posts', 'ix_gone')).toThrow(/No index with id ix_gone/);
  });
});

describe('unique constraints', () => {
  it('adds and removes a unique constraint', () => {
    const added = addUnique(frozen(), 't_posts', {
      name: 'posts_body_key',
      columns: ['c_posts_body'],
    });
    const unique = table(added, 't_posts').uniques[0];
    expect(unique).toEqual({ id: anyId, name: 'posts_body_key', columns: ['c_posts_body'] });
    const removed = removeUnique(added, 't_posts', unique?.id ?? '');
    expect(table(removed, 't_posts').uniques).toEqual([]);
    expect(() => removeUnique(removed, 't_posts', 'uq_gone')).toThrow(/No unique with id/);
  });
});

describe('foreign keys', () => {
  it('adds a foreign key with default actions and removes it', () => {
    const added = addForeignKey(frozen(), 't_users', {
      name: 'users_self_fkey',
      columns: ['c_users_id'],
      refTable: 't_users',
      refColumns: ['c_users_id'],
    });
    expect(table(added, 't_users').foreignKeys[0]).toEqual({
      id: anyId,
      name: 'users_self_fkey',
      columns: ['c_users_id'],
      refTable: 't_users',
      refColumns: ['c_users_id'],
      onDelete: 'no action',
      onUpdate: 'no action',
    });
    const explicit = addForeignKey(frozen(), 't_users', {
      id: 'fk_x',
      name: 'x',
      columns: ['c_users_id'],
      refTable: 't_posts',
      refColumns: ['c_posts_id'],
      onDelete: 'set null',
      onUpdate: 'cascade',
    });
    expect(table(explicit, 't_users').foreignKeys[0]).toMatchObject({
      id: 'fk_x',
      onDelete: 'set null',
      onUpdate: 'cascade',
    });

    const removed = removeForeignKey(frozen(), 't_posts', 'fk_posts_author');
    expect(table(removed, 't_posts').foreignKeys).toEqual([]);
    expect(() => removeForeignKey(removed, 't_posts', 'fk_posts_author')).toThrow(
      /No foreignKey with id/,
    );
  });
});

describe('checks', () => {
  it('adds and removes a check constraint', () => {
    const added = addCheck(frozen(), 't_posts', {
      id: 'ck',
      name: 'posts_id_positive',
      expression: 'id > 0',
    });
    expect(table(added, 't_posts').checks).toEqual([
      { id: 'ck', name: 'posts_id_positive', expression: 'id > 0' },
    ]);
    expect(
      table(addCheck(frozen(), 't_posts', { name: 'c', expression: 'true' }), 't_posts').checks[0]
        ?.id,
    ).toHaveLength(21);
    expect(table(removeCheck(added, 't_posts', 'ck'), 't_posts').checks).toEqual([]);
    expect(() => removeCheck(added, 't_posts', 'ck_gone')).toThrow(/No check with id/);
  });
});

describe('enums', () => {
  it('adds, updates and removes enums', () => {
    const added = addEnum(frozen(), {
      name: 'role',
      namespace: 'ns_public',
      values: ['admin', 'member'],
    });
    expect(added.enums[1]).toEqual({
      id: anyId,
      name: 'role',
      namespace: 'ns_public',
      values: ['admin', 'member'],
    });
    const withId = addEnum(frozen(), {
      id: 'e_role',
      name: 'role',
      namespace: 'ns_public',
      values: ['a'],
    });
    expect(updateEnum(withId, 'e_role', { values: ['a', 'b'] }).enums[1]).toEqual({
      id: 'e_role',
      name: 'role',
      namespace: 'ns_public',
      values: ['a', 'b'],
    });
    expect(removeEnum(withId, 'e_role').enums.map((e) => e.id)).toEqual(['enum_status']);
    expect(() => updateEnum(withId, 'e_gone', {})).toThrow(/No enum with id/);
  });

  it('leaves columns typed with a removed enum for validation to report', () => {
    const next = removeEnum(frozen(), 'enum_status');
    expect(validateSchema(next).map((p) => p.code)).toEqual(['enum-missing']);
  });
});
