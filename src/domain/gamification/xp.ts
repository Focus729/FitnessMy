/**
 * Опыт и уровни — раздел 12.3, в «тихом» варианте из 2.5.
 *
 * Ограничения из ТЗ (обязательные):
 *   • опыт не начисляется задним числом более чем за 48 часов;
 *   • никаких потерь опыта, штрафов и падения уровня;
 *   • достижения не завязаны на вес и дефицит — только на действия.
 */
import type { LocalDate } from '@/domain/model';
import { parseLocalDate } from '@/lib/date';

export type XpReason =
  | 'dayLogged'
  | 'workoutFinished'
  | 'habitDone'
  | 'weightLogged'
  | 'checkinDone'
  | 'allHabitsDone'
  | 'weekStreak'
  | 'personalRecord';

/** Таблица начислений из 12.3. Вынесена в конфиг — значения настраиваются. */
export const XP_TABLE: Record<XpReason, number> = {
  dayLogged: 20,
  workoutFinished: 30,
  habitDone: 5,
  weightLogged: 5,
  checkinDone: 5,
  allHabitsDone: 15,
  weekStreak: 50,
  personalRecord: 25,
};

/** Порог уровня N = 100·N^1.5, округление до 10 (12.3). */
export function levelThreshold(level: number): number {
  if (level <= 1) return 0;
  return Math.round((100 * Math.pow(level, 1.5)) / 10) * 10;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (levelThreshold(level + 1) <= xp && level < 200) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  xp: number;
  currentThreshold: number;
  nextThreshold: number;
  /** Доля до следующего уровня, 0..1 — ровно то, что рисует полоса в 2 px. */
  progress: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const currentThreshold = levelThreshold(level);
  const nextThreshold = levelThreshold(level + 1);
  const span = nextThreshold - currentThreshold;
  return {
    level,
    xp,
    currentThreshold,
    nextThreshold,
    progress: span > 0 ? Math.min(1, Math.max(0, (xp - currentThreshold) / span)) : 1,
  };
}

/**
 * Можно ли начислить опыт за действие, отнесённое к дате `date`.
 * Ретроспективное заполнение старше 48 часов опыт не даёт (12.3).
 */
export function isXpEligible(date: LocalDate, now: Date = new Date()): boolean {
  const day = parseLocalDate(date);
  const endOfDay = new Date(day);
  endOfDay.setHours(23, 59, 59, 999);
  if (day.getTime() > now.getTime()) return false;
  return now.getTime() - endOfDay.getTime() <= 48 * 3_600_000;
}

/** Ключ дедупликации: одно действие за день начисляет опыт один раз. */
export function dedupeKey(reason: XpReason, date: LocalDate, ref?: string): string {
  return ref ? `${reason}:${date}:${ref}` : `${reason}:${date}`;
}

export function xpFor(reason: XpReason): number {
  return XP_TABLE[reason];
}
