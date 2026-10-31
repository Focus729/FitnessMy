/** Training-first overview, approved direction B. See DESIGN.md. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@/data/repositories/hooks';
import { useRepos } from '@/data/repositories/context';
import { useDaySummary, useRibbon, useSettings, useToday } from '@/app/hooks';
import { award } from '@/app/gamification';
import { levelProgress } from '@/domain/gamification/xp';
import { isHabitDone, isScheduledOn, canEditRetroactively } from '@/domain/habits/schedule';
import { timeLabel } from '@/domain/nutrition/fasting';
import { startOfWeek } from '@/lib/date';
import { useSaveAction } from '@/app/useSaveAction';
import { dateShort, num } from '@/lib/format';
import { Bar, Button, MetricValue, Panel, Ring } from '@/design-system/primitives';
import { Ribbon, RibbonScale } from '@/design-system/Ribbon';
import { WaterSheet } from '@/components/WaterSheet';
import { AddFoodSheet } from '@/components/AddFoodSheet';

export function TodayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const repos = useRepos();
  const date = useToday();
  const settings = useSettings();
  const day = useDaySummary(date);
  const ribbon = useRibbon(
    date,
    settings.fasting.enabled ? settings.fasting.windowHours : undefined,
  );

  const [waterOpen, setWaterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const starting = useSaveAction();

  const game = useQuery((r) => r.game.get());
  const sleep = useQuery((r) => r.sleep.byDate(date), [date]);
  const checkin = useQuery((r) => r.checkins.byDate(date), [date]);
  const unfinished = useQuery((r) => r.workouts.unfinished());
  // «Ближайшее» берётся из планов (задача 2); при их отсутствии строка не выводится.
  const nextPlan = useQuery((r) => r.plannedWorkouts.upcoming(date), [date]);
  const habitsToday = useQuery(
    async (r) => {
      const [habits, logs] = await Promise.all([r.habits.all(), r.habitLogs.byDate(date)]);
      const active = habits
        .filter((h) => !h.archived && h.polarity !== 'quit')
        .sort((a, b) => a.order - b.order);
      const weekLogs = await r.habitLogs.byDateRange(
        startOfWeek(date, settings.firstDayOfWeek),
        date,
      );
      return active
        .filter((h) =>
          isScheduledOn(
            h,
            date,
            weekLogs.filter((l) => l.habitId === h.id),
            settings.firstDayOfWeek,
          ),
        )
        .map((h) => ({
          habit: h,
          done: isHabitDone(
            h,
            logs.find((l) => l.habitId === h.id),
          ),
        }));
    },
    [date, settings.firstDayOfWeek],
  );
  const quitHabits = useQuery(async (r) =>
    (await r.habits.all()).filter((habit) => !habit.archived && habit.polarity === 'quit'),
  );

  const targets = settings.targets;
  const remaining = targets.kcal - day.totals.kcal;
  const over = remaining < 0;
  const level = levelProgress(game?.xp ?? 0);

  const toggleHabit = async (habitId: string) => {
    if (!canEditRetroactively(date)) return;
    await repos.habitLogs.toggle(habitId, date);
    await award(repos, 'habitDone', date, habitId);
  };

  return (
    <div className="today-grid space-y-5">
      <section className="training-hero">
        <p className="text-label uppercase text-muted">
          {t(unfinished ? 'today.resumeWorkout' : 'gym.plan')}
        </p>
        <h1>{unfinished?.name || nextPlan?.name || t('gym.startEmpty')}</h1>
        {nextPlan && !unfinished ? (
          <p className="mb-4 text-caption text-muted">{dateShort(nextPlan.plannedDate)}</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={starting.busy}
            onClick={() =>
              void starting.run(async () => {
                if (unfinished) {
                  navigate(`/workout/${unfinished.id}`);
                  return;
                }
                if (nextPlan) {
                  navigate(`/gym?section=plan&date=${nextPlan.plannedDate}`);
                  return;
                }
                const workout = await repos.workouts.startFree(t('gym.startEmpty'));
                navigate(`/workout/${workout.id}`);
              })
            }
          >
            {t(unfinished ? 'common.continue' : nextPlan ? 'today.startWorkout' : 'gym.startEmpty')}
          </Button>
          <Button onClick={() => setAddOpen(true)}>{t('today.addFood')}</Button>
          <Button variant="ghost" onClick={() => navigate('/body?section=weight')}>
            {t('body.weightAdd')}
          </Button>
        </div>
        {starting.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      </section>
      {/* Сигнатурный элемент — лента дня */}
      <div aria-label={t('today.ribbonLabel')}>
        {ribbon ? (
          <>
            <Ribbon
              model={ribbon}
              showWindow={settings.fasting.enabled}
              ariaLabel={t('today.ribbonLabel')}
              onSelect={(mark) => {
                if (mark.kind === 'meal') navigate('/food');
                if (mark.kind === 'workout') navigate('/gym');
              }}
            />
            <RibbonScale />
            {settings.fasting.enabled && ribbon.window.startMin != null ? (
              <p className="tnum mt-1 text-caption text-muted">
                {t('today.eatingWindow', {
                  from: timeLabel(ribbon.window.startMin),
                  to: timeLabel(ribbon.window.endMin ?? ribbon.window.startMin),
                })}
              </p>
            ) : null}
          </>
        ) : (
          <div className="h-6" />
        )}
      </div>

      {/* 1 — осталось */}
      <Panel>
        <div className="text-label uppercase text-muted">
          {over ? t('today.over') : t('today.remaining')}
        </div>
        <div className={`tnum text-display ${over ? 'text-over' : ''}`}>
          {num(Math.abs(Math.round(remaining)))}
        </div>
        <div className="tnum text-caption text-muted">
          {t('today.eaten', {
            eaten: num(Math.round(day.totals.kcal)),
            target: num(targets.kcal),
          })}
        </div>
      </Panel>

      {/* 2 — БЖУ и клетчатка */}
      <Panel title={t('today.macros')} className="space-y-2">
        <Bar
          label={t('today.protein')}
          value={day.totals.proteinG}
          target={targets.proteinG}
          detail={`${num(Math.round(day.totals.proteinG))}/${num(targets.proteinG)}`}
        />
        <Bar
          label={t('today.fat')}
          value={day.totals.fatG}
          target={targets.fatG}
          detail={`${num(Math.round(day.totals.fatG))}/${num(targets.fatG)}`}
        />
        <Bar
          label={t('today.carb')}
          value={day.totals.carbG}
          target={targets.carbG}
          detail={`${num(Math.round(day.totals.carbG))}/${num(targets.carbG)}`}
        />
        <Bar
          label={t('today.fiber')}
          value={day.totals.fiberG ?? 0}
          target={targets.fiberG}
          detail={`${num(Math.round(day.totals.fiberG ?? 0))}/${num(targets.fiberG)}`}
          showOver={false}
        />
        <SecondaryLine
          sugar={day.totals.sugarG ?? 0}
          sugarMax={targets.sugarMaxG}
          sodium={day.totals.sodiumMg ?? 0}
          sodiumMax={targets.sodiumMaxMg}
        />
      </Panel>

      {/* 3 — вода */}
      <Panel title={t('today.water')}>
        <button
          type="button"
          onClick={() => setWaterOpen(true)}
          className="flex w-full items-center gap-3 py-1 text-left"
        >
          <Ring value={day.waterMl} target={targets.waterMl} ariaLabel={t('today.water')} />
          <MetricValue
            value={`${num(day.waterMl)} / ${num(targets.waterMl)}`}
            unit={t('units.ml')}
            size="lg"
          />
        </button>
      </Panel>

      {/* 4 — сон и шаги */}
      {settings.showSleep || settings.showSteps ? (
        <Panel title={t('today.wellbeing')} className="space-y-1">
          {settings.showSleep ? (
            <button
              type="button"
              onClick={() => navigate('/body?section=sleep')}
              className="flex w-full items-baseline gap-3 text-left"
            >
              <span className="w-16 shrink-0 text-label uppercase text-muted">
                {t('today.sleep')}
              </span>
              <span className="tnum text-num">
                {sleep
                  ? `${Math.floor(sleep.durationMin / 60)} ${t('units.h')} ${sleep.durationMin % 60} ${t('units.min')} · ${t('today.quality', { value: sleep.quality })}`
                  : t('today.noSleep')}
              </span>
            </button>
          ) : null}
          {settings.showSteps ? (
            <button
              type="button"
              onClick={() => navigate('/body?section=checkin')}
              className="flex w-full items-baseline gap-3 text-left"
            >
              <span className="w-16 shrink-0 text-label uppercase text-muted">
                {t('today.steps')}
              </span>
              <span className="tnum text-num">
                {checkin?.steps != null ? num(checkin.steps) : t('today.noSteps')}
              </span>
            </button>
          ) : null}
        </Panel>
      ) : null}

      {/* 5 — привычки */}
      {habitsToday && habitsToday.length > 0 ? (
        <Panel title={t('today.habits')}>
          <ul className="mt-1 flex flex-wrap gap-1">
            {habitsToday.map(({ habit, done }) => (
              <li key={habit.id}>
                <button
                  type="button"
                  aria-label={habit.name}
                  aria-pressed={done}
                  onClick={() => void toggleHabit(habit.id)}
                  className={`tappable justify-center rounded-xl border px-3 ${
                    done ? 'border-accent text-accent' : 'border-hairline text-muted'
                  }`}
                >
                  <span aria-hidden="true">{done ? '✓' : '○'}</span>
                  <span className="ml-1 text-caption">
                    {habit.icon} {habit.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {quitHabits?.length ? (
        <Panel title={t('body.habits')}>
          <div className="flex flex-wrap gap-2">
            {quitHabits.map((habit) => (
              <Button key={habit.id} onClick={() => navigate('/body?section=habits')}>
                {habit.icon} {habit.name}
              </Button>
            ))}
          </div>
        </Panel>
      ) : null}
      {/* Тихий RPG: полоса опыта 2 px и номер уровня (решение 2.5) */}
      {settings.gamificationEnabled ? (
        <div className="flex items-center gap-2 pt-2">
          <span className="tnum text-caption text-muted">
            {t('today.level', { level: level.level })}
          </span>
          <span className="h-[2px] flex-1 bg-hairline">
            <span
              className="block h-full bg-accent"
              style={{ width: `${level.progress * 100}%` }}
            />
          </span>
        </div>
      ) : null}

      <WaterSheet open={waterOpen} onClose={() => setWaterOpen(false)} date={date} />
      <AddFoodSheet open={addOpen} onClose={() => setAddOpen(false)} date={date} />
    </div>
  );
}

/** Строка второстепенного: сахар, натрий — мелко, разворачивается по нажатию (9.1). */
function SecondaryLine({
  sugar,
  sugarMax,
  sodium,
  sodiumMax,
}: {
  sugar: number;
  sugarMax: number;
  sodium: number;
  sodiumMax: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="text-caption text-muted" onClick={() => setOpen(true)}>
        {t('today.secondary')}
      </button>
    );
  }

  return (
    <div className="space-y-1 text-caption text-muted">
      <div className="flex justify-between">
        <span>{t('today.sugar')}</span>
        <span className={`tnum ${sugar > sugarMax ? 'text-over' : ''}`}>
          {sugar > sugarMax ? '! ' : ''}
          {num(Math.round(sugar))} / {num(sugarMax)} {t('units.g')}
        </span>
      </div>
      <div className="flex justify-between">
        <span>{t('today.sodium')}</span>
        <span className={`tnum ${sodium > sodiumMax ? 'text-over' : ''}`}>
          {sodium > sodiumMax ? '! ' : ''}
          {num(Math.round(sodium))} / {num(sodiumMax)} {t('units.mg')}
        </span>
      </div>
    </div>
  );
}
