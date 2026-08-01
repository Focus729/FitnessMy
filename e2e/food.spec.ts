import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

/**
 * Сценарий S1 из раздела 3: записать привычный завтрак за 5 секунд.
 * Проверяем и функциональность, и обещание из раздела 1: добавление из
 * «частого» — не более двух нажатий.
 */
test('добавление еды: поиск, граммовка, затем повтор из «частого»', async ({ page }) => {
  await bootstrap(page, 'Еда');
  await waitForSeed(page);

  await page.getByRole('button', { name: 'Добавить еду' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Поиск', exact: true }).click();

  await page.getByPlaceholder('Название продукта').fill('овсян');
  await sheet.getByRole('button', { name: /Овсян/i }).first().click();

  // Экран граммовки: значение уже выделено, сохраняем как есть
  await expect(page.getByLabel('Сколько')).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить' }).click();

  // Запись попала на главный экран
  await expect(page.getByText(/съедено/)).toBeVisible();
  const eatenText = await page.getByText(/съедено/).innerText();
  expect(eatenText).not.toContain('съедено 0');

  // Теперь тот же продукт доступен во вкладке «Частое»: два нажатия до записи
  await page.getByRole('button', { name: 'Добавить еду' }).click();
  const frequent = page.getByRole('dialog');
  await expect(frequent.getByRole('button', { name: /Овсян/i }).first()).toBeVisible();

  const started = Date.now();
  await frequent.getByRole('button', { name: /Овсян/i }).first().click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  const elapsed = Date.now() - started;

  // Целевое время сценария S1 — 5 секунд; интерфейс должен укладываться с запасом
  expect(elapsed).toBeLessThan(5000);
});

test('быстрый ввод калорий работает без базы продуктов', async ({ page }) => {
  await bootstrap(page, 'Быстро');

  await page.getByRole('button', { name: 'Добавить еду' }).click();
  await page.getByRole('button', { name: 'Быстро' }).click();
  await page.getByLabel('Калории').fill('450');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.getByText(/съедено 450/)).toBeVisible();
});
