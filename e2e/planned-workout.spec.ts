import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

test('Today opens the selected plan and finished workouts remain editable and recoverable', async ({
  page,
}) => {
  await bootstrap(page, 'Plan regression');
  await waitForSeed(page);
  await page.goto('/#/gym?section=plan');
  await page.getByRole('button', { name: 'Запланировать', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Planned fixture');
  await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
  await page.getByPlaceholder('Название упражнения').fill('Barbell Squat');
  await page
    .getByRole('button', { name: /Приседания со штангой|Barbell Squat/ })
    .first()
    .click();
  await page.getByLabel('Целевой вес', { exact: true }).fill('60');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.getByText('Planned fixture', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page).toHaveURL(/section=plan/);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByLabel('Вес', { exact: true }).first()).toHaveValue('60');
  await page.getByLabel('Повторы', { exact: true }).first().fill('8');
  await page.getByRole('button', { name: 'Готово', exact: true }).first().click();
  await expect(page.getByText('Отдых', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть тренировку', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await page.getByLabel('Вес', { exact: true }).first().fill('70.5');
  await expect(page.getByText('564,0', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(page.getByLabel('Вес', { exact: true }).first()).toHaveValue('70.5');
  await page.goto('/#/gym');
  await page.getByRole('button', { name: 'Удалить тренировку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть тренировку', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть тренировку', exact: true })).toBeVisible();
});
