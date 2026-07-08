import { test, expect } from 'playwright/test';

/**
 * Audit-log screen — runs in PREVIEW and STAGING. Proves the audit read path end
 * to end: log in as the platform admin, open /audit via the (de-greyed) sidebar
 * nav, and confirm the screen lists admin_audit_log events through the SDK
 * (AdminService.adminListAudit) and filters by action. Value-agnostic — the log
 * is a mutable, append-only fixture, so it asserts the table + filter work, not
 * specific rows.
 */
test.describe('audit log (platform admin)', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL'] && !process.env['PREVIEW_URL']) {
      test.skip(true, 'audit requires the auth stack — set PREVIEW_URL or STAGING_URL');
    }
  });

  test('platform admin views + filters the audit log via the SDK', async ({ page }) => {
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

    // Open Audit via the sidebar nav — proves the link is live (no longer "soon").
    await page.getByTestId('nav-audit').click();
    await expect(page.getByTestId('audit-page')).toBeVisible({ timeout: 10_000 });

    // The SDK list call resolves and the table renders (empty or not).
    await expect(page.getByTestId('audit-table')).toBeVisible({ timeout: 15_000 });
    if ((await page.getByTestId('audit-error').count()) > 0) {
      throw new Error(
        'audit list errored: ' + (await page.getByTestId('audit-error').innerText()),
      );
    }

    // Filter by an action — the table stays present and no error surfaces.
    await page.getByTestId('audit-filter-action').selectOption('delete_user');
    await expect(page.getByTestId('audit-table')).toBeVisible({ timeout: 15_000 });
    expect(
      await page.getByTestId('audit-error').count(),
      'filtering by action errored',
    ).toBe(0);
  });
});
