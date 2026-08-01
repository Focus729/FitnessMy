/** Спарклайн — компактный тренд без осей и подписей (18.5). */

export function Sparkline({
  values,
  width = 80,
  height = 20,
  ariaLabel,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return null;

  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;

  const points = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
