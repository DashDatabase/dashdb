import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import { prefetchFor } from './primitives';
import type { ComponentProps } from 'react';

// Element styles for MDX on the marketing pages (the changelog and blog posts). Code blocks are
// highlighted at build time by fumadocs-mdx; globals.css switches their Shiki colors by theme.

function A({ href = '', ...props }: ComponentProps<'a'>) {
  const className = 'text-primary-text underline';
  // Internal links route client-side; the editor and the docs are never prefetched.
  return href.startsWith('/') ? (
    <Link href={href} prefetch={prefetchFor(href)} className={className} {...props} />
  ) : (
    <a href={href} className={className} {...props} />
  );
}

export const proseMdxComponents: MDXComponents = {
  h2: (props) => (
    <h2 className="mt-12 text-2xl font-semibold tracking-tight first:mt-0" {...props} />
  ),
  h3: (props) => <h3 className="mt-8 font-semibold" {...props} />,
  p: (props) => <p className="mt-4 leading-7 text-text-muted" {...props} />,
  ul: (props) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-text-muted" {...props} />
  ),
  ol: (props) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-text-muted" {...props} />
  ),
  strong: (props) => <strong className="font-semibold text-text" {...props} />,
  a: A,
  code: (props) => (
    <code
      className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em] [pre_&]:bg-transparent [pre_&]:p-0"
      {...props}
    />
  ),
  pre: ({ tabIndex: _tabIndex, ...props }) => (
    <pre
      tabIndex={0}
      className="mt-5 overflow-x-auto rounded-lg border bg-surface p-4 font-mono text-[13px] leading-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote className="mt-4 border-l-2 pl-4 text-text-muted italic" {...props} />
  ),
  kbd: (props) => (
    <kbd className="rounded border bg-surface px-1.5 font-mono text-[0.85em]" {...props} />
  ),
  time: (props) => <time className="mt-1 block text-sm text-text-muted" {...props} />,
};
