import { describe, expect, it } from 'vitest';
import {
  bestAbstinenceStreak,
  currentAbstinenceStreak,
  milestoneReachedToday,
  quitStats,
  QUIT_MILESTONES,
} from './quit';
import type { HabitLog } from '@/domain/model';

const log = (date: string, outcome: 'success' | 'relapse'): HabitLog => ({
  id: `${date}-${outcome}`,
  habitId: 'h1',
  date,
  completed: outcome === 'success',
  outcome,
  createdAt: `${date}T12:00:00.000Z`,
  updatedAt: `${date}T12:00:00.000Z`,
});

const QUIT = '2026-07-01';

describe('серия воздержания', () => {
  it('считается от даты отказа при пустых логах', () => {
    expect(currentAbstinenceStreak([], QUIT, '2026-07-10')).toBe(10);
  });

  it('в первый день равна единице', () => {
    expect(currentAbstinenceStreak([], QUIT, QUIT)).toBe(1);
  });

  it('до даты отказа равна нулю', () => {
    expect(currentAbstinenceStreak([], QUIT, '2026-06-30')).toBe(0);
  });

  it('пропуск дней серию НЕ рвёт — это главное отличие от build', () => {
    // Пользователь отметился 1 и 2 июля, потом три дня не открывал приложение
    const logs = [log('2026-07-01', 'success'), log('2026-07-02', 'success')];
    expect(currentAbstinenceStreak(logs, QUIT, '2026-07-10')).toBe(10);
  });

  it('срыв обнуляет текущую серию, но не лучшую', () => {
    const logs = [log('2026-07-08', 'relapse')];
    expect(currentAbstinenceStreak(logs, QUIT, '2026-07-10')).toBe(2);
    // До срыва было 7 дней: с 1 по 7 июля
    expect(bestAbstinenceStreak(logs, QUIT, '2026-07-10')).toBe(7);
  });

  it('в день срыва текущая серия равна нулю', () => {
    const logs = [log('2026-07-08', 'relapse')];
    expect(currentAbstinenceStreak(logs, QUIT, '2026-07-08')).toBe(0);
  });

  it('несколько срывов подряд', () => {
    const logs = [
      log('2026-07-05', 'relapse'),
      log('2026-07-06', 'relapse'),
      log('2026-07-07', 'relapse'),
    ];
    expect(currentAbstinenceStreak(logs, QUIT, '2026-07-10')).toBe(3);
    // Лучшая — отрезок с 1 по 4 июля
    expect(bestAbstinenceStreak(logs, QUIT, '2026-07-10')).toBe(4);
  });

  it('отметка срыва задним числом пересчитывает серию', () => {
    const before = currentAbstinenceStreak([], QUIT, '2026-07-20');
    const after = currentAbstinenceStreak([log('2026-07-15', 'relapse')], QUIT, '2026-07-20');
    expect(before).toBe(20);
    expect(after).toBe(5);
  });

  it('лучшая серия сохраняется, даже если текущая нулевая', () => {
    const logs = [log('2026-07-20', 'relapse')];
    expect(bestAbstinenceStreak(logs, QUIT, '2026-07-20')).toBe(19);
    expect(currentAbstinenceStreak(logs, QUIT, '2026-07-20')).toBe(0);
  });

  it('логи с успехом на серию не влияют — важны только срывы', () => {
    const withSuccess = Array.from({ length: 5 }, (_, i) =>
      log(`2026-07-0${i + 1}`, 'success'),
    );
    expect(currentAbstinenceStreak(withSuccess, QUIT, '2026-07-10')).toBe(
      currentAbstinenceStreak([], QUIT, '2026-07-10'),
    );
  });

  it('удалённые логи не учитываются', () => {
    const deleted: HabitLog = { ...log('2026-07-08', 'relapse'), deletedAt: '2026-07-09T00:00:00.000Z' };
    expect(currentAbstinenceStreak([deleted], QUIT, '2026-07-10')).toBe(10);
  });
});

describe('сводка по отказу', () => {
  it('считает срывы, чистые дни и последнюю дату срыва', () => {
    const logs = [log('2026-07-05', 'relapse'), log('2026-07-12', 'relapse')];
    const stats = quitStats(logs, QUIT, '2026-07-20');

    expect(stats.relapseCount).toBe(2);
    expect(stats.lastRelapseDate).toBe('2026-07-12');
    expect(stats.currentStreak).toBe(8);
    expect(stats.bestStreak).toBe(8);
    // 20 дней всего минус 2 дня срывов
    expect(stats.totalCleanDays).toBe(18);
  });

  it('подсказывает ближайшую веху', () => {
    const stats = quitStats([], QUIT, '2026-07-05');
    expect(stats.currentStreak).toBe(5);
    expect(stats.nextMilestone).toBe(7);
    expect(stats.daysToNextMilestone).toBe(2);
    expect(stats.reachedMilestones).toEqual([1, 3]);
  });

  it('после последней вехи следующей нет', () => {
    const stats = quitStats([], '2025-01-01', '2026-07-01');
    expect(stats.nextMilestone).toBeNull();
    expect(stats.daysToNextMilestone).toBeNull();
  });

  it('веха засчитывается ровно в свой день', () => {
    expect(milestoneReachedToday(7)).toBe(7);
    expect(milestoneReachedToday(8)).toBeNull();
    expect(QUIT_MILESTONES).toContain(365);
  });
});
