import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrap } from './helpers';

/**
 * Приёмка этапа 0 и раздел 16.2: экспорт и импорт резервной копии,
 * плюс корректный отказ на чужом файле.
 */
test('копия скачивается, читается и загружается обратно', async ({ page }) => {
  await bootstrap(page, 'Копия');

  // Одна запись, чтобы копия была не пустой
  await page.getByRole('button', { name: 'Добавить еду' }).click();
  await page.getByRole('button', { name: 'Быстро' }).click();
  await page.getByLabel('Калории').fill('321');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText(/съедено 321/)).toBeVisible();

  await page.getByRole('button', { name: 'Настройки' }).click();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать копию' }).first().click(),
  ]).then(([d]) => d);

  const path = await download.path();
  expect(path).toBeTruthy();

  const backup = JSON.parse(await readFile(path as string, 'utf8'));
  expect(backup.format).toBe('lenta-backup');
  expect(backup.version).toBe(1);
  expect(backup.tables.diary.length).toBeGreaterThan(0);

  // Предпросмотр импорта того же файла: новых записей нет
  await page.getByRole('button', { name: 'Загрузить копию' }).click();
  await expect(page.getByText('Выбрать файл')).toBeVisible();
  await page.setInputFiles('input[type="file"][accept*="json"]', path as string);
  await expect(page.getByText(/Будет добавлено 0/)).toBeVisible();
  await page.getByRole('radio', { name: 'Заменить всё', exact: true }).click();
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByText('Копия загружена', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.goto('/#/food');
  await expect(page.getByRole('button', { name: /Быстрая запись/ })).toBeVisible();
});

test('импорт чужого файла отклоняется с понятным сообщением', async ({ page }) => {
  await bootstrap(page, 'Чужой файл');

  const alien = join(tmpdir(), 'lenta-alien-backup.json');
  await writeFile(alien, JSON.stringify({ format: 'other-app', version: 9 }));

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Загрузить копию' }).click();
  await expect(page.getByText('Выбрать файл')).toBeVisible();
  await page.setInputFiles('input[type="file"][accept*="json"]', alien);

  await expect(page.getByText('Это не файл резервной копии Lenta.')).toBeVisible();
});
