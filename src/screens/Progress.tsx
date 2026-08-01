/**
 * Вкладка «Прогресс» — аналитика (14) и достижения (12.3).
 *
 * Три уровня глубины: графики, периодические сводки, сопоставления.
 * Сопоставления — строго описательные, с обязательным числом наблюдений и
 * порогом в 10 дней на группу.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { buildSummary, type DayFacts } from '@/domain/stats/summary';
import { computeComparisons, type DayFactsExt } from '@/domain/stats/comparisons';
import { movingAverage } from '@/domain/stats/movingAverage';
import { computeFoodIndex } from '@/domain/nutrition/foodIndex';
import { sumEntries } from '@/domain/nutrition/nutrients';
import { evaluateAchievements } from '@/domain/gamification/achievements';
import { levelProgress } from '@/domain/gamification/xp';
import { addDays, lastNDays, today as todayFn } from '@/lib/date';
import { durationLong, num, signed } from '@/lib/format';
import { Segmented, Label } from '@/design-system/primitives';
import { KcalChart, WeightChart } from '@/components/charts/WeightChart';
import { HabitHeatmap } from '@/components/charts/HabitHeatmap';

type Section = 'charts' | 'summaries' | 'comparisons' | 'achievements';

export function ProgressScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [section, setSection] = useState<Section>('charts');

  const facts = useDayFacts(180);

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel={t('progress.title')}
        value={section}
        options={[
          { value: 'charts' as const, label: t('progress.charts') },
          { value: 'summaries' as const, label: t('progress.summaries') },
          { value: 'comparisons' as const, label: t('progress.comparisons') },
          ...(settings.gamificationEnabled
            ? [{ value: 'achievements' as const, label: t('game.achievements') }]
            : []),
        ]}
        onChange={setSection}
      />

      {section === 'charts' ? <Charts facts={facts} /> : null}
      {section === 'summaries' ? <Summaries facts={facts} /> : null}
      {section === 'comparisons' ? <Comparisons facts={facts} /> : null}
      {section === 'achievements' && settings.gamificationEnabled ? <Achievements /> : null}
    </div>
  );
}

/** Собирает факты по дням — общий вход для всей аналитики. */
function useDayFacts(days: number): DayFactsExt[] {
  const settings = useSettings();
  const to = todayFn();
  const from = addDays(to, -(days - 1));

  return (
    useQuery(
      async (r) => {
        const [diary, body, workouts, sleep, checkins, habits, habitLogs, foods] = await Promise.all([
          r.diary.byDateRange(from, to),
          r.body.byDateRange(from, to),
          r.workouts.byDateRange(from, to),
          r.sleep.byDateRange(from, to),
          r.checkins.byDateRange(from, to),
          r.habits.all(),
          r.habitLogs.byDateRange(from, to),
          r.foods.all(),
        ]);

        const novaById = new Map(foods.map((f) => [f.id, f.novaGroup]));
        const activeHabits = habits.filter((h) => !h.archived);
        const dates = lastNDays(days, to);

        return dates.map<DayFactsExt>((date) => {
          const entries = diary.filter((e) => e.date === date);
          const totals = sumEntries(entries);
          const dayWorkouts = workouts.filter((w) => w.date === date && w.finishedAt);
          const dayLogs = habitLogs.filter((l) => l.date === date);
          const checkin = checkins.find((c) => c.date === date);

          let group4Grams = 0;
          let knownGrams = 0;
          for (const e of entries) {
            const nova = e.novaGroup ?? (e.refId ? novaById.get(e.refId) : undefined);
            if (nova == null || e.grams == null) continue;
            knownGrams += e.grams;
            if (nova === 4) group4Grams += e.grams;
          }

          const index = entries.length
            ? computeFoodIndex({
                totals,
                targets: settings.targets,
                distinctFoods: new Set(entries.map((e) => e.refId ?? e.quickName ?? e.id)).size,
                nova: { group4Grams, knownGrams },
              }).score
            : undefined;

          return {
            date,
            nutrients: totals,
            hasDiary: entries.length > 0,
            weightKg: body.find((b) => b.date === date)?.weightKg,
            workouts: dayWorkouts.length,
            volumeKg: dayWorkouts.reduce((s, w) => s + w.totalVolumeKg, 0),
            sleepMin: sleep.find((s) => s.date === date)?.durationMin,
            habitsScheduled: activeHabits.length,
            habitsCompleted: dayLogs.filter((l) => l.completed).length,
            nutritionIndex: index,
            steps: checkin?.steps,
            stress: checkin?.stress,
          };
        });
      },
      [days, from, to],
    ) ?? []
  );
}

