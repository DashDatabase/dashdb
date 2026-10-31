import { validateSchema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMATS,
  defaultExportFormat,
  detectImportFormat,
  detectPastedFormat,
  detectSqlDialect,
  exportFileName,
  exportSchema,
  importSchema,
  isExportFormat,
  isImportFormat,
} from './formats';
import { TEMPLATES, schemaFromTemplate } from './templates';

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s parses to a valid schema',
    (_, template) => {
      const schema = schemaFromTemplate(template);
      expect(validateSchema(schema)).toEqual([]);
      expect(schema.namespaces.length).toBeGreaterThan(0);
    },
  );

  it('gives each instance fresh ids', () => {
    const blog = TEMPLATES.find((t) => t.id === 'blog');
    if (!blog) throw new Error('missing blog template');
    expect(schemaFromTemplate(blog).id).not.toBe(schemaFromTemplate(blog).id);
  });
});

describe('detectImportFormat', () => {
  it('uses the extension first, then the contents', () => {
    expect(detectImportFormat('schema.prisma', '')).toBe('prisma');
    expect(detectImportFormat('db.DBML', '')).toBe('dbml');
    expect(detectImportFormat('dump.sql', 'CREATE TABLE `a` (id int) ENGINE=InnoDB;')).toBe(
      'mysql',
    );
    expect(detectImportFormat('dump.sql', 'CREATE TABLE a (id int);')).toBe('postgres');
    expect(detectImportFormat('dump.sql', 'model A { id Int }')).toBe('postgres');
    expect(detectImportFormat('schema.txt', 'model A {\n  id Int @id\n}')).toBe('prisma');
  });
});

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

describe('detectPastedFormat', () => {
  it('recognises Prisma, DBML and SQL', () => {
    expect(detectPastedFormat('datasource db {\n  provider = "postgresql"\n}')).toBe('prisma');
    expect(detectPastedFormat('model User {\n  id Int @id\n}')).toBe('prisma');
    expect(detectPastedFormat('Table users {\n  id int [pk]\n}')).toBe('dbml');
    expect(detectPastedFormat('Ref: posts.user_id > users.id')).toBe('dbml');
    expect(detectPastedFormat('CREATE TABLE `t` (id int) ENGINE=InnoDB;')).toBe('mysql');
    expect(detectPastedFormat('')).toBe('postgres');
  });
});

describe('import and export', () => {
  it('round-trips through every export format', async () => {
    const { schema, diagnostics } = importSchema(
      'postgres',
      'CREATE TABLE users (id int PRIMARY KEY);',
    );
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    for (const format of Object.keys(EXPORT_FORMATS)) {
      if (!isExportFormat(format)) throw new Error(format);
      const { code } = await exportSchema(format, schema);
      expect(code).toMatch(/users/i);
    }
  });

  it('guards format names', () => {
    expect(isImportFormat('dbml')).toBe(true);
    expect(isImportFormat('toString')).toBe(false);
    expect(isExportFormat('drizzle')).toBe(true);
    expect(isExportFormat('yaml')).toBe(false);
  });

  it('defaults export to the schema dialect', () => {
    expect(defaultExportFormat(importSchema('mysql', 'CREATE TABLE a (id int);').schema)).toBe(
      'mysql',
    );
    expect(defaultExportFormat(importSchema('postgres', 'CREATE TABLE a (id int);').schema)).toBe(
      'postgres',
    );
  });

  it('builds safe file names', () => {
    expect(exportFileName('My Shop / v2!', 'prisma')).toBe('my-shop-v2.prisma');
    expect(exportFileName('???', 'drizzle')).toBe('schema.ts');
  });
});

describe('format detection on hostile input', () => {
  it('stays fast on text built to make regexes backtrack', () => {
    const inputs = [
      'CREATE TYPE '.repeat(200_000),
      `${'\n'.repeat(1_000_000)}x`,
      `Table ${'x'.repeat(1_000_000)}`,
      ' \t'.repeat(500_000),
    ];
    const start = performance.now();
    for (const text of inputs) {
      detectPastedFormat(text);
      detectImportFormat('dump.sql', text);
    }
    expect(performance.now() - start).toBeLessThan(500);
  });
});
