import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

test('daily suggestions save only after confirmation and replan remaining slots', async ({ page }) => {
  await bootstrap(page);
  await waitForSeed(page);
  await page.getByRole('button', { name: 'Меню на день', exact: true }).click();
  const menu = page.locator('details').filter({ has: page.getByText('Меню на день', { exact: true }) });
  await menu.locator('summary').first().click();
  const suggestions = menu.getByRole('button', { name: 'Посмотреть порцию' });
  await expect(suggestions).toHaveCount(4);
  const remaining = menu.getByText(/Остаток на день/);
  const before = await remaining.innerText();
  await suggestions.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Записать в дневник' })).toBeEnabled();
  expect(await remaining.innerText()).toBe(before);
  await dialog.getByRole('button', { name: 'Записать в дневник' }).click();
  await expect(suggestions).toHaveCount(3);
  await expect(remaining).not.toHaveText(before);
  await menu.getByRole('button', { name: 'Убрать из меню' }).first().click();
  await expect(suggestions).toHaveCount(2);
  await menu.getByRole('button', { name: /Вернуть в меню/ }).click();
  await expect(suggestions).toHaveCount(3);
});
