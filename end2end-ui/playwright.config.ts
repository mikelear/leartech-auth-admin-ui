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
  // Global readiness gate: wait ONCE for the auth stack (seed Job creating
  // platform@ + Hydra) to be up before any spec runs, so per-test logins hit a
  // warm stack instead of racing a cold-start seed. Removes the dominant
  // ordering flake (07/08 exhausting login retries while 09/11 passed). Skips
  // itself when no PREVIEW_URL/STAGING_URL target is set.
  globalSetup: './global-setup.ts',
  // Per-test cap. The login-based specs (07-tenants, 08-users) drive the full
  // OAuth round-trip — form load + submit + Hydra consent + callback + token
  // decode — then screen actions. On the in-cluster software-rendered
  // (swiftshader) browser that exceeds 30s. 90s gives the slow browser room even
  // if the per-test helper needs a retry (the readiness gate absorbs the cold
  // start, so this ceiling is only hit by a genuinely slow browser, not a race).
  timeout: 90_000,
  retries: 0,
  // Cap parallelism. The in-cluster e2e-ui pod has a modest memory limit; the
  // default (= CPU count, 8) spins up 8 headless Chromium instances at once and
  // OOM-kills the pod once the suite grew past ~a dozen specs — which showed up
  // as opaque "arrival Failed" with no results (killed mid-run after 01-page-loads).
  // 2 workers keeps memory well under the limit; the specs are individually fast.
  workers: 2,
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
