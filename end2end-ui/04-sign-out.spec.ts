import { test, expect } from 'playwright/test';

/**
 * Sign-out flow spec — STAGING-ONLY.
 *
 * Sign in → assert authenticated card visible → sign out → assert
 * we land on the unauthenticated home page (Sign in button restored,
 * no [data-testid="authenticated-page"]) WITHOUT an error page or
 * blank screen.
 *
 * Catches the failure mode seen in manual staging testing on
 * 2026-05-17: clicking "Sign out" landed on a Hydra error page,
 * forcing a manual URL reload to recover. The root cause is tracked
 * as Task #27 — LeartechOauthService.initAuth() doesn't catch the
 * "could not find matching config for state" error thrown by
 * angular-auth-oidc-client when storage is cleared but the URL
 * still carries OAuth state params. This spec is what proves the
 * Task #27 fix once landed.
 *
 * Also extends the audience-binding round-trip from 02-login-flow
 * by exercising the FULL session lifecycle — sign in → use →
 * sign out → recover. Without this, a broken sign-out (silent
 * blank screen, persistent stale state) would slip through.
 */
test.describe('sign out flow', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'sign out flow requires Hydra + auth-ui — staging-only');
    }
  });

  // Switched from test.fail() → test.fixme() after first staging run
  // showed Hydra rejects the post-logout redirect with:
  //   "Logout failed because query parameter post_logout_redirect_uri
  //    is not whitelisted as a post_logout_redirect_uri for the client"
  // This triggers Playwright's navigation-error auto-fail BEFORE the
  // test body's assertions run, so test.fail() doesn't catch it.
  // test.fixme() skips the test entirely until setup-auth.sh extends
  // EXTRA_REDIRECT_URIS to also register post_logout_redirect_uris on
  // the frontend-services OAuth2Client (in flight as a follow-up).
  test.fixme(true, 'Hydra post_logout_redirect_uri not yet registered for the angular SPA — extending setup-auth.sh to add it');
  test('sign in then sign out lands on clean unauthenticated home', async ({ page }) => {
    // Step 1: sign in (mirror of 02-login-flow.spec.ts).
    await page.goto('/', { waitUntil: 'networkidle', timeout: 20_000 });

    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn, 'Sign in button missing from landing page').toBeVisible();
    await signIn.click();

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    const passwordField = page.locator('input[type="password"]').first();
    await expect(emailField, 'login form not reached').toBeVisible({ timeout: 15_000 });

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

    const authenticatedPage = page.locator('[data-testid="authenticated-page"]');
    await expect(authenticatedPage, 'must land authenticated before testing sign out').toBeVisible({
      timeout: 10_000,
    });

    // Step 2: sign out — the click triggers OidcSecurityService.logoff()
    // which clears tokens + redirects to Hydra's session-end endpoint
    // which redirects back to postLogoutRedirectUri (window.location.origin).
    const signOut = page.getByRole('button', { name: 'Sign out' });
    await expect(signOut, 'Sign out button missing on authenticated page').toBeVisible();
    await signOut.click();

    // Step 3: wait for the redirect chain to land us back on the SPA's
    // origin (any path). The full chain: SPA → Hydra /oauth2/sessions/logout
    // → postLogoutRedirectUri → SPA home.
    await page.waitForURL(
      (url) => url.origin === new URL(process.env['STAGING_URL']!).origin,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(2_000);

    // Step 4: assert clean unauthenticated state. NOT an error/blank page.
    // The Sign in button must be visible — that's the canonical proof
    // the SPA bootstrapped successfully + the OIDC SDK recognised no
    // active session.
    await expect(
      page.getByRole('button', { name: 'Sign in' }),
      'Sign in button must be visible after sign out — broken state otherwise',
    ).toBeVisible({ timeout: 10_000 });

    // Authenticated card must be gone.
    await expect(authenticatedPage, 'authenticated-page must NOT be visible after sign out').toHaveCount(0);

    // Password field must not be on screen (we're on home, not stuck on login).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // Sanity: page must have actual content (catches the blank-screen
    // failure mode where Bootstrap fails and <app-root> stays empty).
    await expect(page.locator('h1')).toBeVisible();
  });
});
