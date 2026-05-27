import { defineConfig } from '@playwright/test';

/**
 * Playwright config — MV3 extension E2E.
 *
 * MV3 service workers don't run in `--headless` Chrome, so we always launch a
 * persistent context with `headless: false`. CI must wrap the runner in
 * `xvfb-run -a` (handled in the GitHub workflow).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
