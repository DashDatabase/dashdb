// Builds a gallery template (.dashdb.json) from DDL and a metadata file, with the tables laid out
// by the editor's own auto-layout. For maintainers and contributors who start from SQL; the
// other way in is designing in the editor and exporting the project (see content/templates).
//
//   pnpm --filter @dashdb/web template:from-sql <schema.sql> <meta.json> <slug>
//
// meta.json holds the template block without tablesCount (counted here):
//   { "title", "description", "tags": [...], "dialect": "postgres" | "mysql", "decisions": [...] }
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ELK from 'elkjs/lib/elk.bundled.js';
// The SQL parsers only, from source: the package's root entry also loads the Prisma parser,
// whose chevrotain dependency Node's own ESM resolver rejects (bundlers and Vitest cope).
import { validateSchema } from '../../../packages/core/src/ir/schema';
import { parseMySQLDDL } from '../../../packages/core/src/parsers/mysql';
import { parsePostgresDDL } from '../../../packages/core/src/parsers/postgres';
import { computeLayout } from '../src/editor/canvas/layout/elk';
import { NODE_WIDTH, estimateNodeHeight } from '../src/editor/canvas/model';
import type { Layout } from '../src/editor/store/types';
import { templateMetaSchema } from '../src/templates/meta';

const [sqlPath, metaPath, slug] = process.argv.slice(2);
if (!sqlPath || !metaPath || !slug || !/^[a-z0-9-]+$/.test(slug) || /^-|-$|--/.test(slug)) {
  console.error('Usage: template-from-sql <schema.sql> <meta.json> <kebab-case-slug>');
  process.exit(1);
}

/* eslint-disable security/detect-non-literal-fs-filename -- a CLI: it reads the files it is given */
const sql = readFileSync(sqlPath, 'utf8');
const metaInput = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
/* eslint-enable security/detect-non-literal-fs-filename */
const dialect = metaInput.dialect === 'mysql' ? 'mysql' : 'postgres';
// Readable, stable ids (`table:public.users`) keep template files diffable in review.
const parse = dialect === 'mysql' ? parseMySQLDDL : parsePostgresDDL;
const { schema, diagnostics } = parse(sql, { createId: (hint) => hint });

const errors = diagnostics.filter((d) => d.severity === 'error');
if (errors.length > 0) {
  for (const e of errors) console.error(`line ${String(e.line)}: ${e.message}`);
  process.exit(1);
}
const problems = validateSchema(schema);
if (problems.length > 0) {
  console.error(problems);
  process.exit(1);
}

const positions = await computeLayout(new ELK(), {
  nodes: schema.tables.map((t) => ({
    id: t.id,
    width: NODE_WIDTH,
    height: estimateNodeHeight(t, false),
  })),
  edges: schema.tables.flatMap((t) =>
    t.foreignKeys.map((fk) => ({ id: fk.id, source: fk.refTable, target: t.id })),
  ),
});
const layout: Layout = {
  nodes: Object.fromEntries(
    schema.tables.map((t) => [
      t.id,
      {
        x: positions[t.id]?.x ?? 0,
        y: positions[t.id]?.y ?? 0,
        collapsed: false,
        color: 'default',
      },
    ]),
  ),
};

const meta = templateMetaSchema.parse({ ...metaInput, tablesCount: schema.tables.length });
const file = {
  format: 'dashdb.project',
  version: 1,
  exportedAt: new Date().toISOString(),
  template: meta,
  project: { name: meta.title, schema, layout, baselines: [] },
};
const out = join(import.meta.dirname, '..', 'content', 'templates', `${slug}.dashdb.json`);
// eslint-disable-next-line security/detect-non-literal-fs-filename -- content/templates/<checked slug>
writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
console.log(`Wrote ${out} (${String(schema.tables.length)} tables)`);
