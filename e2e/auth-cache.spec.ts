import { expect, test } from '@playwright/test';

for (const locale of ['ru-RU', 'en-US']) {
  test(`offline app fallback never impersonates API or authentication (${locale})`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      locale,
      serviceWorkers: 'allow',
    });
    try {
      const page = await context.newPage();
      await page.goto(baseURL!);
      // The existing application registers its worker after profile onboarding.
      const ru = locale === 'ru-RU';
      await page
        .getByPlaceholder(ru ? 'Имя профиля' : 'Profile name')
        .fill('Offline boundary fixture');
      await page
        .getByRole('button', {
          name: ru ? 'Новый профиль' : 'New profile',
          exact: true,
        })
        .click();
      for (let step = 0; step < 4; step++) {
        if (step === 1) await page.getByRole('checkbox').check();
        await page
          .getByRole('button', { name: ru ? 'Далее' : 'Next', exact: true })
          .click();
      }
      await page
        .getByLabel(ru ? 'Стартовый вес' : 'Starting weight')
        .fill('80');
      for (let step = 0; step < 2; step++)
        await page
          .getByRole('button', { name: ru ? 'Далее' : 'Next', exact: true })
          .click();
      await page
        .getByRole('button', { name: ru ? 'Готово' : 'Done', exact: true })
        .click();
      await page.getByRole('navigation').waitFor();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      await context.setOffline(true);
      const appResponse = await page.reload();
      expect(appResponse?.status()).toBe(200);
      expect(await page.locator('#root').innerHTML()).not.toBe('');
      for (const path of [
        '/api',
        '/api/session',
        '/auth/login',
        '/cdn-cgi/access/login',
      ]) {
        let navigationError = '';
        try {
          await page.goto(`${baseURL}${path}`, { timeout: 10000 });
        } catch (error) {
          navigationError = String(error);
        }
        expect(
          navigationError,
          `${path} must fail offline, not return cached app HTML or hang`,
        ).toMatch(/ERR_INTERNET_DISCONNECTED|ERR_FAILED/);
      }
    } finally {
      await context.close();
    }
  });
}
