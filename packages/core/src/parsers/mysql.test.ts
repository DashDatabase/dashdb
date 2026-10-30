import { describe, expect, it } from 'vitest';
import { parseMySQLDDL } from './mysql';
import { MAX_INPUT_BYTES } from './types';

const parse = (sql: string) => parseMySQLDDL(sql, { createId: (hint) => hint });

describe('parseMySQLDDL', () => {
  it('rejects inputs over 2 MB without parsing', () => {
    const { schema, diagnostics } = parse(`# ${'x'.repeat(MAX_INPUT_BYTES)}`);
    expect(schema.tables).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(['input-too-large']);
  });

  it('reports a syntax error at its exact position and keeps parsing', () => {
    const { schema, diagnostics } = parse(
      'CREATE TABLE a (id int);\nCREATE TABLE b (\n  id int,,\n  x int\n);\nCREATE TABLE c (id int);',
    );
    expect(schema.tables.map((t) => t.name)).toEqual(['a', 'c']);
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'syntax-error',
        message: 'CREATE TABLE b …: Syntax error near ","',
        line: 3,
        column: 10,
      },
    ]);
  });

  it('turns dump noise into warnings', () => {
    const { diagnostics } = parse(
      'SET NAMES utf8mb4;\nLOCK TABLES t WRITE;\nINSERT INTO t VALUES (1);\nDROP TABLE t;',
    );
    expect(diagnostics.map((d) => [d.severity, d.code, d.line])).toEqual([
      ['warning', 'unsupported-statement', 1],
      ['warning', 'unsupported-statement', 2],
      ['warning', 'unsupported-statement', 3],
      ['warning', 'unsupported-statement', 4],
    ]);
  });

  it('never throws on garbage input', () => {
    for (const input of ['', ';;', '`unterminated', "'x", 'CREATE TABLE', 'DELIMITER']) {
      expect(() => parse(input)).not.toThrow();
    }
  });

  it('turns each ENUM column into an IR enum and preserves table options as metadata', () => {
    const { schema } = parse(
      "CREATE TABLE t (s enum('a','b''c') NOT NULL DEFAULT 'a') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=7 COMMENT='It''s t';",
    );
    expect(schema.enums).toEqual([
      { id: 'enum:default.t_s', name: 't_s', namespace: 'namespace:default', values: ['a', "b'c"] },
    ]);
    expect(schema.tables[0]?.columns[0]).toMatchObject({
      nativeType: "enum('a','b''c')",
      logicalType: { kind: 'enum', enumId: 'enum:default.t_s' },
      default: { kind: 'literal', value: 'a' },
    });
    expect(schema.tables[0]?.metadata).toEqual({
      engine: 'innodb',
      charset: 'utf8mb4',
      collate: 'utf8mb4_bin',
      auto_increment: '7',
    });
    expect(schema.tables[0]?.comment).toBe("It's t");
  });

  it('uses the USE database as namespace, and qualified names over it', () => {
    const { schema } = parse(
      'USE shop;\nCREATE TABLE a (id int);\nCREATE TABLE audit.log (id int);',
    );
    expect(schema.namespaces.map((n) => n.name)).toEqual(['shop', 'audit']);
    expect(schema.tables.map((t) => t.namespace)).toEqual(['namespace:shop', 'namespace:audit']);
  });

  it('handles inline keys, references and ALTER TABLE additions', () => {
    const { schema, diagnostics } =
      parse(`CREATE TABLE u (id int PRIMARY KEY AUTO_INCREMENT, email varchar(9) UNIQUE);
CREATE TABLE p (id int, u_id int REFERENCES u (id) ON DELETE SET NULL);
CREATE UNIQUE INDEX p_u ON p (u_id DESC);
CREATE FULLTEXT INDEX p_ft ON p (id);
ALTER TABLE p ADD PRIMARY KEY (id), ADD COLUMN note text, ADD INDEX p_note (note), DROP COLUMN gone;
CREATE INDEX x ON ghost (a);`);
    const p = schema.tables[1];
    expect(p?.primaryKey?.columns).toEqual(['column:default.p.id']);
    expect(p?.columns.map((c) => c.name)).toEqual(['id', 'u_id', 'note']);
    expect(p?.foreignKeys[0]).toMatchObject({ onDelete: 'set null', onUpdate: 'no action' });
    expect(p?.indexes.map((i) => [i.name, i.unique, i.method, i.columns[0]?.order])).toEqual([
      ['p_u', true, null, 'desc'],
      ['p_ft', false, 'fulltext', 'asc'],
      ['p_note', false, null, 'asc'],
    ]);
    expect(schema.tables[0]?.uniques[0]?.name).toBe('email');
    expect(diagnostics.map((d) => `${d.line}:${d.code}`)).toEqual([
      '5:unsupported-statement',
      '6:unresolved-reference',
    ]);
  });

  it('coerces quoted numeric defaults on numeric columns only', () => {
    const { schema } = parse(
      "CREATE TABLE t (a int DEFAULT '3', b decimal(4,2) DEFAULT '0.50', c varchar(3) DEFAULT '7', d boolean DEFAULT TRUE);",
    );
    expect(schema.tables[0]?.columns.map((c) => c.default)).toEqual([
      { kind: 'literal', value: 3 },
      { kind: 'literal', value: 0.5 },
      { kind: 'literal', value: '7' },
      { kind: 'literal', value: true },
    ]);
  });
});
