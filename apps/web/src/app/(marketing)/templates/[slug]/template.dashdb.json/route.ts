import { findTemplate, getTemplates } from '@/templates/load';

// Generated once at build time for every template (`template.dashdb.json`).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getTemplates().map((t) => ({ slug: t.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const template = findTemplate((await params).slug);
  if (!template) return new Response('Not found', { status: 404 });
  return new Response(template.raw, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
