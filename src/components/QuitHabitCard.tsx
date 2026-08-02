/**
 * Карточка привычки, от которой отказываются — задача 3 доработки 0.7.
 *
 * Визуально отличается от обычной: крупный счётчик дней моноширинным
 * шрифтом, под ним лучшая серия и число срывов.
 *
 * Основное действие одно — «Отметить день». «Был срыв» намеренно спрятан
 * за свайпом влево, чтобы его нельзя было нажать случайно (18.5).
 *
 * После срыва текст нейтральный, без осуждения: «Серия начата заново.
 * Лучший результат: N дней».
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import type { Habit, HabitLog } from '@/domain/model';
import { quitStats } from '@/domain/habits/quit';
import { canEditRetroactively } from '@/domain/habits/schedule';
import { num } from '@/lib/format';
import { today as todayFn } from '@/lib/date';
import { Button, MetricValue, Panel, Sheet, TextField } from '@/design-system/primitives';
import { SwipeToDelete } from './SwipeToDelete';

export function QuitHabitCard({
  habit,
  logs,
  onRelapse,
}: {
  habit: Habit;
  logs: readonly HabitLog[];
  onRelapse: () => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const today = todayFn();
  const [relapseOpen, setRelapseOpen] = useState(false);
  const [note, setNote] = useState('');

  const stats = useMemo(
    () => quitStats([...logs], habit.quitStartDate ?? habit.createdAt.slice(0, 10), today),
    [logs, habit.quitStartDate, habit.createdAt, today],
  );

  const markedToday = logs.some((l) => l.date === today && !l.deletedAt);

  const markDay = async () => {
    if (!canEditRetroactively(today)) return;
    await repos.habitLogs.create({
      habitId: habit.id,
      date: today,
      completed: true,
      outcome: 'success',
    });
  };

  const saveRelapse = async () => {
    await repos.habitLogs.create({
      habitId: habit.id,
      date: today,
      completed: false,
      outcome: 'relapse',
      relapseNote: note.trim() || undefined,
    });
    setNote('');
    setRelapseOpen(false);
    onRelapse();
  };

  return (
    <>
      <SwipeToDelete deleteLabel={t('habits.relapse')} onDelete={() => setRelapseOpen(true)}>
        <Panel>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-section">
              {habit.icon} {habit.name}
            </span>
            <span className="text-label uppercase text-muted">{t('habits.quitLabel')}</span>
          </div>

          <MetricValue
            className="mt-2"
            value={num(stats.currentStreak)}
            unit={t('habits.daysUnit', { count: stats.currentStreak })}
            size="display"
          />

          <p className="tnum mt-1 text-caption text-muted">
            {t('habits.bestStreak', { count: stats.bestStreak })} ·{' '}
            {t('habits.relapseCount', { count: stats.relapseCount })}
          </p>

          {stats.nextMilestone != null ? (
            <p className="tnum mt-1 text-caption text-muted">
              {t('habits.nextMilestone', {
                days: stats.daysToNextMilestone,
                milestone: stats.nextMilestone,
              })}
            </p>
          ) : null}

          {stats.currentStreak === 0 && stats.relapseCount > 0 ? (
            <p className="mt-2 text-caption text-muted">
              {t('habits.afterRelapse', { best: stats.bestStreak })}
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button variant="primary" full disabled={markedToday} onClick={() => void markDay()}>
              {markedToday ? t('habits.markedToday') : t('habits.markDay')}
            </Button>
            <Button variant="ghost" onClick={() => setRelapseOpen(true)}>
              {t('habits.relapse')}
            </Button>
          </div>
        </Panel>
      </SwipeToDelete>

      <Sheet open={relapseOpen} onClose={() => setRelapseOpen(false)} title={t('habits.relapse')}>
        <p className="text-body text-muted">{t('habits.relapseHint')}</p>
        <div className="mt-3">
          <TextField
            value={note}
            onChange={setNote}
            aria-label={t('common.note')}
            placeholder={t('common.note')}
          />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="danger" full onClick={() => void saveRelapse()}>
            {t('habits.relapseConfirm')}
          </Button>
          <Button variant="ghost" full onClick={() => setRelapseOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
