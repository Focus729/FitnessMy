import { expect, test } from '@playwright/test';
import worker from '../../backend/index';
import { hashToken } from '../../backend/github-auth';
import { testDatabase } from '../../backend/test-database';

test('creates a fresh cloud profile on the phone and opens its history on a separate PC', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
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
  let logoutRequests = 0;
  try {
    for (const context of [phone, pc]) {
      await context.route(/\/(api\/|auth\/logout$)/, async (route) => {
        const incoming = route.request();
        const url = new URL(incoming.url());
        if (url.pathname === '/auth/logout') logoutRequests++;
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
    const water = mobile.locator('section').filter({
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
    const desktopWater = desktop.locator('section').filter({
      has: desktop.getByRole('heading', { name: 'Water', exact: true }),
    });
    await expect(desktopWater.getByRole('button')).toContainText('200 /');
    await pc.setOffline(true);
    await desktopWater.getByRole('button').click();
    await desktop.getByRole('button', { name: '+300 ml', exact: true }).click();
    await desktop.keyboard.press('Escape');
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
    // Set up two edits to the same water record, which has no inline edit control.
    const original = fixture.sql
      .prepare(
        "SELECT entity_id AS id FROM sync_entities WHERE entity_type='water' AND json_extract(payload, '$.ml')=200",
      )
      .get()!.id as string;
    const edit = async (page: typeof mobile, ml: number) => {
      await page.evaluate(
        async ({ original, ml }) => {
          const path = '/src/data/db/schema.ts';
          const { openDb } = await import(path);
          const workspace = localStorage.getItem('lenta.activeProfile.v1');
          if (!workspace) throw new Error('Workspace is missing');
          await openDb(workspace).water.update(original, { ml });
        },
        { original, ml },
      );
    };
    await pc.setOffline(true);
    await edit(desktop, 600);
    await edit(mobile, 450);
    await expect
      .poll(
        () =>
          fixture.sql
            .prepare(
              "SELECT json_extract(payload, '$.ml') AS ml FROM sync_entities WHERE entity_type='water' AND entity_id=?",
            )
            .get(original)?.ml,
      )
      .toBe(450);
    await pc.setOffline(false);
    await desktop.getByRole('button', { name: 'Compare versions' }).click();
    const comparison = desktop.getByRole('dialog', {
      name: 'Compare versions',
    });
    await expect(comparison.getByText('600', { exact: true })).toBeVisible();
    await expect(comparison.getByText('450', { exact: true })).toBeVisible();
    await desktop.screenshot({
      path: info.outputPath('conflict-en-dark.png'),
      fullPage: true,
    });
    await desktop.setViewportSize({ width: 320, height: 820 });
    await expect(
      comparison.getByRole('button', { name: 'Keep mine' }),
    ).toBeVisible();
    expect(
      await desktop.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await desktop.screenshot({
      path: info.outputPath('conflict-320.png'),
      fullPage: true,
    });
    await comparison.getByRole('button', { name: 'Keep mine' }).click();
    await expect(comparison).toHaveCount(0);
    await expect
      .poll(
        () =>
          fixture.sql
            .prepare(
              "SELECT json_extract(payload, '$.ml') AS ml FROM sync_entities WHERE entity_type='water' AND entity_id=?",
            )
            .get(original)?.ml,
      )
      .toBe(600);
    await mobile.reload();
    await expect(water.getByRole('button')).toContainText('900 /');
    // Keep Vite assets reachable while exercising the cold-start offline gate.
    await desktop.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', {
        get: () => sessionStorage.getItem('fixtureOffline') !== 'true',
      });
    });
    const offline = (value: boolean) =>
      desktop.evaluate((value) => {
        sessionStorage.setItem('fixtureOffline', String(value));
        window.dispatchEvent(new Event(value ? 'offline' : 'online'));
      }, value);
    await offline(true);
    await desktop.reload();
    await expect(
      desktop.getByText(/Connect to the internet to open this profile/),
    ).toBeVisible();
    await expect(desktopWater).toHaveCount(0);
    await offline(false);
    await expect(desktopWater.getByRole('button')).toContainText('900 /');
    await desktop
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await desktop
      .getByRole('button', { name: 'Enable offline access on this device' })
      .click();
    await expect(
      desktop.getByRole('button', {
        name: 'Turn off offline access on this device',
      }),
    ).toBeVisible();
    await desktop.screenshot({
      path: info.outputPath('offline-settings-320.png'),
      fullPage: true,
    });
    await desktop.getByRole('link', { name: 'Today', exact: true }).click();
    await offline(true);
    await desktop.reload();
    await expect(desktopWater.getByRole('button')).toContainText('900 /');
    await edit(desktop, 700);
    await expect(desktopWater.getByRole('button')).toContainText('1,000 /');
    await desktop
      .getByRole('button', { name: 'Switch profile: Cloud fixture' })
      .click();
    await offline(false);
    await desktop.reload();
    const logout = desktop.getByRole('button', {
      name: 'Sign out of cloud account',
    });
    await logout.click();
    await expect(desktop.getByText(/changes waiting to sync/)).toBeVisible();
    expect(logoutRequests).toBe(0);
    await existing.click();
    await expect
      .poll(
        () =>
          fixture.sql
            .prepare(
              "SELECT json_extract(payload, '$.ml') AS ml FROM sync_entities WHERE entity_type='water' AND entity_id=?",
            )
            .get(original)?.ml,
      )
      .toBe(700);
    await expect(desktop.getByText('Synced', { exact: true })).toBeVisible();
    const localId = await desktop.evaluate(() =>
      localStorage.getItem('lenta.activeProfile.v1'),
    );
    await desktop
      .getByRole('button', { name: 'Switch profile: Cloud fixture' })
      .click();
    await logout.click();
    await expect(
      desktop.getByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeVisible();
    expect(logoutRequests).toBe(1);
    expect(
      await desktop.evaluate(async (id) => {
        const path = '/src/data/db/schema.ts';
        const { openDb } = await import(path);
        const db = openDb(id);
        return {
          water: await db.water.count(),
          trust: Boolean(await db.cloudState.get('offlineAccess')),
        };
      }, localId),
    ).toEqual({ water: 0, trust: false });
    fixture.sql
      .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
      .run(
        await hashToken(token),
        'a',
        Math.floor(Date.now() / 1000) + 3600,
        0,
      );
    await desktop.reload();
    await existing.click();
    await expect(desktopWater.getByRole('button')).toContainText('1,000 /');
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
