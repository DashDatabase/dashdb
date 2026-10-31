import { describe, expect, it } from 'vitest';
import { detectSourceFormat, detectSqlDialect } from './detect';

describe('detectSqlDialect', () => {
  it.each([
    ['CREATE TABLE `users` (id int UNSIGNED AUTO_INCREMENT) ENGINE=InnoDB;', 'mysql'],
    ["CREATE TABLE t (c datetime ON UPDATE CURRENT_TIMESTAMP, s enum('a'));", 'mysql'],
    ['CREATE TABLE t (id bigserial PRIMARY KEY, data jsonb);', 'postgres'],
    ["CREATE TYPE mood AS ENUM ('ok'); COMMENT ON TABLE t IS 'x';", 'postgres'],
    ["CREATE TABLE t (d text DEFAULT 'x'::text);", 'postgres'],
    // A lone backtick in a Postgres comment loses to stronger Postgres signals.
    ['-- `legacy`\nCREATE TABLE t (id uuid, at timestamptz, n bigserial);', 'postgres'],
    ['CREATE TABLE t (id int);', 'postgres'],
  ] as const)('%s → %s', (sql, dialect) => {
    expect(detectSqlDialect(sql)).toBe(dialect);
  });
});

describe('detectSourceFormat', () => {
  it('recognises Prisma, DBML and SQL', () => {
    expect(detectSourceFormat('datasource db {\n  provider = "postgresql"\n}')).toBe('prisma');
    expect(detectSourceFormat('model User {\n  id Int @id\n}')).toBe('prisma');
    expect(detectSourceFormat('Table users {\n  id int [pk]\n}')).toBe('dbml');
    expect(detectSourceFormat('Ref: posts.user_id > users.id')).toBe('dbml');
    expect(detectSourceFormat('CREATE TABLE `t` (id int) ENGINE=InnoDB;')).toBe('mysql');
    expect(detectSourceFormat('')).toBe('postgres');
  });

  it('stays fast on text built to make regexes backtrack', () => {
    const inputs = [
      'CREATE TYPE '.repeat(200_000),
      `${'\n'.repeat(1_000_000)}x`,
      `Table ${'x'.repeat(1_000_000)}`,
      ' \t'.repeat(500_000),
    ];
    const start = performance.now();
    for (const text of inputs) {
      detectSourceFormat(text);
      detectSqlDialect(text);
    }
    expect(performance.now() - start).toBeLessThan(500);
  });
});
