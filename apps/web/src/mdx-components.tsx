import type { MDXComponents } from 'mdx/types';

// Element styles for MDX content (the changelog). Required by @next/mdx in the App Router.
const components: MDXComponents = {
  h2: (props) => (
    <h2 className="mt-12 text-2xl font-semibold tracking-tight first:mt-0" {...props} />
  ),
  h3: (props) => <h3 className="mt-6 font-semibold" {...props} />,
  p: (props) => <p className="mt-3 leading-7 text-text-muted" {...props} />,
  ul: (props) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-text-muted" {...props} />
  ),
  a: (props) => <a className="text-primary-text underline" {...props} />,
  code: (props) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em]" {...props} />
  ),
  kbd: (props) => (
    <kbd className="rounded border bg-surface px-1.5 font-mono text-[0.85em]" {...props} />
  ),
  time: (props) => <time className="mt-1 block text-sm text-text-muted" {...props} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
