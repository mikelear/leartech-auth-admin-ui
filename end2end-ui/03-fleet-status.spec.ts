import { test, expect } from 'playwright/test';

/**
 * Fleet-status SDK dogfood spec — STAGING-ONLY.
 *
 * Navigates to /fleet-status, which calls each peer golden-template
 * service via the published SDK (npm package from leartech-ts-packages).
 *
 * **Skips in PR preview**: PR-preview namespaces deploy only the
 * angular template's own service, not peers. Per the observer 0.0.27
 * staging-vs-preview contract, STAGING_URL presence is the
 * discriminator — only staging dispatches have it set.
 *
 * **In staging** (arrivals-observer dispatched Job): each peer's
 * `/api/v1/example` is called via Angular HttpClient without auth
 * (the spec doesn't sign in first). Backend AuthLayer rejects with
 * HTTP 401, which the component counts as `pass` ("auth wiring on"
 * — message in fleet-status.component.ts:189). Strict assertion:
 * every peer row must reach `pass`, not just terminal-state.
 *
 * Tightened from "non-pending" to strict-pass after backend CORS
 * landed (jx-build-cluster-gsm#399 / akv#242). The earlier relaxed
 * assertion masked the missing-CORS issue — a row could be `fail`
 * with status=0 "CORS blocked" and still pass the spec.
 */
test.describe('fleet status', () => {
  test.beforeEach(() => {
    // Skip-in-preview per observer 0.0.27 contract — fleet-status
    // requires all 3 peer templates deployed, which only happens in
    // staging (or local-dev pointed at staging URLs).
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'fleet-status requires peer services — staging-only');
    }
  });


  test('renders fleet-status table with each peer probed', async ({ page }) => {
    await page.goto('/fleet-status', { waitUntil: 'networkidle', timeout: 15_000 });

    // Table renders with header + 3 peer rows.
    const table = page.getByTestId('fleet-status-table');
    await expect(table, 'fleet-status-table not visible').toBeVisible({
      timeout: 5_000,
    });

    // Each peer row exists.
    for (const svc of [
      'leartech-rust-service-template',
      'leartech-dotnet-service-template',
      'leartech-go-service-template',
    ]) {
      const row = page.getByTestId(`fleet-row-${svc}`);
      await expect(row, `row for ${svc} not visible`).toBeVisible();
    }
  });

  test('every peer returns the expected 401 (audience-bound auth wiring proven)', async ({ page }) => {
    await page.goto('/fleet-status', { waitUntil: 'networkidle', timeout: 15_000 });

    // Wait for the async fleet check to settle. Each row moves from
    // `pending` → `pass`/`fail`. `pass` is set by the component for
    // either HTTP 200 (authed) or 401 (unauthed reached the backend) —
    // so the `pass` status alone is too permissive for this spec.
    //
    // Manual testing on 2026-05-17 caught the false positive: go-template's
    // auth middleware was misconfigured (chart env var `AUTH_TOKENURL`
    // didn't match go-common's `ServerURL` field, so middleware noop'd
    // and `/api/v1/example` returned 200 unauthenticated). The row read
    // "pass" because 200 is in the OR — but it was hiding a security
    // regression. Assert the specific HTTP code (401) per peer so that
    // shape of failure can never slip through again.
    //
    // A `fail` row (status=0 CORS-blocked, 5xx, etc.) means the staging
    // wiring is broken — either backend ingress missing CORS annotations,
    // or the peer is down. Either is a real defect worth surfacing.
    await expect(
      page.getByTestId('overall-pass'),
      'overall verdict must be pass — backend CORS + audience-bound auth must be live',
    ).toBeVisible({ timeout: 15_000 });

    for (const svc of [
      'leartech-rust-service-template',
      'leartech-dotnet-service-template',
      'leartech-go-service-template',
    ]) {
      const status = page.getByTestId(`status-${svc}`);
      await expect(status, `${svc} must reach pass`).toContainText('pass');

      // Specifically assert 401, not 200. A 200 unauthenticated would
      // mean the peer's auth middleware isn't enforcing — exactly the
      // shape of regression that bit go-template in staging.
      const http = page.getByTestId(`http-${svc}`);
      await expect(
        http,
        `${svc} must return 401 unauthenticated — 200 would mean auth middleware is broken`,
      ).toHaveText('401');
    }
  });
});
