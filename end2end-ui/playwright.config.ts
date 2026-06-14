import { defineConfig } from 'playwright/test';

/**
 * Playwright config for end2end-ui browser tests.
 *
 * Base URL resolution (first non-empty wins):
 *   1. STAGING_URL — set by leartech-arrivals-observer when it dispatches
 *      a Job against a staging Arrival
 *   2. PREVIEW_URL — set by the catalog end2end-ui task for PR builds
 *   3. localhost:4200 — local dev against `ng serve`
 *
 * Tests run headless Chromium. Captures screenshots, videos, and
 * traces on every run; CI uploads these to GCS and links them in
 * the PR comment / Arrival forensics output.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL:
      process.env['STAGING_URL'] ||
      process.env['PREVIEW_URL'] ||
      'http://localhost:4200',
    headless: true,
    screenshot: 'on',
    video: 'on',
    trace: 'on',
  },
  reporter: [['list']],
  outputDir: 'test-results',
});
