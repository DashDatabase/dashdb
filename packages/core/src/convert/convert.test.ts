import { describe, expect, it } from 'vitest';
import { convert, detectSourceFormat, detectSqlDialect, resolveSource, resolveTarget } from '.';

const PG = `CREATE TABLE users (id bigserial PRIMARY KEY, email text NOT NULL UNIQUE);
CREATE TABLE posts (id serial PRIMARY KEY, author_id bigint NOT NULL REFERENCES users (id));`;
const MYSQL =
  'CREATE TABLE `users` (`id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;';
const PRISMA = `datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
}`;
const DBML = `Table users {
  id int [pk, increment]
  email varchar [unique]
}`;

describe('convert', () => {
  it.each([
    ['sql', 'prisma', PG, /model User \{/],
    ['prisma', 'sql', PRISMA, /CREATE TABLE `?User`?/],
    ['postgres', 'mysql', PG, /AUTO_INCREMENT/],
    ['mysql', 'postgres', MYSQL, /CREATE TABLE users/],
    ['sql', 'drizzle', PG, /pgTable\(\s*'users'/],
    ['prisma', 'drizzle', PRISMA, /mysqlTable\(\s*'User'/],
    ['dbml', 'sql', DBML, /CREATE TABLE users/],
    ['sql', 'dbml', PG, /Table users \{/],
    ['sql', 'mermaid', PG, /users \|\|--o\{ posts/],
  ] as const)('%s → %s', async (from, to, source, expected) => {
    const result = await convert({ from, to, source });
    expect(result.ok).toBe(true);
    expect(result.code).toMatch(expected);
  });

  it('resolves `sql` on both sides from the text and the parsed dialect', async () => {
    const fromMysql = await convert({ from: 'sql', to: 'prisma', source: MYSQL });
    expect(fromMysql).toMatchObject({ from: 'mysql', to: 'prisma' });
    expect(fromMysql.code).toContain('provider = "mysql"');
    // A Prisma schema with a MySQL datasource becomes MySQL DDL.
    expect(await convert({ from: 'prisma', to: 'sql', source: PRISMA })).toMatchObject({
      from: 'prisma',
      to: 'mysql',
    });
  });

  it('returns no output, and errors first, when the source does not parse', async () => {
    const result = await convert({ from: 'prisma', to: 'sql', source: 'model User {' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('');
    expect(result.warnings).toEqual([]);
    expect(result.diagnostics[0]?.severity).toBe('error');
  });

  it('passes serializer warnings through', async () => {
    const result = await convert({
      from: 'postgres',
      to: 'mysql',
      source: 'CREATE TABLE t (tags text[]);',
    });
    expect(result.warnings.map((w) => w.message)).toEqual([
      'Type "text[]" has no mysql equivalent; kept verbatim',
    ]);
  });
});

describe('format resolution', () => {
  it('detects SQL dialects and keeps explicit formats', () => {
    expect(resolveSource('sql', MYSQL)).toBe('mysql');
    expect(resolveSource('sql', PG)).toBe('postgres');
    expect(resolveSource('dbml', PG)).toBe('dbml');
    expect(resolveTarget('sql', { dialect: 'mysql' })).toBe('mysql');
    expect(resolveTarget('sql', { dialect: 'sqlite' })).toBe('postgres');
    expect(resolveTarget('dbml', { dialect: 'mysql' })).toBe('dbml');
  });

  it('re-exports the detectors', () => {
    expect(detectSourceFormat(DBML)).toBe('dbml');
    expect(detectSqlDialect(MYSQL)).toBe('mysql');
  });
});
