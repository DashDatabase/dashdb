import { renderMarkSvg } from '@dashdb/ui/server';
import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand-colors';
import { OG_SIZE } from '@/lib/seo';
import { allPages, findPage, SITE } from '@/lib/site';

// One Open Graph image per public page, rendered at build time (see `ogImagePath` in lib/seo).

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return allPages().map((page) => ({ slug: page.slug }));
}

// The app icon's palette.
const MARK = `data:image/svg+xml;base64,${Buffer.from(
  renderMarkSvg(
    {
      tile: BRAND.indigo,
      outline: BRAND.white,
      header: BRAND.white,
      rows: BRAND.indigoLight,
      node: BRAND.teal,
    },
    96,
  ),
).toString('base64')}`;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const page = findPage((await params).slug);
  if (!page) return new Response('Not found', { status: 404 });
  const isHome = page.path === '/';
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: `linear-gradient(135deg, ${BRAND.ink} 0%, ${BRAND.inkIndigo} 100%)`,
        color: BRAND.white,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a page */}
        <img src={MARK} width={72} height={72} alt="" />
        <div style={{ fontSize: 44, fontWeight: 700 }}>{SITE.name}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{ fontSize: isHome ? 68 : 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}
        >
          {page.title}
        </div>
        {!isHome && (
          <div style={{ fontSize: 30, color: BRAND.muted, maxWidth: 1000 }}>{SITE.headline}</div>
        )}
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: BRAND.muted }}>dashdb.dev</div>
    </div>,
    OG_SIZE,
  );
}
