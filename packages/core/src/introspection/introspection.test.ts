import { describe, expect, it } from 'vitest';
import {
  assembleMysql,
  introspect,
  MYSQL_INTROSPECTION_QUERIES,
  POSTGRES_INTROSPECTION_SQL,
  type Row,
} from '.';

const mysqlRows = {
  tables: [
    {
      name: 'posts',
      type: 'BASE TABLE',
      comment: 'Blog posts',
      engine: 'InnoDB',
      collation: 'utf8mb4_0900_ai_ci',
    },
    { name: 'recent', type: 'VIEW', comment: '', engine: null, collation: null },
  ],
  columns: [
    {
      tbl: 'posts',
      name: 'id',
      position: 1,
      type: 'int',
      nullable: 'NO',
      dflt: null,
      extra: 'auto_increment',
      comment: '',
    },
    {
      tbl: 'posts',
      name: 'author',
      position: 2,
      type: 'int',
      nullable: 'YES',
      dflt: null,
      extra: '',
      comment: 'Writer',
    },
    {
      tbl: 'posts',
      name: 'body',
      position: 3,
      type: 'text',
      nullable: 'YES',
      dflt: undefined,
      extra: '',
      comment: '',
    },
    {
      tbl: 'posts',
      name: 'score',
      position: 4,
      type: 'int',
      nullable: 'YES',
      dflt: 0,
      extra: '',
      comment: '',
    },
  ],
  constraints: [
    {
      tbl: 'posts',
      name: 'PRIMARY',
      type: 'PRIMARY KEY',
      col: 'id',
      ref_schema: null,
      ref_table: null,
      ref_col: null,
      on_delete: null,
      on_update: null,
      definition: null,
    },
    {
      tbl: 'posts',
      name: 'posts_author_fk',
      type: 'FOREIGN KEY',
      col: 'author',
      ref_schema: 'default',
      ref_table: 'users',
      ref_col: 'id',
      on_delete: 'CASCADE',
      on_update: 'NO ACTION',
      definition: null,
    },
    {
      tbl: 'posts',
      name: 'posts_score_chk',
      type: 'CHECK',
      col: null,
      ref_schema: null,
      ref_table: null,
      ref_col: null,
      on_delete: null,
      on_update: null,
      definition: '(`score` >= 0)',
    },
  ],
  indexes: [
    {
      tbl: 'posts',
      name: 'PRIMARY',
      non_unique: 0,
      col: 'id',
      collation: 'A',
      expression: null,
      method: 'BTREE',
    },
    {
      tbl: 'posts',
      name: 'posts_author_score',
      non_unique: 1,
      col: 'author',
      collation: 'A',
      expression: null,
      method: 'BTREE',
    },
    {
      tbl: 'posts',
      name: 'posts_author_score',
      non_unique: 1,
      col: 'score',
      collation: 'D',
      expression: null,
      method: 'BTREE',
    },
    {
      tbl: 'posts',
      name: 'posts_body_ft',
      non_unique: 1,
      col: 'body',
      collation: null,
      expression: null,
      method: 'FULLTEXT',
    },
  ],
} satisfies Record<string, Row[]>;

