import { useSaveAction } from '@/app/useSaveAction';
import { useSessionDraft, clearSessionDraft } from '@/app/useSessionDraft';
import { toDisplay, unitKey } from '@/lib/units';
import { MeasureField } from '@/components/MeasureField';
/**
 * Вкладка «Тело» — вес и замеры (11.1), сон (11.2), чек-ин (11.3),
 * привычки (12.1) с сериями и заморозками (12.2).
 */
import { useMemo, useState } from 'react';
import { useRouteState } from '@/app/navigation';
import type { SleepLog, DailyCheckin } from '@/domain/model';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { award } from '@/app/gamification';
import { recomputeStreaks } from '@/app/streaks';
import type { Habit, HabitPolarity, HabitSchedule, MeasurementKey } from '@/domain/model';
import { movingAverage, trendChange } from '@/domain/stats/movingAverage';
import { canEditRetroactively, isHabitDone, isScheduledOn } from '@/domain/habits/schedule';
import { addDays, diffDays, lastNDays, sleepDurationMin, today as todayFn } from '@/lib/date';
import { dateShort, num } from '@/lib/format';
import {
  Button,
  MetricValue,
  NumberField,
  Panel,
  SectionHeader,
  Segmented,
  Sheet,
  TextField,
} from '@/design-system/primitives';
import { WeightChart } from '@/components/charts/WeightChart';
import { QuitHabitCard } from '@/components/QuitHabitCard';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

type Section = 'weight' | 'sleep' | 'checkin' | 'habits';

const MEASURES: MeasurementKey[] = [
  'neck',
  'chest',
  'waist',
  'hips',
  'thighL',
  'thighR',
  'armL',
  'armR',
  'calfL',
  'calfR',
];

export function BodyScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useRouteState<Section>('section', 'weight', [
    'weight',
    'sleep',
    'checkin',
    'habits',
  ]);
  const [date, setDate] = useRouteState('date', todayFn());

  return (
    <div className="space-y-4">
      <input
        type="date"
        value={date}
        max={todayFn()}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        aria-label={t('common.date')}
        className="min-h-touch rounded-xl border border-hairline bg-surface px-3"
      />
      <Segmented
        ariaLabel={t('body.title')}
        value={section}
        options={[
          { value: 'weight' as const, label: t('body.weight') },
          { value: 'sleep' as const, label: t('body.sleep') },
          { value: 'checkin' as const, label: t('body.checkin') },
          { value: 'habits' as const, label: t('body.habits') },
        ]}
        onChange={setSection}
      />
      {section === 'weight' ? <WeightSection key={date} date={date} /> : null}
      {section === 'sleep' ? <SleepSection key={date} date={date} /> : null}
      {section === 'checkin' ? <CheckinSection key={date} date={date} /> : null}
      {section === 'habits' ? <HabitsSection /> : null}
    </div>
  );
}

/* ─────────────────────── Вес и замеры (11.1) ───────────────────────────────── */