/* ────────────────────────────── Графики (14.1) ─────────────────────────────── */

function Charts({ facts }: { facts: DayFactsExt[] }) {
  const { t } = useTranslation();
  const settings = useSettings();

  const weightSeries = useMemo(
    () =>
      movingAverage(
        facts
          .filter((f) => f.weightKg != null)
          .map((f) => ({ date: f.date, value: f.weightKg as number })),
        7,
      ),
    [facts],
  );

  const kcalData = useMemo(
    () => facts.slice(-60).map((f) => ({ date: f.date, kcal: f.hasDiary ? f.nutrients?.kcal ?? null : null })),
    [facts],
  );

  const habitData = useMemo(
    () =>
      facts.map((f) => ({
        date: f.date,
        ratio: f.habitsScheduled > 0 ? f.habitsCompleted / f.habitsScheduled : null,
      })),
    [facts],
  );

  return (
    <div className="space-y-6">
      <section>
        <Label>{t('progress.weightChart')}</Label>
        <WeightChart series={weightSeries} />
      </section>
      <section>
        <Label>{t('progress.kcalChart')}</Label>
        <KcalChart data={kcalData} target={settings.targets.kcal} />
      </section>
      <section>
        <Label>{t('progress.habitHeatmap')}</Label>
        <HabitHeatmap data={habitData} />
      </section>
    </div>
  );
}

/* ───────────────────────────── Сводки (14.2) ───────────────────────────────── */

function Summaries({ facts }: { facts: DayFactsExt[] }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<7 | 30>(7);

  const current = facts.slice(-period) as DayFacts[];
  const previous = facts.slice(-period * 2, -period) as DayFacts[];
  const prevSummary = previous.length ? buildSummary(previous) : null;
  const summary = buildSummary(current, prevSummary);

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel={t('progress.summaries')}
        value={period}
        options={[
          { value: 7 as const, label: t('progress.weekSummary') },
          { value: 30 as const, label: t('progress.monthSummary') },
        ]}
        onChange={setPeriod}
      />

      <dl className="divide-y divide-hairline">
        <MetricRow
          label={t('units.kcal')}
          value={summary.kcal.average}
          change={summary.kcal.changeVsPrev}
          coverage={`${summary.kcal.daysWithData}/${summary.daysInPeriod}`}
        />
        <MetricRow
          label={t('today.proteinFull')}
          value={summary.proteinG.average}
          change={summary.proteinG.changeVsPrev}
          coverage={`${summary.proteinG.daysWithData}/${summary.daysInPeriod}`}
        />
        <MetricRow
          label={t('today.fatFull')}
          value={summary.fatG.average}
          change={summary.fatG.changeVsPrev}
          coverage={`${summary.fatG.daysWithData}/${summary.daysInPeriod}`}
        />
        <MetricRow
          label={t('today.carbFull')}
          value={summary.carbG.average}
          change={summary.carbG.changeVsPrev}
          coverage={`${summary.carbG.daysWithData}/${summary.daysInPeriod}`}
        />
        <MetricRow label={t('progress.loggedDays')} value={summary.loggedDays} />
        <MetricRow label={t('progress.weightChange')} value={summary.weightChangeKg} signedValue />
        <MetricRow label={t('progress.workoutsCount')} value={summary.workouts} />
        <MetricRow label={t('progress.totalVolume')} value={summary.volumeKg} />
        <MetricRow
          label={t('progress.avgSleep')}
          value={summary.sleepMin.average}
          coverage={`${summary.sleepMin.daysWithData}/${summary.daysInPeriod}`}
          formatter={(v) => durationLong(v)}
        />
        <MetricRow label={t('progress.habitCompletion')} value={summary.habitCompletionPct} />
        <MetricRow
          label={t('progress.nutritionIndex')}
          value={summary.nutritionIndex.average}
          coverage={`${summary.nutritionIndex.daysWithData}/${summary.daysInPeriod}`}
        />
      </dl>
    </div>
  );
}

