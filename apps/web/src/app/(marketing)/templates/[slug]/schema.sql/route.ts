import { findTemplate, getTemplates } from '@/templates/load';
import { templateSql } from '@/templates/preview';

// Generated once at build time for every template (`schema.sql`).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getTemplates().map((t) => ({ slug: t.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const template = findTemplate((await params).slug);
  if (!template) return new Response('Not found', { status: 404 });
  return new Response(templateSql(template), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
