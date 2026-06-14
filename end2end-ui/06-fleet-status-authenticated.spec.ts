import { test, expect } from 'playwright/test';

/**
 * Authenticated fleet-status spec — STAGING-ONLY.
 *
 * Sign in → navigate to /fleet-status → assert every peer returns
 * HTTP 200 (authed call succeeded — peer validated the bearer's
 * audience claim).
 *
 * This is the complementary spec to 03-fleet-status. The 03 case
 * runs WITHOUT signing in first, so every peer is expected to
 * return 401 ("auth wiring on, no bearer"). This case runs WITH
 * sign-in, exercising the FULL chain:
 *
 *   SPA  →  Hydra (audience-bound token)  →  fleet-status page
 *        →  HttpClient.get(peer) + AuthInterceptor injects bearer
 *        →  backend AuthLayer validates aud claim
 *        →  200 (success) or 401 (audience mismatch)
 *
 * If 05-token-claims.spec.ts asserts all 3 audiences are in the
 * token, this spec asserts each backend ACCEPTS that token. If it
 * fails for a specific peer (e.g. rust + dotnet return 401 while go
 * returns 200), the bug is in that backend's audience-check code
 * — not the SPA's token issuance.
 *
 * Manual staging testing on 2026-05-17 reproduced this exact mixed
 * pattern. Codifying the assertion here surfaces the regression in
 * CI rather than ad-hoc browser testing.
 */
test.describe('fleet status — authenticated', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'authenticated fleet status requires Hydra + peer services — staging-only');
    }
  });

  // First staging run (angular@0.0.22/0.0.23) showed this actually
  // PASSES — fresh sign-in produces a token whose aud contains all 3
  // peer service names, every backend's AuthLayer accepts. The mixed
  // 200/401 manual observation on 2026-05-17 was a stale-browser-token
  // artifact, not a real fleet-wide issue.
  test('every peer returns 200 when bearer is audience-bound to all', async ({ page }) => {
    // Sign in
    await page.goto('/', { waitUntil: 'networkidle', timeout: 20_000 });
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn).toBeVisible();
    await signIn.click();

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    const passwordField = page.locator('input[type="password"]').first();
    await expect(emailField).toBeVisible({ timeout: 15_000 });

    const email = process.env['USER_EMAIL'] || 'test@leartech.com';
    const password = process.env['USER_PASSWORD'] || 'Test123!';
    await emailField.fill(email);
    await passwordField.fill(password);
    await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
      .first()
      .click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
    await page.waitForTimeout(2_000);

    // Verify we are authenticated before navigating to fleet-status.
    await expect(page.locator('[data-testid="authenticated-page"]')).toBeVisible({
      timeout: 10_000,
    });

    // Navigate to fleet-status; bearer interceptor will auto-inject
    // the access_token on outgoing /api/v1/example calls.
    await page.goto('/fleet-status', { waitUntil: 'networkidle', timeout: 15_000 });

    // Wait for the async fleet check to settle.
    await expect(page.getByTestId('overall-pass'), 'overall verdict must be pass').toBeVisible({
      timeout: 15_000,
    });

    // Every peer must return HTTP 200 — the bearer's aud contains
    // their service name, AuthLayer validated, endpoint returned
    // the example payload.
    for (const svc of [
      'leartech-rust-service-template',
      'leartech-dotnet-service-template',
      'leartech-go-service-template',
    ]) {
      const row = page.getByTestId(`fleet-row-${svc}`);
      const status = page.getByTestId(`status-${svc}`);
      await expect(row).toBeVisible();
      await expect(status, `${svc} must reach pass`).toContainText('pass');

      // Specifically assert the HTTP column is 200. Pinpoint cell via
      // data-testid="http-<svc>" rather than the looser row.toContainText
      // approach — the duration column ("267ms") and message text can
      // also contain "200", which would mask a failure. The companion
      // 03-fleet-status spec also asserts http=401 unauth on this same
      // testid, catching the mirror regression shape (200 unauth =
      // middleware not enforcing).
      const http = page.getByTestId(`http-${svc}`);
      await expect(
        http,
        `${svc} expected HTTP 200 with bearer-authed call; 401 means audience-validation defect on this backend`,
      ).toHaveText('200');
    }
  });
});
