import { describe, expect, it } from 'vitest';
import { parseDBML } from '../parsers/dbml';
import { parsePostgresDDL } from '../parsers/postgres';
import { parsePrisma } from '../parsers/prisma';
import { toDBML } from '../serializers/dbml';
import { toPostgresDDL } from '../serializers/postgres';
import { toPrisma } from '../serializers/prisma';
import { blogSchema, column, deepFreeze } from './__fixtures__/schemas';
import { addColumn, renameColumn, updateColumn } from './edit';
import { mergeSchema } from './merge';
import { validateSchema } from './schema';
import type { Schema, Table } from './types';

const frozen = () => deepFreeze(blogSchema());

function table(schema: Schema, name: string): Table {
  const found = schema.tables.find((t) => t.name === name);
  if (!found) throw new Error(`no table ${name}`);
  return found;
}

/** Ids in `parsed` that `merge` should replace, mimicking a parser's fresh nanoids. */
function withFreshIds(schema: Schema): Schema {
  const json = JSON.stringify(schema);
  return JSON.parse(
    json.replace(/"(t|c|ns|enum|pk|ix|uq|fk|ck)_([a-z_]+)"/g, '"new_$1_$2"'),
  ) as Schema;
}

describe('mergeSchema without a base', () => {
  it('returns current itself when the parsed schema has the same content', () => {
    const current = frozen();
    expect(mergeSchema(current, withFreshIds(blogSchema()))).toBe(current);
  });

  it('keeps every id matched by name and remaps references', () => {
    const current = frozen();
    const edited = updateColumn(withFreshIds(blogSchema()), 'new_t_users', 'new_c_users_email', {
      nullable: true,
    });
    const merged = mergeSchema(current, edited);

    expect(merged).not.toBe(current);
    expect(merged.id).toBe('schema');
    expect(merged.tables.map((t) => t.id)).toEqual(['t_users', 't_posts']);
    const users = table(merged, 'users');
    expect(users.columns.map((c) => c.id)).toEqual([
      'c_users_id',
      'c_users_email',
      'c_users_created',
    ]);
    expect(users.columns[1]?.nullable).toBe(true);
    const fk = table(merged, 'posts').foreignKeys[0];
    expect(fk).toMatchObject({
      id: 'fk_posts_author',
      refTable: 't_users',
      refColumns: ['c_users_id'],
    });
    expect(table(merged, 'posts').columns[2]?.logicalType).toEqual({
      kind: 'enum',
      enumId: 'enum_status',
    });
    expect(validateSchema(merged)).toEqual([]);
  });

  it('shares unchanged tables and columns by reference', () => {
    const current = frozen();
    const edited = updateColumn(withFreshIds(blogSchema()), 'new_t_users', 'new_c_users_email', {
      nullable: true,
    });
    const merged = mergeSchema(current, edited);
    expect(table(merged, 'posts')).toBe(table(current, 'posts'));
    expect(table(merged, 'users').columns[0]).toBe(table(current, 'users').columns[0]);
    expect(merged.namespaces).toBe(current.namespaces);
    expect(merged.enums).toBe(current.enums);
  });

  it('gives new elements their parsed ids and drops removed ones', () => {
    const current = frozen();
    const parsed = withFreshIds(blogSchema());
    const next: Schema = {
      ...parsed,
      tables: [
        parsed.tables[0] as Table,
        {
          ...(parsed.tables[0] as Table),
          id: 'brand_new',
          name: 'audit_log',
          columns: [column('audit_id', { name: 'id' }), column('audit_at', { name: 'at' })],
          primaryKey: null,
          indexes: [],
          uniques: [],
          checks: [],
        },
      ],
    };
    const merged = mergeSchema(current, next);
    expect(merged.tables.map((t) => [t.id, t.name])).toEqual([
      ['t_users', 'users'],
      ['brand_new', 'audit_log'],
    ]);
  });

  it('adds new namespaces, enums and indexes and removes a primary key', () => {
    const current = frozen();
    const parsed = withFreshIds(blogSchema());
    const next: Schema = {
      ...parsed,
      namespaces: [...parsed.namespaces, { id: 'ns_audit', name: 'audit' }],
      enums: [
        ...parsed.enums,
        { id: 'enum_level', name: 'level', namespace: 'ns_audit', values: ['a'] },
      ],
      tables: parsed.tables.map((t) =>
        t.name === 'users'
          ? { ...t, indexes: t.indexes.map((ix) => ({ ...ix, name: 'users_created_idx' })) }
          : { ...t, primaryKey: null },
      ),
    };
    const merged = mergeSchema(current, next);
    expect(merged.namespaces.map((n) => n.id)).toEqual(['ns_public', 'ns_audit']);
    expect(merged.enums.map((e) => e.id)).toEqual(['enum_status', 'enum_level']);
    expect(table(merged, 'users').indexes[0]?.id).toBe('new_ix_users_created');
    expect(table(merged, 'posts').primaryKey).toBeNull();
  });

  it('treats a foreign key with new columns and a new name as a new foreign key', () => {
    const current = frozen();
    const parsed = withFreshIds(blogSchema());
    const next: Schema = {
      ...parsed,
      tables: parsed.tables.map((t) =>
        t.name === 'posts'
          ? {
              ...t,
              foreignKeys: t.foreignKeys.map((fk) => ({
                ...fk,
                name: 'posts_id_fkey',
                columns: ['new_c_posts_id'],
              })),
            }
          : t,
      ),
    };
    const fk = table(mergeSchema(current, next), 'posts').foreignKeys[0];
    expect(fk).toMatchObject({ id: 'new_fk_posts_author', columns: ['c_posts_id'] });
  });

  it('treats one table swapped for one similar table as a rename', () => {
    const current = frozen();
    const parsed = withFreshIds(blogSchema());
    const renamed: Schema = {
      ...parsed,
      tables: parsed.tables.map((t) => (t.name === 'posts' ? { ...t, name: 'articles' } : t)),
    };
    const merged = mergeSchema(current, renamed);
    expect(table(merged, 'articles').id).toBe('t_posts');
    expect(table(merged, 'articles').columns.map((c) => c.id)).toEqual(
      table(current, 'posts').columns.map((c) => c.id),
    );
  });

  it('treats one column swapped for another as a rename', () => {
    const current = frozen();
    const parsed = renameColumn(
      withFreshIds(blogSchema()),
      'new_t_posts',
      'new_c_posts_body',
      'content',
    );
    const merged = mergeSchema(current, parsed);
    const posts = table(merged, 'posts');
    expect(posts.columns.find((c) => c.name === 'content')?.id).toBe('c_posts_body');
  });

  it('matches foreign keys by shape when their generated names differ', () => {
    const current = frozen();
    const parsed = withFreshIds(blogSchema());
    const next: Schema = {
      ...parsed,
      tables: parsed.tables.map((t) =>
        t.name === 'posts'
          ? { ...t, foreignKeys: t.foreignKeys.map((fk) => ({ ...fk, name: 'fk_author' })) }
          : t,
      ),
    };
    const fk = table(mergeSchema(current, next), 'posts').foreignKeys[0];
    expect(fk).toMatchObject({ id: 'fk_posts_author', name: 'fk_author' });
  });

  it('keeps the current dialect and schema id', () => {
    const current = frozen();
    const parsed = { ...withFreshIds(blogSchema()), id: 'other', dialect: 'mysql' as const };
    const merged = mergeSchema(current, parsed);
    expect(merged.id).toBe('schema');
    expect(merged.dialect).toBe('postgres');
  });
});

