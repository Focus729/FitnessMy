/**
 * Интервальное голодание и «лента дня» — разделы 9.4 и 18.4.
 *
 * Автоопределение: окно питания считается от первой до последней записи дня,
 * руками таймер запускать не нужно.
 */
import type { DiaryEntry, LocalTime, WaterEntry, Workout } from '@/domain/model';
import { timeToMinutes } from '@/lib/date';

export interface EatingWindow {
  /** Минуты от полуночи. */
  startMin: number | null;
  endMin: number | null;
  /** Длительность окна питания в минутах. */
  windowMin: number;
  /** Часы голодания с последней записи (для текущего дня). */
  fastingHours: number | null;
  /** Уложились ли в целевое окно. */
  withinTarget: boolean | null;
}

export function eatingWindow(
  entries: Pick<DiaryEntry, 'time'>[],
  targetWindowHours?: number,
): EatingWindow {
  if (entries.length === 0) {
    return { startMin: null, endMin: null, windowMin: 0, fastingHours: null, withinTarget: null };
  }
  const times = entries.map((e) => timeToMinutes(e.time)).sort((a, b) => a - b);
  const startMin = times[0] as number;
  const endMin = times[times.length - 1] as number;
  const windowMin = endMin - startMin;
  return {
    startMin,
    endMin,
    windowMin,
    fastingHours: null,
    withinTarget: targetWindowHours != null ? windowMin <= targetWindowHours * 60 : null,
  };
}

/** Часы, прошедшие с последнего приёма пищи. */
export function hoursSinceLastMeal(lastEntryAt: Date | null, now: Date = new Date()): number | null {
  if (!lastEntryAt) return null;
  return Math.max(0, (now.getTime() - lastEntryAt.getTime()) / 3_600_000);
}

/* ────────────────────────────── Отметки ленты дня ──────────────────────────── */

export type RibbonMarkKind = 'meal' | 'workout' | 'water';

export interface RibbonMark {
  id: string;
  kind: RibbonMarkKind;
  /** Минуты от полуночи, 0..1440. */
  minute: number;
  /** Для приёмов пищи: калорийность — задаёт размер круга (18.4). */
  kcal?: number;
  label: string;
}

export interface RibbonModel {
  marks: RibbonMark[];
  window: EatingWindow;
  /** Максимальная калорийность приёма — для нормировки размера круга. */
  maxKcal: number;
}

export function buildRibbon(args: {
  entries: Pick<DiaryEntry, 'id' | 'time' | 'nutrients' | 'quickName'>[];
  water?: Pick<WaterEntry, 'id' | 'time' | 'ml'>[];
  workouts?: Pick<Workout, 'id' | 'startedAt' | 'name'>[];
  targetWindowHours?: number;
  labelFor?: (id: string) => string;
}): RibbonModel {
  const marks: RibbonMark[] = [];

  for (const e of args.entries) {
    marks.push({
      id: e.id,
      kind: 'meal',
      minute: timeToMinutes(e.time),
      kcal: e.nutrients.kcal,
      label: e.quickName ?? args.labelFor?.(e.id) ?? '',
    });
  }
  for (const w of args.water ?? []) {
    marks.push({ id: w.id, kind: 'water', minute: timeToMinutes(w.time), label: `${w.ml}` });
  }
  for (const w of args.workouts ?? []) {
    const d = new Date(w.startedAt);
    marks.push({
      id: w.id,
      kind: 'workout',
      minute: d.getHours() * 60 + d.getMinutes(),
      label: w.name,
    });
  }

  const maxKcal = Math.max(0, ...marks.filter((m) => m.kind === 'meal').map((m) => m.kcal ?? 0));

  return {
    marks: marks.sort((a, b) => a.minute - b.minute),
    window: eatingWindow(args.entries, args.targetWindowHours),
    maxKcal,
  };
}

/** Радиус круга приёма пищи: 3..7 px, пропорционально калорийности (18.4). */
export function markRadius(kcal: number | undefined, maxKcal: number): number {
  if (!kcal || maxKcal <= 0) return 3;
  return 3 + Math.min(1, kcal / maxKcal) * 4;
}

/** Пресеты алкоголя и кофеина из 9.4. */
export const SUBSTANCE_PRESETS: {
  key: string;
  kind: 'alcohol' | 'caffeine';
  /** мг кофеина или мл напитка. */
  amount: number;
  abv?: number;
}[] = [
  { key: 'espresso', kind: 'caffeine', amount: 63 },
  { key: 'americano', kind: 'caffeine', amount: 95 },
  { key: 'tea', kind: 'caffeine', amount: 47 },
  { key: 'energyDrink', kind: 'caffeine', amount: 80 },
  { key: 'wineGlass', kind: 'alcohol', amount: 150, abv: 12 },
  { key: 'beerMug', kind: 'alcohol', amount: 500, abv: 5 },
];

export const CAFFEINE_DAILY_REFERENCE_MG = 400;

export function timeLabel(minute: number): LocalTime {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
