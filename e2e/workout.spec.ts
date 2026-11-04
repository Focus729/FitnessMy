import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

/**
 * Сценарий S2 из раздела 3 и приёмка этапа 3: провести тренировку
 * от начала до конца, включая восстановление после закрытия вкладки (10.1).
 */
test('тренировка: начать, отметить подход, закрыть вкладку, продолжить, завершить', async ({
  page,
}) => {
  await bootstrap(page, 'Зал');
  await waitForSeed(page);

  await page.getByRole('link', { name: 'Зал' }).click();
  await page.getByRole('button', { name: 'Свободная тренировка' }).click();

  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await page.getByPlaceholder('Название упражнения').fill('Barbell Squat');
  await page
    .getByRole('button', { name: /Приседания со штангой|Barbell Squat/ })
    .first()
    .click();

  // Первый подход создаётся сам — вводим вес и повторы
  await page.getByLabel('Вес').first().fill('60');
  await page.getByLabel('Повторы').first().fill('8');

  // Отметка подхода — одно нажатие, таймер отдыха стартует автоматически
  await page.getByRole('button', { name: 'Готово' }).first().click();
  await expect(page.getByText('Отдых')).toBeVisible();

  // Состояние тренировки должно пережить перезагрузку (10.1)
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Завершить тренировку' }),
  ).toBeVisible();

  // И должна предлагаться к продолжению с главного экрана
  await page.goto('/#/');
  await expect(page.getByText('Продолжить тренировку')).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();

  await expect(page.getByLabel('Вес').first()).toHaveValue('60');

  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();

  // Тренировка появилась в истории с посчитанным тоннажем
  await expect(page.getByText(/Тоннаж/)).toBeVisible();

  // Native IndexedDB proof: the award and its total commit together and survive reload.
  const progressIsConsistent = async () =>
    page.evaluate(async () => {
      const name = (await indexedDB.databases()).find((db) =>
        db.name?.startsWith('lenta_p_'),
      )?.name;
      if (!name) return false;
      return new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['xpEvents', 'gameState']);
          const events = tx.objectStore('xpEvents').getAll();
          const state = tx.objectStore('gameState').get('singleton');
          tx.oncomplete = () => {
            db.close();
            const rows = events.result as { reason: string; amount: number }[];
            resolve(
              rows.filter((row) => row.reason === 'workoutFinished').length ===
                1 &&
                state.result?.xp ===
                  rows.reduce((sum, row) => sum + row.amount, 0),
            );
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    });
  await expect.poll(progressIsConsistent).toBe(true);
  await page.reload();
  await expect.poll(progressIsConsistent).toBe(true);
});
