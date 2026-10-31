import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostMeta } from '@/components/blog/post-meta';
import { Breadcrumbs } from '@/components/marketing/breadcrumbs';
import { JsonLd } from '@/components/marketing/json-ld';
import { ButtonLink, Container } from '@/components/marketing/primitives';
import { proseMdxComponents } from '@/components/marketing/prose-mdx';
import { blogPage } from '@/lib/content-pages';
import { articleLd } from '@/lib/json-ld';
import { metadataFor } from '@/lib/seo';
import { findPost, getPosts, relatedPosts } from '@/lib/source';

interface Params {
  slug: string;
}

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  return (await getPosts()).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const post = await findPost((await params).slug);
  if (!post) return {};
  const meta = metadataFor(blogPage(post));
  return {
    ...meta,
    authors: [{ name: post.author.name, url: post.author.url }],
    openGraph: {
      ...meta.openGraph,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author.name],
      tags: [...post.tags],
    },
  };
}

export default async function PostPage({ params }: { params: Promise<Params> }) {
  const post = await findPost((await params).slug);
  if (!post) notFound();
  const page = blogPage(post);
  const related = await relatedPosts(post);
  const Body = post.entry.body;
  return (
    <Container className="py-12 sm:py-16">
      <Breadcrumbs page={page} />
      <JsonLd
        data={articleLd({
          page,
          datePublished: post.date,
          author: post.author,
          keywords: post.tags,
        })}
      />
      <article className="max-w-3xl">
        <header>
          <PostMeta post={post} />
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-text-muted">{post.description}</p>
        </header>
        <div className="mt-10 border-t pt-2" data-testid="post-body">
          <Body components={proseMdxComponents} />
        </div>
      </article>

      <div className="mt-12 flex max-w-3xl flex-wrap gap-3 border-t pt-8">
        <ButtonLink href="/app" prefetch={false}>
          Try DashDB, no signup
        </ButtonLink>
        <ButtonLink href="/docs" prefetch={false} variant="outline">
          Read the docs
        </ButtonLink>
      </div>

      {related.length > 0 && (
        <nav aria-labelledby="related-title" className="mt-16 max-w-3xl">
          <h2 id="related-title" className="text-xl font-semibold tracking-tight">
            Related posts
          </h2>
          <ul className="mt-4 space-y-4">
            {related.map((other) => (
              <li key={other.slug}>
                <Link href={other.path} className="font-medium text-primary-text hover:underline">
                  {other.title}
                </Link>
                <p className="mt-1 text-sm text-text-muted">{other.description}</p>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </Container>
  );
}
