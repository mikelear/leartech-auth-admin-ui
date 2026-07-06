import { test, expect } from 'playwright/test';

/**
 * Sign-out flow spec — STAGING-ONLY.
 *
 * Sign in → assert the authenticated shell is visible → click the topbar
 * sign-out → assert we land back on the branded sign-in landing
 * ([data-testid="landing-page"] visible, [data-testid="authenticated-page"]
 * gone) WITHOUT an error page or blank screen.
 *
 * Catches the failure mode seen in manual staging testing on 2026-05-17:
 * clicking "Sign out" landed on a Hydra error page, forcing a manual URL
 * reload to recover. The fix (AppComponent.logout) now falls back to
 * logoffLocal() when Hydra rejects the post-logout redirect, so the local
 * session always ends and the user lands cleanly on the sign-in landing.
 * This spec is what proves that fix.
 */
test.describe('sign out flow', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'sign out flow requires Hydra + auth-ui — staging-only');
    }
  });

  test('sign in then sign out lands on clean unauthenticated home', async ({ page }) => {
    // Step 1: sign in (mirror of 02-login-flow.spec.ts).
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });

    const signIn = page.getByTestId('sign-in-button');
    await expect(signIn, 'sign-in-button missing from landing page').toBeVisible();
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

    const authenticatedPage = page.locator('[data-testid="authenticated-page"]');
    await expect(authenticatedPage, 'must land authenticated before testing sign out').toBeVisible({
      timeout: 15_000,
    });

    // Step 2: sign out — the topbar button triggers AppComponent.logout()
    // → OidcSecurityService.logoff() (with logoffLocal() fallback), which
    // clears tokens and returns to the SPA's origin.
    const signOut = page.getByTestId('sign-out-button');
    await expect(signOut, 'sign-out-button missing on authenticated shell').toBeVisible();
    await signOut.click();

    // Step 3: wait for the redirect chain to land us back on the SPA's origin.
    await page.waitForURL(
      (url) => url.origin === new URL(process.env['STAGING_URL']!).origin,
      { timeout: 20_000 },
    );

    // Step 4: assert clean unauthenticated state — NOT an error/blank page.
    // The branded sign-in landing must be visible; that's the canonical proof
    // the SPA bootstrapped and the OIDC SDK recognised no active session.
    await expect(
      page.getByTestId('landing-page'),
      'landing-page must be visible after sign out — broken state otherwise',
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId('sign-in-button'),
      'sign-in-button must be restored after sign out',
    ).toBeVisible();

    // The authenticated shell must be gone.
    await expect(authenticatedPage, 'authenticated-page must NOT be visible after sign out').toHaveCount(0);

    // Password field must not be on screen (we're on home, not stuck on login).
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});
