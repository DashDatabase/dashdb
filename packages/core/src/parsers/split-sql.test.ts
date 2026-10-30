import { describe, expect, it } from 'vitest';
import { isSchemaStatement, leadingKeywords, splitSql } from './split-sql';

const texts = (sql: string, flavor: 'postgres' | 'mysql' = 'postgres') =>
  splitSql(sql, flavor).map((s) => s.text);

describe('splitSql', () => {
  it('splits on semicolons and records each statement offset', () => {
    const sql = 'CREATE TABLE a (id int);\n  CREATE TABLE b (id int)';
    expect(splitSql(sql, 'postgres')).toEqual([
      { text: 'CREATE TABLE a (id int)', offset: 0 },
      { text: 'CREATE TABLE b (id int)', offset: 27 },
    ]);
  });

  it('ignores semicolons inside strings, quoted identifiers and comments', () => {
    const sql = `INSERT INTO t VALUES ('a;b', 'it''s;');
CREATE TABLE "x;y" (id int); -- trailing; comment
/* block; comment */ SELECT 1;`;
    expect(texts(sql)).toEqual([
      "INSERT INTO t VALUES ('a;b', 'it''s;')",
      'CREATE TABLE "x;y" (id int)',
      'SELECT 1',
    ]);
  });

  it('keeps Postgres dollar-quoted bodies whole, tagged or not', () => {
    const sql = 'CREATE FUNCTION f() AS $body$ a; b; $body$;\nDO $$ BEGIN x; END $$;\nSELECT $1;';
    expect(texts(sql)).toEqual([
      'CREATE FUNCTION f() AS $body$ a; b; $body$',
      'DO $$ BEGIN x; END $$',
      'SELECT $1',
    ]);
  });

  it('handles nested Postgres block comments', () => {
    expect(texts('/* outer /* inner; */ still comment; */ SELECT 1;')).toEqual(['SELECT 1']);
  });

  it('skips COPY data blocks and psql meta-commands', () => {
    const sql = '\\connect app\nCOPY t (a) FROM stdin;\n1;2\nx;y\n\\.\nSELECT 2;';
    expect(texts(sql)).toEqual(['COPY t (a) FROM stdin', 'SELECT 2']);
  });

  it('drops comment-only chunks', () => {
    expect(texts('-- nothing here\n/* or here */\n;;')).toEqual([]);
  });

  it('handles MySQL backticks, # comments, backslash escapes and DELIMITER', () => {
    const sql = `CREATE TABLE \`a;b\` (c varchar(5) DEFAULT 'x\\';y'); # note; here
DELIMITER ;;
CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END ;;
DELIMITER ;
SELECT 3;`;
    expect(texts(sql, 'mysql')).toEqual([
      "CREATE TABLE `a;b` (c varchar(5) DEFAULT 'x\\';y')",
      'CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END',
      'SELECT 3',
    ]);
  });

  it('treats MySQL executable comments as comments', () => {
    expect(texts('/*!40101 SET NAMES utf8mb4 */;\nSELECT 1;', 'mysql')).toEqual(['SELECT 1']);
  });

  it('returns an unterminated final statement', () => {
    expect(texts("SELECT 'open")).toEqual(["SELECT 'open"]);
  });
});

describe('isSchemaStatement', () => {
  it.each([
    'CREATE TABLE t ()',
    'create unlogged table t ()',
    'CREATE TEMPORARY TABLE t ()',
    'CREATE UNIQUE INDEX i ON t (a)',
    'ALTER TABLE t ADD x int',
    'CREATE TYPE e AS ENUM ()',
    'COMMENT ON TABLE t IS',
    'CREATE SCHEMA s',
  ])('recognizes %s', (sql) => {
    expect(isSchemaStatement(sql)).toBe(true);
  });

  it.each(['GRANT SELECT ON t TO u', 'CREATE TRIGGER x', 'CREATE TABL x (', 'SET a = 1'])(
    'rejects %s',
    (sql) => {
      expect(isSchemaStatement(sql)).toBe(false);
    },
  );
});

describe('leadingKeywords', () => {
  it('returns the first words without parentheses', () => {
    expect(leadingKeywords('GRANT  SELECT\nON t TO u')).toBe('GRANT SELECT ON');
    expect(leadingKeywords('COPY t(a) FROM stdin', 2)).toBe('COPY t');
  });
});
