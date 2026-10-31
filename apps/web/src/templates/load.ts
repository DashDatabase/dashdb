import 'server-only';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schemaSchema, type Schema } from '@dashdb/core/lite';
import { z } from 'zod';
import { layoutSchema } from '@/editor/record-schemas';
import type { Layout } from '@/editor/store';
import { templateMetaSchema, type TemplateMeta } from './meta';

// The template gallery's content: every `<slug>.dashdb.json` in content/templates, read and
// validated once per build. A file that does not validate fails the build (and templates.test.ts).

const EXTENSION = '.dashdb.json';

const templateFileSchema = z.strictObject({
  format: z.literal('dashdb.project'),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  template: templateMetaSchema,
  project: z.strictObject({
    name: z.string().max(200),
    schema: schemaSchema,
    layout: layoutSchema,
    baselines: z.array(z.unknown()).max(0, 'Templates ship without baselines'),
  }),
});

export interface Template {
  /** The file name without `.dashdb.json`: the URL segment. */
  readonly slug: string;
  readonly meta: TemplateMeta;
  readonly schema: Schema;
  readonly layout: Layout;
  /** The file as stored, served for "Use this template" and downloads. */
  readonly raw: string;
}

/** Parses one template file; throws with the file name and the first problems. */
export function parseTemplate(slug: string, raw: string): Template {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${slug}${EXTENSION}: not valid JSON (${String(error)})`);
  }
  const result = templateFileSchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(file)'}: ${i.message}`);
    throw new Error(`${slug}${EXTENSION} is not a valid template:\n  ${problems.join('\n  ')}`);
  }
  const { template, project } = result.data;
  return { slug, meta: template, schema: project.schema, layout: project.layout, raw };
}

export interface TemplateSource {
  /** File name, e.g. `crm.dashdb.json`. */
  readonly name: string;
  readonly raw: string;
}

/** Parses the template files among `files` (others are ignored), sorted by title. */
export function templatesFrom(files: readonly TemplateSource[]): Template[] {
  return files
    .filter((file) => file.name.endsWith(EXTENSION))
    .map((file) => parseTemplate(file.name.slice(0, -EXTENSION.length), file.raw))
    .sort((a, b) => a.meta.title.localeCompare(b.meta.title));
}

let cache: Template[] | undefined;

/** All templates in content/templates, by title. */
export function getTemplates(): Template[] {
  // The path is spelled out (not passed in) so the build traces only content/templates.
  cache ??= templatesFrom(
    readdirSync(join(process.cwd(), 'content', 'templates')).map((name) => ({
      name,
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- names listed from content/templates
      raw: readFileSync(join(process.cwd(), 'content', 'templates', name), 'utf8'),
    })),
  );
  return cache;
}

export function findTemplate(slug: string): Template | undefined {
  return getTemplates().find((t) => t.slug === slug);
}

/** Up to `count` other templates, the ones sharing the most tags first. */
export function relatedTemplates(template: Template, count = 3): Template[] {
  const tags = new Set(template.meta.tags);
  return getTemplates()
    .filter((t) => t.slug !== template.slug)
    .map((t) => ({ t, shared: t.meta.tags.filter((tag) => tags.has(tag)).length }))
    .sort((a, b) => b.shared - a.shared || a.t.meta.title.localeCompare(b.t.meta.title))
    .slice(0, count)
    .map(({ t }) => t);
}
