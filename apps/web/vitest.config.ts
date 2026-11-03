import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/shims/server-only.ts', import.meta.url)),
      // Unit tests run against DashDB Community, as tsconfig.json does.
      '@dashdb/active-edition': fileURLToPath(new URL('./src/edition/oss.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
