// The gate every gallery template passes, including community contributions:
//   pnpm --filter @dashdb/web templates:check
import { toMySQLDDL, toPostgresDDL, toPrisma, validateSchema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { parseProjectFile } from '@/editor/project-file';
import { renderDiagramSvg } from '@/editor/export/diagram-svg';
import { getTemplates, parseTemplate, relatedTemplates, templatesFrom } from './load';

const templates = getTemplates();
const cases = templates.map((t) => [t.slug, t] as const);

describe('template gallery', () => {
  it('includes the twelve launch templates (contributions add to them)', () => {
    expect(templates.map((t) => t.slug)).toEqual(
      expect.arrayContaining([
        'analytics-events',
        'blog-cms',
        'booking-system',
        'crm',
        'e-commerce',
        'food-delivery',
        'helpdesk',
        'inventory',
        'lms',
        'marketplace',
        'saas-multi-tenant',
        'social-network',
      ]),
    );
  });

  it('gives every template a unique title and description', () => {
    for (const key of ['title', 'description'] as const) {
      const values = templates.map((t) => t.meta[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it('keeps slugs URL-safe and clear of fixed routes', () => {
    for (const { slug } of templates) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toMatch(/^-|-$|--/);
      expect(slug).not.toBe('contribute');
    }
  });
});

describe.each(cases)('template %s', (_, template) => {
  const { meta, schema, layout } = template;

  it('has metadata that matches its schema', () => {
    expect(meta.tablesCount).toBe(schema.tables.length);
    expect(meta.dialect).toBe(schema.dialect);
  });

  it('is a valid schema with a layout node for every table', () => {
    expect(validateSchema(schema)).toEqual([]);
    expect(Object.keys(layout.nodes).sort()).toEqual(schema.tables.map((t) => t.id).sort());
  });

  it('opens in the editor like any exported project', () => {
    const parsed = parseProjectFile(template.raw);
    expect(parsed.ok).toBe(true);
  });

  it('exports SQL and Prisma, and renders a preview', () => {
    const sql = (meta.dialect === 'mysql' ? toMySQLDDL : toPostgresDDL)(schema);
    expect(sql.code).toContain('CREATE TABLE');
    expect(toPrisma(schema).code).toContain('model ');
    const preview = renderDiagramSvg(schema, layout, {
      theme: 'light',
      transparent: false,
      watermark: false,
    });
    expect(preview.width).toBeGreaterThan(200);
    expect(preview.svg).toContain('<svg');
  });
});

describe('related templates', () => {
  it('suggests three others, sharing tags first', () => {
    const shop = templates.find((t) => t.slug === 'e-commerce');
    if (!shop) throw new Error('e-commerce template missing');
    const related = relatedTemplates(shop);
    expect(related).toHaveLength(3);
    expect(related.map((t) => t.slug)).not.toContain('e-commerce');
    // The marketplace shares two tags (e-commerce, payments) with the store.
    expect(related[0]?.slug).toBe('marketplace');
  });
});

describe('parseTemplate', () => {
  const valid = templates[0]?.raw ?? '';

  it('names the file and the problem when a template is invalid', () => {
    expect(() => parseTemplate('broken', '{')).toThrow(/broken\.dashdb\.json: not valid JSON/);
    const withoutMeta = JSON.stringify({ ...(JSON.parse(valid) as object), template: undefined });
    expect(() => parseTemplate('plain', withoutMeta)).toThrow(/plain\.dashdb\.json.*\n.*template/);
    const file = JSON.parse(valid) as { project: { baselines: unknown[] } };
    file.project.baselines = [{}];
    expect(() => parseTemplate('history', JSON.stringify(file))).toThrow(/baselines/);
  });

  it('reads only *.dashdb.json files, sorted by title', () => {
    const two = JSON.parse(valid) as { template: { title: string } };
    two.template.title = 'Aardvark tracker';
    const parsed = templatesFrom([
      { name: 'one.dashdb.json', raw: valid },
      { name: 'README.md', raw: '# not a template' },
      { name: 'two.dashdb.json', raw: JSON.stringify(two) },
    ]);
    expect(parsed.map((t) => t.slug)).toEqual(['two', 'one']);
  });
});
