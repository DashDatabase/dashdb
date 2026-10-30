import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.db.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/ir/**/*.ts'],
      exclude: ['src/ir/**/*.test.ts', 'src/ir/__fixtures__/**'],
      thresholds: { 100: true },
    },
  },
});
