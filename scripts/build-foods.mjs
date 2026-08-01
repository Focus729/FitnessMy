/**
 * Сборка встроенного набора продуктов — раздел 7.1, слой 1.
 *
 * ВАЖНО про источники (юридическое замечание из 7.1):
 *   • во встроенный набор попадают только базовые продукты, чьи значения
 *     соответствуют публичным данным USDA FoodData Central (общественное
 *     достояние); пищевая ценность базовых продуктов — это факты, они не
 *     являются объектом авторского права;
 *   • выгрузку Open Food Facts включать сюда НЕЛЬЗЯ: её лицензия ODbL
 *     содержит условие share-alike и создаёт обязательства для производной базы.
 *     OFF используется только через API во время работы (слой 2).
 *
 * Набор намеренно состоит из ПРОДУКТОВ, а не брендовых товаров: именно из них
 * состоит домашняя еда. Русские позиции добавлены отдельно, потому что
 * бесплатные базы плохо покрывают российский рынок (решение 2.8).
 *
 * Формат строки:
 *   [ru, en, kcal, protein, fat, carb, fiber, sugar, sodiumMg, category, basis, servings]
 * Значения — на 100 г (или 100 мл для basis='volume').
 * servings — массив пар [название_ru|название_en, граммы].
 *
 * Запуск: node scripts/build-foods.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { FOODS } from './foods-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'src/data/seed/foods.json');

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function slug(en) {
  return `seed-${normalize(en).replace(/\s+/g, '-')}`;
}

function run() {
  const out = [];
  const seen = new Set();

  for (const row of FOODS) {
    const [ru, en, kcal, protein, fat, carb, fiber, sugar, sodium, category, basis, servings] = row;
    const id = slug(en);
    if (seen.has(id)) throw new Error(`Дубликат продукта: ${en}`);
    seen.add(id);

    out.push({
      id,
      name: ru,
      nameI18n: { ru, en },
      per100: {
        kcal,
        proteinG: protein,
        fatG: fat,
        carbG: carb,
        ...(fiber != null ? { fiberG: fiber } : {}),
        ...(sugar != null ? { sugarG: sugar } : {}),
        ...(sodium != null ? { sodiumMg: sodium } : {}),
      },
      servings: (servings ?? []).map(([name, grams], i) => ({
        id: `${id}-s${i}`,
        name,
        grams,
        ...(i === 0 ? { isDefault: true } : {}),
      })),
      basis: basis ?? 'mass',
      category,
      searchKey: normalize(`${ru} ${en}`),
    });
  }

  const json = JSON.stringify(out);
  return mkdir(dirname(OUT), { recursive: true })
    .then(() => writeFile(OUT, json))
    .then(() => {
      process.stdout.write(
        `Продуктов: ${out.length}\n` +
          `Файл: ${(json.length / 1024).toFixed(0)} КБ, gzip ${(gzipSync(json).length / 1024).toFixed(1)} КБ\n`,
      );
    });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
