import { describe, expect, it } from 'vitest';
import { parseIntrospectionJSON } from '../parsers/introspection';
import {
  INTROSPECTION_QUERIES,
  introspect,
  MYSQL_INTROSPECTION_QUERY,
  normalizeIntrospectionPaste,
  POSTGRES_INTROSPECTION_QUERY,
} from '.';

const postgresDoc = {
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

/** What MySQL's query returns: entries out of key order, tagged with `seq`. */
const mysqlDoc = {
  tables: [
    {
      schema: 'default',
      name: 'posts',
      kind: 'table',
      comment: 'Blog posts',
      engine: 'InnoDB',
      collation: 'utf8mb4_0900_ai_ci',
    },
    { schema: 'default', name: 'recent', kind: 'view', comment: null },
  ],
  columns: [
    ['score', 3],
    ['id', 1],
    ['author', 2],
  ].map(([name, position]) => ({
    schema: 'default',
    table: 'posts',
    name: name as string,
    position: position as number,
    type: 'int',
    nullable: name !== 'id',
    default: null,
    extra: name === 'id' ? 'auto_increment' : null,
    comment: null,
  })),
  constraints: [
    {
      schema: 'default',
      table: 'posts',
      name: 'PRIMARY',
      type: 'PRIMARY KEY',
      columns: [{ name: 'id', seq: 1 }],
    },
    {
      schema: 'default',
      table: 'posts',
      name: 'posts_pair_fk',
      type: 'FOREIGN KEY',
      columns: [
        { name: 'score', seq: 2 },
        { name: 'author', seq: 1 },
      ],
      ref_schema: 'default',
      ref_table: 'posts',
      ref_columns: [
        { name: 'author', seq: 2 },
        { name: 'id', seq: 1 },
      ],
      on_delete: 'CASCADE',
      on_update: 'NO ACTION',
    },
  ],
  indexes: [
    {
      schema: 'default',
      table: 'posts',
      name: 'posts_author_score',
      unique: false,
      primary: false,
      method: null,
      columns: [
        { name: 'score', expression: null, order: 'desc', seq: 2 },
        { name: 'author', expression: null, order: 'asc', seq: 1 },
      ],
    },
  ],
  enums: [],
};

describe('introspection queries', () => {
  it.each(Object.entries(INTROSPECTION_QUERIES))(
    '%s is one read-only statement returning a `result` column',
    (_, sql) => {
      // One statement: the only semicolon ends it (none appear inside string literals).
      expect(sql.trim().endsWith('AS result;')).toBe(true);
      expect(sql.indexOf(';')).toBe(sql.length - 1);
      expect(sql.trim()).toMatch(/^(WITH|SELECT)\b/);
      expect(sql).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|COPY|CALL|SET)\s/i,
      );
    },
  );

  it('read every object kind of the contract', () => {
    for (const sql of [POSTGRES_INTROSPECTION_QUERY, MYSQL_INTROSPECTION_QUERY]) {
      for (const key of ['tables', 'columns', 'constraints', 'indexes', 'enums'])
        expect(sql).toContain(`'${key}'`);
    }
    expect(POSTGRES_INTROSPECTION_QUERY).toContain('pg_catalog');
    expect(MYSQL_INTROSPECTION_QUERY).toContain('information_schema');
  });
});

