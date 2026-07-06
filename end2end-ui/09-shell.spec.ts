import { test, expect } from 'playwright/test';

/**
 * App-shell navigation spec — STAGING-ONLY.
 *
 * Proves the redesigned admin console shell wires its sidebar nav to the
 * router: sign in as the platform admin, then click between the Users and
 * Tenants nav links and confirm each screen renders. Also confirms the
 * topbar identity chrome (email + sign-out) is present. Mirrors the login
 * helper + skip guard from 02-login-flow / 07-tenants.
 */
test.describe('app shell navigation', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'shell nav requires Hydra + auth-ui — staging-only');
    }
  });

  test('sidebar nav switches screens and topbar shows identity', async ({ page }) => {
    // Sign in as the PLATFORM admin (mirror of 02/07).
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
      await expect(emailField, 'login form not reached').toBeVisible({
        timeout: 15_000,
      });
      await emailField.fill('platform@leartech.com');
      await page
        .locator('input[type="password"]')
        .first()
        .fill(process.env['USER_PASSWORD'] || 'Test123!');
      await page
        .locator(
          'button[type="submit"], button:has-text("Login"), button:has-text("Sign in")',
        )
        .first()
        .click();

      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 20_000,
      });
    }
    await expect(
      page.locator('[data-testid="authenticated-page"]'),
    ).toBeVisible({ timeout: 15_000 });

    // Sidebar → Users renders the users screen.
    await page.getByTestId('nav-users').click();
    await expect(
      page.getByTestId('users-page'),
      'users screen did not render from nav-users',
    ).toBeVisible({ timeout: 10_000 });

    // Sidebar → Tenants renders the tenants screen.
    await page.getByTestId('nav-tenants').click();
    await expect(
      page.getByTestId('tenants-page'),
      'tenants screen did not render from nav-tenants',
    ).toBeVisible({ timeout: 10_000 });

    // Topbar identity chrome is present throughout.
    await expect(page.getByTestId('sign-out-button')).toBeVisible();
    await expect(page.getByTestId('user-email')).toBeVisible();
  });
});
