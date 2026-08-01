/**
 * Вкладка «Тело» — вес и замеры (11.1), сон (11.2), чек-ин (11.3),
 * привычки (12.1) с сериями и заморозками (12.2).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { award } from '@/app/gamification';
import { recomputeStreaks } from '@/app/streaks';
import type { Habit, HabitSchedule, MeasurementKey } from '@/domain/model';
import { movingAverage } from '@/domain/stats/movingAverage';
import { canEditRetroactively, isHabitDone, isScheduledOn } from '@/domain/habits/schedule';
import { addDays, diffDays, lastNDays, sleepDurationMin, today as todayFn } from '@/lib/date';
import { dateShort } from '@/lib/format';
import { Button, NumberField, Segmented, Sheet, TextField, Label } from '@/design-system/primitives';
import { WeightChart } from '@/components/charts/WeightChart';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

type Section = 'weight' | 'sleep' | 'checkin' | 'habits';

const MEASURES: MeasurementKey[] = [
  'neck', 'chest', 'waist', 'hips', 'thighL', 'thighR', 'armL', 'armR', 'calfL', 'calfR',
];

export function BodyScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('weight');

  return (
    <div className="space-y-4">
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
      {section === 'weight' ? <WeightSection /> : null}
      {section === 'sleep' ? <SleepSection /> : null}
      {section === 'checkin' ? <CheckinSection /> : null}
      {section === 'habits' ? <HabitsSection /> : null}
    </div>
  );
}

/* ─────────────────────── Вес и замеры (11.1) ───────────────────────────────── */

function WeightSection() {
  const { t } = useTranslation();
  const repos = useRepos();
  const date = todayFn();
  const [weight, setWeight] = useState<number | ''>('');
  const [measuresOpen, setMeasuresOpen] = useState(false);

  const history = useQueryWithDefault(
    (r) => r.body.byDateRange(addDays(date, -180), date),
    EMPTY,
    [date],
  );
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
    if (weight === '') return;
    const existing = await repos.body.byDate(date);
    if (existing) await repos.body.update(existing.id, { weightKg: weight });
    else await repos.body.create({ date, weightKg: weight });
    await award(repos, 'weightLogged', date);
    setWeight('');
  };

  const stale = lastMeasureDate == null || diffDays(date, lastMeasureDate) > 30;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <NumberField
          value={weight}
          onChange={setWeight}
          suffix={t('units.kg')}
          big
          className="flex-1"
          aria-label={t('body.weightAdd')}
        />
        <Button variant="primary" disabled={weight === ''} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>

      <WeightChart series={series} />
      <p className="text-caption text-muted">{t('body.weightNoise')}</p>

      {stale ? <p className="text-caption text-muted">{t('body.measurementsStale')}</p> : null}

      <Button full onClick={() => setMeasuresOpen(true)}>
        {t('body.measurements')}
      </Button>

      <MeasurementsSheet open={measuresOpen} onClose={() => setMeasuresOpen(false)} />
    </div>
  );
}

function MeasurementsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const repos = useRepos();
  const date = todayFn();
  const record = useQuery((r) => r.body.byDate(date), [date]);
  const [values, setValues] = useState<Partial<Record<MeasurementKey, number | ''>>>({});

  const save = async () => {
    const measurements: Partial<Record<MeasurementKey, number>> = { ...record?.measurements };
    for (const key of MEASURES) {
      const v = values[key];
      if (v !== '' && v != null) measurements[key] = v;
    }
    if (record) await repos.body.update(record.id, { measurements });
    else await repos.body.create({ date, measurements });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('body.measurements')}
      footer={
        <Button variant="primary" full onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {MEASURES.map((key) => (
          <div key={key}>
            <Label>{t(`body.measure.${key}`)}</Label>
            <div className="mt-1">
              <NumberField
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

function SleepSection() {
  const { t } = useTranslation();
  const repos = useRepos();
  const date = todayFn();
  const existing = useQuery((r) => r.sleep.byDate(date), [date]);
  const recent = useQuery((r) => r.sleep.byDateRange(addDays(date, -30), date), [date]) ?? [];

  const [bedAt, setBedAt] = useState('23:00');
  const [wakeAt, setWakeAt] = useState('07:00');
  const [quality, setQuality] = useState<1 | 2 | 3 | 4 | 5>(3);

  const durationMin = sleepDurationMin(bedAt, wakeAt);

  const save = async () => {
    const payload = { date, bedAt, wakeAt, durationMin, quality };
    if (existing) await repos.sleep.update(existing.id, payload);
    else await repos.sleep.create(payload);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>{t('body.bedAt')}</Label>
          <input
            type="time"
            value={bedAt}
            onChange={(e) => setBedAt(e.target.value)}
            className="tnum mt-1 min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
            aria-label={t('body.bedAt')}
          />
        </div>
        <div>
          <Label>{t('body.wakeAt')}</Label>
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
        <Label>{t('body.sleepQuality')}</Label>
        <div className="mt-1">
          <Segmented
            ariaLabel={t('body.sleepQuality')}
            value={quality}
            options={[1, 2, 3, 4, 5].map((v) => ({ value: v as 1 | 2 | 3 | 4 | 5, label: String(v) }))}
            onChange={setQuality}
          />
        </div>
      </div>

      <Button variant="primary" full onClick={() => void save()}>
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

function CheckinSection() {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const date = todayFn();
  const existing = useQuery((r) => r.checkins.byDate(date), [date]);

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [stress, setStress] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [soreness, setSoreness] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [steps, setSteps] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const save = async () => {
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
    await award(repos, 'checkinDone', date);
  };

  return (
    <div className="space-y-4">
      <Scale label={t('body.mood')} value={mood} onChange={setMood} />
      <Scale label={t('body.energy')} value={energy} onChange={setEnergy} />
      <Scale label={t('body.stress')} value={stress} onChange={setStress} />
      <Scale label={t('body.soreness')} value={soreness} onChange={setSoreness} />

      {settings.showSteps ? (
        <div>
          <Label>{t('body.steps')}</Label>
          <div className="mt-1">
            <NumberField value={steps} onChange={setSteps} aria-label={t('body.steps')} />
          </div>
          <p className="mt-1 text-caption text-muted">{t('body.stepsManual')}</p>
        </div>
      ) : null}

      <TextField value={note} onChange={setNote} aria-label={t('common.note')} placeholder={t('common.note')} />

      <Button variant="primary" full onClick={() => void save()}>
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
      <Label>{label}</Label>
      <div className="mt-1">
        <Segmented
          ariaLabel={label}
          value={value}
          options={[1, 2, 3, 4, 5].map((v) => ({ value: v as 1 | 2 | 3 | 4 | 5, label: String(v) }))}
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
  const week = lastNDays(7, date);

  const toggle = async (habit: Habit, day: string) => {
    if (!canEditRetroactively(day)) return;
    await repos.habitLogs.toggle(habit.id, day);
    await award(repos, 'habitDone', day, habit.id);
    await recomputeStreaks(repos);
  };

  return (
    <div className="space-y-4">
      {game ? (
        <div className="tnum text-caption text-muted">
          {t('habits.streak', { count: game.streaks.habits?.current ?? 0 })} ·{' '}
          {t('habits.bestStreak', { count: game.streaks.habits?.best ?? 0 })} ·{' '}
          {t('habits.freezes', { count: game.freezes })}
        </div>
      ) : null}
      <p className="text-caption text-muted">{t('habits.freezeExplain')}</p>

      {active.length === 0 ? (
        <p className="py-6 text-body text-muted">{t('habits.empty')}</p>
      ) : (
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
            {active.map((habit) => (
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

      <p className="text-caption text-muted">{t('habits.retroHint')}</p>

      <Button full onClick={() => setEditorOpen(true)}>
        {t('habits.new')}
      </Button>

      <HabitEditorSheet open={editorOpen} onClose={() => setEditorOpen(false)} order={active.length} />
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
  const [type, setType] = useState<HabitSchedule['type']>('daily');
  const [times, setTimes] = useState<number | ''>(3);
  const [everyN, setEveryN] = useState<number | ''>(2);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [targetValue, setTargetValue] = useState<number | ''>('');

  const schedule = (): HabitSchedule => {
    if (type === 'weekdays') return { type: 'weekdays', days };
    if (type === 'timesPerWeek') return { type: 'timesPerWeek', times: times === '' ? 3 : times };
    if (type === 'everyNDays') return { type: 'everyNDays', n: everyN === '' ? 2 : everyN };
    return { type: 'daily' };
  };

  const save = async () => {
    if (!name.trim()) return;
    await repos.habits.create({
      name: name.trim(),
      icon,
      schedule: schedule(),
      targetValue: targetValue === '' ? undefined : targetValue,
      archived: false,
      order,
    });
    setName('');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('habits.new')}
      footer={
        <Button variant="primary" full disabled={!name.trim()} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField value={name} onChange={setName} aria-label={t('habits.name')} placeholder={t('habits.name')} />
        <TextField value={icon} onChange={setIcon} aria-label={t('habits.icon')} maxLength={2} />

        <div>
          <Label>{t('habits.schedule')}</Label>
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
          <NumberField value={times} onChange={setTimes} aria-label={t('habits.scheduleTypes.timesPerWeek')} />
        ) : null}
        {type === 'everyNDays' ? (
          <NumberField value={everyN} onChange={setEveryN} aria-label={t('habits.scheduleTypes.everyNDays')} />
        ) : null}

        <div>
          <Label>{t('habits.targetValue')}</Label>
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