function MetricRow({
  label,
  value,
  change,
  coverage,
  signedValue,
  formatter,
}: {
  label: string;
  value: number | null;
  change?: number | null;
  coverage?: string;
  signedValue?: boolean;
  formatter?: (v: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline justify-between py-2">
      <dt className="min-w-0 flex-1">
        <span className="block text-body">{label}</span>
        {/* Обязательное требование 14.2: рядом со средним — число дней с данными */}
        {coverage ? (
          <span className="tnum block text-caption text-muted">
            {coverage} {t('common.daysWithData')}
          </span>
        ) : null}
      </dt>
      <dd className="tnum text-right">
        <span className="block text-num">
          {value == null
            ? t('common.notSet')
            : formatter
              ? formatter(value)
              : signedValue
                ? signed(value, 1)
                : num(value, Number.isInteger(value) ? 0 : 1)}
        </span>
        {change != null ? (
          <span className="block text-caption text-muted">{signed(change, 1)}</span>
        ) : null}
      </dd>
    </div>
  );
}

/* ──────────────────────── Сопоставления (14.3) ─────────────────────────────── */

function Comparisons({ facts }: { facts: DayFactsExt[] }) {
  const { t } = useTranslation();
  const results = useMemo(() => computeComparisons(facts), [facts]);
  const available = results.filter((r) => r.available);

  return (
    <div className="space-y-4">
      <p className="text-caption text-muted">{t('progress.comparisonNote')}</p>

      {available.length === 0 ? (
        <p className="text-body text-muted">{t('progress.comparisonNotEnough')}</p>
      ) : (
        <ul className="space-y-3">
          {available.map((r) => {
            const diff = r.difference ?? 0;
            const phrase =
              diff >= 0
                ? t('progress.diffHigher', { value: num(Math.abs(diff), 1) })
                : t('progress.diffLower', { value: num(Math.abs(diff), 1) });
            return (
              <li key={r.key}>
                <p className="text-body">{t(`progress.comparison.${r.key}`, { diff: phrase })}</p>
                <p className="tnum text-caption text-muted">
                  {t('progress.observations', { a: r.groupA.n, b: r.groupB.n })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────── Достижения (12.3) ─────────────────────────────── */

function Achievements() {
  const { t } = useTranslation();
  const game = useQuery((r) => r.game.get());
  const events = useQuery((r) => r.game.events(30)) ?? [];

  if (!game) return null;
  const level = levelProgress(game.xp);
  const unlocked = new Set(game.unlockedAchievements.map((a) => a.key));
  const statuses = evaluateAchievements({}, unlocked);

  return (
    <div className="space-y-5">
      <section>
        <div className="tnum text-display">{level.level}</div>
        <div className="text-caption text-muted">
          {t('game.level', { level: level.level })} · {t('game.xp', { xp: num(game.xp) })}
        </div>
        <div className="mt-2 h-[2px] bg-hairline">
          <div className="h-full bg-accent" style={{ width: `${level.progress * 100}%` }} />
        </div>
        <div className="tnum mt-1 text-caption text-muted">
          {t('game.toNextLevel', {
            level: level.level + 1,
            xp: num(level.nextThreshold - game.xp),
          })}
        </div>
      </section>

      <section>
        <Label>
          {t('game.achievements')} ·{' '}
          {t('game.unlockedCount', { unlocked: unlocked.size, total: statuses.length })}
        </Label>
        <ul className="mt-2 divide-y divide-hairline">
          {statuses.map((s) => (
            <li key={s.def.key} className="flex items-center gap-3 py-2">
              <span className={`w-4 ${s.unlocked ? 'text-accent' : 'text-hairline'}`} aria-hidden="true">
                {s.unlocked ? '◆' : '◇'}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-body ${s.unlocked ? '' : 'text-muted'}`}>
                  {t(`game.achievement.${s.def.key}`)}
                </span>
                <span className="block text-caption text-muted">
                  {t(`game.categories.${s.def.category}`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Label>{t('game.xpLog')}</Label>
        <ul className="tnum mt-2 divide-y divide-hairline text-caption">
          {events.map((e) => (
            <li key={e.id} className="flex justify-between py-1">
              <span className="text-muted">{t(`game.reasons.${e.reason}`, e.reason)}</span>
              <span>{signed(e.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
