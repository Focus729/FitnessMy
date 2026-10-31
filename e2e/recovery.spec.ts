import { expect, test } from '@playwright/test';
import { bootstrap } from './helpers';

test('a failed diary write retains the draft and retry creates only one record', async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const method of ['add', 'put'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (value: unknown, key?: IDBValidKey) {
        if (this.name === 'diary' && localStorage.getItem('fixture.failDiaryWrites') === '1') {
          throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
        }
        return original.call(this, value, key);
      };
    }
  });
  await bootstrap(page, 'Write failure fixture');
  await page.evaluate(() => localStorage.setItem('fixture.failDiaryWrites', '1'));
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Быстро', exact: true }).click();
  await page.getByLabel('Что это было', { exact: true }).fill('Retry fixture');
  await page.getByLabel('Калории', { exact: true }).fill('123,5');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Калории', { exact: true })).toHaveValue('123,5');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Введённое не сохранено', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить ввод', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Поиск', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Быстро', exact: true }).click();
  await expect(page.getByLabel('Калории', { exact: true })).toHaveValue('123.5');
  await page.evaluate(() => localStorage.removeItem('fixture.failDiaryWrites'));
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/food');
  await expect(page.getByRole('button', { name: /Retry fixture/ })).toHaveCount(1);
});

test('unavailable storage status leaves backup settings usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', {
      configurable: true,
      value: () => Promise.reject(new Error('Synthetic denial')),
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await bootstrap(page, 'Storage fixture');
  await page.goto('/#/settings');
  await expect(
    page.getByText(
      'Браузер не сообщил состояние хранилища. Сохраните резервную копию данных в файл.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
