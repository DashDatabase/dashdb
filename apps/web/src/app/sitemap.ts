import { rules } from '@dashdb/core';
import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { allPages } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = allPages().map((page) => ({
    url: absoluteUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
  // The migration safety guides are public, indexable reference pages.
  const guides = rules.flatMap((rule) =>
    rule.dialects.map((dialect) => ({
      url: absoluteUrl(`/guides/${dialect}/${rule.id}`),
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    })),
  );
  return [...pages, ...guides];
}
