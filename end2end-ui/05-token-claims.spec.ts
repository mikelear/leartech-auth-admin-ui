import { test, expect } from 'playwright/test';
import { loginAsPlatformAdmin } from './support/auth';

/**
 * Authenticated-identity + audience-binding spec — STAGING+PREVIEW.
 *
 * Two things this spec proves:
 *   1. The redesigned shell exposes the signed-in platform admin's identity in
 *      the topbar (email + a role label derived from the token's ext.Permissions),
 *      which is only rendered when the audience-bound access_token carried the
 *      PlatformAdmin permission — round-tripped end to end.
 *   2. The Bearer the SPA attaches to leartech-auth-service /admin/* calls
 *      carries `leartech-auth-service` in its `aud` claim (RFC 8707 audience
 *      binding). This is what auth-service Group C will START ENFORCING; if this
 *      spec goes red, admin-ui's admin calls WILL 401 after C lands.
 */
test.describe('authenticated identity', () => {
  test.beforeEach(() => {
    // Identity assertion needs the login form (Hydra) — skip pure local runs.
    if (!process.env['STAGING_URL'] && !process.env['PREVIEW_URL']) {
      test.skip(true, 'identity spec requires the auth stack — set PREVIEW_URL or STAGING_URL');
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

  /**
   * Audience-binding check — the crucial guard against auth-service Group C.
   *
   * After Group B the token admin-ui obtains carries an `aud` array; in Group C
   * auth-service /admin/* will ENFORCE that `leartech-auth-service` appears in
   * that array. If admin-ui's api.conf.json / chart doesn't request the right
   * audience the SPA will still work today (Group B) but silently break the
   * moment C lands. This spec is the canary: log in, drive an admin call, snap
   * the outgoing Authorization header, decode the JWT and assert `aud` contains
   * `leartech-auth-service`. Red here === admin-ui is not ready for Group C.
   */
  test('admin API Bearer carries leartech-auth-service in aud (RFC 8707)', async ({ page }) => {
    await loginAsPlatformAdmin(page);

    // Watch for the SPA's next outgoing /admin/* call. We start the wait BEFORE
    // navigating so we don't miss the immediate list call that fires when the
    // screen mounts (users/tenants both do adminList*() on init).
    //
    // loginAsPlatformAdmin already lands on /users (whose adminListUsers has
    // fired), so we navigate to a DIFFERENT screen (/tenants) to guarantee a
    // fresh admin request — clicking nav-users when already on /users would
    // not re-fire the list call.
    const adminReqPromise = page.waitForRequest(
      (req) =>
        /\/admin\//.test(new URL(req.url()).pathname) &&
        (req.headers()['authorization'] ?? '').startsWith('Bearer '),
      { timeout: 20_000 },
    );
    await page.getByTestId('nav-tenants').click();

    const adminReq = await adminReqPromise;
    const authHeader = adminReq.headers()['authorization'] ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    expect(jwt, 'no Bearer token attached to admin request').not.toBe('');

    // Decode the JWT payload (base64url). No signature check — that's
    // auth-service's job; we only care what the SPA sends.
    const parts = jwt.split('.');
    expect(parts.length, 'malformed JWT — expected 3 dot-separated parts').toBe(3);
    const base64url = parts[1];
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    // Node 18+ / Playwright: Buffer available on the harness side.
    const payloadJson = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson) as { aud?: string | string[]; iss?: string };

    // `aud` may be a string or a string[] per RFC 7519. Normalise, then assert
    // leartech-auth-service is present.
    const audList = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    expect(
      audList,
      `admin-ui token aud does not include leartech-auth-service — Group C will 401. aud=${JSON.stringify(payload.aud)} iss=${payload.iss}`,
    ).toContain('leartech-auth-service');
  });
});
