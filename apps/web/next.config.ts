import { join } from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `NEXT_OUTPUT=standalone` (set by the Dockerfile) emits .next/standalone: server.js plus only
  // the files it needs. Traced from the monorepo root so workspace packages are included.
  ...(process.env.NEXT_OUTPUT === 'standalone' && {
    output: 'standalone',
    outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
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
    resolveAlias: {
      // @dashdb/core's Prisma parser searches the filesystem for a config at import time.
      lilconfig: { browser: './src/shims/lilconfig.ts' },
    },
  },
};

// MDX is compiled at build time by fumadocs-mdx: the docs and blog collections declared in
// source.config.ts, and standalone files such as the changelog.
const withMDX = createMDX();

export default withMDX(nextConfig);
