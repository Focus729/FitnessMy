/** Вода — раздел 9.4: кнопки быстрого добавления с настраиваемыми объёмами. */
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import type { LocalDate } from '@/domain/model';
import { toLocalTime } from '@/lib/date';
import { num } from '@/lib/format';
import { Button, Sheet } from '@/design-system/primitives';

export function WaterSheet({
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
  const entries = useQuery((r) => r.water.byDate(date), [date]) ?? [];
  const total = entries.reduce((s, e) => s + e.ml, 0);

  const add = (ml: number) =>
    repos.water.create({ date, time: toLocalTime(), ml });

  return (
    <Sheet open={open} onClose={onClose} title={t('food.waterTitle')}>
      <div className="tnum text-display">{num(total)}</div>
      <div className="text-caption text-muted">
        {t('units.ml')} · {t('common.goal')} {num(settings.targets.waterMl)}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {settings.waterPresetsMl.map((ml) => (
          <Button key={ml} onClick={() => void add(ml)}>
            {t('food.waterAdd', { ml })}
          </Button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-hairline">
        {entries.map((e) => (
          <li key={e.id} className="flex min-h-touch items-center gap-3">
            <span className="tnum flex-1 text-caption text-muted">{e.time}</span>
            <span className="tnum text-num">
              {num(e.ml)} {t('units.ml')}
            </span>
            <button
              type="button"
              aria-label={t('common.delete')}
              className="tappable justify-center px-2 text-muted"
              onClick={() => void repos.water.remove(e.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
