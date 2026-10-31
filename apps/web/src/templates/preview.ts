import 'server-only';
import { toMySQLDDL, toPostgresDDL, toPrisma } from '@dashdb/core';
import { renderDiagramSvg, type DiagramImage } from '@/editor/export/diagram-svg';
import type { Template } from './load';

// Build-time artifacts for a template: the diagram preview (the editor's own SVG export, from the
// template's saved layout) and its schema as SQL and Prisma.

const previews = new Map<string, DiagramImage>();

export function templatePreview(template: Template): DiagramImage {
  let image = previews.get(template.slug);
  if (!image) {
    image = renderDiagramSvg(template.schema, template.layout, {
      theme: 'light',
      transparent: false,
      watermark: false,
    });
    previews.set(template.slug, image);
  }
  return image;
}

export function templateSql(template: Template): string {
  const serialize = template.meta.dialect === 'mysql' ? toMySQLDDL : toPostgresDDL;
  return serialize(template.schema).code;
}

export function templatePrisma(template: Template): string {
  return toPrisma(template.schema).code;
}

/** Paths of the static files each template page links to. */
export const templateFiles = (slug: string) => ({
  preview: `/templates/${slug}/preview.svg`,
  project: `/templates/${slug}/template.dashdb.json`,
  sql: `/templates/${slug}/schema.sql`,
  prisma: `/templates/${slug}/schema.prisma`,
});