describe('introspect', () => {
  const runner = (result: unknown, seen: string[] = []) => ({
    seen,
    run: (sql: string) => {
      seen.push(sql);
      return Promise.resolve([{ result }]);
    },
  });

  it('runs the Postgres query and parses its JSON document (object or text)', async () => {
    const a = runner(postgresDoc);
    const fromObject = await introspect(a.run, 'postgres');
    expect(fromObject.schema.tables.map((t) => t.name)).toEqual(['t']);
    const b = runner(JSON.stringify(postgresDoc));
    const fromText = await introspect(b.run, 'postgres');
    expect(fromText.schema.tables[0]?.columns.map((c) => c.name)).toEqual(['id']);
    expect([...a.seen, ...b.seen]).toEqual([
      POSTGRES_INTROSPECTION_QUERY,
      POSTGRES_INTROSPECTION_QUERY,
    ]);
  });

  it('runs the single MySQL query and orders entries by seq', async () => {
    const { run, seen } = runner(mysqlDoc);
    const result = await introspect(run, 'mysql', { createId: (hint) => hint });
    expect(seen).toEqual([MYSQL_INTROSPECTION_QUERY]);
    expect(result.schema.tables.map((t) => t.name)).toEqual(['posts']);
    const posts = result.schema.tables[0];
    const columnName = (id: string) => posts?.columns.find((c) => c.id === id)?.name;
    expect(posts?.columns.map((c) => c.name)).toEqual(['id', 'author', 'score']);
    expect(posts?.foreignKeys[0]?.columns.map(columnName)).toEqual(['author', 'score']);
    expect(posts?.foreignKeys[0]?.refColumns.map(columnName)).toEqual(['id', 'author']);
    expect(posts?.indexes[0]?.columns.map((c) => [columnName(c.column), c.order])).toEqual([
      ['author', 'asc'],
      ['score', 'desc'],
    ]);
  });

  it('reports an empty result as invalid input', async () => {
    const result = await introspect(() => Promise.resolve([]), 'postgres');
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'invalid-input' });
  });
});

describe('seq ordering in the contract', () => {
  it('keeps the given order when no entry has a seq', () => {
    const { schema } = parseIntrospectionJSON(
      {
        tables: [{ schema: 'public', name: 't' }],
        columns: ['a', 'b'].map((name, i) => ({
          schema: 'public',
          table: 't',
          name,
          position: i + 1,
          type: 'int',
          nullable: false,
        })),
        indexes: [{ schema: 'public', table: 't', name: 'ix', unique: false, columns: ['b', 'a'] }],
        constraints: [
          { schema: 'public', table: 't', name: 'uq', type: 'UNIQUE', columns: ['b', 'a'] },
        ],
      },
      'postgres',
    );
    const t = schema.tables[0];
    const names = (ids: readonly string[]) =>
      ids.map((id) => t?.columns.find((c) => c.id === id)?.name);
    expect(names(t?.uniques[0]?.columns ?? [])).toEqual(['b', 'a']);
    expect(names(t?.indexes[0]?.columns.map((c) => c.column) ?? [])).toEqual(['b', 'a']);
  });
});

describe('normalizeIntrospectionPaste', () => {
  const doc = '{"tables": [{"schema": "public", "name": "it\'s \\"q\\""}], "columns": []}';

  it('leaves a clean document alone (trimmed, BOM removed)', () => {
    expect(normalizeIntrospectionPaste(`\uFEFF  ${doc}\n`)).toBe(doc);
  });

  it('strips psql aligned output: header, rule and row count', () => {
    expect(normalizeIntrospectionPaste(` result\n--------\n ${doc}\n(1 row)\n`)).toBe(doc);
  });

  it('strips a column header line (TablePlus, DBeaver "copy with header")', () => {
    expect(normalizeIntrospectionPaste(`result\n${doc}`)).toBe(doc);
  });

  it('unquotes a CSV field', () => {
    expect(normalizeIntrospectionPaste(`"${doc.replaceAll('"', '""')}"`)).toBe(doc);
  });

  it('decodes a JSON string literal', () => {
    expect(normalizeIntrospectionPaste(JSON.stringify(doc))).toBe(doc);
  });

  it('keeps a malformed string literal for the parser to report', () => {
    expect(normalizeIntrospectionPaste('"{\\"a\\": \\x}"')).toBe('{\\"a\\": \\x}');
  });

  it('returns text without a document trimmed', () => {
    expect(normalizeIntrospectionPaste('  ERROR: permission denied  ')).toBe(
      'ERROR: permission denied',
    );
  });

  it('round-trips through the parser', () => {
    const pasted = ` result\n--------\n ${JSON.stringify(postgresDoc)}\n(1 row)`;
    const { schema, diagnostics } = parseIntrospectionJSON(
      normalizeIntrospectionPaste(pasted),
      'postgres',
    );
    expect(diagnostics).toEqual([]);
    expect(schema.tables.map((t) => t.name)).toEqual(['t']);
  });
});
