import { test, expect } from 'playwright/test';

/**
 * Smoke test: verifies the Angular admin console loads without JS errors,
 * renders the app root, and shows the branded sign-in landing when
 * unauthenticated. Runs everywhere (no auth stack needed for the anonymous
 * home).
 */
test.describe('page loads', () => {
  test('no JavaScript errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Filter out expected errors (CORS on localhost, etc.)
    const unexpected = errors.filter(
      (e) => !e.includes('CORS') && !e.includes('net::ERR_FAILED')
    );

    expect(unexpected).toEqual([]);
  });

  test('app-root element renders', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const appRoot = page.locator('app-root');
    await expect(appRoot).toBeAttached({ timeout: 10_000 });
  });

  test('page title is set', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('unauthenticated root shows the branded sign-in landing', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // The redesigned shell renders a branded landing card when signed out.
    await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
  });
});
