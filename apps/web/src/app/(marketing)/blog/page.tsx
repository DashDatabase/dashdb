import type { Metadata } from 'next';
import Link from 'next/link';
import { PostMeta } from '@/components/blog/post-meta';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { JsonLd } from '@/components/marketing/json-ld';
import { Container, PageHeader } from '@/components/marketing/primitives';
import { collectionPageLd } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/seo';
import { getPage } from '@/lib/site';
import { getPosts } from '@/lib/source';

const meta = pageMetadata('blog');

export const metadata: Metadata = {
  ...meta,
  alternates: {
    ...meta.alternates,
    types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'DashDB blog' }] },
  },
};

export default async function BlogPage() {
  const page = getPage('blog');
  const posts = await getPosts();
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <JsonLd
        data={collectionPageLd(
          page,
          posts.map((post) => ({ name: post.title, path: post.path })),
        )}
      />
      <PageHeader
        title="Blog"
        intro="Schema design, zero-downtime migrations, and how Postgres and MySQL really take locks."
      />
      <p className="mt-4 text-sm">
        <a href="/blog/rss.xml" className="text-primary-text underline">
          Subscribe with RSS
        </a>
      </p>
      <ul className="mt-12 max-w-3xl divide-y border-y" data-testid="blog-posts">
        {posts.map((post) => (
          <li key={post.slug} className="relative py-8">
            <PostMeta post={post} />
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
              {/* The link covers the whole entry. */}
              <Link
                href={post.path}
                className="after:absolute after:inset-0 hover:text-primary-text focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {post.title}
              </Link>
            </h2>
            <p className="mt-2 text-text-muted">{post.description}</p>
          </li>
        ))}
      </ul>
    </Container>
  );
}
