/**
 * Онбординг — раздел 8.1. Шесть шагов, назад можно всегда.
 * Пропустить онбординг нельзя, но каждый шаг, кроме 2 и 3, — можно.
 *
 * После онбординга — экран расчёта: показать норму, объяснить, откуда она
 * взялась, и дать сразу изменить любую цифру (B6-б).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useSettings, useUpdateSettings } from '@/app/hooks';
import { setLocale, type Locale } from '@/i18n';
import { requestPersistentStorage } from '@/data/backup';
import {
  calculateTargets,
  targetInputFromProfile,
  type CalculatedTargets,
} from '@/domain/nutrition/targets';
import type { ActivityLevel, Goal, Profile } from '@/domain/model';
import { today } from '@/lib/date';
import { num } from '@/lib/format';
import { Button, NumberField, Segmented, TextField, Label } from '@/design-system/primitives';

const ACTIVITY_LEVELS: ActivityLevel[] = [1.2, 1.375, 1.55, 1.725, 1.9];
const TOTAL_STEPS = 6;

interface Draft {
  name: string;
  sex: 'male' | 'female';
  birthDate: string;
  heightCm: number | '';
  goal: Goal;
  ratePerWeek: number;
  activityLevel: ActivityLevel;
  weightKg: number | '';
  bodyFatPct: number | '';
}

export function Onboarding() {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();

  const [step, setStep] = useState(1);
  const [persistGranted, setPersistGranted] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft>({
    name: '',
    sex: 'male',
    birthDate: '1990-01-01',
    heightCm: 175,
    goal: 'maintain',
    ratePerWeek: 0,
    activityLevel: 1.375,
    weightKg: '',
    bodyFatPct: '',
  });

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const calc: CalculatedTargets | null = useMemo(() => {
    if (draft.weightKg === '' || draft.heightCm === '') return null;
    const profile = {
      sex: draft.sex,
      birthDate: draft.birthDate,
      heightCm: draft.heightCm,
      activityLevel: draft.activityLevel,
      goal: draft.goal,
      goalRatePerWeekKg: draft.goal === 'lose' ? -draft.ratePerWeek : draft.ratePerWeek,
      bodyFatPct: draft.bodyFatPct === '' ? undefined : draft.bodyFatPct,
    } as Profile;
    return calculateTargets(targetInputFromProfile(profile, draft.weightKg));
  }, [draft]);

  const finish = async (kcalOverride?: number) => {
    if (!calc || draft.weightKg === '' || draft.heightCm === '') return;

    await repos.profile.save({
      id: '',
      name: draft.name || t('profiles.me'),
      sex: draft.sex,
      birthDate: draft.birthDate,
      heightCm: draft.heightCm,
      activityLevel: draft.activityLevel,
      goal: draft.goal,
      goalRatePerWeekKg: draft.goal === 'lose' ? -draft.ratePerWeek : draft.ratePerWeek,
      ...(draft.bodyFatPct === '' ? {} : { bodyFatPct: draft.bodyFatPct }),
    });

    await repos.body.create({ date: today(), weightKg: draft.weightKg });

    const targets = { ...calc.targets };
    if (kcalOverride != null && kcalOverride !== targets.kcal) {
      targets.kcal = kcalOverride;
      targets.mode = 'manual';
    }
    await updateSettings({ targets, onboardingDone: true });
  };

  const canGoNext =
    (step !== 2 || draft.heightCm !== '') && (step !== 5 || draft.weightKg !== '');

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Label>{t('onboarding.step', { current: Math.min(step, TOTAL_STEPS), total: TOTAL_STEPS })}</Label>

      <div className="mt-4 flex-1">
        {step === 1 ? (
          <Step title={t('onboarding.languageTitle')} subtitle={t('onboarding.languageSubtitle')}>
            <Segmented
              ariaLabel={t('onboarding.languageTitle')}
              value={settings.locale}
              options={[
                { value: 'ru' as Locale, label: 'Русский' },
                { value: 'en' as Locale, label: 'English' },
              ]}
              onChange={(v) => {
                void setLocale(v);
                void updateSettings({ locale: v });
              }}
            />
          </Step>
        ) : null}

        {step === 2 ? (
          <Step title={t('onboarding.profileTitle')} subtitle={t('onboarding.profileSubtitle')}>
            <Field label={t('onboarding.name')}>
              <TextField
                value={draft.name}
                onChange={(v) => patch({ name: v })}
                aria-label={t('onboarding.name')}
              />
            </Field>
            <Field label={t('onboarding.sex')}>
              <Segmented
                value={draft.sex}
                options={[
                  { value: 'male' as const, label: t('onboarding.male') },
                  { value: 'female' as const, label: t('onboarding.female') },
                ]}
                onChange={(v) => patch({ sex: v })}
              />
            </Field>
            <Field label={t('onboarding.birthDate')}>
              <input
                type="date"
                className="min-h-touch w-full rounded-xl border border-hairline bg-surface px-3 text-body"
                value={draft.birthDate}
                onChange={(e) => patch({ birthDate: e.target.value })}
              />
            </Field>
            <Field label={t('onboarding.height')}>
              <NumberField
                value={draft.heightCm}
                onChange={(v) => patch({ heightCm: v })}
                suffix={t('units.cm')}
                aria-label={t('onboarding.height')}
              />
            </Field>
          </Step>
        ) : null}

        {step === 3 ? (
          <Step title={t('onboarding.goalTitle')}>
            <Segmented
              value={draft.goal}
              options={[
                { value: 'lose' as const, label: t('onboarding.lose') },
                { value: 'maintain' as const, label: t('onboarding.maintain') },
                { value: 'gain' as const, label: t('onboarding.gain') },
              ]}
              onChange={(v) => patch({ goal: v, ratePerWeek: v === 'maintain' ? 0 : 0.5 })}
            />
            {draft.goal !== 'maintain' ? (
              <Field label={t('onboarding.rate')}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.ratePerWeek}
                  onChange={(e) => patch({ ratePerWeek: Number(e.target.value) })}
                  className="w-full accent-[var(--accent)]"
                  aria-label={t('onboarding.rate')}
                />
                <div className="tnum mt-1 text-num">
                  {num(draft.ratePerWeek, 1)} {t('units.kgPerWeek')}
                </div>
                <p className="mt-1 text-caption text-muted">{t('onboarding.rateHint')}</p>
              </Field>
            ) : null}
          </Step>
        ) : null}

        {step === 4 ? (
          <Step title={t('onboarding.activityTitle')} subtitle={t('onboarding.activitySubtitle')}>
            <ul className="space-y-2">
              {ACTIVITY_LEVELS.map((level) => (
                <li key={level}>
                  <button
                    type="button"
                    onClick={() => patch({ activityLevel: level })}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-body ${
                      draft.activityLevel === level ? 'border-accent' : 'border-hairline'
                    }`}
                  >
                    {t(`onboarding.activity_${level}`)}
                  </button>
                </li>
              ))}
            </ul>
          </Step>
        ) : null}

        {step === 5 ? (
          <Step title={t('onboarding.weightTitle')} subtitle={t('onboarding.weightSubtitle')}>
            <NumberField
              value={draft.weightKg}
              onChange={(v) => patch({ weightKg: v })}
              suffix={t('units.kg')}
              big
              autoFocus
              aria-label={t('onboarding.weightTitle')}
            />
            <Field label={t('onboarding.bodyFat')}>
              <NumberField
                value={draft.bodyFatPct}
                onChange={(v) => patch({ bodyFatPct: v })}
                suffix="%"
                aria-label={t('onboarding.bodyFat')}
              />
              <p className="mt-1 text-caption text-muted">{t('onboarding.bodyFatHint')}</p>
            </Field>
          </Step>
        ) : null}

        {step === 6 ? (
          <Step title={t('onboarding.storageTitle')}>
            <p className="text-body">{t('onboarding.storageBody')}</p>
            <p className="mt-3 text-body text-muted">{t('onboarding.storageRisk')}</p>
            <p className="mt-4 text-section">{t('onboarding.storageActions')}</p>
            <ol className="mt-2 space-y-3">
              <li>
                <div className="text-body">{t('onboarding.addToHome')}</div>
                <ul className="mt-1 space-y-0.5 text-caption text-muted">
                  <li>{t('onboarding.addToHomeIos')}</li>
                  <li>{t('onboarding.addToHomeAndroid')}</li>
                  <li>{t('onboarding.addToHomeDesktop')}</li>
                </ul>
              </li>
              <li>
                {persistGranted === true ? (
                  <div className="text-body text-good">{t('onboarding.persistOn')}</div>
                ) : (
                  <Button
                    onClick={() => void requestPersistentStorage().then(setPersistGranted)}
                  >
                    {t('onboarding.enablePersist')}
                  </Button>
                )}
                {persistGranted === false ? (
                  <p className="mt-1 text-caption text-muted">{t('onboarding.persistFailed')}</p>
                ) : null}
              </li>
            </ol>
            <p className="mt-4 text-caption text-muted">{t('onboarding.backupPromise')}</p>
          </Step>
        ) : null}

        {step === 7 && calc ? (
          <TargetsReview calc={calc} draft={draft} onConfirm={(kcal) => void finish(kcal)} />
        ) : null}
      </div>

      {step <= TOTAL_STEPS ? (
        <div className="mt-6 flex gap-2">
          {step > 1 ? (
            <Button onClick={() => setStep((s) => s - 1)}>{t('common.back')}</Button>
          ) : null}
          <Button
            variant="primary"
            full
            disabled={!canGoNext}
            onClick={() => setStep((s) => s + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TargetsReview({
  calc,
  draft,
  onConfirm,
}: {
  calc: CalculatedTargets;
  draft: Draft;
  onConfirm: (kcal: number) => void;
}) {
  const { t } = useTranslation();
  const [kcal, setKcal] = useState<number | ''>(calc.targets.kcal);

  const rate = draft.goal === 'lose' ? -draft.ratePerWeek : draft.ratePerWeek;
  const delta = Math.round((rate * 7700) / 7);

  return (
    <div>
      <h1 className="text-title">{t('onboarding.calcTitle')}</h1>

      <div className="tnum mt-6 text-display">{num(calc.targets.kcal)}</div>
      <div className="text-caption text-muted">{t('units.kcal')}</div>

      <p className="mt-4 text-body text-muted">
        {t('onboarding.calcExplain', {
          bmr: num(calc.bmr),
          formula: t(calc.formula === 'katch' ? 'onboarding.formulaKatch' : 'onboarding.formulaMifflin'),
          activity: draft.activityLevel,
          tdee: num(calc.tdee),
          rate: num(rate, 1),
          delta: num(delta),
        })}
      </p>
      <p className="mt-2 text-caption text-muted">{t('onboarding.calcFootnote')}</p>

      {calc.warnings.map((w) => (
        <p key={w.kind} className="mt-3 rounded-xl border border-over px-3 py-2 text-caption text-over">
          {w.kind === 'belowBmr'
            ? t('onboarding.warnBelowBmr', { kcal: num(w.kcal), bmr: num(w.bmr) })
            : w.kind === 'belowFloor'
              ? t('onboarding.warnBelowFloor', { kcal: num(w.kcal), floor: num(w.floor) })
              : t('onboarding.warnFastRate', { rate: num(w.ratePerWeekKg, 1) })}
        </p>
      ))}

      <div className="mt-6">
        <Label>{t('onboarding.calcEditable')}</Label>
        <div className="mt-2">
          <NumberField
            value={kcal}
            onChange={setKcal}
            suffix={t('units.kcal')}
            big
            aria-label={t('units.kcal')}
          />
        </div>
      </div>

      <dl className="mt-4 space-y-1 text-caption text-muted">
        <MacroRow label={t('today.proteinFull')} value={calc.targets.proteinG} />
        <MacroRow label={t('today.fatFull')} value={calc.targets.fatG} />
        <MacroRow label={t('today.carbFull')} value={calc.targets.carbG} />
        <MacroRow label={t('today.fiberFull')} value={calc.targets.fiberG} />
      </dl>

      <Button
        variant="primary"
        full
        className="mt-6"
        onClick={() => onConfirm(kcal === '' ? calc.targets.kcal : kcal)}
      >
        {t('common.done')}
      </Button>
    </div>
  );
}

function MacroRow({ label, value }: { label: string; value: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="tnum">
        {num(value)} {t('units.g')}
      </dd>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-title">{title}</h1>
      {subtitle ? <p className="mt-1 text-caption text-muted">{subtitle}</p> : null}
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
