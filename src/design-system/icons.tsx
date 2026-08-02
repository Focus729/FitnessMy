/**
 * Иконки разделов — задача 6 доработки 0.7, пункт 1.
 *
 * У каждого из пяти разделов своя форма. Активная вкладка — заливка акцентом,
 * неактивная — контур: состояние передаётся и цветом, и формой, поэтому
 * различимо и без цвета (19.3).
 *
 * Формы намеренно геометрические и монохромные — иллюстраций в приложении нет
 * (18.1), выразительность сосредоточена в ленте дня.
 */

export type SectionIconName = 'today' | 'food' | 'gym' | 'body' | 'progress' | 'settings';

const PATHS: Record<SectionIconName, string> = {
  // Лента дня: горизонтальная линия с отметкой
  today: 'M3 12h18M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  // Тарелка
  food: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  // Гриф с блинами
  gym: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  // Силуэт-ромб
  body: 'M12 3l7 9l-7 9l-7-9z',
  // Растущий график
  progress: 'M4 20V9M10 20V4M16 20v-7M22 20H2',
  // Шестерня, сведённая к кругу с рисками
  settings: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3',
};

export function SectionIcon({
  name,
  active = false,
  size = 20,
}: {
  name: SectionIconName;
  active?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={active ? 'text-accent' : 'text-muted'}
    >
      <path
        d={PATHS[name]}
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Активная вкладка дополнительно заливается — форма читается плотнее.
        fill={active && (name === 'body' || name === 'today') ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.18 : 0}
      />
    </svg>
  );
}
