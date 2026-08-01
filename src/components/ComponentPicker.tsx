/** Общий подбор ингредиентов для блюд и рецептов. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@/data/repositories/hooks';
import type { Food } from '@/domain/model';
import { num } from '@/lib/format';
import { NumberField, TextField } from '@/design-system/primitives';

export interface ComponentRow {
  foodId: string;
  grams: number;
}

export function ComponentPicker({
  components,
  onChange,
}: {
  components: ComponentRow[];
  onChange: (rows: ComponentRow[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const results = useQuery((r) => r.foods.search(query, 12), [query]) ?? [];
  const foods = useQuery((r) => r.foods.all()) ?? [];
  const byId = new Map(foods.map((f: Food) => [f.id, f]));

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-hairline">
        {components.map((row, i) => (
          <li key={`${row.foodId}-${i}`} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-body">
              {byId.get(row.foodId)?.name ?? row.foodId}
            </span>
            <div className="w-24">
              <NumberField
                value={row.grams}
                onChange={(v) =>
                  onChange(
                    components.map((c, k) => (k === i ? { ...c, grams: v === '' ? 0 : v } : c)),
                  )
                }
                suffix={t('units.g')}
                aria-label={t('units.g')}
              />
            </div>
            <button
              type="button"
              aria-label={t('common.delete')}
              className="tappable justify-center px-1 text-muted"
              onClick={() => onChange(components.filter((_, k) => k !== i))}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>

      <TextField
        value={query}
        onChange={setQuery}
        placeholder={t('food.searchPlaceholder')}
        aria-label={t('food.searchPlaceholder')}
      />
      {query.trim() ? (
        <ul className="divide-y divide-hairline">
          {results.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
                onClick={() => {
                  onChange([...components, { foodId: food.id, grams: 100 }]);
                  setQuery('');
                }}
              >
                <span className="min-w-0 flex-1 truncate text-body">{food.name}</span>
                <span className="tnum text-caption text-muted">{num(food.per100.kcal)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
