import { defineConfig } from 'vitest/config';

// Integration tests that need a live database (docker compose up -d).
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    testTimeout: 15_000,
  },
});
