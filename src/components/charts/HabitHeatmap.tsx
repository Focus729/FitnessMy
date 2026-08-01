/**
 * Тепловая карта привычек — раздел 14.1.
 * Компактная сетка год × дни, монохромная: насыщенность вместо цвета,
 * чтобы состояние не передавалось одним лишь цветом (19.3).
 */
import { useTranslation } from 'react-i18next';
import { dateShort } from '@/lib/format';

export function HabitHeatmap({
  data,
}: {
  data: { date: string; ratio: number | null }[];
}) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return <p className="py-6 text-caption text-muted">{t('progress.noData')}</p>;
  }

  // Раскладка по неделям: столбец — неделя, строка — день недели.
  const weeks: { date: string; ratio: number | null }[][] = [];
  let current: { date: string; ratio: number | null }[] = [];
  for (const day of data) {
    current.push(day);
    if (weekdayOf(day.date) === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length) weeks.push(current);

  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="flex gap-[2px]">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-[2px]">
            {week.map((day) => (
              <span
                key={day.date}
                title={`${dateShort(day.date)}`}
                className="block h-3 w-3 rounded-[2px]"
                style={{
                  background:
                    day.ratio == null
                      ? 'var(--hairline)'
                      : `color-mix(in srgb, var(--ink) ${Math.round(day.ratio * 100)}%, var(--hairline))`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
  return wd === 0 ? 7 : wd;
}
