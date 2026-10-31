import { findTemplate, getTemplates } from '@/templates/load';
import { templatePreview } from '@/templates/preview';

// Generated once at build time for every template (`preview.svg`).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getTemplates().map((t) => ({ slug: t.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const template = findTemplate((await params).slug);
  if (!template) return new Response('Not found', { status: 404 });
  return new Response(templatePreview(template).svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });
}
