import { expect, test } from '@playwright/test';
import worker from '../../backend/index';
import { hashToken } from '../../backend/github-auth';
import { testDatabase } from '../../backend/test-database';

test('creates a fresh cloud profile on the phone and opens its history on a separate PC', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(65_000);
  const fixture = testDatabase();
  const origin = 'https://fixture.example';
  const token = await hashToken('synthetic-workspace-test');
  fixture.sql
    .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
    .run(await hashToken(token), 'a', Math.floor(Date.now() / 1000) + 3600, 0);
  const env = {
    DB: fixture.db,
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    APP_ORIGIN: origin,
    ALLOWED_GITHUB_ID: '1',
    GITHUB_CLIENT_ID: 'fixture',
    GITHUB_CLIENT_SECRET: 'fixture',
    CLOUD_SYNC_ENABLED: 'true',
  };
  const phone = await browser.newContext({
    baseURL,
    locale: 'ru-RU',
    viewport: { width: 320, height: 820 },
  });
  const pc = await browser.newContext({
    baseURL,
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  let signedIn = true;
  try {
    for (const context of [phone, pc]) {
      await context.route('**/api/**', async (route) => {
        const incoming = route.request();
        const url = new URL(incoming.url());
        const headers = new Headers(await incoming.allHeaders());
        if (signedIn)
          headers.set('Cookie', `__Host-fitnessmy_session=${token}`);
        if (headers.get('Origin') === baseURL) headers.set('Origin', origin);
        const response = await worker.fetch(
          new Request(`${origin}${url.pathname}${url.search}`, {
            method: incoming.method(),
            headers,
            ...(incoming.postData() === null
              ? {}
              : { body: incoming.postData() }),
          }),
          env,
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      });
    }
    const mobile = await phone.newPage();
    await mobile.goto('/');
    const name = mobile.getByRole('textbox', { name: 'Имя облачного профиля' });
    await expect(name).toBeVisible();
    expect(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mobile.screenshot({
      path: info.outputPath('phone-ru.png'),
      fullPage: true,
    });
    await name.fill('Cloud fixture');
    await mobile
      .getByRole('button', { name: 'Создать облачный профиль' })
      .click();
    const next = mobile.getByRole('button', { name: 'Далее', exact: true });
    await next.click();
    await mobile
      .getByRole('checkbox', {
        name: 'Я проверил имя, пол, дату рождения и рост',
      })
      .check();
    for (let i = 0; i < 3; i++) await next.click();
    await mobile.getByLabel('Стартовый вес').fill('80');
    await next.click();
    await next.click();
    await mobile.getByRole('button', { name: 'Готово', exact: true }).click();
    const water = mobile
      .locator('section')
      .filter({
        has: mobile.getByRole('heading', { name: 'Вода', exact: true }),
      });
    await water.getByRole('button').click();
    await mobile.getByRole('button', { name: '+200 мл', exact: true }).click();
    await expect
      .poll(
        () =>
          fixture.sql
            .prepare(
              "SELECT COUNT(*) AS n FROM sync_entities WHERE entity_type IN ('profile','settings','body','water')",
            )
            .get()?.n,
      )
      .toBe(4);

    const desktop = await pc.newPage();
    await desktop.goto('/');
    const existing = desktop.getByRole('button', {
      name: 'Cloud fixture',
      exact: true,
    });
    await expect(existing).toBeVisible();
    expect(
      await desktop.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await desktop.screenshot({
      path: info.outputPath('desktop-en-dark.png'),
      fullPage: true,
    });
    await existing.click();
    const desktopWater = desktop
      .locator('section')
      .filter({
        has: desktop.getByRole('heading', { name: 'Water', exact: true }),
      });
    await expect(desktopWater.getByRole('button')).toContainText('200 /');
    await pc.setOffline(true);
    await desktopWater.getByRole('button').click();
    await desktop.getByRole('button', { name: '+300 ml', exact: true }).click();
    await expect(
      desktop.getByText('Offline', { exact: true }).first(),
    ).toBeVisible();
    expect(
      fixture.sql
        .prepare(
          "SELECT COUNT(*) AS n FROM sync_entities WHERE entity_type='water'",
        )
        .get()?.n,
    ).toBe(1);
    await pc.setOffline(false);
    await expect
      .poll(
        () =>
          fixture.sql
            .prepare(
              "SELECT COUNT(*) AS n FROM sync_entities WHERE entity_type='water'",
            )
            .get()?.n,
      )
      .toBe(2);
    await mobile.reload();
    await expect(water.getByRole('button')).toContainText('500 /');
    signedIn = false;
    await desktop.reload();
    await expect(
      desktop.getByText('Sign in again to open this cloud profile.'),
    ).toBeVisible();
    await expect(desktopWater).toHaveCount(0);
  } finally {
    await phone.close();
    await pc.close();
    fixture.sql.close();
  }
});
