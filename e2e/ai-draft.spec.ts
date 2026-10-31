import { expect, test } from '@playwright/test';
import { bootstrap } from './helpers';

test('photo candidates require review and persist only edited, retained rows', async ({ page }) => {
  await bootstrap(page, 'AI fixture');
  await page.route('https://api.openai.com/**', (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    name: 'Keep fixture',
                    grams: 100,
                    kcal: 250,
                    proteinG: 10,
                    fatG: 10,
                    carbG: 30,
                    confidence: 'low',
                  },
                  {
                    name: 'Remove fixture',
                    grams: 50,
                    kcal: 90,
                    proteinG: 2,
                    fatG: 2,
                    carbG: 15,
                    confidence: 'low',
                  },
                ],
              }),
            },
          },
        ],
      },
    }),
  );
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('settings', 'readwrite');
        const table = tx.objectStore('settings');
        const read = table.getAll();
        read.onsuccess = () => {
          const settings = read.result[0];
          table.put({
            ...settings,
            ai: {
              ...settings.ai,
              enabled: true,
              provider: 'openai',
              apiKey: 'synthetic-test-key',
              model: 'fixture-model',
              features: { ...settings.ai.features, photoFood: true },
            },
          });
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Фото', exact: true }).click();
  await page.getByLabel('Еда по фото', { exact: true }).setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afo8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const names = page.getByLabel('Что это было', { exact: true });
  await expect(names).toHaveCount(2);
  await names.first().fill('Reviewed fixture');
  await page.getByLabel('ккал', { exact: true }).first().fill('123,5');
  await page.getByRole('button', { name: 'Удалить', exact: true }).last().click();
  await expect(names).toHaveCount(1);
  // The draft is not a diary entry until the explicit Add action.
  const before = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    return new Promise<number>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const count = db.transaction('diary').objectStore('diary').count();
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
      };
    });
  });
  expect(before).toBe(0);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/food');
  await page.getByRole('button', { name: /Reviewed fixture/ }).click();
  await expect(page.getByLabel('ккал', { exact: true })).toHaveValue('123.5');
  await expect(page.getByText('Remove fixture', { exact: true })).toHaveCount(0);
});
