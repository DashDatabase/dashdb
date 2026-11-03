// e2e/edition: the app run with the test edition (test/fixtures/test-edition.tsx) on its own dev
// server. Run after the main suite (`pnpm e2e`), not beside it: two dev servers compiling at once
// starve each other.
import { defineConfig, devices } from '@playwright/test';
import base, { returningUser } from './playwright.config';

const baseURL = process.env.E2E_EDITION_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
  ...base,
  testDir: './e2e/edition',
  testIgnore: [],
  use: { ...base.use, baseURL, storageState: returningUser(baseURL) },
  projects: [{ name: 'edition-fixture', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec next dev --port 3001',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DASHDB_EDITION_MODULE: './test/fixtures/test-edition.tsx',
      NEXT_DIST_DIR: '.next-fixture',
    },
  },
});
