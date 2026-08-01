/**
 * Алкоголь и кофеин — раздел 9.4.
 *
 * Алкоголь автоматически добавляет калории в дневник (7 ккал на грамм этанола).
 * Кофеин — счётчик миллиграммов с ориентиром 400 мг/сут.
 */
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { alcoholKcal, ethanolMl } from '@/domain/nutrition/nutrients';
import { CAFFEINE_DAILY_REFERENCE_MG, SUBSTANCE_PRESETS } from '@/domain/nutrition/fasting';
import type { LocalDate } from '@/domain/model';
import { toLocalTime } from '@/lib/date';
import { num } from '@/lib/format';
import { Button, Sheet } from '@/design-system/primitives';

export function SubstancesSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const entries = useQuery((r) => r.substances.byDate(date), [date]) ?? [];

  const caffeineMg = entries.filter((e) => e.kind === 'caffeine').reduce((s, e) => s + e.amount, 0);
  const alcoholKcalTotal = entries
    .filter((e) => e.kind === 'alcohol')
    .reduce((s, e) => s + (e.kcal ?? 0), 0);

  const addPreset = async (key: string) => {
    const preset = SUBSTANCE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const label = t(`food.presets.${key}`);

    if (preset.kind === 'caffeine') {
      await repos.substances.create({
        date,
        time: toLocalTime(),
        kind: 'caffeine',
        amount: preset.amount,
        label,
      });
      return;
    }

    const ethanol = ethanolMl(preset.amount, preset.abv ?? 12);
    const kcal = alcoholKcal(ethanol);
    await repos.substances.create({
      date,
      time: toLocalTime(),
      kind: 'alcohol',
      amount: ethanol,
      label,
      kcal,
    });
    // Алкоголь идёт и в калории — отдельной записью в дневнике (9.4).
    await repos.diary.create({
      date,
      time: toLocalTime(),
      mealSlotId: settings.mealSlots[settings.mealSlots.length - 1]?.id ?? 'snack',
      kind: 'quick',
      quickName: label,
      nutrients: { kcal, proteinG: 0, fatG: 0, carbG: 0 },
      inputMethod: 'quick',
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('food.substancesTitle')}>
      <div className="tnum text-num">
        {t('food.caffeineToday', { mg: num(caffeineMg), limit: CAFFEINE_DAILY_REFERENCE_MG })}
      </div>
      {alcoholKcalTotal > 0 ? (
        <div className="tnum text-caption text-muted">
          {t('food.alcoholKcalNote', { kcal: num(alcoholKcalTotal) })}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {SUBSTANCE_PRESETS.map((preset) => (
          <Button key={preset.key} onClick={() => void addPreset(preset.key)}>
            {t(`food.presets.${preset.key}`)}
          </Button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-hairline">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <span className="tnum w-12 shrink-0 text-caption text-muted">{e.time}</span>
            <span className="min-w-0 flex-1 truncate text-body">{e.label}</span>
            <span className="tnum text-caption text-muted">
              {e.kind === 'caffeine'
                ? `${num(e.amount)} ${t('units.mg')}`
                : `${num(e.amount)} ${t('units.ml')}`}
            </span>
            <button
              type="button"
              aria-label={t('common.delete')}
              className="tappable justify-center px-1 text-muted"
              onClick={() => void repos.substances.remove(e.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
