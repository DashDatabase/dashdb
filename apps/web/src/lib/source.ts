// The MDX collections, compiled at build time by fumadocs-mdx (see source.config.ts).
import 'server-only';
import { blog as blogPosts, docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { AUTHORS } from '@/blog/authors';

/** The docs at /docs, with the page tree for the sidebar. */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

export type DocsPage = (typeof source)['$inferPage'];

type PostEntry = (typeof blogPosts)[number];

export interface BlogPost {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly author: (typeof AUTHORS)[keyof typeof AUTHORS];
  readonly tags: readonly string[];
  readonly readingMinutes: number;
  readonly entry: PostEntry;
}

/** Average adult silent reading speed for technical prose, in words per minute. */
const WORDS_PER_MINUTE = 230;

export function readingMinutes(markdown: string): number {
  const words = markdown
    // Code reads slower than prose but is skimmed; count it like prose.
    .replace(/[#>*_`[\]()|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

let posts: Promise<BlogPost[]> | undefined;

/** Every blog post, newest first (ties by title). */
export function getPosts(): Promise<BlogPost[]> {
  posts ??= Promise.all(
    blogPosts.map(async (entry): Promise<BlogPost> => {
      const slug = entry.info.path.replace(/\.mdx?$/, '');
      return {
        slug,
        path: `/blog/${slug}`,
        title: entry.title,
        description: entry.description,
        date: entry.date,
        author: AUTHORS[entry.author],
        tags: entry.tags,
        readingMinutes: readingMinutes(await entry.getText('processed')),
        entry,
      };
    }),
  ).then((all) =>
    all.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)),
  );
  return posts;
}

export async function findPost(slug: string): Promise<BlogPost | undefined> {
  return (await getPosts()).find((p) => p.slug === slug);
}

/** Up to `count` other posts, most shared tags first, then newest. */
export async function relatedPosts(post: BlogPost, count = 3): Promise<BlogPost[]> {
  const shared = (other: BlogPost) => other.tags.filter((t) => post.tags.includes(t)).length;
  return (await getPosts())
    .filter((other) => other.slug !== post.slug)
    .map((other, order) => ({ other, order, score: shared(other) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, count)
    .map(({ other }) => other);
}
