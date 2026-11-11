import { devices, expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers';
import { testDatabase } from '../backend/test-database';
import worker from '../backend/index';
import { hashToken } from '../backend/github-auth';

test('a trusted cloud profile opens from the installed app cache and queues an offline entry', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL,
    locale: 'ru-RU',
    serviceWorkers: 'allow',
  });
  const fixture = testDatabase();
  let disconnected = false;
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
      if (disconnected) {
        await route.abort('internetdisconnected');
        return;
      }
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
    disconnected = true;
    await context.setOffline(true);
    expect((await page.reload())?.status()).toBe(200);
    await page.getByRole('button', { name: 'Сменить профиль: Fixture' }).click();
    expect((await page.reload())?.status()).toBe(200);
    await expect(
      page.getByText('Профили, доступные без сети на этом устройстве.'),
    ).toBeVisible();
    await expect(picker).toBeVisible();
    await picker.click();
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
    disconnected = false;
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
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Switch profile: Fixture' }).waitFor();
    disconnected = true;
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Switch profile: Fixture' }).click();
    await expect(
      page.getByText('Profiles available offline on this device.'),
    ).toBeVisible();
    await picker.click();
    disconnected = false;
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Turn off offline access on this device' }).click();
    await expect(
      page.getByRole('button', { name: 'Enable offline access on this device' }),
    ).toBeVisible();
    disconnected = true;
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Switch profile: Fixture' }).click();
    await expect(
      page.getByText('Connect to the internet to open this profile. You can enable offline access in Settings.'),
    ).toBeVisible();
    await expect(picker).toHaveCount(0);
  } finally {
    await context.close();
    fixture.sql.close();
  }
});
