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

    // #17: the authenticated console defaults to /users — the root path redirects
    // there instead of rendering a bare shell. This both proves the default route
    // and opens the screen.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByTestId('users-page'),
      'default route did not land on /users',
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

    // #14: the Security column shows a 2FA + passkey status badge per user.
    // test@'s enrolment state is MUTABLE on persistent staging (unlike a fresh
    // preview), so assert each badge renders and carries a valid boolean —
    // value-agnostic, not a fixed 'false'.
    const twofa = page.getByTestId('user-2fa-test@leartech.com');
    const passkey = page.getByTestId('user-passkey-test@leartech.com');
    await expect(twofa, '2FA badge missing').toBeVisible({ timeout: 10_000 });
    await expect(passkey, 'passkey badge missing').toBeVisible();
    await expect(twofa).toHaveAttribute('data-enabled', /^(true|false)$/);
    await expect(passkey).toHaveAttribute('data-enabled', /^(true|false)$/);

    // #16: permissions are editable. Toggle 'Admin' on test@, confirm it flips,
    // then toggle back so the fixture is left as found.
    const adminPerm = page.getByTestId('user-perm-Admin-test@leartech.com');
    await expect(adminPerm, 'Admin permission toggle missing').toBeVisible();
    const before = await adminPerm.getAttribute('data-on');
    await adminPerm.click();
    await expect(page.getByTestId('users-table')).toBeVisible({ timeout: 15_000 });
    await expect(adminPerm, 'permission did not flip').toHaveAttribute(
      'data-on',
      String(before !== 'true'),
    );
    await adminPerm.click(); // restore original state
    await expect(page.getByTestId('users-table')).toBeVisible({ timeout: 15_000 });
    await expect(adminPerm).toHaveAttribute('data-on', String(before === 'true'));
    expect(
      await page.getByTestId('users-error').count(),
      'editing permission errored',
    ).toBe(0);
  });
});
