import { defineConfig } from 'vitest/config';

// Tests against real databases and external tools (prisma, tsc); run by the CI db-tests job.
// Postgres 17 and MySQL 8.4 run in Testcontainers started once by the global setup.
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts', 'test/**/*.db.test.ts'],
    globalSetup: ['test/roundtrip/setup.ts'],
    fileParallelism: true,
    maxConcurrency: 6,
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
