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

export function WeightChart({ series }: { series: SmoothedPoint[] }) {
  const { t } = useTranslation();
  if (series.length < 2) {
    return <p className="py-6 text-caption text-muted">{t('progress.noData')}</p>;
  }

  const data = series.map((p) => ({
    date: p.date,
    raw: p.raw,
    trend: p.trend,
    // Отдельная серия для интерполированных участков — она рисуется пунктиром.
    interpolated: p.interpolated ? p.filled : null,
  }));

  const values = series.flatMap((p) => [p.raw, p.trend].filter((v): v is number => v != null));
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);

  return (
    <div className="h-48 w-full">
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
          <Scatter dataKey="raw" fill="var(--muted)" shape="circle" legendType="none" />
          <Line
            type="monotone"
            dataKey="interpolated"
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="trend"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
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
  if (data.length < 2) {
    return <p className="py-6 text-caption text-muted">{t('progress.noData')}</p>;
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((d) => ({ ...d, target }))} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dateShort}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
            stroke="var(--hairline)"
            minTickGap={40}
          />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} stroke="var(--hairline)" width={40} />
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
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="kcal"
            stroke="var(--ink)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--ink)' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
