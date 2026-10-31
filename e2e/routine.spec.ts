import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

test('routine edits validate, survive reload and can be restored after template reset', async ({
  page,
}) => {
  await bootstrap(page, 'Routine fixture');
  await waitForSeed(page);
  await page.goto('/#/gym?section=routines');
  await page.getByRole('button', { name: 'Из шаблона', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Всё тело, 3 дня/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Изменить', exact: true }).first().click();
  await page.getByLabel('Название', { exact: true }).fill('Edited routine');
  await page.getByLabel('Подходов', { exact: true }).first().fill('0');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Подходов', { exact: true }).first().fill('4');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Edited routine/ }).click();
  await expect(page.getByLabel('Подходов', { exact: true }).first()).toHaveValue('4');
  if (process.env.CAPTURE_EVIDENCE === '1') await page.screenshot({
    path: 'docs/audit/redesign/routine-editor-ru-phone.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Вернуть как в шаблоне', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await page.getByRole('button', { name: /Edited routine/ }).click();
  await expect(page.getByLabel('Подходов', { exact: true }).first()).toHaveValue('4');
});

test('calendar plans can be edited, moved and skipped without losing the selected date', async ({
  page,
}) => {
  await bootstrap(page, 'Calendar fixture');
  await page.goto('/#/gym?section=plan&date=2026-01-01');
  await page.getByRole('button', { name: 'Запланировать', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Overdue fixture');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await page.getByLabel('Дата', { exact: true }).fill('2026-01-02');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '2026-01-02', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Еда', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Зал', exact: true }).click();
  await expect(page).toHaveURL(/section=plan.*date=2026-01-02/);
  await page.reload();
  await expect(page.getByRole('button', { name: '2026-01-02', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await expect(page.getByText('Пропущена', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Запланировать', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Move fixture');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Перенести на сегодня', exact: true }).click();
  await expect(page.getByText('Move fixture', { exact: true })).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.getByText('Move fixture', { exact: true })).toBeVisible();
});
