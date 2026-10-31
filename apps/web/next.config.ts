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

export default nextConfig;
