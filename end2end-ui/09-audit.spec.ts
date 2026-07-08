import { test, expect } from 'playwright/test';
import { loginAsPlatformAdmin } from './support/auth';

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
    // Shared login with retry (absorbs the auth-stack readiness race) + token gate.
    await loginAsPlatformAdmin(page);

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
