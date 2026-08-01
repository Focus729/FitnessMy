/**
 * Планировщик меню на неделю и список покупок — раздел 9.5.
 *
 * Работает БЕЗ AI. Жадный подбор с локальными улучшениями: задача маленькая,
 * полный перебор не нужен, важна предсказуемость и скорость.
 *
 * Критерий приёмки этапа 5: день сходится по калориям в пределах ±5%,
 * белок — не ниже цели.
 */
import type { LocalDate, Nutrients } from '@/domain/model';
import { mul, add, ZERO, round2 } from './nutrients';

export interface PlanCandidate {
  refId: string;
  kind: 'dish' | 'recipe' | 'food';
  name: string;
  /** Ценность одной «стандартной» подачи. */
  per100: Nutrients;
  /** Базовая порция в граммах. */
  baseGrams: number;
  /** Сколько раз в неделю допустимо. */
  maxPerWeek: number;
  /** В какие слоты это блюдо уместно. Пусто — в любые. */
  allowedSlotIds?: string[];
  /** Ингредиенты для списка покупок. */
  components?: { foodId: string; name: string; grams: number; category: string }[];
}

export interface PlanTargets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

export interface PlanSlotSpec {
  mealSlotId: string;
  /** Доля дневных калорий на этот слот. Сумма долей нормализуется. */
  share: number;
}

export interface PlannedSlot {
  mealSlotId: string;
  kind: PlanCandidate['kind'];
  refId: string;
  name: string;
  grams: number;
  nutrients: Nutrients;
  pinned?: boolean;
}

export interface PlannedDay {
  date: LocalDate;
  slots: PlannedSlot[];
  totals: Nutrients;
  kcalDeviation: number;
  meetsProtein: boolean;
}

export interface PlanResult {
  days: PlannedDay[];
  /** Максимальное отклонение по калориям среди дней, доля. */
  worstDeviation: number;
  ok: boolean;
}

const MIN_GRAMS = 30;
const MAX_GRAMS = 900;
const GRAM_STEP = 10;

/** Ценность порции кандидата в заданной граммовке. */
export function candidateNutrients(c: PlanCandidate, grams: number): Nutrients {
  return mul(c.per100, grams / 100);
}

/**
 * Раскладка на неделю. Детерминирована: при одинаковом входе — одинаковый выход.
 * `seedOrder` задаёт стабильный обход кандидатов вместо случайного.
 */
export function planWeek(args: {
  dates: LocalDate[];
  slots: PlanSlotSpec[];
  candidates: PlanCandidate[];
  targets: PlanTargets;
  /** Уже зафиксированные пользователем позиции («не трогать при пересчёте»). */
  pinned?: Record<LocalDate, PlannedSlot[]>;
}): PlanResult {
  const { dates, slots, candidates, targets } = args;
  const shareSum = slots.reduce((s, x) => s + x.share, 0) || 1;
  const usage = new Map<string, number>();
  const days: PlannedDay[] = [];

  // Стабильный порядок: сначала более белковые на 100 ккал — так проще добрать белок.
  const ordered = [...candidates].sort((a, b) => proteinDensity(b) - proteinDensity(a));

  for (const date of dates) {
    const pinnedSlots = args.pinned?.[date] ?? [];
    const planned: PlannedSlot[] = [...pinnedSlots];

    for (const slot of slots) {
      if (planned.some((p) => p.mealSlotId === slot.mealSlotId)) continue;
      const slotKcal = (targets.kcal * slot.share) / shareSum;

      const candidate = pickCandidate(ordered, slot.mealSlotId, usage, planned);
      if (!candidate) continue;

      const grams = fitGrams(candidate, slotKcal);
      planned.push({
        mealSlotId: slot.mealSlotId,
        kind: candidate.kind,
        refId: candidate.refId,
        name: candidate.name,
        grams,
        nutrients: candidateNutrients(candidate, grams),
      });
      usage.set(candidate.refId, (usage.get(candidate.refId) ?? 0) + 1);
    }

    improveDay(planned, candidates, targets);
    days.push(finishDay(date, planned, targets));
  }

  const worst = days.reduce((m, d) => Math.max(m, Math.abs(d.kcalDeviation)), 0);
  return { days, worstDeviation: round2(worst), ok: worst <= 0.05 && days.every((d) => d.meetsProtein) };
}

function proteinDensity(c: PlanCandidate): number {
  const kcal = c.per100.kcal || 1;
  return (c.per100.proteinG * 100) / kcal;
}

