import { renderRss } from '@/blog/rss';
import { getSiteUrl } from '@/lib/config';
import { absoluteUrl } from '@/lib/seo';
import { getPage, SITE } from '@/lib/site';
import { getPosts } from '@/lib/source';

// The blog's RSS feed, written once at build time.
export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  const site = getSiteUrl();
  const blog = getPage('blog');
  const xml = renderRss({
    title: `${SITE.name} blog`,
    url: absoluteUrl(blog.path, site),
    feedUrl: absoluteUrl('/blog/rss.xml', site),
    description: blog.description,
    items: (await getPosts()).map((post) => ({
      title: post.title,
      url: absoluteUrl(post.path, site),
      description: post.description,
      date: post.date,
      author: post.author.name,
      tags: post.tags,
    })),
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
