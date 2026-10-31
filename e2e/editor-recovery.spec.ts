import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

for (const kind of ['foods', 'recipes', 'habits'] as const) {
  test(`${kind} editor protects drafts and retries a failed save exactly once`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        if (this.name === localStorage.getItem('fixture.failTable')) {
          throw new DOMException('Synthetic failure', 'QuotaExceededError');
        }
        return original.call(this, value, key);
      };
    });
    await bootstrap(page, 'Editor recovery');
    await waitForSeed(page);
    if (kind === 'foods') {
      await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
      await page.getByRole('button', { name: 'Поиск', exact: true }).click();
      await page.getByPlaceholder('Название продукта').fill('New product fixture');
      await page.getByRole('button', { name: 'Создать продукт', exact: true }).click();
      await page.getByLabel('ккал', { exact: true }).fill('123,5');
    } else if (kind === 'recipes') {
      await page.goto('/#/food?section=recipes');
      await page.getByRole('button', { name: 'Новый рецепт', exact: true }).click();
      await page.getByPlaceholder('Название продукта').fill('гречка');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Гречка/ })
        .first()
        .click();
      await page.getByLabel('Вес готового блюда', { exact: true }).fill('150');
    } else {
      await page.goto('/#/body?section=habits');
      await page.getByRole('button', { name: 'Новая привычка', exact: true }).click();
    }
    const name = `${kind} draft fixture`;
    await page.getByRole('dialog').last().getByLabel('Название', { exact: true }).fill(name);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Введённое не сохранено', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить ввод', exact: true }).click();
    await page.evaluate((table) => localStorage.setItem('fixture.failTable', table), kind);
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Сохранить', exact: true })
      .click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('dialog').last().getByLabel('Название', { exact: true }),
    ).toHaveValue(name);
    if (process.env.CAPTURE_EVIDENCE === '1') await page.screenshot({
      path: `docs/audit/redesign/${kind}-save-error-ru.png`,
      fullPage: true,
    });
    await page.evaluate(() => localStorage.removeItem('fixture.failTable'));
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Сохранить', exact: true })
      .click();
    if (kind === 'foods') await expect(page.getByLabel('Сколько', { exact: true })).toBeVisible();
    else await expect(page.getByRole('dialog')).toHaveCount(0);
    const count = await page.evaluate(
      async ({ table, name }) =>
        new Promise<number>((resolve) => {
          const request = indexedDB.open(
            `lenta_p_${localStorage.getItem('lenta.activeProfile.v1')}`,
          );
          request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction(table).objectStore(table).getAll();
            read.onsuccess = () => {
              db.close();
              resolve(read.result.filter((row) => row.name === name).length);
            };
          };
        }),
      { table: kind, name },
    );
    expect(count).toBe(1);
    if (kind === 'recipes') {
      await page.getByRole('button', { name: 'Удалить', exact: true }).click();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });
}
