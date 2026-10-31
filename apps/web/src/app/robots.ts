import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/** Paths that are app surfaces, not content: the local editor, the API and share links. */
const DISALLOWED_PATHS = ['/app', '/api', '/share'] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
