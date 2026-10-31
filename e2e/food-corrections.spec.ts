import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

test('same-name portions, meal reset, repeat Undo and historical slot visibility remain correct', async ({
  page,
}) => {
  await bootstrap(page, 'Food corrections');
  await waitForSeed(page);
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    await new Promise<void>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('foods', 'readwrite');
        for (const [index, brand] of ['Alpha', 'Beta'].entries()) {
          const at = new Date().toISOString();
          tx.objectStore('foods').put({
            id: `twin-${index}`,
            name: 'Twin fixture',
            brand,
            searchKey: 'twin fixture',
            source: 'user',
            basis: 'mass',
            per100: { kcal: (index + 1) * 100, proteinG: 10, fatG: 1, carbG: 10 },
            servings: [],
            isFavorite: true,
            useCount: 1,
            lastGrams: index ? 75 : 50,
            verified: false,
            createdAt: at,
            updatedAt: at,
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.goto('/#/food?date=2026-10-23');
  // Native fixture writes do not notify the application's live Dexie queries.
  await page.reload();
  await page.getByRole('button', { name: /\+ ещё/ }).click();
  await page.getByRole('button', { name: 'Добавить Обед', exact: true }).click();
  await page.getByRole('button', { name: 'Поиск', exact: true }).click();
  await page.getByPlaceholder('Название продукта').fill('Twin');
  await page.getByRole('button', { name: /Twin fixture Alpha/ }).click();
  await expect(page.getByLabel('Сколько', { exact: true })).toHaveValue('50');
  await page.getByLabel('Сколько', { exact: true }).fill('333');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Не сохранять', exact: true }).click();
  await page.getByPlaceholder('Название продукта').fill('Twin');
  await page.getByRole('button', { name: /Twin fixture Beta/ }).click();
  await expect(page.getByLabel('Сколько', { exact: true })).toHaveValue('75');
  await expect(page.getByRole('radio', { name: 'Обед', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить Ужин', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Twin fixture.*75/ }).click();
  await expect(page.getByRole('radio', { name: 'Ужин', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Повторить', exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('Готово');
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('main').getByRole('button', { name: /Twin fixture/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Индекс питания/ }).click();
  await page.getByRole('radio', { name: 'Неделя', exact: true }).click();
  await expect(page.getByText('1/5 дней с данными', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    await new Promise<void>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('settings', 'readwrite');
        const table = tx.objectStore('settings');
        const read = table.get('singleton');
        read.onsuccess = () =>
          table.put({
            ...read.result,
            firstDayOfWeek: 7,
            mealSlots: read.result.mealSlots.filter((slot: { id: string }) => slot.id !== 'lunch'),
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  await expect(page.getByText('Без категории', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /Twin fixture/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Индекс питания/ }).click();
  await page.getByRole('radio', { name: 'Неделя', exact: true }).click();
  await expect(page.getByText('1/6 дней с данными', { exact: true })).toBeVisible();
});
