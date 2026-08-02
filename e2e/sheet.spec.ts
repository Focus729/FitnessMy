import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

/**
 * Задача 5 доработки 0.7: экран добавления упражнения должен закрываться
 * очевидно и не оставлять мусора в базе.
 */
test('добавление упражнения: открыть и сразу закрыть', async ({ page }) => {
  await bootstrap(page, 'Панель');
  await waitForSeed(page);

  await page.getByRole('link', { name: 'Зал' }).click();
  await page.getByRole('button', { name: 'Свободная тренировка' }).click();

  const countSets = () =>
    page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      const name = dbs.find((d) => d.name?.startsWith('lenta_p_'))?.name as string;
      return new Promise<number>((resolve) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const count = req.result.transaction('workoutSets').objectStore('workoutSets').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(-1);
        };
      });
    });

  const before = await countSets();

  // Открыть панель и закрыть кнопкой — подтверждения быть не должно
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Завершить тренировку' })).toBeVisible();

  // Пустая форма не создаёт черновиков в базе
  expect(await countSets()).toBe(before);

  // Esc закрывает так же молча
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await countSets()).toBe(before);

  // Клик по затемнённому фону — третий обязательный путь
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await countSets()).toBe(before);
});

test('поиск упражнений: крестик очистки и группы при пустом запросе', async ({ page }) => {
  await bootstrap(page, 'Поиск');
  await waitForSeed(page);

  await page.getByRole('link', { name: 'Зал' }).click();
  await page.getByRole('button', { name: 'Свободная тренировка' }).click();
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();

  const sheet = page.getByRole('dialog');
  // Пустой запрос показывает группы, а не пустой список
  await expect(sheet.getByText('Все упражнения')).toBeVisible();

  await page.getByPlaceholder('Название упражнения').fill('squat');
  await expect(sheet.getByRole('button', { name: 'Очистить' })).toBeVisible();

  await sheet.getByRole('button', { name: 'Очистить' }).click();
  await expect(page.getByPlaceholder('Название упражнения')).toHaveValue('');
  await expect(sheet.getByText('Все упражнения')).toBeVisible();
});
