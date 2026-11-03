import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.db.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { 100: true },
    },
  },
});
