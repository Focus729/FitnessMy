import { expect, test } from '@playwright/test';
import { bootstrap } from './helpers';

test('barcode lookup preserves leading zeroes and distinguishes a network failure from no match', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Fixture denial', 'NotAllowedError')),
      },
    });
  });
  let requests = 0;
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    expect(route.request().url()).toContain('/0001234567890.json');
    requests++;
    return requests === 1 ? route.abort('failed') : route.fulfill({ json: { status: 0 } });
  });
  await bootstrap(page, 'Barcode regression');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Штрихкод', exact: true }).click();
  await page.getByLabel('Ввести цифрами', { exact: true }).fill('0001234567890');
  await page.getByRole('dialog').getByRole('button', { name: 'Поиск', exact: true }).last().click();
  await expect(page.getByRole('status')).toContainText('Справочник не ответил');
  await page.getByRole('button', { name: 'Повторить попытку', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Такого штрихкода нет');
  expect(requests).toBe(2);
});

test('unsaved sleep drafts stay with their date after navigation', async ({ page }) => {
  await bootstrap(page, 'Draft regression');
  await page.goto('/#/body?section=sleep&date=2026-10-20');
  await page.getByLabel('Лёг', { exact: true }).fill('02:17');
  await page.getByLabel('Дата', { exact: true }).fill('2026-10-21');
  await expect(page.getByLabel('Лёг', { exact: true })).not.toHaveValue('02:17');
  await page.getByLabel('Дата', { exact: true }).fill('2026-10-20');
  await expect(page.getByLabel('Лёг', { exact: true })).toHaveValue('02:17');
  await page.reload();
  await expect(page.getByLabel('Лёг', { exact: true })).toHaveValue('02:17');
});

test('food search reports no match and ignores results after the query changes', async ({
  page,
}) => {
  await bootstrap(page, 'Search regression');
  await page.route('https://world.openfoodfacts.org/**', async (route) => {
    if (route.request().url().includes('search_terms=Delayed')) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        json: {
          products: [
            {
              code: '1234567890123',
              product_name: 'Stale result',
              nutriments: { 'energy-kcal_100g': 100 },
            },
          ],
        },
      });
    } else await route.fulfill({ json: { products: [] } });
  });
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Поиск', exact: true }).click();
  const query = page.getByPlaceholder('Название продукта');
  await query.fill('No matching fixture');
  await page.getByRole('button', { name: 'Искать в интернете', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Продукты не найдены');
  await query.fill('Delayed');
  await page.getByRole('button', { name: 'Искать в интернете', exact: true }).click();
  await query.fill('Replacement');
  await page.getByRole('button', { name: 'Искать в интернете', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Продукты не найдены');
  await expect(page.getByText('Stale result', { exact: true })).toHaveCount(0);
});

test('profiles stay isolated and a PIN keeps its leading zero', async ({ page }) => {
  await bootstrap(page, 'First');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Быстро', exact: true }).click();
  await page.getByLabel('Калории', { exact: true }).fill('321');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const pin = page.getByLabel('Установить PIN', { exact: true });
  await pin.fill('012345');
  await pin.locator('..').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(pin).toHaveValue('');
  await page.getByRole('button', { name: 'Сменить профиль: First', exact: true }).click();
  await bootstrap(page, 'Second');
  await expect(page.getByText(/съедено 0/)).toBeVisible();
  await page.getByRole('button', { name: 'Сменить профиль: Second', exact: true }).click();
  await page.getByRole('button', { name: 'First', exact: true }).click();
  await page.getByLabel('Введите PIN', { exact: true }).fill('012345');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByText(/съедено 321/)).toBeVisible();
});

test('sleep values survive reopening and editing without duplicate dates', async ({ page }) => {
  await bootstrap(page, 'Sleep regression');
  await page.goto('/#/body?section=sleep');
  await page.getByLabel('Лёг', { exact: true }).fill('01:15');
  await page.getByLabel('Встал', { exact: true }).fill('09:30');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Готово');
  await page.reload();
  await expect(page.getByLabel('Лёг', { exact: true })).toHaveValue('01:15');
  await expect(page.getByLabel('Встал', { exact: true })).toHaveValue('09:30');
  await page.getByLabel('Встал', { exact: true }).fill('10:00');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1);
});

test('diary correction persists decimals and keyboard focus stays in its dialog', async ({
  page,
}) => {
  await bootstrap(page, 'Diary regression');
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('button', { name: 'Быстро', exact: true }).click();
  await page.getByLabel('Калории', { exact: true }).fill('321');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.goto('/#/food');
  await page.getByRole('button', { name: /Быстрая запись/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ккал', { exact: true }).fill('123,5');
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  const choice = page.getByRole('dialog', { name: 'Введённое не сохранено', exact: true });
  await expect(choice).toBeVisible();
  expect(await choice.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(choice).toHaveCount(0);
  await expect(dialog.getByLabel('ккал', { exact: true })).toHaveValue('123,5');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Быстрая запись/ }).click();
  await expect(page.getByRole('dialog').getByLabel('ккал', { exact: true })).toHaveValue('123.5');
});
