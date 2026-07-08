import { test, expect } from 'playwright/test';
import { loginAsPlatformAdmin } from './support/auth';

/**
 * OAuth-clients screen — runs in PREVIEW and STAGING. Proves the clients proxy
 * end to end: log in as the platform admin, open /clients via the (de-greyed)
 * sidebar nav, and confirm the screen lists Hydra's registered OAuth2 clients
 * through the SDK (AdminService.adminListClients → GET /admin/clients). Hydra is
 * seeded with first-party + service-to-service clients, so the list is non-empty.
 */
test.describe('oauth clients (platform admin)', () => {
  test.beforeEach(() => {
    if (!process.env['STAGING_URL'] && !process.env['PREVIEW_URL']) {
      test.skip(true, 'clients requires the auth stack — set PREVIEW_URL or STAGING_URL');
    }
  });

  test('platform admin views registered OAuth clients via the SDK', async ({ page }) => {
    await loginAsPlatformAdmin(page);

    // Open OAuth clients via the sidebar nav — proves the link is live (not "soon").
    await page.getByTestId('nav-clients').click();
    await expect(page.getByTestId('clients-page')).toBeVisible({ timeout: 10_000 });

    // The SDK list call resolves and the table renders.
    await expect(page.getByTestId('clients-table')).toBeVisible({ timeout: 15_000 });
    if ((await page.getByTestId('clients-error').count()) > 0) {
      throw new Error(
        'clients list errored: ' +
          (await page.getByTestId('clients-error').innerText()),
      );
    }

    // Hydra is seeded with clients (frontend-services + s2s) — non-empty.
    await expect(page.getByTestId('clients-count')).not.toHaveText('0');
  });
});
