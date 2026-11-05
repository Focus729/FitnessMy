import { expect, test } from '@playwright/test';
import { testDatabase } from '../../backend/test-database';
import { syncApi } from '../../backend/sync-api';

test('two isolated Chrome profiles exchange edits through the SQL-backed HTTP handler', async ({
  browser,
}) => {
  const fixture = testDatabase();
  const origin = 'http://127.0.0.1:4175';
  const phone = await browser.newContext({ baseURL: origin });
  const pc = await browser.newContext({ baseURL: origin });
  try {
    for (const context of [phone, pc]) {
      await context.route('**/api/profiles/p/sync**', async (route) => {
        const incoming = route.request();
        const response = await syncApi(
          new Request(incoming.url(), {
            method: incoming.method(),
            headers: await incoming.allHeaders(),
            ...(incoming.method() === 'POST'
              ? { body: incoming.postData() }
              : {}),
          }),
          fixture.db,
          'a',
          origin,
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      });
    }
    const phonePage = await phone.newPage();
    const pcPage = await pc.newPage();
    for (const page of [phonePage, pcPage]) {
      await page.goto('/');
      await page.evaluate(async () => {
        const modulePath = '/src/data/db/schema.ts';
        const { openDb } = await import(modulePath);
        await openDb('browser-sync-fixture').cloudState.put({
          key: 'link',
          accountId: 'a',
          profileId: 'p',
          locked: false,
        });
      });
    }
    await phonePage.evaluate(async () => {
      const modulePath = '/src/data/db/schema.ts';
      const { openDb } = await import(modulePath);
      await openDb('browser-sync-fixture').water.put({
        id: 'w',
        date: '2026-11-05',
        time: '10:00',
        ml: 250,
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      });
    });
    for (const page of [phonePage, pcPage])
      await page.evaluate(async () => {
        const schemaPath = '/src/data/db/schema.ts';
        const syncPath = '/src/data/cloud/sync-once.ts';
        const transportPath = '/src/data/cloud/transport.ts';
        const { openDb } = await import(schemaPath);
        const { syncOnce } = await import(syncPath);
        const { createSyncTransport } = await import(transportPath);
        await syncOnce(
          openDb('browser-sync-fixture'),
          'a',
          'p',
          createSyncTransport('p'),
        );
      });
    expect(
      await pcPage.evaluate(async () => {
        const path = '/src/data/db/schema.ts';
        const { openDb } = await import(path);
        return (await openDb('browser-sync-fixture').water.get('w')).ml;
      }),
    ).toBe(250);
    await pcPage.evaluate(async () => {
      const path = '/src/data/db/schema.ts';
      const { openDb } = await import(path);
      await openDb('browser-sync-fixture').water.update('w', { ml: 500 });
    });
    await pcPage.reload();
    for (const page of [pcPage, phonePage])
      await page.evaluate(async () => {
        const schemaPath = '/src/data/db/schema.ts';
        const syncPath = '/src/data/cloud/sync-once.ts';
        const transportPath = '/src/data/cloud/transport.ts';
        const { openDb } = await import(schemaPath);
        const { syncOnce } = await import(syncPath);
        const { createSyncTransport } = await import(transportPath);
        await syncOnce(
          openDb('browser-sync-fixture'),
          'a',
          'p',
          createSyncTransport('p'),
        );
      });
    expect(
      await phonePage.evaluate(async () => {
        const path = '/src/data/db/schema.ts';
        const { openDb } = await import(path);
        return (await openDb('browser-sync-fixture').water.get('w')).ml;
      }),
    ).toBe(500);
  } finally {
    await phone.close();
    await pc.close();
    fixture.sql.close();
  }
});
