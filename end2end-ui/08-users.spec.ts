import { test, expect } from 'playwright/test';
import { loginAsPlatformAdmin } from './support/auth';

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
    // Log in as the PLATFORM admin (users API requires PlatformAdmin) and wait
    // until the access token is attached — see loginAsPlatformAdmin.
    await loginAsPlatformAdmin(page);

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

    // #22: the Last-login column renders a value per user (a date or "Never") —
    // value-agnostic (staging login state is mutable).
    const lastLogin = page.getByTestId('user-lastlogin-test@leartech.com');
    await expect(lastLogin, 'last-login cell missing').toBeVisible();
    await expect(lastLogin).not.toBeEmpty();

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

    // Drawer lifecycle: create a throwaway via "New user", then delete it via its
    // Details drawer — self-cleaning, exercises create + delete end to end.
    //
    // Backend-version tolerant: the admin create endpoint's fix (auth-service
    // #120, v0.1.85) may lag on some clusters (per-cluster release skew). Where
    // it lags, the create is rejected and the drawer surfaces an error — we skip
    // the lifecycle rather than fail THIS UI gate for a backend-version gap (the
    // create path is covered by auth-service's own end2end on that cluster). On
    // clusters whose auth-service supports it, the full create→delete runs.
    const email = `drawer-${Date.now()}@leartech.com`;
    await page.getByTestId('new-user-button').click();
    await expect(page.getByTestId('user-drawer')).toBeVisible();
    await page.getByTestId('drawer-email').fill(email);
    await page.getByTestId('drawer-displayname').fill('Drawer Test');
    await page.getByTestId('drawer-save').click();

    // Wait for either outcome: the new row (created) or a drawer error (rejected).
    const createdRow = page.getByTestId('user-row-' + email);
    const drawerError = page.getByTestId('drawer-error');
    await expect(createdRow.or(drawerError).first()).toBeVisible({ timeout: 15_000 });

    if (await drawerError.isVisible()) {
      test.info().annotations.push({
        type: 'skip',
        description:
          'drawer create rejected by backend (auth-service lacks the admin-create fix on this cluster): ' +
          (await drawerError.innerText()),
      });
      await page.getByTestId('drawer-close').click().catch(() => undefined);
      return;
    }

    await expect(createdRow, 'created user did not appear').toBeVisible();

    await page.getByTestId('user-details-' + email).click();
    await expect(page.getByTestId('user-drawer')).toBeVisible();
    await page.getByTestId('drawer-delete').click();
    await page.getByTestId('drawer-delete-confirm').click();
    await expect(
      page.getByTestId('user-row-' + email),
      'deleted user still listed',
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
