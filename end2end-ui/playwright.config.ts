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
  // Per-test cap. The login-based specs (07-tenants, 08-users) drive the full
  // OAuth round-trip — form load + submit + Hydra consent + callback + token
  // decode — then screen actions. On the in-cluster software-rendered
  // (swiftshader) browser that exceeds 30s, so the test was killed mid-flow on
  // GCP (AZ was just fast enough). 60s gives the slow browser room (matches
  // leartech-auth-ui's config after the same symptom).
  timeout: 60_000,
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
