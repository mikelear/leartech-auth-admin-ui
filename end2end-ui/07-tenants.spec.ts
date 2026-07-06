import { test, expect } from 'playwright/test';

/**
 * Tenants screen — runs in PREVIEW and STAGING. preview/helmfile.yaml.gotmpl now
 * provisions the full stack (postgres + auth-service[+Hydra+seed] + auth-ui for
 * the login form), so the platform-admin login + admin API work per-PR too.
 *
 * Proves the SDK adoption end to end: log in as the PLATFORM admin
 * (platform@leartech.com, role=platform_admin — seeded by auth-service's chart
 * seed Job), open /tenants, and confirm the screen lists tenants via the
 * generated auth-service SDK (AdminService.adminListTenants) and can create one
 * (adminCreateTenant). A non-platform user is 403'd (covered at the API level by
 * auth-service end2end/11-platform-admin.sh); here we drive the real UI + SDK.
 *
 * Prereq in staging: the deployed auth-admin-ui must have
 * peers.leartech-auth-service set (staging values) so the SDK basePath points at
 * auth-service, and leartech-auth-service in audiences[] so the admin API
 * accepts the bearer (RFC 8707).
 */
test.describe('tenants (platform admin)', () => {
  test.beforeEach(() => {
    // Full auth stack is present in both preview and staging; skip only a bare
    // local run with no target.
    if (!process.env['STAGING_URL'] && !process.env['PREVIEW_URL']) {
      test.skip(true, 'tenants requires the auth stack — set PREVIEW_URL or STAGING_URL');
    }
  });

  test('platform admin lists and creates tenants via the SDK', async ({ page }) => {
    // Log in as the PLATFORM admin — the tenant API requires PlatformAdmin, so
    // the default test user would 403. Poll for state (never networkidle).
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

    // Open the tenants screen.
    await page.getByTestId('nav-tenants').click();
    await expect(
      page.getByTestId('tenants-page'),
      'tenants screen did not render',
    ).toBeVisible({ timeout: 10_000 });

    // The SDK list call resolves — a platform admin (with peer + audience wired)
    // gets the table; surface a config/permission error loudly instead.
    await expect(page.getByTestId('tenants-table')).toBeVisible({
      timeout: 15_000,
    });
    if ((await page.getByTestId('tenants-error').count()) > 0) {
      throw new Error(
        'tenants list errored: ' +
          (await page.getByTestId('tenants-error').innerText()),
      );
    }

    // Create a unique tenant and confirm it appears in the list.
    const name = 'e2e-admin-' + Math.random().toString(36).slice(2, 8);
    await page.getByTestId('tenant-name-input').fill(name);
    await page.getByTestId('tenant-display-input').fill('E2E Admin UI');
    await page.getByTestId('tenant-create-button').click();

    await expect(
      page.getByTestId('tenant-row-' + name),
      'created tenant not shown after create',
    ).toBeVisible({ timeout: 15_000 });

    // Unhappy path: submitting the SAME name again is a guaranteed duplicate.
    // The admin API returns 409 and the UI must surface it as a clear
    // "already exists" error rather than silently swallowing it.
    await page.getByTestId('tenant-name-input').fill(name);
    await page.getByTestId('tenant-display-input').fill('E2E Admin UI dup');
    await page.getByTestId('tenant-create-button').click();

    const dupError = page.getByTestId('tenants-error');
    await expect(
      dupError,
      'duplicate tenant create did not surface an error',
    ).toBeVisible({ timeout: 15_000 });
    await expect(dupError).toContainText(/already exists/i);

    // Delete the tenant we created: proves the Delete action end to end AND
    // cleans up after this run (no e2e-admin-* accumulation). Inline confirm:
    // Delete → Confirm → the row disappears and the (dup) error clears.
    await page.getByTestId('tenant-delete-' + name).click();
    await page.getByTestId('tenant-delete-confirm-' + name).click();
    await expect(
      page.getByTestId('tenant-row-' + name),
      'tenant row should be gone after delete',
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByTestId('tenants-error'),
      'a successful delete should clear the error',
    ).toHaveCount(0);
  });
});
