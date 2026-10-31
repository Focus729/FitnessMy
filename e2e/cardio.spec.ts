import { expect, test } from '@playwright/test';
import { bootstrap } from './helpers';

test('imperial cardio validates input, stores metres and supports deletion undo', async ({
  page,
}) => {
  await bootstrap(page, 'Cardio fixture');
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Имперские', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Имперские', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.goto('/#/gym?section=cardio');
  await page.getByRole('button', { name: 'Записать кардио', exact: true }).click();
  await page.getByLabel('Дистанция', { exact: true }).fill('1');
  await page.getByLabel('Средний пульс', { exact: true }).fill('999');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Средний пульс', { exact: true }).fill('120');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('main').getByText(/1,00 мили/)).toBeVisible();
  const metres = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).find((db) => db.name?.startsWith('lenta_p_'))!.name!;
    return new Promise<number>((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('cardio').objectStore('cardio').getAll();
        read.onsuccess = () => {
          db.close();
          resolve(read.result[0].distanceM);
        };
      };
    });
  });
  expect(metres).toBeCloseTo(1609.344, 3);
  await page.getByRole('main').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('main').getByText(/1,00 мили/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(page.getByRole('main').getByText(/1,00 мили/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(/1,00 мили/)).toBeVisible();
});