function WeightSection({ date }: { date: string }) {
  const { t } = useTranslation();
  const repos = useRepos();
  const saving = useSaveAction();
  const { units } = useSettings();
  const [weight, setWeight] = useState<number | ''>('');
  const [measuresOpen, setMeasuresOpen] = useState(false);

  const history = useQueryWithDefault((r) => r.body.byDateRange(addDays(date, -180), date), EMPTY, [
    date,
  ]);
  const lastMeasureDate = useQuery((r) => r.body.lastMeasurementDate());

  const series = useMemo(
    () =>
      movingAverage(
        history
          .filter((b) => b.weightKg != null)
          .map((b) => ({ date: b.date, value: b.weightKg as number })),
        7,
      ),
    [history],
  );

  const save = async () => {
    if (weight === '' || weight <= 0) return;
    const existing = await repos.body.byDate(date);
    if (existing) await repos.body.update(existing.id, { weightKg: weight });
    else await repos.body.create({ date, weightKg: weight });
    await award(repos, 'weightLogged', date);
    setWeight('');
  };

  const stale = lastMeasureDate == null || diffDays(date, lastMeasureDate) > 30;
  const latestTrend = [...series].reverse().find((p) => p.trend != null)?.trend ?? null;
  const trendDelta = trendChange(series);

  return (
    <div className="space-y-4">
      {saving.state === 'error' ? (
        <p role="alert">{t('errors.saveFailed')}</p>
      ) : saving.state === 'saved' ? (
        <p role="status">{t('common.done')}</p>
      ) : null}
      <div className="flex gap-2">
        <MeasureField
          value={weight}
          onChange={setWeight}
          suffix={t('units.kg')}
          big
          className="flex-1"
          aria-label={t('body.weightAdd')}
        />
        <Button
          variant="primary"
          disabled={weight === '' || weight <= 0 || saving.busy}
          onClick={() => void saving.run(save)}
        >
          {t('common.save')}
        </Button>
      </div>

      <Panel title={t('body.trend')}>
        <MetricValue
          value={latestTrend != null ? num(toDisplay(latestTrend, 'mass', units), 1) : '—'}
          unit={t(`units.${unitKey('mass', units)}`)}
          size="display"
          delta={trendDelta == null ? undefined : toDisplay(trendDelta, 'mass', units)}
          deltaGood="neutral"
        />
        <WeightChart series={series} />
        <p className="text-caption text-muted">{t('body.weightNoise')}</p>
      </Panel>

      {stale ? <p className="text-caption text-muted">{t('body.measurementsStale')}</p> : null}

      <Button full onClick={() => setMeasuresOpen(true)}>
        {t('body.measurements')}
      </Button>

      <MeasurementsSheet
        key={String(measuresOpen)}
        date={date}
        open={measuresOpen}
        onClose={() => setMeasuresOpen(false)}
      />
    </div>
  );
}

function MeasurementsSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const loaded = useQuery(async (r) => ({ record: await r.body.byDate(date) }), [date]);
  const record = loaded?.record;
  const saving = useSaveAction();
  const [values, setValues] = useState<Partial<Record<MeasurementKey, number | ''>>>({});

  const save = async () => {
    if (!loaded) return;
    const measurements: Partial<Record<MeasurementKey, number>> = {
      ...record?.measurements,
    };
    for (const key of MEASURES) {
      const v = values[key];
      if (v !== '' && v != null) {
        if (v <= 0 || v > 300) throw new Error('Invalid measurement');
        measurements[key] = v;
      }
    }
    if (record) await repos.body.update(record.id, { measurements });
    else await repos.body.create({ date, measurements });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!saving.busy) onClose();
      }}
      dirty={Object.keys(values).length > 0}
      onSave={() => void saving.run(save)}
      title={t('body.measurements')}
      footer={
        <Button
          variant="primary"
          full
          disabled={!loaded || saving.busy}
          onClick={() => void saving.run(save)}
        >
          {t('common.save')}
        </Button>
      }
    >
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {MEASURES.map((key) => (
          <div key={key}>
            <SectionHeader title={t(`body.measure.${key}`)} />
            <div className="mt-1">
              <MeasureField
                measure="length"
                value={values[key] ?? record?.measurements?.[key] ?? ''}
                onChange={(v) => setValues((s) => ({ ...s, [key]: v }))}
                suffix={t('units.cm')}
                aria-label={t(`body.measure.${key}`)}
              />
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ──────────────────────────── Сон (11.2) ───────────────────────────────────── */

function SleepSection({ date }: { date: string }) {
  const { t } = useTranslation();
  const loaded = useQuery(async (r) => ({ record: await r.sleep.byDate(date) }), [date]);
  return loaded ? <SleepForm date={date} existing={loaded.record} /> : <p>{t('common.loading')}</p>;
}

function SleepForm({ date, existing }: { date: string; existing?: SleepLog }) {
  const { t } = useTranslation();
  const repos = useRepos();
  const saving = useSaveAction();
  const recent = useQuery((r) => r.sleep.byDateRange(addDays(date, -30), date), [date]) ?? [];

  const [bedAt, setBedAt] = useSessionDraft(`sleep.${date}`, 'bedAt', existing?.bedAt ?? '23:00');
  const [wakeAt, setWakeAt] = useSessionDraft(
    `sleep.${date}`,
    'wakeAt',
    existing?.wakeAt ?? '07:00',
  );
  const [quality, setQuality] = useSessionDraft<1 | 2 | 3 | 4 | 5>(
    `sleep.${date}`,
    'quality',
    existing?.quality ?? 3,
  );

  const durationMin = sleepDurationMin(bedAt, wakeAt);

  const save = async () => {
    if (!bedAt || !wakeAt || durationMin <= 0) throw new Error('Invalid duration');
    const existing = await repos.sleep.byDate(date);
    const payload = { date, bedAt, wakeAt, durationMin, quality };
    if (existing) await repos.sleep.update(existing.id, payload);
    else await repos.sleep.create(payload);
    clearSessionDraft(repos.profileId, `sleep.${date}`);
  };

  return (
    <div className="space-y-4">
      {saving.state === 'error' ? (
        <p role="alert">{t('errors.saveFailed')}</p>
      ) : saving.state === 'saved' ? (
        <p role="status">{t('common.done')}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <SectionHeader title={t('body.bedAt')} />
          <input
            type="time"
            value={bedAt}
            onChange={(e) => setBedAt(e.target.value)}
            className="tnum mt-1 min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
            aria-label={t('body.bedAt')}
          />
        </div>
        <div>
          <SectionHeader title={t('body.wakeAt')} />
          <input
            type="time"
            value={wakeAt}
            onChange={(e) => setWakeAt(e.target.value)}
            className="tnum mt-1 min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
            aria-label={t('body.wakeAt')}
          />
        </div>
      </div>

      <div className="tnum text-num">
        {t('body.sleepDuration', {
          hours: Math.floor(durationMin / 60),
          minutes: durationMin % 60,
        })}
      </div>

      <div>
        <SectionHeader title={t('body.sleepQuality')} />
        <div className="mt-1">
          <Segmented
            ariaLabel={t('body.sleepQuality')}
            value={quality}
            options={[1, 2, 3, 4, 5].map((v) => ({
              value: v as 1 | 2 | 3 | 4 | 5,
              label: String(v),
            }))}
            onChange={setQuality}
          />
        </div>
      </div>

      <Button variant="primary" full disabled={saving.busy} onClick={() => void saving.run(save)}>
        {t('common.save')}
      </Button>

      <ul className="tnum divide-y divide-hairline text-caption">
        {recent
          .slice()
          .reverse()
          .map((s) => (
            <li key={s.id} className="flex justify-between py-1">
              <span className="text-muted">{dateShort(s.date)}</span>
              <span>
                {t('body.sleepDuration', {
                  hours: Math.floor(s.durationMin / 60),
                  minutes: s.durationMin % 60,
                })}{' '}
                · {s.quality}/5
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Чек-ин (11.3) ──────────────────────────────────── */

function CheckinSection({ date }: { date: string }) {
  const { t } = useTranslation();
  const loaded = useQuery(async (r) => ({ record: await r.checkins.byDate(date) }), [date]);
  return loaded ? (
    <CheckinForm date={date} existing={loaded.record} />
  ) : (
    <p>{t('common.loading')}</p>
  );
}

function CheckinForm({ date, existing }: { date: string; existing?: DailyCheckin }) {
  const { t } = useTranslation();
  const repos = useRepos();
  const saving = useSaveAction();
  const settings = useSettings();

  const [mood, setMood] = useSessionDraft<1 | 2 | 3 | 4 | 5>(
    `checkin.${date}`,
    'mood',
    existing?.mood ?? 3,
  );
  const [energy, setEnergy] = useSessionDraft<1 | 2 | 3 | 4 | 5>(
    `checkin.${date}`,
    'energy',
    existing?.energy ?? 3,
  );
  const [stress, setStress] = useSessionDraft<1 | 2 | 3 | 4 | 5>(
    `checkin.${date}`,
    'stress',
    existing?.stress ?? 3,
  );
  const [soreness, setSoreness] = useSessionDraft<1 | 2 | 3 | 4 | 5>(
    `checkin.${date}`,
    'soreness',
    existing?.soreness ?? 3,
  );
  const [steps, setSteps] = useSessionDraft<number | ''>(
    `checkin.${date}`,
    'steps',
    existing?.steps ?? '',
  );
  const [note, setNote] = useSessionDraft(`checkin.${date}`, 'note', existing?.note ?? '');
  const validSteps = steps === '' || (Number.isInteger(steps) && steps >= 0 && steps <= 200000);

  const save = async () => {
    if (!validSteps) return;
    const existing = await repos.checkins.byDate(date);
    const payload = {
      date,
      mood,
      energy,
      stress,
      soreness,
      steps: steps === '' ? undefined : steps,
      note: note.trim() || undefined,
    };
    if (existing) await repos.checkins.update(existing.id, payload);
    else await repos.checkins.create(payload);
    clearSessionDraft(repos.profileId, `checkin.${date}`);
    await award(repos, 'checkinDone', date);
  };

  return (
    <div className="space-y-4">
      {saving.state === 'error' ? (
        <p role="alert">{t('errors.saveFailed')}</p>
      ) : saving.state === 'saved' ? (
        <p role="status">{t('common.done')}</p>
      ) : null}
      <Scale label={t('body.mood')} value={mood} onChange={setMood} />
      <Scale label={t('body.energy')} value={energy} onChange={setEnergy} />
      <Scale label={t('body.stress')} value={stress} onChange={setStress} />
      <Scale label={t('body.soreness')} value={soreness} onChange={setSoreness} />

      {settings.showSteps ? (
        <div>
          <SectionHeader title={t('body.steps')} />
          <div className="mt-1">
            <NumberField
              value={steps}
              onChange={setSteps}
              aria-label={t('body.steps')}
              aria-invalid={!validSteps}
            />
          </div>
          <p className="mt-1 text-caption text-muted">{t('body.stepsManual')}</p>
          {!validSteps ? (
            <p role="alert" className="text-caption text-over">
              {t('body.stepsInvalid')}
            </p>
          ) : null}
        </div>
      ) : null}

      <TextField
        value={note}
        onChange={setNote}
        aria-label={t('common.note')}
        placeholder={t('common.note')}
      />

      <Button
        variant="primary"
        full
        disabled={saving.busy || !validSteps}
        onClick={() => void saving.run(save)}
      >
        {t('common.save')}
      </Button>
    </div>
  );
}

function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div>
      <SectionHeader title={label} />
      <div className="mt-1">
        <Segmented
          ariaLabel={label}
          value={value}
          options={[1, 2, 3, 4, 5].map((v) => ({
            value: v as 1 | 2 | 3 | 4 | 5,
            label: String(v),
          }))}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

/* ──────────────────── Привычки, серии, заморозки (12.1, 12.2) ──────────────── */

function HabitsSection() {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const date = todayFn();

  const habits = useQuery((r) => r.habits.all()) ?? [];
  const logs = useQuery((r) => r.habitLogs.byDateRange(addDays(date, -30), date), [date]) ?? [];
  const game = useQuery((r) => r.game.get());
  const [editorOpen, setEditorOpen] = useState(false);

  const active = habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const buildHabits = active.filter((h) => h.polarity !== 'quit');
  const quitHabits = active.filter((h) => h.polarity === 'quit');
  const week = lastNDays(7, date);

  const toggle = async (habit: Habit, day: string) => {
    if (!canEditRetroactively(day)) return;
    await repos.habitLogs.toggle(habit.id, day);
    await award(repos, 'habitDone', day, habit.id);
    await recomputeStreaks(repos);
  };

  return (
    <div className="space-y-4">
      {/* Серии и заморозки относятся только к привычкам «хочу делать»:
          для отказов пропуск дня ничего не рвёт, покрывать нечего (задача 3). */}
      {game && buildHabits.length > 0 ? (
        <>
          <div className="tnum text-caption text-muted">
            {t('habits.streak', { count: game.streaks.habits?.current ?? 0 })} ·{' '}
            {t('habits.bestStreak', { count: game.streaks.habits?.best ?? 0 })} ·{' '}
            {t('habits.freezes', { count: game.freezes })}
          </div>
          <p className="text-caption text-muted">{t('habits.freezeExplain')}</p>
        </>
      ) : null}

      {quitHabits.length > 0 ? (
        <div className="space-y-3">
          {quitHabits.map((habit) => (
            <QuitHabitCard
              key={habit.id}
              habit={habit}
              logs={logs.filter((l) => l.habitId === habit.id)}
              onRelapse={() => void recomputeStreaks(repos)}
            />
          ))}
          <p className="text-caption text-muted">{t('habits.quitExplain')}</p>
        </div>
      ) : null}

      {active.length === 0 ? (
        <p className="py-6 text-body text-muted">{t('habits.empty')}</p>
      ) : buildHabits.length === 0 ? null : (
        <table className="w-full text-caption">
          <thead>
            <tr className="text-muted">
              <th className="text-left" />
              {week.map((d) => (
                <th key={d} className="w-8 text-center font-normal">
                  {t(`habits.weekdayShort.${isoWeekdayOf(d)}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buildHabits.map((habit) => (
              <tr key={habit.id}>
                <td className="truncate py-1 pr-2 text-body">
                  {habit.icon} {habit.name}
                </td>
                {week.map((d) => {
                  const log = logs.find((l) => l.habitId === habit.id && l.date === d);
                  const scheduled = isScheduledOn(
                    habit,
                    d,
                    logs.filter((l) => l.habitId === habit.id),
                    settings.firstDayOfWeek,
                  );
                  const done = isHabitDone(habit, log);
                  return (
                    <td key={d} className="text-center">
                      <button
                        type="button"
                        aria-label={`${habit.name} ${d}`}
                        aria-pressed={done}
                        disabled={!scheduled || !canEditRetroactively(d)}
                        onClick={() => void toggle(habit, d)}
                        className={`tappable w-full justify-center ${
                          done ? 'text-accent' : scheduled ? 'text-muted' : 'text-hairline'
                        }`}
                      >
                        <span aria-hidden="true">{done ? '✓' : scheduled ? '○' : '·'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {buildHabits.length > 0 ? (
        <p className="text-caption text-muted">{t('habits.retroHint')}</p>
      ) : null}

      <Button full onClick={() => setEditorOpen(true)}>
        {t('habits.new')}
      </Button>

      {editorOpen ? (
        <HabitEditorSheet
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          order={active.length}
        />
      ) : null}
    </div>
  );
}

function isoWeekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
  return wd === 0 ? 7 : wd;
}

function HabitEditorSheet({
  open,
  onClose,
  order,
}: {
  open: boolean;
  onClose: () => void;
  order: number;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('●');
  const [polarity, setPolarity] = useState<HabitPolarity>('build');
  const [quitStartDate, setQuitStartDate] = useState(todayFn());
  const [type, setType] = useState<HabitSchedule['type']>('daily');
  const [times, setTimes] = useState<number | ''>(3);
  const [everyN, setEveryN] = useState<number | ''>(2);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [targetValue, setTargetValue] = useState<number | ''>('');
  const saving = useSaveAction();
  const [initial] = useState(() =>
    JSON.stringify([name, icon, polarity, quitStartDate, type, times, everyN, days, targetValue]),
  );
  const dirty =
    initial !==
    JSON.stringify([name, icon, polarity, quitStartDate, type, times, everyN, days, targetValue]);
  const valid =
    Boolean(name.trim()) &&
    (targetValue === '' || targetValue > 0) &&
    (polarity === 'quit'
      ? Boolean(quitStartDate) && quitStartDate <= todayFn()
      : type === 'timesPerWeek'
        ? Number.isInteger(times) && Number(times) >= 1 && Number(times) <= 7
        : type === 'everyNDays'
          ? Number.isInteger(everyN) && Number(everyN) >= 1
          : type === 'weekdays'
            ? days.length > 0
            : true);

  const schedule = (): HabitSchedule => {
    if (type === 'weekdays') return { type: 'weekdays', days };
    if (type === 'timesPerWeek') return { type: 'timesPerWeek', times: times === '' ? 3 : times };
    if (type === 'everyNDays') return { type: 'everyNDays', n: everyN === '' ? 2 : everyN };
    return { type: 'daily' };
  };

  const save = async () => {
    if (!valid) return;
    await repos.habits.create({
      name: name.trim(),
      icon,
      schedule: schedule(),
      targetValue: targetValue === '' ? undefined : targetValue,
      archived: false,
      order,
      polarity,
      ...(polarity === 'quit' ? { quitStartDate } : {}),
    });
    setName('');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => !saving.busy && onClose()}
      dirty={dirty}
      onSave={valid ? () => void saving.run(save) : undefined}
      title={t('habits.new')}
      footer={
        <Button
          variant="primary"
          full
          disabled={!valid || saving.busy}
          onClick={() => void saving.run(save)}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
        <TextField
          value={name}
          onChange={setName}
          aria-label={t('habits.name')}
          placeholder={t('habits.name')}
        />
        <TextField value={icon} onChange={setIcon} aria-label={t('habits.icon')} maxLength={2} />

        <div>
          <SectionHeader title={t('habits.polarity')} />
          <Segmented
            ariaLabel={t('habits.polarity')}
            value={polarity}
            options={[
              { value: 'build' as const, label: t('habits.polarityBuild') },
              { value: 'quit' as const, label: t('habits.polarityQuit') },
            ]}
            onChange={setPolarity}
          />
        </div>

        {polarity === 'quit' ? (
          <div>
            <SectionHeader title={t('habits.quitStartDate')} hint={t('habits.quitExplain')} />
            <input
              type="date"
              value={quitStartDate}
              max={todayFn()}
              onChange={(e) => setQuitStartDate(e.target.value)}
              className="tnum min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
              aria-label={t('habits.quitStartDate')}
            />
          </div>
        ) : null}

        <div className={polarity === 'quit' ? 'hidden' : undefined}>
          <SectionHeader title={t('habits.schedule')} />
          <div className="mt-1">
            <Segmented
              ariaLabel={t('habits.schedule')}
              value={type}
              options={(['daily', 'weekdays', 'timesPerWeek', 'everyNDays'] as const).map((v) => ({
                value: v,
                label: t(`habits.scheduleTypes.${v}`),
              }))}
              onChange={setType}
            />
          </div>
        </div>

        {type === 'weekdays' ? (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                onClick={() =>
                  setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
                }
                className={`tappable flex-1 justify-center rounded-lg border text-caption ${
                  days.includes(d) ? 'border-accent text-accent' : 'border-hairline text-muted'
                }`}
              >
                {t(`habits.weekdayShort.${d}`)}
              </button>
            ))}
          </div>
        ) : null}

        {type === 'timesPerWeek' ? (
          <NumberField
            value={times}
            onChange={setTimes}
            aria-label={t('habits.scheduleTypes.timesPerWeek')}
          />
        ) : null}
        {type === 'everyNDays' ? (
          <NumberField
            value={everyN}
            onChange={setEveryN}
            aria-label={t('habits.scheduleTypes.everyNDays')}
          />
        ) : null}

        <div>
          <SectionHeader title={t('habits.targetValue')} />
          <div className="mt-1">
            <NumberField
              value={targetValue}
              onChange={setTargetValue}
              aria-label={t('habits.targetValue')}
            />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
