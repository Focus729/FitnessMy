/**
 * Поиск и ранжирование продуктов — раздел 7.1.
 *
 * Порядок выдачи обязателен:
 *   1. Точное совпадение среди избранного
 *   2. Продукты пользователя, по убыванию useCount
 *   3. Недавние (lastUsedAt за 30 дней)
 *   4. Встроенный набор
 *   5. Кэш из сети
 *   6. Живой запрос в сеть — только по явному нажатию
 *
 * Полнотекстовый движок не нужен: сравниваем по предвычисленному searchKey.
 */
import type { Food } from '@/domain/model';

/**
 * Нормализация: нижний регистр, ё→е, схлопывание пробелов и пунктуации.
 * Используется и при сохранении продукта (поле searchKey), и при запросе.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Грубая обрезка русских окончаний: «гречкой» и «гречка» должны совпасть.
 * Полноценный стеммер здесь избыточен — база маленькая и своя.
 */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  const endings = [
    'иями', 'ями', 'ами', 'ого', 'ому', 'ыми', 'ими', 'ая', 'яя', 'ое', 'ее',
    'ой', 'ей', 'ый', 'ий', 'ом', 'ем', 'ах', 'ях', 'ов', 'ев', 'ью', 'ии',
    'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'й', 'ь',
  ];
  // Основа не короче трёх букв: «яйца» и «яйцо» должны сойтись на «яйц».
  for (const e of endings) {
    if (word.length - e.length >= 3 && word.endsWith(e)) return word.slice(0, -e.length);
  }
  return word;
}

export function searchKeyFor(food: Pick<Food, 'name' | 'nameI18n' | 'brand'>): string {
  // Поиск ищет по обоим языкам одновременно, независимо от интерфейса (17).
  const parts = [food.name, food.nameI18n?.ru, food.nameI18n?.en, food.brand].filter(Boolean);
  return normalize(parts.join(' '));
}

export function tokenize(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean).map(stem);
}

/** Совпадает ли продукт со всеми токенами запроса. */
export function matches(searchKey: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.every((t) => searchKey.includes(t));
}

export interface RankOptions {
  now?: number;
  query: string;
}

const SOURCE_RANK: Record<Food['source'], number> = {
  user: 0,
  ai: 0,
  seed: 1,
  off: 2,
  usda: 2,
};

/**
 * Балл продукта. Меньше — выше в списке (сортировка по возрастанию),
 * что напрямую воспроизводит порядок из 7.1.
 */
export function rankFood(food: Food, opts: RankOptions): number {
  const q = normalize(opts.query);
  const now = opts.now ?? Date.now();
  const key = food.searchKey || searchKeyFor(food);

  let tier: number;
  const exact = q.length > 0 && (normalize(food.name) === q || key === q);

  if (food.isFavorite && exact) tier = 0;
  else if (food.isFavorite) tier = 1;
  else if (food.source === 'user' || food.source === 'ai') tier = 2;
  else if (food.lastUsedAt && now - new Date(food.lastUsedAt).getTime() < 30 * 86_400_000) tier = 3;
  else tier = 4 + (SOURCE_RANK[food.source] ?? 3);

  // Внутри уровня: точное совпадение → начало строки → частота → алфавит.
  const startsWith = q.length > 0 && key.startsWith(q) ? 0 : 1;
  const exactBonus = exact ? 0 : 1;
  const frequency = 1 / (1 + food.useCount);

  return tier * 1000 + exactBonus * 100 + startsWith * 10 + frequency;
}

export function searchFoods(foods: Food[], query: string, limit = 50, now?: number): Food[] {
  const tokens = tokenize(query);
  const filtered = query.trim()
    ? foods.filter((f) => matches(f.searchKey || searchKeyFor(f), tokens))
    : foods;
  return [...filtered]
    .sort((a, b) => rankFood(a, { query, now }) - rankFood(b, { query, now }) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Плитки вкладки «Частое» (9.2): избранное + часто используемое, 12 штук.
 * Это путь на 5 секунд, поэтому список стабилен и не зависит от запроса.
 */
export function frequentFoods<T extends { isFavorite: boolean; useCount: number; lastUsedAt?: string }>(
  items: T[],
  limit = 12,
): T[] {
  return [...items]
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
    })
    .slice(0, limit);
}
