import type { MetadataRoute } from 'next';
import { everyPage } from '@/lib/content-pages';
import { absoluteUrl } from '@/lib/seo';

// Every public page: the registry, converter tools, templates, safety guides, docs and posts.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await everyPage()).map((page) => ({
    url: absoluteUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
