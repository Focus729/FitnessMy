/**
 * Индекс питания — раздел 9.6.
 *
 * Собственная прозрачная формула 0–100. Требование ТЗ: при нажатии на индекс
 * раскрывается разбор по каждому компоненту с цифрами, поэтому функция
 * возвращает не число, а полный разбор.
 *
 * Если данных NOVA нет, компонент «степень переработки» исключается,
 * а веса остальных пропорционально увеличиваются.
 */
import type { Nutrients } from '@/domain/model';

export type IndexComponentKey =
  | 'protein'
  | 'fiber'
  | 'sugar'
  | 'sodium'
  | 'variety'
  | 'processing';

export interface IndexComponent {
  key: IndexComponentKey;
  /** Базовый вес по ТЗ. */
  baseWeight: number;
  /** Фактический вес после перераспределения. */
  weight: number;
  /** Доля выполнения 0..1. */
  score: number;
  /** Набранные баллы = weight × score. */
  points: number;
  /** Цифры для разбора. */
  value: number;
  target: number;
  applicable: boolean;
}

export interface FoodIndexResult {
  score: number;
  components: IndexComponent[];
}

export interface FoodIndexInput {
  totals: Nutrients;
  targets: { proteinG: number; fiberG: number; sugarMaxG: number; sodiumMaxMg: number };
  /** Число различных продуктов за период (для дня — за день, для недели — за неделю). */
  distinctFoods: number;
  /** Масса продуктов NOVA-4 и общая масса с известной группой NOVA. */
  nova?: { group4Grams: number; knownGrams: number };
}

const BASE_WEIGHTS: Record<IndexComponentKey, number> = {
  protein: 25,
  fiber: 25,
  sugar: 15,
  sodium: 10,
  variety: 15,
  processing: 10,
};

/** Доля от цели, максимум при 100%, дальше без роста. */
function upToTarget(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp01(value / target);
}

/** Полный балл ниже границы, линейно до 0 при двукратном превышении. */
function underLimit(value: number, limit: number): number {
  if (limit <= 0) return 0;
  if (value <= limit) return 1;
  if (value >= limit * 2) return 0;
  return 1 - (value - limit) / limit;
}

/** Разнообразие: 0 при <10 продуктов, максимум при ≥30. */
export function varietyScore(distinct: number): number {
  if (distinct < 10) return 0;
  if (distinct >= 30) return 1;
  return (distinct - 10) / 20;
}

export function computeFoodIndex(input: FoodIndexInput): FoodIndexResult {
  const { totals, targets } = input;
  const novaKnown = (input.nova?.knownGrams ?? 0) > 0;
  const novaShare = novaKnown ? input.nova!.group4Grams / input.nova!.knownGrams : 0;

  const raw: Omit<IndexComponent, 'weight' | 'points'>[] = [
    {
      key: 'protein',
      baseWeight: BASE_WEIGHTS.protein,
      score: upToTarget(totals.proteinG, targets.proteinG),
      value: round1(totals.proteinG),
      target: targets.proteinG,
      applicable: true,
    },
    {
      key: 'fiber',
      baseWeight: BASE_WEIGHTS.fiber,
      score: upToTarget(totals.fiberG ?? 0, targets.fiberG),
      value: round1(totals.fiberG ?? 0),
      target: targets.fiberG,
      applicable: true,
    },
    {
      key: 'sugar',
      baseWeight: BASE_WEIGHTS.sugar,
      score: underLimit(totals.sugarG ?? 0, targets.sugarMaxG),
      value: round1(totals.sugarG ?? 0),
      target: targets.sugarMaxG,
      applicable: true,
    },
    {
      key: 'sodium',
      baseWeight: BASE_WEIGHTS.sodium,
      score: underLimit(totals.sodiumMg ?? 0, targets.sodiumMaxMg),
      value: Math.round(totals.sodiumMg ?? 0),
      target: targets.sodiumMaxMg,
      applicable: true,
    },
    {
      key: 'variety',
      baseWeight: BASE_WEIGHTS.variety,
      score: varietyScore(input.distinctFoods),
      value: input.distinctFoods,
      target: 30,
      applicable: true,
    },
    {
      key: 'processing',
      baseWeight: BASE_WEIGHTS.processing,
      score: 1 - clamp01(novaShare),
      value: Math.round(novaShare * 100),
      target: 0,
      applicable: novaKnown,
    },
  ];

  const applicableWeight = raw.filter((c) => c.applicable).reduce((s, c) => s + c.baseWeight, 0);
  const factor = applicableWeight > 0 ? 100 / applicableWeight : 0;

  const components: IndexComponent[] = raw.map((c) => {
    const weight = c.applicable ? round1(c.baseWeight * factor) : 0;
    return { ...c, weight, points: round1(weight * c.score) };
  });

  const score = Math.round(components.reduce((s, c) => s + c.points, 0));
  return { score: clamp(score, 0, 100), components };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
