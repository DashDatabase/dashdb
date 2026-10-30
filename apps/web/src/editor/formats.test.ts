import { validateSchema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMATS,
  defaultExportFormat,
  detectImportFormat,
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
