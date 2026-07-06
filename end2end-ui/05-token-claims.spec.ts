import { test, expect } from 'playwright/test';

/**
 * Authenticated-identity spec — STAGING-ONLY.
 *
 * The redesigned shell no longer renders the raw decoded token in a <pre>;
 * identity is surfaced in the topbar instead (email + a role label derived
 * from the token's ext.Permissions). This spec proves the platform admin's
 * identity flows through end to end: sign in as platform@leartech.com and
 * assert the topbar shows that email and the "Platform admin" role label —
 * which is only rendered when the access_token carried the PlatformAdmin
 * permission (proving the audience-bound claims round-tripped correctly).
 */
test.describe('authenticated identity', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL']) {
      test.skip(true, 'identity spec requires Hydra — staging-only');
    }
  });

  test('topbar reflects the signed-in platform admin identity', async ({ page }) => {
    // Sign in as the PLATFORM admin (mirror of 02-login-flow.spec.ts).
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });

    const signIn = page.getByTestId('sign-in-button');
    await expect(signIn, 'sign-in-button missing').toBeVisible();
    await signIn.click();

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    const passwordField = page.locator('input[type="password"]').first();
    await expect(emailField).toBeVisible({ timeout: 15_000 });

    await emailField.fill('platform@leartech.com');
    await passwordField.fill(process.env['USER_PASSWORD'] || 'Test123!');
    await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
      .first()
      .click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

    const authenticatedPage = page.locator('[data-testid="authenticated-page"]');
    await expect(authenticatedPage, 'authenticated shell not visible after login').toBeVisible({
      timeout: 15_000,
    });

    // Topbar email reflects the login identity (from the decoded token).
    await expect(page.getByTestId('user-email')).toContainText('platform@leartech.com');

    // The topbar role label reads "Platform admin" — only rendered when the
    // token's ext.Permissions includes PlatformAdmin, so this proves the
    // audience-bound platform-admin claim reached the SPA.
    await expect(authenticatedPage).toContainText('Platform admin');
  });
});
