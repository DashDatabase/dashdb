import { describe, expect, it } from 'vitest';
import { blogSchema, column } from './__fixtures__/schemas';
import { schemaSchema, validateSchema, type SchemaProblem } from './schema';
import type { Schema } from './types';

type DeepMutable<T> = T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;

/** Build a variant of the blog schema by mutating a deep copy. */
function variant(mutate: (schema: DeepMutable<Schema>) => void): Schema {
  const schema = structuredClone(blogSchema()) as DeepMutable<Schema>;
  mutate(schema);
  return schema;
}

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`fixture has no item ${index}`);
  return item;
}

const users = (s: DeepMutable<Schema>) => at(s.tables, 0);
const posts = (s: DeepMutable<Schema>) => at(s.tables, 1);
const codes = (problems: SchemaProblem[]) => problems.map((p) => p.code);

describe('schemaSchema', () => {
  it('accepts the fixture', () => {
    expect(schemaSchema.parse(blogSchema())).toEqual(blogSchema());
  });
});

describe('validateSchema', () => {
  it('returns no problems for a valid schema', () => {
    expect(validateSchema(blogSchema())).toEqual([]);
  });

  it('accepts an empty table without a primary key', () => {
    const schema = variant((s) => {
      s.tables.push({
        ...structuredClone(posts(s)),
        id: 't_empty',
        name: 'empty',
        columns: [],
        primaryKey: null,
        indexes: [],
        foreignKeys: [],
      });
    });
    expect(validateSchema(schema)).toEqual([]);
  });

  describe('invalid-shape', () => {
    it('reports non-object input', () => {
      expect(validateSchema(null)).toEqual([
        expect.objectContaining({ code: 'invalid-shape', path: [] }),
      ]);
    });

    it('reports bad fields with their path and skips semantic checks', () => {
      const problems = validateSchema({ ...blogSchema(), dialect: 'oracle', tables: 'nope' });
      expect(codes(problems)).toEqual(['invalid-shape', 'invalid-shape']);
      expect(problems.map((p) => p.path)).toEqual([['dialect'], ['tables']]);
    });

    it('rejects unknown keys, a wrong version and scale > precision', () => {
      const problems = validateSchema(
        variant((s) => {
          (s as Record<string, unknown>).extra = true;
          (s as { version: number }).version = 2;
          at(users(s).columns, 0).logicalType = { kind: 'decimal', precision: 2, scale: 3 };
        }),
      );
      expect(problems.map((p) => p.path)).toEqual(
        expect.arrayContaining([
          [],
          ['version'],
          ['tables', 0, 'columns', 0, 'logicalType', 'scale'],
        ]),
      );
    });

    it('rejects every column default kind when malformed', () => {
      const bad = [
        { kind: 'literal', value: Number.POSITIVE_INFINITY },
        { kind: 'expression', sql: '' },
        { kind: 'sequence', name: '' },
        { kind: 'other' },
      ];
      for (const def of bad) {
        const problems = validateSchema(
          variant((s) => (at(users(s).columns, 0).default = def as never)),
        );
        expect(codes(problems)).toEqual(['invalid-shape']);
      }
    });
  });

  it('duplicate-id', () => {
    const problems = validateSchema(
      variant((s) => {
        at(s.enums, 0).id = 'ns_public';
        at(posts(s).columns, 3).id = 'c_posts_id';
        posts(s).uniques.push({ id: 'ix_users_created', name: 'posts_u', columns: ['c_posts_id'] });
        posts(s).foreignKeys.push({
          ...at(posts(s).foreignKeys, 0),
          id: 't_users',
          name: 'posts_fk_2',
        });
        posts(s).checks.push({ id: 'pk_posts', name: 'posts_check', expression: 'true' });
      }),
    );
    // Colliding ids also confuse reference lookups; only the duplicate-id reports matter here.
    expect(problems.filter((p) => p.code === 'duplicate-id')).toEqual([
      expect.objectContaining({ code: 'duplicate-id', id: 'ns_public', path: ['enums', 0, 'id'] }),
      expect.objectContaining({
        code: 'duplicate-id',
        id: 'c_posts_id',
        path: ['tables', 1, 'columns', 3, 'id'],
      }),
      expect.objectContaining({
        code: 'duplicate-id',
        id: 'ix_users_created',
        path: ['tables', 1, 'uniques', 0, 'id'],
      }),
      expect.objectContaining({
        code: 'duplicate-id',
        id: 't_users',
        path: ['tables', 1, 'foreignKeys', 1, 'id'],
      }),
      expect.objectContaining({
        code: 'duplicate-id',
        id: 'pk_posts',
        path: ['tables', 1, 'checks', 0, 'id'],
      }),
    ]);
  });

  it('duplicate-namespace-name', () => {
    const problems = validateSchema(
      variant((s) => s.namespaces.push({ id: 'ns_2', name: 'public' })),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'duplicate-namespace-name',
        namespaceId: 'ns_2',
        path: ['namespaces', 1, 'name'],
      }),
    ]);
  });

  it('duplicate-table-name is scoped per namespace', () => {
    const problems = validateSchema(
      variant((s) => {
        s.namespaces.push({ id: 'ns_audit', name: 'audit' });
        s.tables.push({
          ...structuredClone(posts(s)),
          id: 't_users_2',
          name: 'users',
          namespace: 'ns_public',
          columns: [],
          primaryKey: null,
          indexes: [],
          foreignKeys: [],
        });
        s.tables.push({
          ...structuredClone(posts(s)),
          id: 't_users_3',
          name: 'users',
          namespace: 'ns_audit',
          columns: [],
          primaryKey: null,
          indexes: [],
          foreignKeys: [],
        });
      }),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'duplicate-table-name',
        tableId: 't_users_2',
        name: 'users',
        path: ['tables', 2, 'name'],
      }),
    ]);
  });

  it('duplicate-column-name', () => {
    const problems = validateSchema(variant((s) => (at(posts(s).columns, 3).name = 'status')));
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'duplicate-column-name',
        tableId: 't_posts',
        columnId: 'c_posts_body',
        path: ['tables', 1, 'columns', 3, 'name'],
      }),
    ]);
  });

  it('duplicate-enum-name', () => {
    const problems = validateSchema(
      variant((s) =>
        s.enums.push({ id: 'enum_2', name: 'post_status', namespace: 'ns_public', values: ['x'] }),
      ),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'duplicate-enum-name',
        enumId: 'enum_2',
        path: ['enums', 1, 'name'],
      }),
    ]);
  });

  describe('duplicate-index-name', () => {
    const sameNameAcrossTables = (dialect: Schema['dialect']) =>
      variant((s) => {
        s.dialect = dialect;
        at(posts(s).indexes, 0).name = 'users_created_at_idx';
      });

    it.each(['postgres', 'sqlite'] as const)('is scoped per namespace on %s', (dialect) => {
      expect(validateSchema(sameNameAcrossTables(dialect))).toEqual([
        expect.objectContaining({
          code: 'duplicate-index-name',
          tableId: 't_posts',
          indexId: 'ix_posts_author',
          path: ['tables', 1, 'indexes', 0, 'name'],
        }),
      ]);
    });

    it('is scoped per table on mysql', () => {
      expect(validateSchema(sameNameAcrossTables('mysql'))).toEqual([]);
      const problems = validateSchema(
        variant((s) => {
          s.dialect = 'mysql';
          posts(s).indexes.push({ ...at(posts(s).indexes, 0), id: 'ix_2' });
        }),
      );
      expect(codes(problems)).toEqual(['duplicate-index-name']);
    });
  });

  it('duplicate-constraint-name covers pk, unique, fk and check names', () => {
    const problems = validateSchema(
      variant((s) => {
        users(s).uniques.push({ id: 'uq_2', name: 'users_pkey', columns: ['c_users_id'] });
        at(users(s).checks, 0).name = 'users_email_key';
        posts(s).checks.push({ id: 'ck_2', name: 'posts_author_fkey', expression: 'true' });
      }),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'duplicate-constraint-name',
        tableId: 't_users',
        constraintId: 'uq_2',
        path: ['tables', 0, 'uniques', 1, 'name'],
      }),
      expect.objectContaining({
        code: 'duplicate-constraint-name',
        tableId: 't_users',
        constraintId: 'ck_users_email',
        path: ['tables', 0, 'checks', 0, 'name'],
      }),
      expect.objectContaining({
        code: 'duplicate-constraint-name',
        tableId: 't_posts',
        constraintId: 'ck_2',
        path: ['tables', 1, 'checks', 0, 'name'],
      }),
    ]);
  });

  it('unknown-namespace for tables and enums', () => {
    const problems = validateSchema(
      variant((s) => {
        posts(s).namespace = 'ns_gone';
        at(s.enums, 0).namespace = 'ns_gone';
      }),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'unknown-namespace',
        elementId: 'enum_status',
        namespaceId: 'ns_gone',
        path: ['enums', 0, 'namespace'],
      }),
      expect.objectContaining({
        code: 'unknown-namespace',
        elementId: 't_posts',
        namespaceId: 'ns_gone',
        path: ['tables', 1, 'namespace'],
      }),
    ]);
  });

  it('fk-missing-table', () => {
    const problems = validateSchema(
      variant((s) => (at(posts(s).foreignKeys, 0).refTable = 't_gone')),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'fk-missing-table',
        tableId: 't_posts',
        foreignKeyId: 'fk_posts_author',
        refTable: 't_gone',
        path: ['tables', 1, 'foreignKeys', 0, 'refTable'],
      }),
    ]);
  });

  it('fk-missing-column', () => {
    const problems = validateSchema(
      variant((s) => (at(posts(s).foreignKeys, 0).refColumns = ['c_gone'])),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'fk-missing-column',
        columnId: 'c_gone',
        path: ['tables', 1, 'foreignKeys', 0, 'refColumns', 0],
      }),
    ]);
  });

  it('fk-local-missing-column', () => {
    const problems = validateSchema(
      variant((s) => (at(posts(s).foreignKeys, 0).columns = ['c_gone'])),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'fk-local-missing-column',
        columnId: 'c_gone',
        path: ['tables', 1, 'foreignKeys', 0, 'columns', 0],
      }),
    ]);
  });

  it('fk-column-count-mismatch', () => {
    const problems = validateSchema(
      variant((s) => (at(posts(s).foreignKeys, 0).refColumns = ['c_users_id', 'c_users_email'])),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'fk-column-count-mismatch',
        foreignKeyId: 'fk_posts_author',
      }),
    ]);
  });

  it('pk-nullable-column', () => {
    const problems = validateSchema(variant((s) => (at(users(s).columns, 0).nullable = true)));
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'pk-nullable-column',
        tableId: 't_users',
        columnId: 'c_users_id',
        path: ['tables', 0, 'primaryKey', 'columns', 0],
      }),
    ]);
  });

  it('pk-missing-column', () => {
    const problems = validateSchema(variant((s) => posts(s).primaryKey?.columns.push('c_gone')));
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'pk-missing-column',
        columnId: 'c_gone',
        path: ['tables', 1, 'primaryKey', 'columns', 1],
      }),
    ]);
  });

  it('index-missing-column', () => {
    const problems = validateSchema(
      variant((s) =>
        at(users(s).indexes, 0).columns.push({ column: 'c_gone', order: 'asc', nulls: null }),
      ),
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'index-missing-column',
        indexId: 'ix_users_created',
        columnId: 'c_gone',
        path: ['tables', 0, 'indexes', 0, 'columns', 1, 'column'],
      }),
    ]);
  });

  it('unique-missing-column', () => {
    const problems = validateSchema(variant((s) => (at(users(s).uniques, 0).columns = ['c_gone'])));
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'unique-missing-column',
        constraintId: 'uq_users_email',
        columnId: 'c_gone',
        path: ['tables', 0, 'uniques', 0, 'columns', 0],
      }),
    ]);
  });

  it('enum-missing', () => {
    const problems = validateSchema(variant((s) => (s.enums = [])));
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'enum-missing',
        tableId: 't_posts',
        columnId: 'c_posts_status',
        enumId: 'enum_status',
        path: ['tables', 1, 'columns', 2, 'logicalType', 'enumId'],
      }),
    ]);
  });

  it('reports every problem, not just the first', () => {
    const problems = validateSchema(
      variant((s) => {
        users(s).columns.push(column('c_dup', { name: 'email' }));
        at(users(s).columns, 0).nullable = true;
        at(posts(s).foreignKeys, 0).refTable = 't_gone';
      }),
    );
    expect(codes(problems)).toEqual([
      'duplicate-column-name',
      'pk-nullable-column',
      'fk-missing-table',
    ]);
  });
});