describe('assembleMysql', () => {
  it('maps flat information_schema rows to the introspection contract', () => {
    const result = assembleMysql(mysqlRows);
    expect(result.tables).toEqual([
      {
        schema: 'default',
        name: 'posts',
        kind: 'table',
        comment: 'Blog posts',
        engine: 'InnoDB',
        collation: 'utf8mb4_0900_ai_ci',
      },
      {
        schema: 'default',
        name: 'recent',
        kind: 'view',
        comment: null,
        engine: null,
        collation: null,
      },
    ]);
    expect(result.columns.map((c) => [c.name, c.nullable, c.default, c.extra, c.comment])).toEqual([
      ['id', false, null, 'auto_increment', null],
      ['author', true, null, null, 'Writer'],
      ['body', true, null, null, null],
      ['score', true, '0', null, null],
    ]);
    expect(result.constraints).toEqual([
      expect.objectContaining({
        name: 'PRIMARY',
        type: 'PRIMARY KEY',
        columns: ['id'],
        ref_table: null,
        ref_columns: null,
      }),
      expect.objectContaining({
        name: 'posts_author_fk',
        columns: ['author'],
        ref_schema: 'default',
        ref_table: 'users',
        ref_columns: ['id'],
        on_delete: 'CASCADE',
      }),
      expect.objectContaining({
        name: 'posts_score_chk',
        type: 'CHECK',
        columns: [],
        definition: '(`score` >= 0)',
      }),
    ]);
    expect(result.indexes).toEqual([
      expect.objectContaining({ name: 'PRIMARY', primary: true, unique: true, method: null }),
      expect.objectContaining({
        name: 'posts_author_score',
        unique: false,
        primary: false,
        columns: [
          { name: 'author', expression: null, order: 'asc' },
          { name: 'score', expression: null, order: 'desc' },
        ],
      }),
      expect.objectContaining({ name: 'posts_body_ft', method: 'fulltext' }),
    ]);
  });
});

describe('assembleMysql driver values', () => {
  it('turns whatever the driver returns into text', () => {
    const column = (dflt: unknown) => ({
      tbl: 't',
      name: 'c',
      position: 1,
      type: 'int',
      nullable: 'YES',
      dflt,
      extra: '',
      comment: '',
    });
    const { columns } = assembleMysql({
      tables: [],
      columns: [10n, true, Buffer.from('abc'), { a: 1 }].map(column),
      constraints: [],
      indexes: [],
    });
    expect(columns.map((c) => c.default)).toEqual(['10', 'true', 'abc', '{"a":1}']);
  });
});

describe('introspect', () => {
  it('runs the Postgres query and parses its JSON document (object or text)', async () => {
    const doc = {
      tables: [{ schema: 'public', name: 't', kind: 'table', comment: null }],
      columns: [
        {
          schema: 'public',
          table: 't',
          name: 'id',
          position: 1,
          type: 'integer',
          nullable: false,
          default: null,
          identity: null,
          comment: null,
        },
      ],
      constraints: [],
      indexes: [],
      enums: [],
    };
    const seen: string[] = [];
    const run = (result: unknown) => (sql: string) => {
      seen.push(sql);
      return Promise.resolve([{ result }]);
    };
    const fromObject = await introspect(run(doc), 'postgres');
    expect(fromObject.schema.tables.map((t) => t.name)).toEqual(['t']);
    const fromText = await introspect(run(JSON.stringify(doc)), 'postgres');
    expect(fromText.schema.tables[0]?.columns.map((c) => c.name)).toEqual(['id']);
    expect(seen).toEqual([POSTGRES_INTROSPECTION_SQL, POSTGRES_INTROSPECTION_SQL]);
  });

  it('reports an empty Postgres result as invalid input', async () => {
    const result = await introspect(() => Promise.resolve([]), 'postgres');
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'invalid-input' });
  });

  it('runs the four MySQL queries and assembles them', async () => {
    const byQuery = new Map<string, Row[]>(
      Object.entries(MYSQL_INTROSPECTION_QUERIES).map(([k, sql]) => [
        sql,
        mysqlRows[k as keyof typeof mysqlRows],
      ]),
    );
    const result = await introspect((sql) => Promise.resolve(byQuery.get(sql) ?? []), 'mysql');
    const posts = result.schema.tables.find((t) => t.name === 'posts');
    expect(posts?.columns.map((c) => c.name)).toEqual(['id', 'author', 'body', 'score']);
    expect(posts?.indexes.map((i) => i.name)).toEqual(['posts_author_score', 'posts_body_ft']);
    expect(result.schema.tables.map((t) => t.name)).toEqual(['posts']);
  });
});
