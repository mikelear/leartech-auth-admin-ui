import { expect, type Page } from 'playwright/test';

/**
 * Log in as the seeded platform admin (platform@leartech.com) and wait until the
 * OIDC access token is actually attached to admin API calls.
 *
 * Two flakes this removes:
 *  1. Auth-stack readiness race — on a fresh preview/staging the seed Job that
 *     creates platform@ can lag the first login attempt, so the credential submit
 *     doesn't redirect and `waitForURL` times out. We RETRY the whole login a few
 *     times with a short backoff, so a slow seed is absorbed rather than failing
 *     every platform-admin spec. (This was the dominant auth-admin-ui e2e flake.)
 *  2. Token-readiness — right after the callback the app is "authenticated" but
 *     the access token isn't in the store yet, so the first admin API call can
 *     401. We gate on the token by landing on /users and waiting for its data.
 */
export async function loginAsPlatformAdmin(page: Page): Promise<void> {
  const password = process.env['USER_PASSWORD'] || 'Test123!';
  const authed = page.locator('[data-testid="authenticated-page"]');

  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    if ((await authed.count()) > 0) break; // already authenticated

    const signIn = page.getByTestId('sign-in-button');
    await expect(signIn).toBeVisible({ timeout: 15_000 });
    await signIn.click();

    const emailField = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    await expect(emailField, 'login form not reached').toBeVisible({ timeout: 15_000 });
    await emailField.fill('platform@leartech.com');
    await page.locator('input[type="password"]').first().fill(password);
    await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
      .first()
      .click();

    try {
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
      break; // login completed
    } catch (e) {
      // Login didn't redirect — usually the auth stack (seed/Hydra) isn't ready
      // yet. Back off and retry the whole flow; fail loudly on the last attempt.
      if (attempt === attempts) {
        throw new Error(
          `login did not complete after ${attempts} attempts — auth stack likely not ready (seed/Hydra): ${String(e)}`,
        );
      }
      await page.waitForTimeout(5_000);
    }
  }

  await expect(authed, 'not authenticated after login').toBeVisible({ timeout: 15_000 });

  // Token-readiness gate: land on the default /users screen and wait for its
  // data (a real admin call succeeding); reload once on a transient 401.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const table = page.getByTestId('users-table');
  try {
    await expect(table).toBeVisible({ timeout: 12_000 });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(table).toBeVisible({ timeout: 15_000 });
  }
}
