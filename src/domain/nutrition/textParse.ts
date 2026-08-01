/**
 * Детерминированный разбор строки «200 г гречки и куриная грудка» — раздел 15.2.
 *
 * Это ПОЛНОЦЕННАЯ реализация, а не заглушка: она работает без ключа AI и без сети.
 * AI-версия того же сценария лишь добавляется поверх.
 */
import type { Food, Serving } from '@/domain/model';
import { normalize, tokenize, matches, rankFood } from './search';

export interface ParsedItem {
  /** Исходный фрагмент строки. */
  raw: string;
  /** Что удалось распознать как количество. */
  grams?: number;
  servingCount?: number;
  servingName?: string;
  /** Найденный продукт, если совпадение нашлось. */
  food?: Food;
  query: string;
  confidence: 'low' | 'medium' | 'high';
}

const UNIT_TO_GRAMS: Record<string, number> = {
  г: 1,
  гр: 1,
  грамм: 1,
  граммов: 1,
  g: 1,
  gram: 1,
  grams: 1,
  кг: 1000,
  kg: 1000,
  мл: 1,
  ml: 1,
  л: 1000,
  l: 1000,
};

/** Слова-порции: ищем среди servings продукта. */
const PIECE_WORDS = ['шт', 'штук', 'штуки', 'pcs', 'piece', 'pieces'];

/**
 * Разделители фрагментов. Союз «и» отделяется пробелами явно: `\b` в JS
 * работает по ASCII и на кириллице границу слова не находит.
 */
const SPLIT_RE = /\s*[,;+\n]\s*|\s+(?:и|and)\s+/gi;

/** Граница «штук против граммов» для числа без распознанной единицы. */
const SERVING_COUNT_LIMIT = 20;

export function splitPhrases(input: string): string[] {
  return input
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Разбирает один фрагмент: количество + единица + название. */
export function parsePhrase(phrase: string, foods: Food[]): ParsedItem {
  const cleaned = phrase.trim();
  const m = /^(\d+(?:[.,]\d+)?)\s*([а-яa-z]+)?\s*(.*)$/i.exec(cleaned);

  let grams: number | undefined;
  let servingCount: number | undefined;
  let servingName: string | undefined;
  let query = cleaned;

  if (m) {
    const amount = parseFloat((m[1] ?? '0').replace(',', '.'));
    const unit = normalize(m[2] ?? '');
    const rest = (m[3] ?? '').trim();

    if (unit && UNIT_TO_GRAMS[unit] != null) {
      grams = amount * (UNIT_TO_GRAMS[unit] as number);
      query = rest || cleaned;
    } else if (unit && PIECE_WORDS.includes(unit)) {
      servingCount = amount;
      servingName = unit;
      query = rest || cleaned;
    } else {
      // Единица не распознана — значит, это часть названия: «2 яйца», «3 банана».
      query = [m[2], rest].filter(Boolean).join(' ').trim() || cleaned;
      // Небольшое число перед названием — это количество порций,
      // большое — почти наверняка граммы («300 гречка»).
      if (amount <= SERVING_COUNT_LIMIT) servingCount = amount;
      else grams = amount;
    }
  }

  const tokens = tokenize(query);
  const candidates = foods
    .filter((f) => matches(f.searchKey, tokens))
    .sort((a, b) => rankFood(a, { query }) - rankFood(b, { query }));
  const food = candidates[0];

  let resolvedGrams = grams;
  if (resolvedGrams == null && food) {
    if (servingCount != null) {
      const serving = pickServing(food.servings, servingName);
      if (serving) resolvedGrams = Math.round(servingCount * serving.grams);
    }
    if (resolvedGrams == null) resolvedGrams = food.lastGrams ?? defaultServingGrams(food);
  }

  const confidence: ParsedItem['confidence'] =
    food && grams != null ? 'high' : food ? 'medium' : 'low';

  return {
    raw: cleaned,
    grams: resolvedGrams,
    servingCount,
    servingName,
    food,
    query,
    confidence,
  };
}

export function parseFoodText(input: string, foods: Food[]): ParsedItem[] {
  return splitPhrases(input).map((p) => parsePhrase(p, foods));
}

function pickServing(servings: Serving[], name?: string): Serving | undefined {
  if (!servings.length) return undefined;
  if (name) {
    const n = normalize(name);
    const found = servings.find((s) => normalize(s.name).includes(n));
    if (found) return found;
  }
  return servings.find((s) => s.isDefault) ?? servings[0];
}

export function defaultServingGrams(food: Food): number {
  const def = food.servings.find((s) => s.isDefault) ?? food.servings[0];
  return def?.grams ?? 100;
}
