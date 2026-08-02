/**
 * Планирование тренировок заранее — задача 2 доработки 0.7.
 *
 * Домен знает только про даты и порядок дней программы: ни про Dexie,
 * ни про React.
 */
import type { LocalDate, PlannedItem, PlannedWorkout, Routine, RoutineDay } from '@/domain/model';
import { addDays, diffDays, isoWeekday } from '@/lib/date';

export interface PlannedDate {
  date: LocalDate;
  routineDayId: string;
  name: string;
  items: Omit<PlannedItem, 'id'>[];
}

export interface NextDatesOptions {
  /** Дни недели, в которые тренируемся. Пусто — подряд, через день. */
  weekdays?: number[];
  /** С какого дня цикла начинать. По умолчанию — с сохранённого в программе. */
  startDayIndex?: number;
  /** Даты, которые уже заняты планами: их пропускаем. */
  busyDates?: readonly LocalDate[];
}

/**
 * Следующие `count` дат для программы с учётом цикла дней.
 *
 * Без указания дней недели тренировки ставятся через день — это разумный
 * компромисс между «каждый день» (невыполнимо) и попыткой угадать график.
 */
export function nextPlannedDates(
  routine: Routine,
  from: LocalDate,
  count: number,
  options: NextDatesOptions = {},
): PlannedDate[] {
  const days = [...routine.days].sort((a, b) => a.order - b.order);
  if (days.length === 0 || count <= 0) return [];

  const busy = new Set(options.busyDates ?? []);
  const weekdays = options.weekdays?.length ? [...options.weekdays].sort((a, b) => a - b) : null;
  const out: PlannedDate[] = [];

  let cursor = from;
  let dayIndex = options.startDayIndex ?? routine.nextDayIndex ?? 0;
  let guard = 0;

  while (out.length < count && guard++ < 400) {
    const fits = weekdays ? weekdays.includes(isoWeekday(cursor)) : true;

    if (fits && !busy.has(cursor)) {
      const day = days[dayIndex % days.length] as RoutineDay;
      out.push({
        date: cursor,
        routineDayId: day.id,
        name: `${routine.name} · ${day.name}`,
        items: itemsFromRoutineDay(day),
      });
      dayIndex += 1;
      cursor = addDays(cursor, weekdays ? 1 : 2);
    } else {
      cursor = addDays(cursor, 1);
    }
  }

  return out;
}

/** Предзаполнение плана составом дня программы. Дальше план правится свободно. */
export function itemsFromRoutineDay(day: RoutineDay): Omit<PlannedItem, 'id'>[] {
  return [...day.items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      exerciseId: item.exerciseId,
      order: index,
      supersetGroup: item.supersetGroup,
      targetSets: item.targetSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
      targetRpe: item.targetRpe,
      restSec: item.restSec,
    }));
}

/**
 * Перенос плана на другую дату.
 *
 * `shiftFollowing` — сдвинуть все последующие запланированные тренировки на
 * то же число дней. Без него переносится только один план, порядок остальных
 * не меняется.
 *
 * Возвращает НОВЫЙ массив с изменёнными записями; исходный не мутируется,
 * поэтому функцию можно звать из рендера без опаски.
 */
export function reschedule(
  plans: PlannedWorkout[],
  id: string,
  newDate: LocalDate,
  shiftFollowing: boolean,
): PlannedWorkout[] {
  const target = plans.find((p) => p.id === id);
  if (!target) return plans;

  const shift = diffDays(newDate, target.plannedDate);
  if (shift === 0) return plans;

  return plans.map((plan) => {
    if (plan.id === id) return { ...plan, plannedDate: newDate };
    if (!shiftFollowing) return plan;
    // Сдвигаем только ещё не начатые планы, стоящие позже исходной даты.
    if (plan.status !== 'planned') return plan;
    if (plan.plannedDate <= target.plannedDate) return plan;
    return { ...plan, plannedDate: addDays(plan.plannedDate, shift) };
  });
}

/** Просроченные планы: дата прошла, а тренировка не начата (не удаляются). */
export function overduePlans(plans: PlannedWorkout[], today: LocalDate): PlannedWorkout[] {
  return plans
    .filter((p) => !p.deletedAt && p.status === 'planned' && p.plannedDate < today)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

/** Ближайший план начиная с сегодня — источник строки «Ближайшее» на главном. */
export function upcomingPlan(plans: PlannedWorkout[], today: LocalDate): PlannedWorkout | undefined {
  return plans
    .filter((p) => !p.deletedAt && p.status === 'planned' && p.plannedDate >= today)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
}

/** Планы, сгруппированные по дате — для календаря месяца. */
export function groupByDate(plans: PlannedWorkout[]): Map<LocalDate, PlannedWorkout[]> {
  const out = new Map<LocalDate, PlannedWorkout[]>();
  for (const plan of plans) {
    if (plan.deletedAt) continue;
    const list = out.get(plan.plannedDate) ?? [];
    list.push(plan);
    out.set(plan.plannedDate, list);
  }
  return out;
}