describe('mergeSchema with a base', () => {
  it('keeps what the format cannot express and only takes what the edit changed', () => {
    const current = frozen();
    // A format without checks, comments or metadata: the base and the edit both lack them.
    const strip = (schema: Schema): Schema => ({
      ...schema,
      tables: schema.tables.map((t) => ({ ...t, checks: [], comment: null, metadata: {} })),
    });
    const base = strip(withFreshIds(blogSchema()));
    const parsed = updateColumn(base, 'new_t_users', 'new_c_users_email', {
      nativeType: 'text',
      logicalType: { kind: 'text' },
    });

    const merged = mergeSchema(current, parsed, { base });
    const users = table(merged, 'users');
    expect(users.columns[1]).toMatchObject({ id: 'c_users_email', nativeType: 'text' });
    expect(users.checks).toEqual(table(current, 'users').checks);
    expect(users.comment).toBe('Registered users');
    expect(table(merged, 'posts')).toBe(table(current, 'posts'));
  });

  it('drops an element the edit deleted', () => {
    const current = frozen();
    const base = withFreshIds(blogSchema());
    const parsed: Schema = {
      ...base,
      tables: base.tables.map((t) => (t.name === 'users' ? { ...t, checks: [] } : t)),
    };
    expect(table(mergeSchema(current, parsed, { base }), 'users').checks).toEqual([]);
  });

  it('keeps current order when the format emits elements in its own order', () => {
    const current = frozen();
    const reversed = (schema: Schema): Schema => ({
      ...schema,
      tables: [...schema.tables].reverse(),
    });
    const base = reversed(withFreshIds(blogSchema()));
    const parsed = updateColumn(base, 'new_t_users', 'new_c_users_email', { nullable: true });
    const merged = mergeSchema(current, parsed, { base });
    expect(merged.tables.map((t) => t.id)).toEqual(['t_users', 't_posts']);
  });

  it('takes the parsed order when the edit reorders elements', () => {
    const current = frozen();
    const base = withFreshIds(blogSchema());
    const parsed: Schema = {
      ...base,
      tables: base.tables.map((t) =>
        t.name === 'users' ? { ...t, columns: [...t.columns].reverse() } : t,
      ),
    };
    const merged = mergeSchema(current, parsed, { base });
    expect(table(merged, 'users').columns.map((c) => c.name)).toEqual([
      'created_at',
      'email',
      'id',
    ]);
  });

  it('places a new element after its neighbour in the code', () => {
    const current = frozen();
    const base = withFreshIds(blogSchema());
    const parsed = addColumn(base, 'new_t_users', {
      name: 'nickname',
      logicalType: { kind: 'text' },
      nativeType: 'text',
    });
    const reordered: Schema = {
      ...parsed,
      tables: parsed.tables.map((t) => {
        if (t.name !== 'users') return t;
        const [id, email, created, nickname] = t.columns;
        return { ...t, columns: [id, nickname, email, created].filter((c) => c !== undefined) };
      }),
    };
    const merged = mergeSchema(current, reordered, { base });
    expect(table(merged, 'users').columns.map((c) => c.name)).toEqual([
      'id',
      'nickname',
      'email',
      'created_at',
    ]);
  });

  it('places a new first element at the start', () => {
    const current = frozen();
    const base = withFreshIds(blogSchema());
    const added = addColumn(base, 'new_t_users', {
      name: 'tenant_id',
      logicalType: { kind: 'int' },
      nativeType: 'integer',
    });
    const parsed: Schema = {
      ...added,
      tables: added.tables.map((t) =>
        t.name === 'users'
          ? { ...t, columns: [...t.columns.slice(-1), ...t.columns.slice(0, -1)] }
          : t,
      ),
    };
    const merged = mergeSchema(current, parsed, { base });
    expect(table(merged, 'users').columns.map((c) => c.name)).toEqual([
      'tenant_id',
      'id',
      'email',
      'created_at',
    ]);
  });

  it('drops kept constraints that point at a deleted column', () => {
    const current = frozen();
    // The format cannot express indexes; the edit deletes the indexed column.
    const strip = (schema: Schema): Schema => ({
      ...schema,
      tables: schema.tables.map((t) => ({ ...t, indexes: [] })),
    });
    const base = strip(withFreshIds(blogSchema()));
    const parsed: Schema = {
      ...base,
      tables: base.tables.map((t) =>
        t.name === 'users'
          ? { ...t, columns: t.columns.filter((c) => c.name !== 'created_at') }
          : t,
      ),
    };
    const merged = mergeSchema(current, parsed, { base });
    expect(table(merged, 'users').indexes).toEqual([]);
    expect(table(merged, 'posts').indexes).toBe(table(current, 'posts').indexes);
    expect(validateSchema(merged)).toEqual([]);
  });

  it('does not rename a table the base never had', () => {
    const current = frozen();
    const base: Schema = {
      ...withFreshIds(blogSchema()),
      tables: [withFreshIds(blogSchema()).tables[0] as Table],
    };
    const parsed: Schema = {
      ...base,
      tables: [
        ...base.tables,
        { ...(withFreshIds(blogSchema()).tables[1] as Table), name: 'articles' },
      ],
    };
    const merged = mergeSchema(current, parsed, { base });
    // `posts` was invisible to the format, so it is kept and `articles` is a new table.
    expect(merged.tables.map((t) => t.name).sort()).toEqual(['articles', 'posts', 'users']);
    expect(table(merged, 'articles').id).not.toBe('t_posts');
  });
});

