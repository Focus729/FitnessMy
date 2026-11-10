import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';
import { testDatabase } from '../backend/test-database';
import worker from '../backend/index';
import { hashToken } from '../backend/github-auth';

test('a trusted cloud profile opens from the installed app cache and queues an offline entry', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    locale: 'ru-RU',
    serviceWorkers: 'allow',
  });
  const fixture = testDatabase();
  try {
    const origin = 'https://fixture.example';
    const token = await hashToken('offline-browser-fixture');
    fixture.sql
      .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
      .run(
        await hashToken(token),
        'a',
        Math.floor(Date.now() / 1000) + 3600,
        0,
      );
    await context.route('**/api/**', async (route) => {
      const incoming = route.request();
      const url = new URL(incoming.url());
      const headers = new Headers(await incoming.allHeaders());
      headers.set('Cookie', `__Host-fitnessmy_session=${token}`);
      if (headers.get('Origin') === baseURL) headers.set('Origin', origin);
      const response = await worker.fetch(
        new Request(`${origin}${url.pathname}${url.search}`, {
          method: incoming.method(),
          headers,
          body: incoming.postData() ?? undefined,
        }),
        {
          DB: fixture.db,
          ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
          APP_ORIGIN: origin,
          ALLOWED_GITHUB_ID: '1',
          GITHUB_CLIENT_ID: 'fixture',
          GITHUB_CLIENT_SECRET: 'fixture',
          CLOUD_SYNC_ENABLED: 'true',
        },
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    const page = await context.newPage();
    await page.goto('/');
    const picker = page.getByRole('button', { name: 'Fixture', exact: true });
    test.skip(
      (await page.getByRole('region', { name: 'Облачный аккаунт' }).count()) ===
        0,
      'Cloud-enabled build required',
    );
    await picker.click();
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Напомнить завтра' }).click();
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Включить доступ без сети на этом устройстве',
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Выключить доступ без сети на этом устройстве',
      }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Сегодня', exact: true }).click();
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await page.reload();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    await expect(
      page.getByText('Синхронизировано', { exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    expect((await page.reload())?.status()).toBe(200);
    const water = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: 'Вода', exact: true }),
      });
    await water.getByRole('button').click();
    await page.getByRole('button', { name: '+200 мл', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(water.getByRole('button')).toContainText('200 /');
    expect(
      fixture.sql
        .prepare(
          "SELECT COUNT(*) AS n FROM sync_entities WHERE entity_type='water'",
        )
        .get()?.n,
    ).toBe(0);
    await context.setOffline(false);
    await expect
      .poll(
        () =>
          fixture.sql
            .prepare(
              "SELECT COUNT(*) AS n FROM sync_entities WHERE entity_type='water'",
            )
            .get()?.n,
      )
      .toBe(1);
  } finally {
    await context.close();
    fixture.sql.close();
  }
});
