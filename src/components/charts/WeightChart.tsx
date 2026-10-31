/**
 * График веса — раздел 11.1 и 14.1.
 *
 * Обязательно: сырые точки тонкими серыми, тренд (скользящее среднее за 7 дней)
 * акцентной линией. Интерполированные участки рисуются пунктиром (14.4).
 *
 * Графики рисуются в --ink и --muted; акцент — только линия тренда (18.2).
 */
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SmoothedPoint } from '@/domain/stats/movingAverage';
import { dateShort, num } from '@/lib/format';
import { useSettings } from '@/app/hooks';
import { toDisplay, unitKey } from '@/lib/units';

export function WeightChart({ series }: { series: SmoothedPoint[] }) {
  const { t } = useTranslation();
  const { units } = useSettings();
  const display = (value: number | null) =>
    value == null ? null : toDisplay(value, 'mass', units);
  const observed = series.filter((p) => p.raw != null && Number.isFinite(p.raw));
  if (observed.length === 1)
    return (
      <p className="py-6 text-caption text-muted">
        {t('progress.onePoint', {
          date: dateShort(observed[0]!.date),
          value: `${num(display(observed[0]!.raw) as number, 1)} ${t(`units.${unitKey('mass', units)}`)}`,
        })}
      </p>
    );
  if (observed.length === 0) {
    return <p className="py-6 text-caption text-muted">{t('progress.noData')}</p>;
  }

  const data = series.map((p) => ({
    date: p.date,
    raw: display(p.raw),
    trend: p.interpolated ? null : display(p.trend),
    // A continuous dashed baseline remains visible only where observed data is absent.
    interpolated: display(p.trend),
  }));

  const values = data.flatMap((p) => [p.raw, p.trend].filter((v): v is number => v != null));
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);

  return (
    <div className="w-full">
      <p className="mb-2 text-caption text-muted">
        {dateShort(series[0]!.date)}–{dateShort(series[series.length - 1]!.date)} ·{' '}
        {observed.length}/{series.length} {t('common.daysWithData')} ·{' '}
        {t(`units.${unitKey('mass', units)}`)}
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={dateShort}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              stroke="var(--hairline)"
              minTickGap={40}
            />
            <YAxis
              domain={[min, max]}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              stroke="var(--hairline)"
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => dateShort(String(v))}
              formatter={(value: number) => num(value, 1)}
            />
            <Scatter
              dataKey="raw"
              name={t('body.rawPoints')}
              fill="var(--muted)"
              shape="circle"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="interpolated"
              name={t('body.trend')}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="trend"
              name={t('body.trend')}
              tooltipType="none"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-caption text-muted">{t('progress.interpolationHint')}</p>
    </div>
  );
}

/** Простой столбчатый график калорий с линией цели (14.1). */
export function KcalChart({
  data,
  target,
}: {
  data: { date: string; kcal: number | null }[];
  target: number;
}) {
  const { t } = useTranslation();
  const observed = data.filter((p) => p.kcal != null && Number.isFinite(p.kcal));
  if (observed.length === 1)
    return (
      <p className="py-6 text-caption text-muted">
        {t('progress.onePoint', {
          date: dateShort(observed[0]!.date),
          value: `${num(observed[0]!.kcal as number)} ${t('units.kcal')}`,
        })}
      </p>
    );
  if (observed.length === 0) {
    return <p className="py-6 text-caption text-muted">{t('progress.noData')}</p>;
  }

  return (
    <div className="w-full">
      <p className="mb-2 text-caption text-muted">
        {dateShort(data[0]!.date)}–{dateShort(data[data.length - 1]!.date)} · {observed.length}/
        {data.length} {t('common.daysWithData')} · {t('units.kcal')}
      </p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.map((d) => ({ ...d, target }))}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
          >
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={dateShort}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              stroke="var(--hairline)"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              stroke="var(--hairline)"
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => dateShort(String(v))}
              formatter={(value: number) => num(value)}
            />
            <Line
              type="stepAfter"
              dataKey="target"
              name={t('settings.sections.targets')}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="kcal"
              name={t('units.kcal')}
              stroke="var(--ink)"
              strokeWidth={2}
              dot={{ r: 2, fill: 'var(--ink)' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
