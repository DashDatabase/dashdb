import { defineConfig } from 'vitest/config';

// Tests that shell out to external tools (prisma, tsc); run by the CI db-tests job.
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    testTimeout: 120_000,
  },
});
