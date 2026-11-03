import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const appDir = import.meta.dirname;
const repoRoot = join(appDir, '..', '..');

// The edition the app is built with (docs/architecture/editions.md). DASHDB_EDITION_MODULE is a
// path, relative to apps/web or absolute, to a module whose default export is an EditionModule;
// the default is DashDB Community. A module outside this repository (the cloud edition) widens
// Turbopack's root to the common parent, and DASHDB_EDITION_TRANSPILE lists packages it uses
// that need compiling, comma-separated.
const editionModule = resolve(appDir, process.env.DASHDB_EDITION_MODULE ?? './src/edition/oss.ts');
const editionTranspile = (process.env.DASHDB_EDITION_TRANSPILE ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

/** The deepest directory containing both paths. */
function commonParent(a: string, b: string): string {
  let parent = a;
  while (relative(parent, b).startsWith('..') || isAbsolute(relative(parent, b))) {
    parent = dirname(parent);
  }
  return parent;
}

const outsideRepo = relative(repoRoot, editionModule).startsWith(`..${sep}`);
const turbopackRoot = outsideRepo ? commonParent(repoRoot, editionModule) : repoRoot;
// Turbopack wants aliases as paths relative to the app, with forward slashes.
const editionAlias = `./${relative(appDir, editionModule).split(sep).join('/')}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a second dev server run beside the first (the Playwright edition fixture).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: editionTranspile,
  // `NEXT_OUTPUT=standalone` (set by the Dockerfile) emits .next/standalone: server.js plus only
  // the files it needs. Traced from the monorepo root so workspace packages are included.
  ...(process.env.NEXT_OUTPUT === 'standalone' && {
    output: 'standalone',
    outputFileTracingRoot: turbopackRoot,
    // The template gallery reads these with fs at request time (ISR), which tracing can't see.
    outputFileTracingIncludes: { '/*': ['./content/templates/*.dashdb.json'] },
    // Static generation starts one worker per CPU; inside Docker Desktop's VM that runs out of
    // memory, so the image build uses a few (NEXT_BUILD_CPUS).
    experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) || 2 },
  }),
  // `SOURCE_MAPS=1 pnpm build` emits browser source maps, for attributing bundle bytes to
  // modules (see PERFORMANCE.md).
  productionBrowserSourceMaps: process.env.SOURCE_MAPS === '1',
  // The safety guides live under /guides/<dialect>/<rule-id>; their index is in the docs.
  redirects: () =>
    Promise.resolve([
      { source: '/guides', destination: '/docs/safety-rules', permanent: true },
      {
        source: '/guides/:dialect(postgres|mysql)',
        destination: '/docs/safety-rules',
        permanent: true,
      },
    ]),
  turbopack: {
    root: turbopackRoot,
    resolveAlias: {
      // @dashdb/core's Prisma parser searches the filesystem for a config at import time.
      lilconfig: { browser: './src/shims/lilconfig.ts' },
      '@dashdb/active-edition': editionAlias,
    },
  },
  // For `next build --webpack`.
  webpack: (config: { resolve: { alias: Record<string, string> } }) => {
    config.resolve.alias['@dashdb/active-edition'] = editionModule;
    return config;
  },
};

// MDX is compiled at build time by fumadocs-mdx: the docs and blog collections declared in
// source.config.ts, and standalone files such as the changelog.
const withMDX = createMDX();

export default withMDX(nextConfig);
