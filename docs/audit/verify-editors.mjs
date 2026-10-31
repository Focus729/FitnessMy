import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4175/FitnessMy/';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const results = [];
try {
  for (const ru of [true, false]) {
    const locale = ru ? 'ru-RU' : 'en-US';
    const context = await browser.newContext({
      locale,
      viewport: { width: ru ? 390 : 1440, height: 1000 },
      colorScheme: ru ? 'light' : 'dark',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByPlaceholder(ru ? 'Имя профиля' : 'Profile name').fill('Editor fixture');
    await page
      .getByRole('button', { name: ru ? 'Новый профиль' : 'New profile', exact: true })
      .click();
    for (let i = 0; i < 4; i++) {
      if (i === 1) await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: ru ? 'Далее' : 'Next', exact: true }).click();
    }
    await page.getByLabel(ru ? 'Стартовый вес' : 'Starting weight').fill('80');
    for (let i = 0; i < 2; i++)
      await page.getByRole('button', { name: ru ? 'Далее' : 'Next', exact: true }).click();
    await page.getByRole('button', { name: ru ? 'Готово' : 'Done', exact: true }).click();
    await page.getByRole('navigation').waitFor();
    await page.goto(`${base}#/gym?section=routines`);
    await page
      .getByRole('button', { name: ru ? 'Из шаблона' : 'From a template', exact: true })
      .click();
    await page.getByRole('dialog').locator('li button').first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByRole('button', { name: ru ? 'Изменить' : 'Edit', exact: true })
      .first()
      .click();
    await page.screenshot({ path: `docs/audit/redesign/editor-${locale}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const id = localStorage.getItem('lenta.activeProfile.v1');
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(`lenta_p_${id}`);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('settings', 'readwrite');
          const table = tx.objectStore('settings');
          const read = table.get('singleton');
          read.onsuccess = () => table.put({ ...read.result, units: 'imperial' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.goto(`${base}#/body`);
    await page.reload();
    await page.getByRole('button', { name: ru ? 'Замеры' : 'Measurements', exact: true }).click();
    await page.getByLabel(ru ? 'Талия' : 'Waist', { exact: true }).fill('40');
    await page.screenshot({
      path: `docs/audit/redesign/measurements-${locale}.png`,
      fullPage: true,
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: ru ? 'Сохранить' : 'Save', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const waist = await page.evaluate(
      async () =>
        new Promise((resolve) => {
          const request = indexedDB.open(
            `lenta_p_${localStorage.getItem('lenta.activeProfile.v1')}`,
          );
          request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('body').objectStore('body').getAll();
            read.onsuccess = () => {
              db.close();
              resolve(read.result.find((row) => row.measurements?.waist)?.measurements.waist);
            };
          };
        }),
    );
    expect(waist).toBeCloseTo(101.6, 5);
    await page.evaluate(() => {
      const profiles = JSON.parse(localStorage.getItem('lenta.profiles.v1'));
      profiles[0].createdAt = '2025-01-01T00:00:00.000Z';
      localStorage.setItem('lenta.profiles.v1', JSON.stringify(profiles));
    });
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: ru ? 'Пора сделать резервную копию' : 'Time for a backup' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: ru ? 'Напомнить завтра' : 'Remind me tomorrow', exact: true })
      .click();
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const snooze = await page.evaluate(() =>
      localStorage.getItem(
        `lenta.backupSnoozeUntil.${localStorage.getItem('lenta.activeProfile.v1')}`,
      ),
    );
    expect(Date.parse(snooze)).toBeGreaterThan(Date.now());
    expect(errors).toEqual([]);
    results.push({ locale, waistCm: waist, backupReminderAndSnooze: 'passed', errors });
    await context.close();
  }
  await writeFile('docs/audit/redesign/editor-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
