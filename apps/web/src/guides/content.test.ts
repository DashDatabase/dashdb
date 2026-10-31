// Checks the MDX in content/docs and content/blog against the product: every example schema
// parses with the editor's own parsers, and every internal link points at a page that exists.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  detectSqlDialect,
  parseDBML,
  parseMySQLDDL,
  parsePostgresDDL,
  parsePrisma,
  type ParseResult,
} from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { allPages } from '@/lib/site';

const CONTENT = join(import.meta.dirname, '..', '..', 'content');

function mdxFiles(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks content/ only
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });
}

// eslint-disable-next-line security/detect-non-literal-fs-filename -- files listed above
const read = (path: string) => readFileSync(path, 'utf8');

/** `content/docs/orms/index.mdx` → `/docs/orms`. */
function docsUrl(path: string): string {
  const rel = relative(join(CONTENT, 'docs'), path)
    .split(sep)
    .join('/')
    .replace(/\.mdx$/, '');
  const url = `/docs/${rel}`.replace(/\/index$/, '');
  return url === '/docs' ? '/docs' : url;
}

const docs = mdxFiles(join(CONTENT, 'docs'));
const posts = mdxFiles(join(CONTENT, 'blog'));

describe('docs and blog content', () => {
  it('parses every example schema without errors or warnings', () => {
    const examples = docs.flatMap((file) =>
      [...read(file).matchAll(/```(\w+) title="Example"\n([\s\S]*?)```/g)].map((m) => ({
        file: relative(CONTENT, file),
        lang: m[1] ?? '',
        code: m[2] ?? '',
      })),
    );
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const { file, lang, code } of examples) {
      let result: ParseResult;
      if (lang === 'prisma') result = parsePrisma(code);
      else if (lang === 'text') result = parseDBML(code);
      else if (detectSqlDialect(code) === 'mysql') result = parseMySQLDDL(code);
      else result = parsePostgresDDL(code);
      expect(result.diagnostics, file).toEqual([]);
      expect(result.schema.tables.length, file).toBeGreaterThan(0);
    }
  });

  it('links only to pages that exist', () => {
    const known = new Set([
      ...allPages().map((p) => p.path),
      ...docs.map(docsUrl),
      ...posts.map((p) => `/blog/${relative(join(CONTENT, 'blog'), p).replace(/\.mdx$/, '')}`),
      '/app',
      '/blog/rss.xml',
    ]);
    for (const file of [...docs, ...posts]) {
      const links = [...read(file).matchAll(/\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)].map(
        (m) => (m[1] ?? m[2] ?? '').split('#')[0] ?? '',
      );
      for (const link of links)
        expect(known, `${relative(CONTENT, file)} → ${link}`).toContain(link);
    }
  });

  it('has a docs page for every section of the docs structure', () => {
    const urls = docs.map(docsUrl);
    for (const url of [
      '/docs',
      '/docs/getting-started',
      '/docs/editor-basics',
      '/docs/importing',
      '/docs/importing/postgres',
      '/docs/importing/mysql',
      '/docs/importing/prisma',
      '/docs/importing/dbml',
      '/docs/importing/existing-database',
      '/docs/importing/project-files',
      '/docs/migrations',
      '/docs/safety-rules',
      '/docs/orms/prisma',
      '/docs/orms/drizzle',
      '/docs/orms/raw-sql',
      '/docs/self-hosting',
      '/docs/contributing',
      '/docs/faq',
    ]) {
      expect(urls).toContain(url);
    }
  });
});
