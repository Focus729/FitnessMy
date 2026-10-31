/**
 * Планировщик меню и список покупок — раздел 9.5.
 * Детерминированный алгоритм, без AI.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useRouteState } from '@/app/navigation';
import { useSettings } from '@/app/hooks';
import {
  buildShoppingList,
  planWeek,
  type PlanCandidate,
  type PlanResult,
} from '@/domain/nutrition/planner';
import { computeDish, computeRecipe } from '@/domain/nutrition/recipe';
import type { Nutrients } from '@/domain/model';
import { dateRange, startOfWeek, today as todayFn, toLocalTime } from '@/lib/date';
import { dateShort, num, percent } from '@/lib/format';
import { Button, Segmented, Stepper } from '@/design-system/primitives';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

export function PlannerPanel() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [date, setDate] = useRouteState('week', startOfWeek(todayFn(), settings.firstDayOfWeek));
  const weekStart = startOfWeek(date, settings.firstDayOfWeek);
  const saved = useQuery(
    async (r) => ({
      weekStart,
      draft: await r.meta.get<PlannerDraft>(`planner.${weekStart}`),
    }),
    [weekStart],
  );
  return (
    <div className="space-y-4">
      <label className="text-caption">
        {t('food.planWeek')}{' '}
        <input
          type="date"
          value={weekStart}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
      </label>
      {saved?.weekStart === weekStart ? (
        <PlannerWeek key={weekStart} weekStart={weekStart} initial={saved.draft} />
      ) : (
        <p>{t('common.loading')}</p>
      )}
    </div>
  );
}

interface PlannerDraft {
  selected: Record<string, number>;
  plan: PlanResult | null;
  checked: Record<string, boolean>;
}

function PlannerWeek({ weekStart, initial }: { weekStart: string; initial?: PlannerDraft }) {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const [selected, setSelected] = useState<Record<string, number>>(initial?.selected ?? {});
  const [plan, setPlan] = useState<PlanResult | null>(initial?.plan ?? null);
  const [view, setView] = useState<'plan' | 'shopping'>('plan');
  const [checked, setChecked] = useState<Record<string, boolean>>(initial?.checked ?? {});
  const [failed, setFailed] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  useEffect(() => {
    void repos.meta
      .set(`planner.${weekStart}`, { selected, plan, checked })
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  }, [repos, weekStart, selected, plan, checked]);

  const candidates = useQueryWithDefault(async (r) => {
    const [dishes, recipes, foods] = await Promise.all([
      r.dishes.all(),
      r.recipes.all(),
      r.foods.all(),
    ]);
    const byId = new Map(foods.map((f) => [f.id, f]));
    const out: PlanCandidate[] = [];

    for (const dish of dishes) {
      const math = computeDish(
        dish.components
          .map((c) => ({ grams: c.grams, per100: byId.get(c.foodId)?.per100 }))
          .filter((c): c is { grams: number; per100: Nutrients } => c.per100 != null),
      );
      if (math.totalGrams <= 0) continue;
      out.push({
        refId: dish.id,
        kind: 'dish',
        name: dish.name,
        per100: math.per100,
        baseGrams: math.totalGrams,
        maxPerWeek: 3,
        components: dish.components.map((c) => ({
          foodId: c.foodId,
          name: byId.get(c.foodId)?.name ?? '',
          grams: c.grams,
          category: byId.get(c.foodId)?.category ?? 'other',
        })),
      });
    }

    for (const recipe of recipes) {
      const math = computeRecipe(
        recipe.components
          .map((c) => ({ grams: c.grams, per100: byId.get(c.foodId)?.per100 }))
          .filter((c): c is { grams: number; per100: Nutrients } => c.per100 != null),
        recipe.yieldGrams,
        recipe.servings,
      );
      if (math.yieldGrams <= 0) continue;
      out.push({
        refId: recipe.id,
        kind: 'recipe',
        name: recipe.name,
        per100: math.per100Cooked,
        baseGrams: math.servingGrams,
        maxPerWeek: 3,
        components: recipe.components.map((c) => ({
          foodId: c.foodId,
          name: byId.get(c.foodId)?.name ?? '',
          grams: c.grams / Math.max(1, recipe.servings),
          category: byId.get(c.foodId)?.category ?? 'other',
        })),
      });
    }

    return out;
  }, EMPTY);

  const pool = useMemo(
    () =>
      candidates
        .filter((c) => (selected[c.refId] ?? 0) > 0)
        .map((c) => ({ ...c, maxPerWeek: selected[c.refId] as number })),
    [candidates, selected],
  );

  const dates = dateRange(weekStart, dateRange(weekStart, weekStart)[0] as string).length
    ? Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i))
    : [];

  const generate = () => {
    setPlan(
      planWeek({
        dates,
        slots: settings.mealSlots
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            mealSlotId: s.id,
            share: s.targetKcalShare ?? 1 / settings.mealSlots.length,
          })),
        candidates: pool,
        targets: {
          kcal: settings.targets.kcal,
          proteinG: settings.targets.proteinG,
          fatG: settings.targets.fatG,
          carbG: settings.targets.carbG,
        },
      }),
    );
  };

  const applyDay = async (dayIndex: number) => {
    const day = plan?.days[dayIndex];
    if (!day) return;
    try {
      await repos.diary.addBatch(
        day.slots.map((slot, index) => {
          const id = `menu-${day.date}-${index}-${slot.mealSlotId}`;
          return {
            id,
            date: day.date,
            time: toLocalTime(),
            mealSlotId: slot.mealSlotId,
            kind: slot.kind === 'food' ? 'food' : slot.kind,
            refId: slot.refId,
            grams: slot.grams,
            nutrients: slot.nutrients,
            inputMethod: 'plan',
          };
        }),
      );
      setApplied(day.date);
    } catch {
      setFailed(true);
    }
  };

  const shopping = plan ? buildShoppingList(plan.days, pool) : [];

  if (candidates.length === 0) {
    return <p className="py-6 text-body text-muted">{t('food.planEmptyPool')}</p>;
  }

  return (
    <div className="space-y-4">
      {failed ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {applied ? (
        <p role="status">
          {dateShort(applied)} · {t('common.done')}
        </p>
      ) : null}
      <div>
        <div className="text-label uppercase text-muted">{t('food.planPool')}</div>
        <ul className="mt-2 divide-y divide-hairline">
          {candidates.map((c) => (
            <li key={c.refId} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-body">{c.name}</span>
              <Stepper
                value={selected[c.refId] ?? 0}
                min={0}
                max={7}
                ariaLabel={t('food.planMaxPerWeek', {
                  count: selected[c.refId] ?? 0,
                })}
                onChange={(v) => setSelected((s) => ({ ...s, [c.refId]: v }))}
              />
            </li>
          ))}
        </ul>
      </div>

      <Button variant="primary" full disabled={pool.length === 0} onClick={generate}>
        {plan ? t('food.planRegenerate') : t('food.planGenerate')}
      </Button>

      {plan ? (
        <>
          <p className={`text-caption ${plan.ok ? 'text-good' : 'text-muted'}`}>
            {plan.ok ? t('food.planOk') : t('food.planOff')}
          </p>

          <Segmented
            ariaLabel={t('food.planTitle')}
            value={view}
            options={[
              { value: 'plan' as const, label: t('food.planTitle') },
              { value: 'shopping' as const, label: t('food.shoppingList') },
            ]}
            onChange={setView}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <ul
              aria-label={t('food.planTitle')}
              className={`space-y-3 ${view === 'plan' ? '' : 'hidden lg:block'}`}
            >
              {plan.days.map((day, i) => (
                <li key={day.date}>
                  <div className="flex items-baseline justify-between border-b border-hairline pb-1">
                    <span className="text-label uppercase text-muted">{dateShort(day.date)}</span>
                    <span className="tnum text-caption text-muted">
                      {num(Math.round(day.totals.kcal))} ·{' '}
                      {t('food.planDeviation', {
                        value: num(day.kcalDeviation * 100, 1),
                      })}
                    </span>
                  </div>
                  <ul>
                    {day.slots.map((slot) => (
                      <li key={`${day.date}-${slot.mealSlotId}`} className="flex gap-3 py-1">
                        <span className="min-w-0 flex-1 truncate text-caption">{slot.name}</span>
                        <span className="tnum text-caption text-muted">
                          {num(slot.grams)} {t('units.g')}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button variant="ghost" className="px-0" onClick={() => void applyDay(i)}>
                    {t('food.planApplyDay')}
                  </Button>
                </li>
              ))}
            </ul>
            <ul
              aria-label={t('food.shoppingList')}
              className={`divide-y divide-hairline ${view === 'shopping' ? '' : 'hidden lg:block'}`}
            >
              {shopping.map((item) => (
                <li key={item.name}>
                  <label className="flex min-h-touch items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked[item.name] ?? false}
                      onChange={(e) =>
                        setChecked((c) => ({
                          ...c,
                          [item.name]: e.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{item.name}</span>
                      <span className="block text-caption text-muted">
                        {t(`food.categories.${item.category}`, item.category)}
                      </span>
                    </span>
                    <span className="tnum text-caption text-muted">
                      {num(item.grams)} {t('units.g')}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-caption text-muted">
            {t('food.planDeviation', {
              value: num(plan.worstDeviation * 100, 1),
            })}{' '}
            · {percent(plan.worstDeviation, 1)}
          </p>
        </>
      ) : null}
    </div>
  );
}

function addDaysLocal(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
