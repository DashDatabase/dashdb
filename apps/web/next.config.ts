import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
