import { test, expect } from 'playwright/test';

/**
 * Users screen — runs in PREVIEW and STAGING. preview/helmfile.yaml.gotmpl
 * provisions the full stack (postgres + auth-service[+Hydra+seed] + auth-ui for
 * the login form), so the platform-admin login + admin API work per-PR too.
 *
 * Proves the SDK adoption end to end: log in as the PLATFORM admin
 * (platform@leartech.com, role=platform_admin — seeded by auth-service's chart
 * seed Job), open /users, and confirm the screen lists users via the generated
 * auth-service SDK (AdminService.adminListUsers) and can change a user's role
 * (adminSetUserRole). A non-platform user is 403'd (covered at the API level by
 * auth-service end2end/11-platform-admin.sh); here we drive the real UI + SDK.
 *
 * Prereq in staging: the deployed auth-admin-ui must have
 * peers.leartech-auth-service set (staging values) so the SDK basePath points at
 * auth-service, and leartech-auth-service in audiences[] so the admin API
 * accepts the bearer (RFC 8707).
 */
test.describe('users (platform admin)', () => {
  test.beforeEach(() => {
    // Full auth stack is present in both preview and staging; skip only a bare
    // local run with no target.
    if (!process.env['STAGING_URL'] && !process.env['PREVIEW_URL']) {
      test.skip(true, 'users requires the auth stack — set PREVIEW_URL or STAGING_URL');
    }
  });

  test('platform admin lists users and changes a role via the SDK', async ({ page }) => {
    // Log in as the PLATFORM admin — the users API requires PlatformAdmin, so
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

    // Open the users screen.
    await page.getByTestId('nav-users').click();
    await expect(
      page.getByTestId('users-page'),
      'users screen did not render',
    ).toBeVisible({ timeout: 10_000 });

    // The SDK list call resolves — a platform admin (with peer + audience wired)
    // gets the table; surface a config/permission error loudly instead.
    await expect(page.getByTestId('users-table')).toBeVisible({
      timeout: 15_000,
    });
    if ((await page.getByTestId('users-error').count()) > 0) {
      throw new Error(
        'users list errored: ' +
          (await page.getByTestId('users-error').innerText()),
      );
    }

    // The redesigned users screen renders summary stats — the total-users
    // stat must be present and non-empty.
    await expect(page.getByTestId('stat-users')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('stat-users')).not.toBeEmpty();

    // The seeded test user must be present.
    const testRow = page.getByTestId('user-row-test@leartech.com');
    await expect(testRow, 'seeded test@leartech.com user not shown').toBeVisible({
      timeout: 15_000,
    });

    // Seeded test@ is active by default: its row shows an "Active" status
    // badge and its toggle offers to "Suspend" access.
    await expect(testRow).toContainText('Active');
    await expect(
      page.getByTestId('user-active-toggle-test@leartech.com'),
    ).toContainText('Suspend');

    // Change test@'s role and confirm no error surfaces.
    await page
      .getByTestId('user-role-select-test@leartech.com')
      .selectOption('tenant_admin');

    await expect(page.getByTestId('users-table')).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await page.getByTestId('users-error').count(),
      'changing role errored',
    ).toBe(0);
  });
});
