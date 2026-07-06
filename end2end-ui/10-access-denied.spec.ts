import { test, expect } from 'playwright/test';

/**
 * Access-denied (403) spec — STAGING-ONLY.
 *
 * Unhappy path: a plain member (test@leartech.com, no platform perms) IS
 * authenticated — so the shell renders and the sidebar nav is available —
 * but the tenants/users admin API requires PlatformAdmin. Opening either
 * screen fires a list call that 403s. This proves the UI surfaces that 403
 * as a clear, human-readable error ([data-testid="tenants-error"] /
 * [data-testid="users-error"]) instead of a blank screen or a crash.
 *
 * Complements 07/08 (which log in as the platform admin and exercise the
 * happy path) by asserting the permission gate fails loud.
 */
test.describe('access denied (non-platform member)', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'access-denied spec requires Hydra + auth-service — staging-only');
    }
  });

  test('member sees a forbidden error on tenants and users', async ({ page }) => {
    // Sign in as the plain MEMBER (mirror of 02-login-flow.spec.ts).
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });

    const signIn = page.getByTestId('sign-in-button');
    await expect(signIn, 'sign-in-button missing from landing page').toBeVisible({
      timeout: 15_000,
    });
    await signIn.click();

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailField, 'login form not reached').toBeVisible({ timeout: 15_000 });
    await emailField.fill('test@leartech.com');
    await page
      .locator('input[type="password"]')
      .first()
      .fill(process.env['USER_PASSWORD'] || 'Test123!');
    await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
      .first()
      .click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

    // A member is authenticated — the shell + sidebar render.
    await expect(
      page.locator('[data-testid="authenticated-page"]'),
    ).toBeVisible({ timeout: 15_000 });

    // Tenants: the screen loads, but the list call 403s → error surfaces.
    await page.getByTestId('nav-tenants').click();
    await expect(page.getByTestId('tenants-page')).toBeVisible({ timeout: 10_000 });
    const tenantsError = page.getByTestId('tenants-error');
    await expect(
      tenantsError,
      'member must see a forbidden error on tenants, not a blank screen',
    ).toBeVisible({ timeout: 15_000 });
    await expect(tenantsError).toContainText(/forbidden|platform-admin/i);

    // Users: same gate — the list call 403s → error surfaces.
    await page.getByTestId('nav-users').click();
    await expect(page.getByTestId('users-page')).toBeVisible({ timeout: 10_000 });
    const usersError = page.getByTestId('users-error');
    await expect(
      usersError,
      'member must see a forbidden error on users, not a blank screen',
    ).toBeVisible({ timeout: 15_000 });
    await expect(usersError).toContainText(/forbidden|platform-admin/i);
  });
});