describe('mergeSchema with real formats', () => {
  it('a column type edited in Prisma updates the column and keeps every id', () => {
    const current = frozen();
    const text = toPrisma(current).code;
    const base = parsePrisma(text).schema;
    const edited = text.replace(/(\n\s+email\s+)String(\s+@unique) @db\.VarChar\(255\)/, '$1Int$2');
    expect(edited).not.toBe(text);
    const parsed = parsePrisma(edited);
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const merged = mergeSchema(current, parsed.schema, { base });
    expect(merged.tables.map((t) => t.id)).toEqual(current.tables.map((t) => t.id));
    const email = table(merged, 'users').columns.find((c) => c.name === 'email');
    expect(email).toMatchObject({ id: 'c_users_email', logicalType: { kind: 'int' } });
    // Everything else is untouched, including the CHECK constraint Prisma cannot express.
    expect(table(merged, 'posts')).toBe(table(current, 'posts'));
    expect(table(merged, 'users').checks).toBe(table(current, 'users').checks);
    expect(validateSchema(merged)).toEqual([]);
  });

  it.each([
    ['Prisma', (s: Schema) => toPrisma(s).code, parsePrisma],
    ['DBML', (s: Schema) => toDBML(s).code, parseDBML],
    ['PostgreSQL', (s: Schema) => toPostgresDDL(s).code, parsePostgresDDL],
  ])('re-parsing unedited %s output is a no-op', (_name, serialize, parse) => {
    const current = frozen();
    const text = serialize(current);
    const base = parse(text).schema;
    expect(mergeSchema(current, parse(text).schema, { base })).toBe(current);
  });
});
