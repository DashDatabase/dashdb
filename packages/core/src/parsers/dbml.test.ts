import { describe, expect, it } from 'vitest';
import { parseDBML } from './dbml';
import { MAX_INPUT_BYTES } from './types';

const parse = (source: string) => parseDBML(source, { createId: (hint) => hint });

describe('parseDBML', () => {
  it('rejects inputs over 2 MB without parsing', () => {
    expect(parse(`// ${'x'.repeat(MAX_INPUT_BYTES)}`).diagnostics.map((d) => d.code)).toEqual([
      'input-too-large',
    ]);
  });

  it('reports compiler errors with their positions', () => {
    const { schema, diagnostics } = parse('Table a {\n  id int [pk\n}');
    expect(schema.tables).toEqual([]);
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'syntax-error',
        message: expect.any(String) as string,
        line: 3,
        column: 1,
      },
    ]);
  });

  it.each([
    ['MySQL', 'mysql'],
    ['PostgreSQL', 'postgres'],
    ['SQLite', 'sqlite'],
  ])('maps database_type %s to %s', (databaseType, dialect) => {
    const { schema } = parse(
      `Project p {\n  database_type: '${databaseType}'\n}\nTable a {\n  id int [pk]\n}`,
    );
    expect(schema.dialect).toBe(dialect);
  });

  it('warns about unsupported database types and defaults to postgres', () => {
    const { schema, diagnostics } = parse(
      `Project p {\n  database_type: 'Oracle'\n}\nTable a {\n  id int\n}`,
    );
    expect(schema.dialect).toBe('postgres');
    expect(diagnostics.map((d) => d.code)).toEqual(['unsupported-feature']);
  });

  it('puts one-to-one foreign keys on the second endpoint and skips many-to-many', () => {
    const { schema, diagnostics } = parse(`Table a {
  id int [pk]
}
Table b {
  a_id int [pk]
  tag int
}
Ref: a.id - b.a_id
Ref: a.id <> b.tag`);
    expect(schema.tables[1]?.foreignKeys).toHaveLength(1);
    expect(schema.tables[0]?.foreignKeys).toHaveLength(0);
    expect(diagnostics.map((d) => d.line)).toEqual([9]);
  });

  it('maps defaults including DBML null and boolean quirks', () => {
    const { schema } = parse(`Table t {
  a int [default: 1]
  b bool [default: false]
  c text [default: null]
  d text [default: 'x']
  e timestamp [default: \`now()\`]
}`);
    expect(schema.tables[0]?.columns.map((c) => c.default)).toEqual([
      { kind: 'literal', value: 1 },
      { kind: 'literal', value: false },
      { kind: 'literal', value: null },
      { kind: 'literal', value: 'x' },
      { kind: 'expression', sql: 'now()' },
    ]);
  });
});
