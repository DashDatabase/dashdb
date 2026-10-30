import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      // @dashdb/core's Prisma parser searches the filesystem for a config at import time.
      lilconfig: { browser: './src/shims/lilconfig.ts' },
    },
  },
};

export default nextConfig;
