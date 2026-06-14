import { test, expect } from 'playwright/test';

/**
 * Golden-standard smoke test: verifies the Angular app loads without
 * JS errors and renders the expected root element. Every Angular app
 * cloned from the template inherits this test.
 */
test.describe('page loads', () => {
  test('no JavaScript errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/', { waitUntil: 'networkidle', timeout: 15_000 });

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
    await page.goto('/', { waitUntil: 'networkidle', timeout: 15_000 });
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
