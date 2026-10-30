import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.db.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/ir/**/*.ts', 'src/diff/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/ir/__fixtures__/**', 'src/diff/__test-utils__/**'],
      thresholds: { 100: true },
    },
  },
});
