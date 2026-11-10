import type { Page } from '@playwright/test';

/** Проходит выбор профиля и онбординг до главного экрана. */
export async function bootstrap(page: Page, profileName = 'Тест'): Promise<void> {
  await page.goto('/');

  // Экран выбора профиля
  await page.getByPlaceholder('Имя профиля').fill(profileName);
  await page.getByRole('button', { name: 'Новый профиль' }).click();
  await completeOnboarding(page);
}

export async function completeOnboarding(page: Page): Promise<void> {
  // 1 — язык
  await page.getByRole('button', { name: 'Далее' }).click();
  // 2 — профиль
  await page
    .getByRole('checkbox', {
      name: 'Я проверил имя, пол, дату рождения и рост',
    })
    .check();
  await page.getByRole('button', { name: 'Далее' }).click();
  // 3 — цель
  await page.getByRole('button', { name: 'Далее' }).click();
  // 4 — активность
  await page.getByRole('button', { name: 'Далее' }).click();
  // 5 — стартовый вес
  await page.getByLabel('Стартовый вес').fill('80');
  await page.getByRole('button', { name: 'Далее' }).click();
  // 6 — хранилище
  await page.getByRole('button', { name: 'Далее' }).click();
  // Экран расчёта нормы
  await page.getByRole('button', { name: 'Готово' }).click();

  await page.getByText('Осталось').waitFor();
}

/** Ждёт, пока встроенные наборы загрузятся в IndexedDB. */
export async function waitForSeed(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const dbs = await indexedDB.databases();
      const name = dbs.find((d) => d.name?.startsWith('lenta_p_'))?.name;
      if (!name) return false;
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('foods')) return resolve(false);
          const count = db.transaction('foods').objectStore('foods').count();
          count.onsuccess = () => resolve(count.result > 100);
          count.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    },
    undefined,
    { timeout: 30_000 },
  );
}
