import { chromium } from 'playwright/test';
import { attemptPlatformLogin } from './support/auth';

/**
 * Global readiness gate — runs ONCE before any spec.
 *
 * On a fresh preview/staging the auth stack warms asynchronously: the seed Job
 * that creates platform@leartech.com and Hydra can lag the first login by a
 * minute or more. That used to make the FIRST login-heavy specs (07-tenants,
 * 08-users) burn through their per-test login retries and fail with an opaque
 * "auth stack likely not ready" / waitForURL timeout, while later specs (09/11)
 * passed once the stack had warmed — a pure ordering flake that reddened the gate
 * (esp. on the slower in-cluster swiftshader browser).
 *
 * Waiting here, with a generous budget DECOUPLED from the per-test timeout,
 * removes the race for the whole suite: we retry a full platform login until it
 * succeeds, then let the specs run against a warm stack. If it never comes up we
 * fail the run early with a clear message instead of N opaque per-spec failures.
 *
 * No target (local dev without PREVIEW_URL/STAGING_URL) → the specs self-skip, so
 * there's nothing to gate; return immediately.
 */
async function globalSetup(): Promise<void> {
  const baseURL = process.env['STAGING_URL'] || process.env['PREVIEW_URL'];
  if (!baseURL) return;

  const password = process.env['USER_PASSWORD'] || 'Test123!';
  const budgetMs = 180_000;
  const start = Date.now();

  const browser = await chromium.launch();
  try {
    let attempt = 0;
    while (Date.now() - start <= budgetMs) {
      attempt++;
      const page = await browser.newPage({ baseURL });
      const ok = await attemptPlatformLogin(page, password);
      await page.close().catch(() => undefined);
      if (ok) {
        console.log(
          `[global-setup] auth stack ready after ${attempt} attempt(s), ${Date.now() - start}ms`,
        );
        return;
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    throw new Error(
      `[global-setup] auth stack (seed/Hydra) not ready after ${attempt} attempts / ${budgetMs}ms against ${baseURL}`,
    );
  } finally {
    await browser.close();
  }
}

export default globalSetup;
