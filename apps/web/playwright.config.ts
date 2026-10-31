import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // The dev server compiles each route on first visit, which can outlast the default timeouts.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Specs start as returning users; onboarding.spec.ts opts back into the first run.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            {
              name: 'dashdb-onboarding',
              value: JSON.stringify({ status: 'dismissed', step: 0, projectId: null }),
            },
          ],
        },
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
