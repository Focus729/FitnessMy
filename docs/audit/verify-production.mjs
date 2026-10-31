import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const base = process.env.VERIFY_URL ?? 'http://127.0.0.1:4175/FitnessMy/';
const live = base.startsWith('https:');
const output = new URL(live ? './redesign/live/' : './redesign/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
async function onboard(page, ru, name) {
  await page.getByPlaceholder(ru ? 'Имя профиля' : 'Profile name').fill(name);
  await page
    .getByRole('button', { name: ru ? 'Новый профиль' : 'New profile', exact: true })
    .click();
  for (let index = 0; index < 4; index++) {
    if (index === 1) await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: ru ? 'Далее' : 'Next', exact: true }).click();
  }
  await page.getByLabel(ru ? 'Стартовый вес' : 'Starting weight').fill('80');
  for (let index = 0; index < 2; index++)
    await page.getByRole('button', { name: ru ? 'Далее' : 'Next', exact: true }).click();
  await page.getByRole('button', { name: ru ? 'Готово' : 'Done', exact: true }).click();
  await page.getByRole('navigation').waitFor();
}
const results = [];
try {
  for (const [locale, width, colorScheme] of [
    ['ru-RU', 390, 'light'],
    ['en-US', 1440, 'dark'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      locale,
      colorScheme,
    });
    const page = await context.newPage();
    const errors = [];
    const assetFailures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.url().startsWith(base) && response.status() >= 400)
        assetFailures.push(response.url());
    });
    const ru = locale === 'ru-RU';
    await page.goto(base);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    expect(await page.locator('link[rel="manifest"]').evaluate(link => link.href)).toBe(`${base}manifest.webmanifest`);
    const manifest = await (await page.request.get(`${base}manifest.webmanifest`)).json();
    expect(manifest.start_url).toBe('/FitnessMy/');
    expect(manifest.scope).toBe('/FitnessMy/');
    const identity = await (await page.request.get(`${base}build-info.json`)).json();
    expect(identity.base).toBe('/FitnessMy/');
    if (process.env.EXPECTED_REVISION)
      expect(identity.revision).toBe(process.env.EXPECTED_REVISION);
    await onboard(page, ru, 'Production-path fixture');
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(base);
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: ru ? 'Добавить еду' : 'Add food', exact: true }).click();
    await page.getByRole('button', { name: ru ? 'Быстро' : 'Quick', exact: true }).click();
    await page.getByLabel(ru ? 'Калории' : 'Calories', { exact: true }).fill('123.5');
    await page.getByRole('button', { name: ru ? 'Сохранить' : 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto(`${base}#/food`);
    await page.getByRole('button', { name: ru ? /Быстрая запись/ : /Quick entry/ }).click();
    await expect(
      page.getByRole('dialog').getByLabel(ru ? 'ккал' : 'kcal', { exact: true }),
    ).toHaveValue('123.5');
    await page
      .getByRole('dialog')
      .getByLabel(ru ? 'ккал' : 'kcal', { exact: true })
      .fill('124.5');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: ru ? 'Сохранить' : 'Save', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('button', { name: ru ? /Быстрая запись/ : /Quick entry/ }),
    ).toBeVisible();
    await page.screenshot({
      path: new URL(`${locale}-production-offline.png`, output).pathname.replace(
        /^\/([A-Z]:)/i,
        '$1',
      ),
      fullPage: false,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
    expect(errors).toEqual([]);
    expect(assetFailures).toEqual([]);
    await page.goto(`${base}#/settings`);
    await page.getByRole('radio', { name: ru ? 'Имперские' : 'Imperial', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: ru ? 'Имперские' : 'Imperial', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.goto(`${base}#/body?date=2026-10-20`);
    await page.getByLabel(ru ? 'Записать вес' : 'Log weight', { exact: true }).fill('176.37');
    await page.getByRole('button', { name: ru ? 'Сохранить' : 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(ru ? 'Готово' : 'Done');
    const readWeight = () =>
      page.evaluate(async () => {
        const name = (await indexedDB.databases()).find((db) =>
          db.name?.startsWith('lenta_p_'),
        ).name;
        return new Promise((resolve) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('body').objectStore('body').getAll();
            read.onsuccess = () => {
              db.close();
              resolve(read.result.find((row) => row.date === '2026-10-20').weightKg);
            };
          };
        });
      });
    const canonicalWeight = await readWeight();
    expect(canonicalWeight).toBeCloseTo(80, 2);
    await page.goto(`${base}#/settings`);
    await page.getByRole('radio', { name: ru ? 'Метрические' : 'Metric', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: ru ? 'Метрические' : 'Metric', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(await readWeight()).toBe(canonicalWeight);
    await page.goto(`${base}#/gym`);
    await page
      .getByRole('button', { name: ru ? 'Свободная тренировка' : 'Free workout', exact: true })
      .click();
    await page
      .getByRole('button', { name: ru ? 'Добавить упражнение' : 'Add exercise', exact: true })
      .click();
    await page.getByPlaceholder(ru ? 'Название упражнения' : 'Exercise name').fill('Barbell Squat');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Приседания со штангой|Barbell Squat/ })
      .first()
      .click();
    await page
      .getByLabel(ru ? 'Вес' : 'Weight', { exact: true })
      .first()
      .fill('60.5');
    await page
      .getByLabel(ru ? 'Повторы' : 'Reps', { exact: true })
      .first()
      .fill('8');
    await page
      .getByRole('button', { name: ru ? 'Готово' : 'Done', exact: true })
      .first()
      .click();
    await expect(page.getByText(ru ? 'Отдых' : 'Rest', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(ru ? 'Вес' : 'Weight', { exact: true }).first()).toHaveValue(
      '60.5',
    );
    await expect(page.getByText(ru ? 'Отдых' : 'Rest', { exact: true })).toBeVisible();
    await page.goto(`${base}#/`);
    await context.setOffline(false);
    const updateRevision = live ? null : `local-update-fixture-${locale}-${Date.now()}`;
    if (!live) {
      const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
        env: { ...process.env, APP_BASE_PATH: '/FitnessMy/', BUILD_REVISION: updateRevision },
        encoding: 'utf8',
      });
      if (build.status !== 0)
        throw new Error(build.stderr || build.stdout || 'Update fixture build failed');
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.ready).update();
      });
      const update = page.getByRole('button', { name: ru ? 'Обновить' : 'Update', exact: true });
      await expect(update).toBeVisible({ timeout: 30000 });
      await update.click();
      await expect(update).toHaveCount(0);
    }
    await page.getByRole('button', { name: ru ? 'Продолжить' : 'Continue', exact: true }).click();
    await expect(page.getByLabel(ru ? 'Вес' : 'Weight', { exact: true }).first()).toHaveValue(
      '60.5',
    );
    await expect(page.getByLabel(ru ? 'Повторы' : 'Reps', { exact: true }).first()).toHaveValue(
      '8',
    );
    await page.screenshot({
      path: new URL(`${locale}-production-update.png`, output).pathname.replace(
        /^\/([A-Z]:)/i,
        '$1',
      ),
      fullPage: false,
    });
    expect(errors).toEqual([]);
    expect(assetFailures).toEqual([]);
    await page.goto(`${base}#/settings`);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page
        .getByRole('button', { name: ru ? 'Скачать копию' : 'Download backup', exact: true })
        .first()
        .click(),
    ]);
    const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    expect(backup.tables.diary.some((row) => row.nutrients.kcal === 124.5)).toBe(true);
    await page
      .getByRole('button', { name: ru ? 'Загрузить копию' : 'Load backup', exact: true })
      .click();
    await page.setInputFiles('input[type="file"][accept*="json"]', backupPath);
    await page
      .getByRole('radio', { name: ru ? 'Заменить всё' : 'Replace everything', exact: true })
      .click();
    await page.getByRole('button', { name: ru ? 'Применить' : 'Apply', exact: true }).click();
    await expect(
      page.getByText(ru ? 'Копия загружена' : 'Backup loaded', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: ru ? 'Закрыть' : 'Close', exact: true })
      .click();
    await page.getByRole('button', { name: /Production-path fixture/ }).click();
    await onboard(page, ru, 'Isolated fixture');
    await page.goto(`${base}#/food`);
    await expect(
      page.getByRole('button', { name: ru ? /Быстрая запись/ : /Quick entry/ }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: /Isolated fixture/ }).click();
    await page.getByRole('button', { name: 'Production-path fixture', exact: true }).click();
    await page.goto(`${base}#/food`);
    await expect(
      page.getByRole('button', { name: ru ? /Быстрая запись/ : /Quick entry/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    results.push({
      locale,
      width,
      scope,
      revision: identity.revision,
      updateRevision,
      offlineReload: true,
      offlineFoodSave: true,
      offlineWorkoutResume: true,
      explicitUpdatePreservesWorkout: !live,
      backupRoundTrip: true,
      profileIsolation: true,
      canonicalWeight,
      unitSwitchPreservesData: true,
      errors,
      assetFailures,
    });
    await context.close();
  }
  await writeFile(
    new URL('production-path-results.json', output),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
