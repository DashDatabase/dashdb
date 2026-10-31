import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `SOURCE_MAPS=1 pnpm build` emits browser source maps, for attributing bundle bytes to
  // modules (see PERFORMANCE.md).
  productionBrowserSourceMaps: process.env.SOURCE_MAPS === '1',
  turbopack: {
    resolveAlias: {
      // @dashdb/core's Prisma parser searches the filesystem for a config at import time.
      lilconfig: { browser: './src/shims/lilconfig.ts' },
    },
  },
};

// MDX content (the changelog) is imported by pages and compiled at build time.
const withMDX = createMDX({});

export default withMDX(nextConfig);
