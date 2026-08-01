import { describe, expect, it } from 'vitest';
import { computeStreak, dayStatusFromFlag, dayStatusFromHabits, MAX_FREEZES } from './streaks';
import { canEditRetroactively, isHabitDone, isScheduledOn } from './schedule';
import type { HabitLog } from '@/domain/model';

const day = (date: string, status: 'done' | 'missed' | 'notScheduled') => ({ date, status });

describe('серии и заморозки', () => {
  it('серия растёт за каждый выполненный день', () => {
    const result = computeStreak([
      day('2026-07-01', 'done'),
      day('2026-07-02', 'done'),
      day('2026-07-03', 'done'),
    ]);
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it('дни без запланированных привычек серию не трогают', () => {
    const result = computeStreak([
      day('2026-07-01', 'done'),
      day('2026-07-02', 'notScheduled'),
      day('2026-07-03', 'done'),
    ]);
    expect(result.current).toBe(2);
  });

  it('заморозка начисляется за каждые 7 дней подряд', () => {
    const days = Array.from({ length: 7 }, (_, i) => day(`2026-07-0${i + 1}`, 'done'));
    expect(computeStreak(days).freezes).toBe(1);
  });

  it('пропуск покрывается заморозкой: серия сохраняется, день помечен', () => {
    const days = [
      ...Array.from({ length: 7 }, (_, i) => day(`2026-07-0${i + 1}`, 'done')),
      day('2026-07-08', 'missed'),
      day('2026-07-09', 'done'),
    ];
    const result = computeStreak(days);
    expect(result.current).toBe(8);
    expect(result.frozenDays).toEqual(['2026-07-08']);
    expect(result.freezes).toBe(0);
  });

  it('без заморозок пропуск рвёт серию', () => {
    const result = computeStreak([
      day('2026-07-01', 'done'),
      day('2026-07-02', 'missed'),
      day('2026-07-03', 'done'),
    ]);
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });

  it('в запасе не больше трёх заморозок', () => {
    const days = Array.from({ length: 40 }, (_, i) => {
      const date = new Date(2026, 6, 1 + i).toISOString().slice(0, 10);
      return day(date, 'done');
    });
    expect(computeStreak(days).freezes).toBe(MAX_FREEZES);
  });

  it('лучшая серия запоминается после разрыва', () => {
    const result = computeStreak([
      day('2026-07-01', 'done'),
      day('2026-07-02', 'done'),
      day('2026-07-03', 'done'),
      day('2026-07-04', 'missed'),
      day('2026-07-05', 'done'),
    ]);
    expect(result.best).toBe(3);
    expect(result.current).toBe(1);
  });

  it('статус дня по привычкам', () => {
    expect(dayStatusFromHabits({ scheduledCount: 0, completedCount: 0 })).toBe('notScheduled');
    expect(dayStatusFromHabits({ scheduledCount: 3, completedCount: 3 })).toBe('done');
    expect(dayStatusFromHabits({ scheduledCount: 3, completedCount: 2 })).toBe('missed');
    expect(dayStatusFromFlag(true)).toBe('done');
  });
});

describe('расписания привычек', () => {
  const created = '2026-07-01T00:00:00.000Z';

  it('ежедневная запланирована всегда', () => {
    expect(isScheduledOn({ schedule: { type: 'daily' }, createdAt: created }, '2026-07-05')).toBe(true);
  });

  it('по дням недели', () => {
    const habit = { schedule: { type: 'weekdays' as const, days: [1, 3, 5] }, createdAt: created };
    // 2026-07-06 — понедельник
    expect(isScheduledOn(habit, '2026-07-06')).toBe(true);
    expect(isScheduledOn(habit, '2026-07-07')).toBe(false);
  });

  it('каждые N дней — от даты создания', () => {
    const habit = { schedule: { type: 'everyNDays' as const, n: 3 }, createdAt: created };
    expect(isScheduledOn(habit, '2026-07-01')).toBe(true);
    expect(isScheduledOn(habit, '2026-07-04')).toBe(true);
    expect(isScheduledOn(habit, '2026-07-05')).toBe(false);
  });

  it('N раз в неделю: доступна, пока квота не выбрана', () => {
    const habit = { schedule: { type: 'timesPerWeek' as const, times: 2 }, createdAt: created };
    const logs: HabitLog[] = [
      log('2026-07-06'),
      log('2026-07-07'),
    ];
    expect(isScheduledOn(habit, '2026-07-08', [])).toBe(true);
    expect(isScheduledOn(habit, '2026-07-08', logs)).toBe(false);
  });

  it('до даты создания привычка не запланирована', () => {
    expect(isScheduledOn({ schedule: { type: 'daily' }, createdAt: created }, '2026-06-30')).toBe(false);
  });

  it('привычка с целевым значением требует достижения значения', () => {
    const habit = { targetValue: 8000 };
    expect(isHabitDone(habit, log('2026-07-01', 5000))).toBe(false);
    expect(isHabitDone(habit, log('2026-07-01', 9000))).toBe(true);
    expect(isHabitDone({}, undefined)).toBe(false);
  });
});

describe('ретроактивное заполнение', () => {
  const now = new Date('2026-07-10T12:00:00');

  it('вчерашний день можно отметить', () => {
    expect(canEditRetroactively('2026-07-09', now)).toBe(true);
  });

  it('сегодня можно отметить', () => {
    expect(canEditRetroactively('2026-07-10', now)).toBe(true);
  });

  it('позапрошлый день уже нельзя', () => {
    expect(canEditRetroactively('2026-07-07', now)).toBe(false);
  });

  it('будущее отмечать нельзя', () => {
    expect(canEditRetroactively('2026-07-20', now)).toBe(false);
  });
});

function log(date: string, value?: number): HabitLog {
  return {
    id: date,
    habitId: 'h',
    date,
    completed: true,
    value,
    createdAt: date,
    updatedAt: date,
  };
}
