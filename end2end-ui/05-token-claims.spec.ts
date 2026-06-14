import { test, expect } from 'playwright/test';

/**
 * Token claims diagnostic spec — STAGING-ONLY.
 *
 * Signs in, then reads the decoded `aud` claim from the token-payload
 * <pre> rendered by AppComponent. Asserts every audience configured
 * in api.conf.json's `auth.audiences[]` is present in the issued
 * access_token's `aud` array.
 *
 * **Why this matters**: the 03-fleet-status spec proves each peer
 * call REACHES the backend (CORS + ingress). This spec proves the
 * bearer the SPA sends has the right `aud` claim for each peer to
 * VALIDATE and accept (200 vs 401).
 *
 * Manual staging testing on 2026-05-17 surfaced a mixed-result
 * pattern: with bearer present, go-template returned 200 but
 * rust + dotnet returned 401. Two possible root causes:
 *   1. SPA's authorize request sends audience= incorrectly,
 *      Hydra only echoes one value into aud
 *   2. SPA's audience param flows through correctly (token's aud
 *      contains all 3) but rust + dotnet AuthLayers fail to match
 *      multi-value aud against their expected single audience
 *
 * This spec disambiguates them. If aud[] contains all 3 → bug is
 * downstream in rust/dotnet's audience-check code. If aud[] is
 * missing values → bug is upstream in the angular SPA's audience
 * param transmission.
 */
test.describe('token claims', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'token claims spec requires Hydra — staging-only');
    }
  });

  // Diagnostic outcome (2026-05-17): staging run with test.fail() showed
  // token.aud = [] — silent refresh via /oauth2/token (refresh_token grant)
  // wasn't carrying the audience= param, so Hydra dropped the binding.
  // Fixed in leartech-ts-common#12: customParamsRefreshTokenRequest +
  // customParamsCodeRequest mirror customParamsAuthRequest. After the
  // chain landed (ts-common 0.3.1 → renovate bump → angular template
  // release), this spec started passing its assertions cleanly. Marker
  // removed; spec is now a real assertion.
  test('access_token aud contains every audience from api.conf.json', async ({ page }) => {
    // Sign in (mirror of 02-login-flow.spec.ts).
    await page.goto('/', { waitUntil: 'networkidle', timeout: 20_000 });

    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn, 'Sign in button missing').toBeVisible();
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

    // Extract decoded token payload from the rendered <pre>. AppComponent
    // base64url-decodes the access_token's payload segment and JSON.stringifies
    // it into `tokenPayload()` signal — same parse the spec needs.
    const payloadText = await page.getByTestId('token-payload').innerText();
    const claims = JSON.parse(payloadText);

    // aud might be a string OR an array (RFC 7519 §4.1.3 allows both).
    const tokenAud: string[] = Array.isArray(claims.aud)
      ? claims.aud
      : claims.aud
        ? [claims.aud]
        : [];

    // The configured audiences come from /api.conf.json — fetch the same
    // file the SPA loaded at runtime so the assertion uses the live config,
    // not a static expected list (the chart's gitops config is the source
    // of truth per Staging-config pattern).
    const apiConfRes = await page.request.get('/api.conf.json');
    const apiConf = await apiConfRes.json();
    const expectedAudiences: string[] = apiConf?.auth?.audiences ?? [];

    expect(expectedAudiences.length, 'api.conf.json must declare audiences[]').toBeGreaterThan(0);

    // Print both sides for forensic value on failure (Playwright's reporter
    // captures stdout per-test).
    console.log('token aud:', JSON.stringify(tokenAud));
    console.log('expected audiences (from api.conf.json):', JSON.stringify(expectedAudiences));

    for (const expected of expectedAudiences) {
      expect(
        tokenAud,
        `token aud ${JSON.stringify(tokenAud)} must contain '${expected}' — every audience in api.conf.json must end up in the issued token`,
      ).toContain(expected);
    }
  });
});
