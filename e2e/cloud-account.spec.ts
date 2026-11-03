import { test, expect } from '@playwright/test';

for (const locale of ['ru-RU', 'en-US']) {
  test(`cloud account states and logout (${locale})`, async ({ browser, baseURL }) => {
    const ru = locale === 'ru-RU';
    const context = await browser.newContext({ locale, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    let sessionState = 200;
    let allowLogout = false;
    await page.route('**/api/session', route => route.fulfill({ status: sessionState, contentType: 'application/json', body: JSON.stringify(sessionState === 200 ? { authenticated: true } : { error: 'unavailable' }) }));
    await page.route('**/auth/logout', route => route.fulfill({ status: allowLogout ? 200 : 503, contentType: 'application/json', body: JSON.stringify(allowLogout ? { signedOut: true } : { error: 'unavailable' }) }));
    await page.goto(baseURL!);
    const signOut = page.getByRole('button', { name: ru ? 'Выйти из облачного аккаунта' : 'Sign out of cloud account', exact: true });
    await expect(signOut).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/cloud-${locale}-${width}-${colorScheme}.png`, fullPage: true });
      }
    }
    await signOut.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(signOut).toBeEnabled();
    allowLogout = true;
    await signOut.click();
    await expect(page.getByRole('button', { name: ru ? 'Войти через GitHub' : 'Sign in with GitHub', exact: true })).toBeVisible();
    sessionState = 503;
    await page.reload();
    const retry = page.getByRole('button', { name: ru ? 'Повторить' : 'Try again', exact: true });
    await expect(retry).toBeVisible();
    sessionState = 200;
    await retry.click();
    await expect(signOut).toBeVisible();
    await context.close();
  });
}
