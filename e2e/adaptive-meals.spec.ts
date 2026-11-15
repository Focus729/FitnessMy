import { expect, test } from '@playwright/test';
import { bootstrap, waitForSeed } from './helpers';

test.beforeEach(async ({ page }) => {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  await page.clock.setFixedTime(noon);
});

test('daily suggestions save only after confirmation and replan remaining slots', async ({ page }) => {
  await bootstrap(page);
  await waitForSeed(page);
  await page.getByRole('button', { name: 'Меню на день', exact: true }).click();
  const menu = page.locator('details.adaptive-meals');
  const second = menu.getByRole('button', { name: 'Меню 2', exact: true });
  await expect(menu.getByRole('button', { name: 'Меню 3', exact: true })).toBeVisible();
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  const suggestions = menu.getByRole('button', { name: 'Посмотреть порцию' });
  await expect(suggestions).toHaveCount(4);
  const remaining = menu.getByText(/Остаток на день/);
  const before = await remaining.innerText();
  const dish = menu.getByRole('article').locator('.menu-dish').first();
  const dishName = await dish.innerText();
  await dish.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(dishName);
  await expect(dialog.getByRole('heading', { name: 'Ингредиенты' })).toBeVisible();
  await expect(dialog.locator('ol li')).toHaveCount(2);
  const firstAmount = dialog.locator('ul li .tnum').first();
  const initialAmount = Number.parseFloat(await firstAmount.innerText());
  await dialog.getByLabel('Размер порции').fill('75');
  expect(Number.parseFloat(await firstAmount.innerText())).toBe(Math.round(initialAmount * 0.75));
  await expect(dialog.getByRole('button', { name: 'Записать в дневник' })).toBeEnabled();
  expect(await remaining.innerText()).toBe(before);
  await dialog.getByRole('button', { name: 'Записать в дневник' }).click();
  await expect(suggestions).toHaveCount(3);
  await expect(remaining).not.toHaveText(before);
  await expect(menu.getByText('Порция записана в дневник.')).toBeVisible();
  await expect(menu.getByRole('article').filter({ hasText: 'Завтрак' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Убрать из меню' }).first().click();
  await expect(suggestions).toHaveCount(2);
  await menu.getByRole('button', { name: /Вернуть в меню/ }).click();
  await expect(suggestions).toHaveCount(3);
  for (let n = 3; n > 0; n--) {
    await menu.getByRole('button', { name: 'Убрать из меню' }).first().click();
    await expect(suggestions).toHaveCount(n - 1);
  }
  await expect(menu.getByText('Открытых приёмов пищи нет.')).toBeVisible();
  await expect(menu.getByText('Меню на завтра', { exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Меню 3', exact: true })).toBeVisible();
});

test('desktop compares all menus; phone switches frames without overflow', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await bootstrap(page);
  await waitForSeed(page);
  await page.getByRole('button', { name: 'Меню на день', exact: true }).click();
  const menu = page.locator('details.adaptive-meals');
  const frames = menu.getByRole('article');
  await expect(frames).toHaveCount(3);
  const dishes = await frames.evaluateAll((items) =>
    items.map((item) => Array.from(item.querySelectorAll('.menu-dish'), (dish) => dish.textContent)),
  );
  dishes.forEach((variant, index) => {
    expect(variant).toHaveLength(4);
    for (const other of dishes.slice(index + 1)) {
      expect(variant.filter((dish, slot) => dish !== other[slot]).length).toBeGreaterThanOrEqual(2);
    }
  });
  await frames.nth(1).getByRole('button', { name: 'Выбрать меню' }).click();
  await expect(frames.nth(1)).toHaveAttribute('data-selected', 'true');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('menu-desktop-ru-dark.png') });
  await menu.getByText('Исключить ингредиенты', { exact: true }).click();
  const ingredient = menu.getByLabel('Выбрать ингредиент');
  await ingredient.selectOption('seed-chicken-breast');
  await menu.getByRole('button', { name: 'Исключить', exact: true }).click();
  await expect(menu.getByRole('button', { name: /Вернуть:/ })).toBeVisible();
  await expect(menu.locator('.menu-dish').filter({ hasText: /курица/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await page.getByRole('link', { name: 'Food', exact: true }).click();
  await expect(menu.getByRole('article', { name: 'Menu 1' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(menu.getByRole('article')).toHaveCount(1);
    await menu.getByRole('button', { name: 'Menu 3', exact: true }).click();
    await expect(menu.getByRole('article', { name: 'Menu 3' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: info.outputPath('menu-phone-en-light.png') });
  const preferred = menu.getByRole('button', { name: 'Preferred ingredients · 0' });
  await preferred.click();
  const picker = page.getByRole('dialog', { name: 'Preferred ingredients' });
  await picker.getByRole('searchbox').fill('zzzz no ingredient');
  await expect(picker.getByText('No ingredients found.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preferred).toBeFocused();
  await menu.getByRole('article').locator('.menu-dish').first().click();
  const recipe = page.getByRole('dialog');
  await expect(recipe.getByRole('heading', { name: 'Preparation' })).toBeVisible();
  await expect(recipe.locator('ol li')).toHaveCount(2);
  await expect(recipe.getByRole('heading', { name: 'Ingredients', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath('recipe-phone-en-light.png') });
});
