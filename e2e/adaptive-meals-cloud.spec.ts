import { expect, test } from '@playwright/test';
import worker from '../backend/index';
import { hashToken } from '../backend/github-auth';
import { testDatabase } from '../backend/test-database';
import { completeOnboarding, waitForSeed } from './helpers';

test('Hermes ranks verified menus and a phone entry replans the desktop diary', async ({ browser, baseURL }) => {
  test.skip(process.env.VITE_CLOUD_ENABLED !== 'true', 'Cloud-enabled build required');
  test.setTimeout(90_000);
  const fixture = testDatabase();
  const origin = 'https://fixture.example';
  const token = await hashToken('meal-fixture-session');
  const bridgeKey = '82505155-27b2-436c-851d-94c1667bc961';
  fixture.sql.prepare('INSERT INTO sessions VALUES(?,?,?,?)')
    .run(await hashToken(token), 'a', Math.floor(Date.now() / 1000) + 3600, 0);
  fixture.sql.prepare('INSERT INTO hermes_meal_bridges VALUES(?,?,?)')
    .run('a', 'p', await hashToken(bridgeKey));
  const env = {
    DB: fixture.db, ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    APP_ORIGIN: origin, ALLOWED_GITHUB_ID: '1', GITHUB_CLIENT_ID: 'fixture',
    GITHUB_CLIENT_SECRET: 'fixture', CLOUD_SYNC_ENABLED: 'true', HERMES_MEALS_ENABLED: 'true',
  };
  const bridge = async (action: 'claim' | 'complete', body = {}) => {
    const result = await worker.fetch(new Request(`${origin}/api/hermes/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${bridgeKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), env);
    expect(result.ok).toBe(true);
    return result.json();
  };
  const phone = await browser.newContext({ baseURL, locale: 'ru-RU', viewport: { width: 390, height: 840 } });
  const desktop = await browser.newContext({ baseURL, locale: 'ru-RU', viewport: { width: 1440, height: 900 } });
  try {
    for (const context of [phone, desktop]) {
      await context.route('**/api/**', async (route) => {
        const incoming = route.request();
        const url = new URL(incoming.url());
        const headers = new Headers(await incoming.allHeaders());
        headers.set('Cookie', `__Host-fitnessmy_session=${token}`);
        if (headers.get('Origin') === baseURL) headers.set('Origin', origin);
        const response = await worker.fetch(new Request(`${origin}${url.pathname}${url.search}`, {
          method: incoming.method(), headers, body: incoming.postData() ?? undefined,
        }), env);
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
    }
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const mobile = await phone.newPage();
    await mobile.clock.setFixedTime(noon);
    await mobile.goto('/');
    await mobile.getByRole('button', { name: 'Fixture', exact: true }).click({ timeout: 12_000 });
    await completeOnboarding(mobile);
    await mobile.getByRole('button', { name: 'Напомнить завтра' }).click();
    await waitForSeed(mobile);
    await mobile.getByRole('button', { name: 'Меню на день', exact: true }).click();
    const menu = mobile.locator('.adaptive-meals');
    await expect(menu.getByText('Ждём рекомендацию от Hermes…')).toBeVisible();
    await menu.getByRole('button', { name: 'Меню 2', exact: true }).click();
    await expect.poll(() => fixture.sql.prepare(
      "SELECT COUNT(*) AS n FROM hermes_meal_jobs WHERE purpose='plan' AND payload IS NOT NULL",
    ).get()?.n).toBe(1);
    const { job } = await bridge('claim');
    const payload = JSON.parse(job.payload);
    expect(payload.menus).toHaveLength(3);
    expect(payload.menus[0].dishes).toHaveLength(4);
    await bridge('complete', { ...job, result: '{"order":[3,1,2],"explanation":"Тестовое сравнение"}' });
    await expect(menu.getByText(/Hermes рекомендует меню 3/)).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Меню 2', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const pc = await desktop.newPage();
    await pc.clock.setFixedTime(noon);
    await pc.goto('/');
    await pc.getByRole('button', { name: 'Fixture', exact: true }).click();
    await pc.getByRole('button', { name: 'Напомнить завтра' }).click({ timeout: 12_000 });
    await pc.getByRole('button', { name: 'Меню на день', exact: true }).click();
    const pcMenu = pc.locator('.adaptive-meals');
    await expect(pcMenu.getByRole('article')).toHaveCount(3);
    await expect(pcMenu.getByText('Завтрак', { exact: true })).toHaveCount(3);
    await menu.getByRole('button', { name: 'Посмотреть порцию' }).first().click();
    await mobile.getByRole('dialog').getByRole('button', { name: 'Записать в дневник' }).click();
    await expect(menu.getByText('Порция записана в дневник.')).toBeVisible();
    await expect.poll(() => fixture.sql.prepare(
      "SELECT COUNT(*) AS n FROM sync_entities WHERE entity_type='diary'",
    ).get()?.n).toBeGreaterThan(0);
    await pc.reload();
    await expect(pcMenu.getByRole('article')).toHaveCount(3);
    await expect(pcMenu.getByText('Завтрак', { exact: true })).toHaveCount(0);
    await expect(pcMenu.getByRole('button', { name: 'Посмотреть порцию' })).toHaveCount(9);

    // A nonconforming reply cannot replace the visible catalog suggestions.
    const previousSnapshot = job.snapshot;
    await expect.poll(() => fixture.sql.prepare(
      "SELECT snapshot FROM hermes_meal_jobs WHERE purpose='plan'",
    ).get()?.snapshot).not.toBe(previousSnapshot);
    const { job: updated } = await bridge('claim');
    expect(JSON.parse(updated.payload).menus[0].dishes).toHaveLength(3);
    await bridge('complete', { ...updated, result: '{"order":[3,9,2]}' });
    await expect(pcMenu.getByText(/Hermes пока недоступен/)).toBeVisible();
    await expect(pcMenu.getByRole('button', { name: 'Посмотреть порцию' })).toHaveCount(9);
  } finally {
    await Promise.all([phone.close(), desktop.close()]);
    fixture.sql.close();
  }
});
