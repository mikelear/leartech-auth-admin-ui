import { test, expect } from 'playwright/test';

/**
 * Login-flow spec — STAGING-ONLY.
 *
 * Mirrors leartech-auth-ui's 03-login-flow.spec.ts but exercises the
 * angular *service template* SPA: click Sign in, get redirected to
 * leartech-auth-ui's /login (the Hydra login_challenge UI), fill the
 * test user's credentials, follow the OIDC redirect chain back to
 * /auth/callback, and assert the authenticated-page card appears with
 * the user's identity decoded from the access_token.
 *
 * **Skips in PR preview**: PR-preview namespaces deploy only this
 * template's own chart — no Hydra, no auth-service, no auth-ui.
 * Per the observer 0.0.27 contract, STAGING_URL presence is the
 * discriminator that staging-only specs gate on.
 *
 * **Prerequisite in staging**: setup-auth.sh must have registered
 *   https://<staging-url>/auth/callback
 * as a redirect_uri on the `frontend-services` OAuth2Client. Until
 * that lands (Task #22), Hydra will reject the auth request with
 * "redirect_uri not registered" and this test will fail at the form
 * presence check.
 */
test.describe('login flow', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'login flow requires Hydra + auth-ui — staging-only');
    }
  });

  test('login with test credentials shows authenticated page', async ({ page }) => {
    // Go to root — the Sign in button kicks off authorize() which
    // redirects to Hydra → /oauth2/auth → login_challenge → auth-ui
    // /login. We click here rather than relying on auto-login so the
    // template stays a normal "anonymous home → sign in" SPA.
    await page.goto('/', { waitUntil: 'networkidle', timeout: 20_000 });

    // If a previous test in this run left the session active, skip
    // straight to the assertions.
    const alreadyAuthed = await page.locator('[data-testid="authenticated-page"]').count() > 0;
    if (!alreadyAuthed) {
      const signIn = page.getByRole('button', { name: 'Sign in' });
      await expect(signIn, 'Sign in button missing from landing page').toBeVisible();
      await signIn.click();

      // After the click we should land on auth-ui's /login under
      // its own host (https://leartech-auth-ui-<cluster>...). Wait for
      // the login form to appear.
      const emailField = page.locator('input[type="email"], input[name="email"]').first();
      const passwordField = page.locator('input[type="password"]').first();
      await expect(emailField, 'login form not reached — check setup-auth.sh registered this template\'s redirect_uri on frontend-services').toBeVisible({ timeout: 15_000 });
      await expect(passwordField).toBeVisible();

      const email = process.env['USER_EMAIL'] || 'test@leartech.com';
      const password = process.env['USER_PASSWORD'] || 'Test123!';
      await emailField.fill(email);
      await passwordField.fill(password);

      const submitButton = page
        .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
        .first();
      await submitButton.click();

      // Wait for the redirect chain to settle: auth-ui → Hydra consent
      // → /auth/callback → /. The AuthCallbackComponent calls checkAuth
      // and routes to '/', so we end up back on the root.
      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 20_000,
      });
      await page.waitForTimeout(2_000);
    }

    // Structural assertions on the authenticated state rendered by
    // AppComponent. Locator-based (not string-includes) so partial
    // matches like 'Not authenticated' don't false-pass.
    const authenticatedPage = page.locator('[data-testid="authenticated-page"]');
    await expect(authenticatedPage, 'authenticated-page card not visible after login').toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Authenticated' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // The token-payload <pre> must render — proves we decoded the
    // access_token and the audience-bound claims are visible.
    await expect(page.getByTestId('token-payload')).toBeVisible();
  });
});
