import { validateSchema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMATS,
  defaultExportFormat,
  detectImportFormat,
  detectPastedFormat,
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
    async (_, template) => {
      const schema = await schemaFromTemplate(template);
      expect(validateSchema(schema)).toEqual([]);
      expect(schema.namespaces.length).toBeGreaterThan(0);
    },
  );

  it('gives each instance fresh ids', async () => {
    const blog = TEMPLATES.find((t) => t.id === 'blog');
    if (!blog) throw new Error('missing blog template');
    expect((await schemaFromTemplate(blog)).id).not.toBe((await schemaFromTemplate(blog)).id);
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

describe('import and export', () => {
  it('round-trips through every export format', async () => {
    const { schema, diagnostics } = await importSchema(
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

  it('defaults export to the schema dialect', async () => {
    const parsed = (format: 'mysql' | 'postgres') =>
      importSchema(format, 'CREATE TABLE a (id int);').then((r) => r.schema);
    expect(defaultExportFormat(await parsed('mysql'))).toBe('mysql');
    expect(defaultExportFormat(await parsed('postgres'))).toBe('postgres');
  });

  it('builds safe file names', () => {
    expect(exportFileName('My Shop / v2!', 'prisma')).toBe('my-shop-v2.prisma');
    expect(exportFileName('???', 'drizzle')).toBe('schema.ts');
  });
});

describe('format detection on hostile input', () => {
  // The detectors themselves are tested in @dashdb/core; this covers the file-name wrapper.
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
