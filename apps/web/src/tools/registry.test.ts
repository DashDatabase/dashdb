import { rules } from '@dashdb/core';
import { convert } from '@dashdb/core/convert';
import { describe, expect, it } from 'vitest';
import { PAGES } from '@/lib/site';
import {
  TOOLS,
  explanationWords,
  findTool,
  type MappingRow,
  type ToolDefinition,
} from './registry';

const tools: readonly ToolDefinition[] = TOOLS;
const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A one-column schema in the tool's source format, with the row's type on column `col`. */
function sampleFor(tool: ToolDefinition, row: MappingRow): string {
  if (row.sample) return row.sample;
  if (tool.from === 'prisma') {
    return `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\nmodel T {\n  id Int @id\n  col ${row.source}\n}`;
  }
  return `CREATE TABLE t (id int PRIMARY KEY, col ${row.source} NOT NULL);`;
}

describe('tool registry', () => {
  it('has the ten launch tools with URL-safe, unique slugs', () => {
    expect(tools.map((t) => t.slug)).toEqual([
      'sql-to-prisma',
      'prisma-to-sql',
      'postgres-to-mysql',
      'mysql-to-postgres',
      'sql-to-drizzle',
      'prisma-to-drizzle',
      'dbml-to-sql',
      'sql-to-dbml',
      'sql-to-mermaid',
      'prisma-to-erd',
    ]);
    for (const tool of tools) {
      expect(tool.slug).toMatch(/^[a-z0-9-]+$/);
      expect(tool.slug).not.toMatch(/^-|-$|--/);
    }
    expect(findTool('sql-to-prisma')?.to).toBe('prisma');
    expect(findTool('nope')).toBeUndefined();
  });

  it('gives every page a unique title, H1, description, lead and explanation', () => {
    for (const key of ['title', 'h1', 'description', 'lead'] as const) {
      const values = tools.map((t) => t[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
    const intros = tools.map((t) => t.intro.join(' '));
    expect(new Set(intros).size).toBe(intros.length);
    // No paragraph is shared between two pages.
    const paragraphs = tools.flatMap((t) => [...t.intro, ...t.gotchas.map((g) => g.body)]);
    expect(new Set(paragraphs).size).toBe(paragraphs.length);
  });

  it('keeps descriptions within what search results show', () => {
    for (const tool of tools) {
      expect(tool.description.length, tool.slug).toBeGreaterThanOrEqual(80);
      expect(tool.description.length, tool.slug).toBeLessThanOrEqual(170);
      expect(`${tool.title} · DashDB`.length, tool.slug).toBeLessThanOrEqual(60);
    }
  });

  it.each(tools.map((t) => [t.slug, t] as const))(
    '%s explains itself in 300-500 words',
    (_, tool) => {
      const words = explanationWords(tool);
      expect(words).toBeGreaterThanOrEqual(300);
      expect(words).toBeLessThanOrEqual(500);
    },
  );

  it('links only to tools, pages and guides that exist', () => {
    const slugs = new Set(tools.map((t) => t.slug));
    const pages = new Set<string>(PAGES.map((p) => p.path));
    const guides = new Set(rules.flatMap((r) => r.dialects.map((d) => `/guides/${d}/${r.id}`)));
    for (const tool of tools) {
      expect(tool.related.length, tool.slug).toBeGreaterThanOrEqual(2);
      for (const related of tool.related) {
        expect(slugs.has(related), `${tool.slug} → ${related}`).toBe(true);
        expect(related).not.toBe(tool.slug);
      }
      for (const { href } of tool.guides) {
        expect(pages.has(href) || guides.has(href), `${tool.slug} → ${href}`).toBe(true);
      }
      expect(tool.faq.length, tool.slug).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('tool examples and mapping tables', () => {
  it.each(tools.map((t) => [t.slug, t] as const))(
    '%s: the example converts without errors',
    async (_, tool) => {
      const result = await convert({ from: tool.from, to: tool.to, source: tool.exampleInput });
      expect(result.ok).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(result.code.length).toBeGreaterThan(50);
    },
  );

  const rows = tools.flatMap((tool) =>
    tool.mapping.rows.map((row) => [tool.slug, row.source, tool, row] as const),
  );

  it.each(rows)('%s: %s', async (_, __, tool, row) => {
    const result = await convert({ from: tool.from, to: tool.to, source: sampleFor(tool, row) });
    expect(result.ok).toBe(true);
    const output = flat(result.code);
    const expected = flat(row.expect ?? row.target);
    if (row.sample) {
      expect(output).toContain(expected);
      return;
    }
    // One-column samples: look only at column `col`, not at the id column before it.
    const marker = tool.to === 'drizzle' ? ' col: ' : ' col ';
    const start = output.indexOf(marker);
    expect(start, 'column not found in output').toBeGreaterThanOrEqual(0);
    expect(output.slice(start, start + 200)).toContain(expected);
  });
});
