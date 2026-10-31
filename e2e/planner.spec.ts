import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

test('weekly menu and shopping checks survive reload without duplicate diary rows', async ({
  page,
}) => {
  await bootstrap(page, 'Menu fixture');
  await waitForSeed(page);
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['foods', 'dishes'], 'readwrite');
        const read = tx.objectStore('foods').getAll();
        read.onsuccess = () => {
          const food = read.result.find((item) => item.per100.kcal > 100);
          const at = new Date().toISOString();
          tx.objectStore('dishes').put({
            id: 'menu-fixture',
            name: 'Menu fixture',
            components: [{ foodId: food.id, grams: 200 }],
            totalGrams: 200,
            isFavorite: true,
            useCount: 0,
            createdAt: at,
            updatedAt: at,
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
      request.onerror = () => reject(request.error);
    });
  });
  await page.goto('/#/food?section=planner&week=2026-10-19');
  for (let index = 0; index < 3; index++)
    await page.getByRole('button', { name: '+1', exact: true }).click();
  await page.getByRole('button', { name: 'Разложить неделю', exact: true }).click();
  await page.getByRole('radio', { name: 'Список покупок', exact: true }).click();
  const checkbox = page.getByRole('checkbox').first();
  await checkbox.check();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Пересчитать', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Список покупок', exact: true }).click();
  await expect(checkbox).toBeChecked();
  await page.getByRole('radio', { name: 'Меню на неделю', exact: true }).click();
  const expectedEntries = await page
    .getByRole('list', { name: 'Меню на неделю', exact: true })
    .locator(':scope > li')
    .first()
    .locator('ul > li')
    .count();
  const apply = page
    .getByRole('button', { name: 'Записать этот день в дневник', exact: true })
    .first();
  await apply.click();
  await expect(page.getByRole('status')).toContainText('Готово');
  await apply.click();
  await page.getByLabel('Неделя меню', { exact: true }).fill('2026-10-26');
  await expect(page.getByRole('button', { name: 'Разложить неделю', exact: true })).toBeDisabled();
  await page.goto('/#/food?date=2026-10-19');
  const rows = page.getByRole('main').getByRole('button', { name: /Menu fixture/ });
  await expect(rows).toHaveCount(expectedEntries);
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  const ids = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    return new Promise<string[]>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('diary').objectStore('diary').getAll();
        read.onsuccess = () => {
          db.close();
          resolve(read.result.map((row) => row.id));
        };
      };
    });
  });
  expect(ids).toHaveLength(expectedEntries);
  expect(new Set(ids).size).toBe(count);
});