function pickCandidate(
  ordered: PlanCandidate[],
  slotId: string,
  usage: Map<string, number>,
  plannedToday: PlannedSlot[],
): PlanCandidate | undefined {
  const usedToday = new Set(plannedToday.map((p) => p.refId));
  const eligible = ordered.filter((c) => {
    if (c.allowedSlotIds?.length && !c.allowedSlotIds.includes(slotId)) return false;
    if ((usage.get(c.refId) ?? 0) >= c.maxPerWeek) return false;
    if (usedToday.has(c.refId)) return false;
    return true;
  });
  if (eligible.length === 0) {
    // Все лимиты исчерпаны — берём наименее использованное, чтобы план не рвался.
    return [...ordered].sort((a, b) => (usage.get(a.refId) ?? 0) - (usage.get(b.refId) ?? 0))[0];
  }
  // Наименее использованное среди подходящих — так рацион не сводится к одному блюду.
  return eligible.sort((a, b) => (usage.get(a.refId) ?? 0) - (usage.get(b.refId) ?? 0))[0];
}

/** Подбор граммовки под целевую калорийность слота. */
function fitGrams(c: PlanCandidate, slotKcal: number): number {
  const per100 = c.per100.kcal;
  if (per100 <= 0) return c.baseGrams;
  const raw = (slotKcal / per100) * 100;
  return clampStep(raw);
}

function clampStep(grams: number): number {
  const stepped = Math.round(grams / GRAM_STEP) * GRAM_STEP;
  return Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, stepped));
}

/**
 * Локальные улучшения: подтягиваем граммовки непзафиксированных позиций,
 * пока калории не сойдутся, а белок не достигнет цели.
 */
function improveDay(planned: PlannedSlot[], candidates: PlanCandidate[], targets: PlanTargets) {
  const byId = new Map(candidates.map((c) => [c.refId, c]));
  const movable = planned.filter((p) => !p.pinned);
  if (movable.length === 0) return;

  for (let iteration = 0; iteration < 60; iteration++) {
    const totals = sumSlots(planned);
    const kcalGap = targets.kcal - totals.kcal;
    const proteinGap = targets.proteinG - totals.proteinG;

    if (Math.abs(kcalGap) <= targets.kcal * 0.02 && proteinGap <= 0) break;

    // Белок не добран — растим самую белковую позицию; иначе правим по калориям.
    const target =
      proteinGap > 0
        ? [...movable].sort(
            (a, b) => densityOf(byId.get(b.refId)) - densityOf(byId.get(a.refId)),
          )[0]
        : [...movable].sort((a, b) => b.grams - a.grams)[0];
    if (!target) break;

    const c = byId.get(target.refId);
    if (!c || c.per100.kcal <= 0) break;

    const deltaKcal = proteinGap > 0 ? Math.max(kcalGap, 40) : kcalGap;
    const deltaGrams = clampStep(target.grams + (deltaKcal / c.per100.kcal) * 100) - target.grams;
    if (deltaGrams === 0) break;

    const next = clampStep(target.grams + deltaGrams);
    if (next === target.grams) break;
    target.grams = next;
    target.nutrients = candidateNutrients(c, next);
  }
}

function densityOf(c?: PlanCandidate): number {
  return c ? proteinDensity(c) : 0;
}

function sumSlots(slots: PlannedSlot[]): Nutrients {
  return slots.reduce<Nutrients>((acc, s) => add(acc, s.nutrients), { ...ZERO });
}

function finishDay(date: LocalDate, slots: PlannedSlot[], targets: PlanTargets): PlannedDay {
  const totals = sumSlots(slots);
  return {
    date,
    slots,
    totals,
    kcalDeviation: targets.kcal > 0 ? round2((totals.kcal - targets.kcal) / targets.kcal) : 0,
    meetsProtein: totals.proteinG >= targets.proteinG * 0.95,
  };
}

/* ────────────────────────────── Список покупок ─────────────────────────────── */

export interface ShoppingAggregate {
  name: string;
  grams: number;
  category: string;
  checked: boolean;
}

const CATEGORY_ORDER = ['meat', 'dairy', 'grains', 'vegetables', 'fruits', 'other'];

/** Агрегирует ингредиенты плана, суммируя одинаковые продукты (9.5). */
export function buildShoppingList(
  days: PlannedDay[],
  candidates: PlanCandidate[],
): ShoppingAggregate[] {
  const byId = new Map(candidates.map((c) => [c.refId, c]));
  const acc = new Map<string, ShoppingAggregate>();

  for (const day of days) {
    for (const slot of day.slots) {
      const c = byId.get(slot.refId);
      if (!c) continue;
      const factor = c.baseGrams > 0 ? slot.grams / c.baseGrams : 1;

      if (!c.components?.length) {
        upsert(acc, c.refId, c.name, slot.grams, 'other');
        continue;
      }
      for (const comp of c.components) {
        upsert(acc, comp.foodId, comp.name, comp.grams * factor, comp.category);
      }
    }
  }

  return [...acc.values()]
    .map((i) => ({ ...i, grams: Math.round(i.grams) }))
    .sort(
      (a, b) =>
        catRank(a.category) - catRank(b.category) || a.name.localeCompare(b.name),
    );
}

function catRank(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function upsert(
  acc: Map<string, ShoppingAggregate>,
  key: string,
  name: string,
  grams: number,
  category: string,
) {
  const cur = acc.get(key);
  if (cur) cur.grams += grams;
  else acc.set(key, { name, grams, category, checked: false });
}
