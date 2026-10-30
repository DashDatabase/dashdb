import { describe, expect, it } from 'vitest';
import { parseIntrospectionJSON, type IntrospectionResult } from './introspection';
import { jsonErrorOffset } from './json-error';
import { MAX_INPUT_BYTES } from './types';

const parse = (json: unknown, dialect: 'postgres' | 'mysql' = 'postgres') =>
  parseIntrospectionJSON(json, dialect, { createId: (hint) => hint });

const table = (name: string): IntrospectionResult['tables'][number] => ({ schema: 'public', name });
const column = (
  tableName: string,
  name: string,
  extra: Partial<IntrospectionResult['columns'][number]> = {},
): IntrospectionResult['columns'][number] => ({
  schema: 'public',
  table: tableName,
  name,
  position: 1,
  type: 'integer',
  nullable: false,
  ...extra,
});

describe('parseIntrospectionJSON', () => {
  it('accepts JSON text or an already-parsed object', () => {
    const input: IntrospectionResult = { tables: [table('t')], columns: [column('t', 'id')] };
    expect(parse(JSON.stringify(input))).toEqual(parse(input));
  });

  it('rejects inputs over 2 MB without parsing', () => {
    expect(parse(`"${'x'.repeat(MAX_INPUT_BYTES)}"`).diagnostics.map((d) => d.code)).toEqual([
      'input-too-large',
    ]);
  });

  it('reports invalid JSON with a position', () => {
    const { diagnostics } = parse('{\n  "tables": [,]\n}');
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'invalid-input', line: 2, column: 14 }),
    ]);
  });

  it('reports contract violations with their path', () => {
    const { diagnostics } = parse({ tables: [{ schema: 'public' }], columns: 'nope' });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'tables.0.name: Invalid input: expected string, received undefined',
      'columns: Invalid input: expected array, received string',
    ]);
  });

  it('parses Postgres catalog defaults', () => {
    const defaults = [
      "nextval('\"Odd\"''s_seq'::regclass)",
      'NULL::text',
      'true',
      '(-5)',
      "'-1'::integer",
      "'it''s'::character varying",
      'now()',
    ];
    const { schema } = parse({
      tables: [table('t')],
      columns: defaults.map((d, i) => column('t', `c${i}`, { position: i + 1, default: d })),
    });
    expect(schema.tables[0]?.columns.map((c) => c.default)).toEqual([
      { kind: 'sequence', name: '"Odd"\'s_seq' },
      { kind: 'literal', value: null },
      { kind: 'literal', value: true },
      { kind: 'literal', value: -5 },
      { kind: 'literal', value: -1 },
      { kind: 'literal', value: "it's" },
      { kind: 'expression', sql: 'now()' },
    ]);
    expect(schema.tables[0]?.columns[0]?.autoIncrement).toBe(true);
  });

  it('parses MySQL defaults using the EXTRA flags', () => {
    const { schema } = parse(
      {
        tables: [{ schema: 'db', name: 't' }],
        columns: [
          {
            schema: 'db',
            table: 't',
            name: 'a',
            position: 1,
            type: 'datetime',
            nullable: false,
            default: 'CURRENT_TIMESTAMP',
            extra: 'DEFAULT_GENERATED',
          },
          {
            schema: 'db',
            table: 't',
            name: 'b',
            position: 2,
            type: 'int',
            nullable: true,
            default: 'NULL',
          },
          {
            schema: 'db',
            table: 't',
            name: 'c',
            position: 3,
            type: 'varchar(9)',
            nullable: true,
            default: "'quoted'",
          },
          {
            schema: 'db',
            table: 't',
            name: 'd',
            position: 4,
            type: 'json',
            nullable: true,
            default: '(json_array())',
            extra: 'DEFAULT_GENERATED',
          },
        ],
      },
      'mysql',
    );
    expect(schema.tables[0]?.columns.map((c) => c.default)).toEqual([
      { kind: 'expression', sql: 'CURRENT_TIMESTAMP' },
      { kind: 'literal', value: null },
      { kind: 'literal', value: 'quoted' },
      { kind: 'expression', sql: '(json_array())' },
    ]);
  });

  it('reports rows that point at unknown tables and malformed foreign keys', () => {
    const { diagnostics } = parse({
      tables: [table('t')],
      columns: [column('t', 'id'), column('ghost', 'x')],
      constraints: [
        { schema: 'public', table: 'ghost', name: 'k', type: 'UNIQUE', columns: ['x'] },
        { schema: 'public', table: 't', name: 'fk', type: 'FOREIGN KEY', columns: ['id'] },
        {
          schema: 'public',
          table: 't',
          name: 'fk2',
          type: 'FOREIGN KEY',
          columns: ['id'],
          ref_table: 'nope',
          on_delete: 'bogus',
        },
      ],
      indexes: [{ schema: 'public', table: 'ghost', name: 'i', unique: false, columns: ['x'] }],
    });
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Column "x" belongs to unknown table "public.ghost"',
      'Constraint "k" belongs to unknown table "public.ghost"',
      'Foreign key "fk" has no ref_table',
      'Index "i" belongs to unknown table "public.ghost"',
      'Foreign key "fk2" references unknown table "public.nope"',
    ]);
  });

  it('references the primary key when ref_columns are omitted', () => {
    const { schema } = parse({
      tables: [table('a'), table('b')],
      columns: [column('a', 'id'), column('b', 'a_id')],
      constraints: [
        { schema: 'public', table: 'a', name: 'a_pkey', type: 'PRIMARY KEY', columns: ['id'] },
        {
          schema: 'public',
          table: 'b',
          name: 'b_a_fkey',
          type: 'FOREIGN KEY',
          columns: ['a_id'],
          ref_table: 'a',
          on_delete: 'r',
          on_update: 'SET DEFAULT',
        },
      ],
    });
    expect(schema.tables[1]?.foreignKeys[0]).toMatchObject({
      refColumns: ['column:public.a.id'],
      onDelete: 'restrict',
      onUpdate: 'set default',
    });
  });
});

describe('jsonErrorOffset', () => {
  it.each([
    ['{"a": [1, 2,]}', 12],
    ['{"a" 1}', 5],
    ['[tru]', 4],
    [String.raw`{"a": "x\q"}`, 9],
    [String.raw`{"a": "\u12G4"}`, 9],
    ['"unterminated', 13],
    ['[1] extra', 4],
    ['-', 1],
    ['1.', 2],
    ['1e+', 3],
    ['{"a": "tab\there"}', 10],
    [String.raw`{"a": {"b": [true, false, null, -1.5e3, "\u00e9\n"]}, "c": 01}`, 60],
  ])('locates the error in %s', (text, offset) => {
    expect(jsonErrorOffset(text)).toBe(offset);
  });
});
