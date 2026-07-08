import { expect, type Page } from 'playwright/test';

/**
 * Log in as the seeded platform admin (platform@leartech.com) and — crucially —
 * wait until the OIDC access token is actually attached to admin API calls, not
 * merely until `isAuthenticated` flips.
 *
 * The flake this removes: right after the OIDC callback there's a brief window
 * where the app is "authenticated" but the access token isn't yet in the store,
 * so the FIRST admin API call a screen fires can 401. It hit whichever screen a
 * test opened first (seen on 07-tenants). We gate on the token by landing on the
 * default /users screen and waiting for its data to load — a real admin call
 * succeeding — reloading once if that first call lost the race. After this
 * returns, any screen a test navigates to has a working token.
 */
export async function loginAsPlatformAdmin(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const alreadyAuthed =
    (await page.locator('[data-testid="authenticated-page"]').count()) > 0;
  if (!alreadyAuthed) {
    const signIn = page.getByTestId('sign-in-button');
    await expect(signIn).toBeVisible({ timeout: 15_000 });
    await signIn.click();

    const emailField = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    await expect(emailField, 'login form not reached').toBeVisible({ timeout: 15_000 });
    await emailField.fill('platform@leartech.com');
    await page
      .locator('input[type="password"]')
      .first()
      .fill(process.env['USER_PASSWORD'] || 'Test123!');
    await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
      .first()
      .click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
  }
  await expect(page.locator('[data-testid="authenticated-page"]')).toBeVisible({
    timeout: 15_000,
  });

  // Token-readiness gate: the default route is /users (#17). Wait for its table
  // — a real admin call succeeding. A transient post-callback 401 surfaces as
  // users-error with no table, so reload once (token is attached by then).
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const table = page.getByTestId('users-table');
  try {
    await expect(table).toBeVisible({ timeout: 12_000 });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(table).toBeVisible({ timeout: 15_000 });
  }
}
