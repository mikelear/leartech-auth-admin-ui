import { expect, type Page } from 'playwright/test';

export const PLATFORM_EMAIL = 'platform@leartech.com';

/**
 * ONE platform-admin login attempt. Returns true if it reached an authenticated
 * (post-login) URL; false on any failure — most commonly the credential submit
 * not redirecting because the auth stack (the seed Job that creates platform@, or
 * Hydra) isn't ready yet on a fresh preview/staging. Never throws, so both the
 * per-test helper and the global readiness gate can retry cleanly.
 */
export async function attemptPlatformLogin(page: Page, password: string): Promise<boolean> {
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    if ((await page.locator('[data-testid="authenticated-page"]').count()) > 0) return true;

    const signIn = page.getByTestId('sign-in-button');
    await signIn.waitFor({ state: 'visible', timeout: 15_000 });
    await signIn.click();

    const emailField = page.locator('input[type="email"], input[name="email"]').first();
    await emailField.waitFor({ state: 'visible', timeout: 15_000 });
    await emailField.fill(PLATFORM_EMAIL);
    await page.locator('input[type="password"]').first().fill(password);
    await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
      .first()
      .click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Log in as the seeded platform admin (platform@leartech.com) and wait until the
 * OIDC access token is actually attached to admin API calls.
 *
 * The dominant auth-stack readiness race (seed/Hydra lagging a fresh preview) is
 * now absorbed ONCE, before any spec runs, by the global readiness gate
 * (global-setup.ts) — so by the time this runs the stack is warm and the first
 * attempt succeeds. We keep a few retries here as belt-and-suspenders for a
 * transient blip, and still gate on token-readiness (a real admin call resolving).
 */
export async function loginAsPlatformAdmin(page: Page): Promise<void> {
  const password = process.env['USER_PASSWORD'] || 'Test123!';
  const authed = page.locator('[data-testid="authenticated-page"]');

  const attempts = 3;
  let ok = false;
  for (let attempt = 1; attempt <= attempts && !ok; attempt++) {
    ok = await attemptPlatformLogin(page, password);
    if (!ok && attempt < attempts) {
      await page.waitForTimeout(3_000);
    }
  }
  if (!ok) {
    throw new Error(
      `login did not complete after ${attempts} attempts — auth stack likely not ready (seed/Hydra)`,
    );
  }

  await expect(authed, 'not authenticated after login').toBeVisible({ timeout: 15_000 });

  // Token-readiness gate: land on the default /users screen and wait for its
  // data (a real admin call succeeding); reload once on a transient 401.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const table = page.getByTestId('users-table');
  try {
    await expect(table).toBeVisible({ timeout: 12_000 });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(table).toBeVisible({ timeout: 15_000 });
  }
}
