/**
 * Вкладка «Еда» — дневник (9.1), индекс питания (9.6), блюда и рецепты (9.3),
 * голодание, алкоголь и кофеин (9.4), планировщик меню (9.5).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveAction } from '@/app/useSaveAction';
import { useRouteState } from '@/app/navigation';
import { useRepos } from '@/data/repositories/context';
import { useQuery } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import type { DiaryEntry, MealSlot } from '@/domain/model';
import { sumEntries } from '@/domain/nutrition/nutrients';
import { computeFoodIndex } from '@/domain/nutrition/foodIndex';
import { addDays, diffDays, today as todayFn, startOfWeek } from '@/lib/date';
import { dateLong, num } from '@/lib/format';
import { Button, Segmented, Sheet, UndoToast } from '@/design-system/primitives';
import { AddFoodSheet } from '@/components/AddFoodSheet';
import { SubstancesSheet } from '@/components/SubstancesSheet';
import { DishEditorSheet } from '@/components/DishEditorSheet';
import { RecipeEditorSheet } from '@/components/RecipeEditorSheet';
import { PlannerPanel } from '@/components/PlannerPanel';
import { DiaryEditorSheet } from '@/components/DiaryEditorSheet';

const EMPTY_ENTRIES: DiaryEntry[] = [];

type Section = 'diary' | 'dishes' | 'recipes' | 'planner';

export function FoodScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useRouteState<Section>('section', 'diary', [
    'diary',
    'dishes',
    'recipes',
    'planner',
  ]);

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel={t('food.title')}
        value={section}
        options={[
          { value: 'diary' as const, label: t('food.diary') },
          { value: 'dishes' as const, label: t('food.myDishes') },
          { value: 'recipes' as const, label: t('food.recipes') },
          { value: 'planner' as const, label: t('food.planner') },
        ]}
        onChange={setSection}
      />

      {section === 'diary' ? <Diary /> : null}
      {section === 'dishes' ? <Dishes /> : null}
      {section === 'recipes' ? <Recipes /> : null}
      {section === 'planner' ? <PlannerPanel /> : null}
    </div>
  );
}

/* ─────────────────────────────── Дневник (9.1) ─────────────────────────────── */

function Diary() {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const [date, setDate] = useRouteState('date', todayFn());
  const [addSlot, setAddSlot] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [substancesOpen, setSubstancesOpen] = useState(false);
  const [expandEmpty, setExpandEmpty] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);

  const entries = useQuery((r) => r.diary.byDate(date), [date]) ?? EMPTY_ENTRIES;
  const names = useQuery(async (r) => {
    const [foods, dishes, recipes] = await Promise.all([
      r.foods.all(),
      r.dishes.all(),
      r.recipes.all(),
    ]);
    return new Map<string, string>([
      ...foods.map((f) => [f.id, f.name] as const),
      ...dishes.map((d) => [d.id, d.name] as const),
      ...recipes.map((x) => [x.id, x.name] as const),
    ]);
  });

  const slots = useMemo(() => {
    const result = [...settings.mealSlots].sort((a, b) => a.order - b.order);
    for (const entry of entries)
      if (!result.some((slot) => slot.id === entry.mealSlotId)) {
        result.push({
          id: entry.mealSlotId,
          name: t('food.uncategorized'),
          order: result.length,
        });
      }
    return result;
  }, [settings.mealSlots, entries, t]);
  const totals = sumEntries(entries);

  const bySlot = new Map<string, DiaryEntry[]>();
  for (const slot of slots) bySlot.set(slot.id, []);
  for (const entry of entries) {
    const list = bySlot.get(entry.mealSlotId) ?? [];
    list.push(entry);
    bySlot.set(entry.mealSlotId, list);
  }

  const emptySlots = slots.filter((s) => (bySlot.get(s.id) ?? []).length === 0);
  const collapseEmpty = emptySlots.length > 2 && !expandEmpty;
  const visibleSlots = collapseEmpty
    ? slots.filter((s) => (bySlot.get(s.id) ?? []).length > 0)
    : slots;

  const slotLabel = (slot: MealSlot) =>
    ['breakfast', 'lunch', 'dinner', 'snack'].includes(slot.id) && slot.name === slot.id
      ? t(`slots.${slot.id}`, slot.name)
      : slot.name;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={t('common.back')}
          className="tappable justify-center px-2 text-muted"
          onClick={() => setDate((d) => addDays(d, -1))}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="text-section">{dateLong(date)}</span>
        <button
          type="button"
          aria-label={t('common.next')}
          className="tappable justify-center px-2 text-muted"
          onClick={() => setDate((d) => addDays(d, 1))}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <button type="button" onClick={() => setIndexOpen(true)} className="w-full text-left">
        <div className="tnum text-num">
          {num(Math.round(totals.kcal))} / {num(settings.targets.kcal)} {t('units.kcal')}
        </div>
        <div className="tnum text-caption text-muted">
          {t('today.protein')} {num(Math.round(totals.proteinG))} · {t('today.fat')}{' '}
          {num(Math.round(totals.fatG))} · {t('today.carb')} {num(Math.round(totals.carbG))} ·{' '}
          {t('food.indexTitle')}
        </div>
      </button>

      <ul className="space-y-3">
        {visibleSlots.map((slot) => {
          const items = bySlot.get(slot.id) ?? [];
          const slotTotals = sumEntries(items);
          return (
            <li key={slot.id}>
              <div className="flex items-baseline justify-between border-b border-hairline pb-1">
                <span className="text-label uppercase text-muted">{slotLabel(slot)}</span>
                <span className="tnum text-caption text-muted">
                  {num(Math.round(slotTotals.kcal))}
                </span>
              </div>
              <ul>
                {items.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setEditing(entry)}
                    >
                      <span className="block truncate text-body">
                        {entry.quickName || names?.get(entry.refId ?? '') || t('food.quickEntry')}
                        {entry.aiGenerated ? (
                          <span className="ml-1 text-[10px] uppercase text-muted">
                            {t('ai.generatedMark')}
                          </span>
                        ) : null}
                      </span>
                      <span className="tnum block text-caption text-muted">
                        {entry.grams != null ? `${num(entry.grams)} ${t('units.g')} · ` : ''}
                        {entry.time}
                      </span>
                    </button>
                    <span className="tnum text-num">{num(Math.round(entry.nutrients.kcal))}</span>
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      className="tappable justify-center px-1 text-muted"
                      onClick={() => {
                        void repos.diary.remove(entry.id);
                        setUndo(entry.id);
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li>
                    <Button variant="ghost" className="px-0" onClick={() => setAddSlot(slot.id)}>
                      {t('food.addFirstMeal', { slot: slotLabel(slot) })}
                    </Button>
                  </li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>

      {collapseEmpty ? (
        <Button variant="ghost" full onClick={() => setExpandEmpty(true)}>
          {t('food.moreSlots', { count: emptySlots.length })}
        </Button>
      ) : null}

      <div className="flex gap-2">
        <Button full onClick={() => setAddSlot(slots[0]?.id ?? 'breakfast')}>
          {t('common.add')}
        </Button>
        <Button full onClick={() => setSubstancesOpen(true)}>
          {t('food.substancesTitle')}
        </Button>
      </div>

      <NutritionIndexSheet open={indexOpen} onClose={() => setIndexOpen(false)} date={date} />
      {editing ? (
        <DiaryEditorSheet
          key={editing.id}
          entry={editing}
          name={editing.quickName || names?.get(editing.refId ?? '') || t('food.quickEntry')}
          slots={slots}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <SubstancesSheet open={substancesOpen} onClose={() => setSubstancesOpen(false)} date={date} />
      <AddFoodSheet
        open={addSlot != null}
        onClose={() => setAddSlot(null)}
        date={date}
        initialSlotId={addSlot ?? undefined}
      />

      {undo ? (
        <UndoToast
          message={t('common.deleted')}
          actionLabel={t('common.undo')}
          onAction={() => {
            void repos.diary.restore(undo);
            setUndo(null);
          }}
          onExpire={() => setUndo(null)}
        />
      ) : null}
    </div>
  );
}

/* ───────────────────────── Индекс питания (9.6) ────────────────────────────── */

function NutritionIndexSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const [scope, setScope] = useState<'day' | 'week'>('day');

  const data = useQuery(
    async (r) => {
      const from = scope === 'day' ? date : startOfWeek(date, settings.firstDayOfWeek);
      const entries = await r.diary.byDateRange(from, date);
      const foods = await r.foods.all();
      const novaById = new Map(foods.map((f) => [f.id, f.novaGroup]));

      let group4Grams = 0;
      let knownGrams = 0;
      for (const e of entries) {
        const nova = e.novaGroup ?? (e.refId ? novaById.get(e.refId) : undefined);
        if (nova == null || e.grams == null) continue;
        knownGrams += e.grams;
        if (nova === 4) group4Grams += e.grams;
      }

      return {
        totals: sumEntries(entries),
        daysLogged: new Set(entries.map((entry) => entry.date)).size,
        daysInPeriod: diffDays(date, from) + 1,
        distinct: new Set(entries.map((e) => e.refId ?? e.quickName ?? e.id)).size,
        nova: { group4Grams, knownGrams },
      };
    },
    [date, scope, settings.firstDayOfWeek],
  );

  if (!data) return null;

  const result = computeFoodIndex({
    totals: data.totals,
    targets: {
      proteinG:
        settings.targets.proteinG *
        (scope === 'week' ? diffDays(date, startOfWeek(date, settings.firstDayOfWeek)) + 1 : 1),
      fiberG:
        settings.targets.fiberG *
        (scope === 'week' ? diffDays(date, startOfWeek(date, settings.firstDayOfWeek)) + 1 : 1),
      sugarMaxG:
        settings.targets.sugarMaxG *
        (scope === 'week' ? diffDays(date, startOfWeek(date, settings.firstDayOfWeek)) + 1 : 1),
      sodiumMaxMg:
        settings.targets.sodiumMaxMg *
        (scope === 'week' ? diffDays(date, startOfWeek(date, settings.firstDayOfWeek)) + 1 : 1),
    },
    distinctFoods: data.distinct,
    nova: data.nova,
  });

  return (
    <Sheet open={open} onClose={onClose} title={t('food.indexTitle')}>
      <Segmented
        ariaLabel={t('food.indexTitle')}
        value={scope}
        options={[
          { value: 'day' as const, label: t('common.today') },
          { value: 'week' as const, label: t('common.week') },
        ]}
        onChange={setScope}
      />

      <div className="tnum mt-4 text-display">{result.score}</div>
      <div className="text-caption text-muted">{t('food.indexScore', { score: result.score })}</div>
      <p className="mt-2 text-caption text-muted">
        {data.daysLogged}/{data.daysInPeriod} {t('common.daysWithData')}
      </p>
      {scope === 'week' ? (
        <p className="text-caption text-muted">{t('food.weekToDateHint')}</p>
      ) : null}

      <div className="mt-4 text-label uppercase text-muted">{t('food.indexExplain')}</div>
      <ul className="mt-2 divide-y divide-hairline">
        {result.components
          .filter((c) => c.applicable)
          .map((c) => (
            <li key={c.key} className="py-2">
              <div className="flex justify-between">
                <span className="text-body">{t(`food.indexComponents.${c.key}`)}</span>
                <span className="tnum text-num">{c.points}</span>
              </div>
              <div className="tnum text-caption text-muted">
                {c.key === 'variety'
                  ? t('food.indexVarietyValue', {
                      value: c.value,
                      points: c.points,
                      weight: c.weight,
                    })
                  : c.key === 'processing'
                    ? t('food.indexProcessingValue', {
                        value: c.value,
                        points: c.points,
                        weight: c.weight,
                      })
                    : t('food.indexComponentValue', {
                        value: c.value,
                        target: c.target,
                        points: c.points,
                        weight: c.weight,
                      })}
              </div>
            </li>
          ))}
      </ul>

      {result.components.some((c) => !c.applicable) ? (
        <p className="mt-3 text-caption text-muted">{t('food.indexNoNova')}</p>
      ) : null}
    </Sheet>
  );
}

/* ───────────────────────── Блюда и рецепты (9.3) ───────────────────────────── */

function Dishes() {
  const { t } = useTranslation();
  const repos = useRepos();
  const dishes = useQuery((r) => r.dishes.all()) ?? [];
  const saving = useSaveAction();
  const [undoId, setUndoId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  return (
    <div className="space-y-3">
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {undoId ? (
        <UndoToast
          message={t('common.deleted')}
          actionLabel={t('common.undo')}
          onAction={() =>
            void saving.run(async () => {
              await repos.dishes.restore(undoId);
              setUndoId(null);
            })
          }
          onExpire={() => setUndoId(null)}
        />
      ) : null}
      <Button full onClick={() => setEditing(null)}>
        {t('food.dishNew')}
      </Button>
      <ul className="divide-y divide-hairline">
        {dishes.map((dish) => (
          <li key={dish.id} className="flex items-center gap-3 py-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left text-body"
              onClick={() => setEditing(dish.id)}
            >
              <span className="block truncate">{dish.name}</span>
              <span className="tnum block text-caption text-muted">
                {num(dish.totalGrams)} {t('units.g')}
              </span>
            </button>
            <button
              type="button"
              aria-label={t('common.delete')}
              className="tappable justify-center px-2 text-muted"
              disabled={saving.busy}
              onClick={() =>
                void saving.run(async () => {
                  await repos.dishes.remove(dish.id);
                  setUndoId(dish.id);
                })
              }
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <DishEditorSheet
        open={editing !== undefined}
        dishId={editing ?? undefined}
        onClose={() => setEditing(undefined)}
      />
    </div>
  );
}

function Recipes() {
  const { t } = useTranslation();
  const repos = useRepos();
  const recipes = useQuery((r) => r.recipes.all()) ?? [];
  const saving = useSaveAction();
  const [undoId, setUndoId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);

  return (
    <div className="space-y-3">
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {undoId ? (
        <UndoToast
          message={t('common.deleted')}
          actionLabel={t('common.undo')}
          onAction={() =>
            void saving.run(async () => {
              await repos.recipes.restore(undoId);
              setUndoId(null);
            })
          }
          onExpire={() => setUndoId(null)}
        />
      ) : null}
      <Button full onClick={() => setEditing(null)}>
        {t('food.recipeNew')}
      </Button>
      <ul className="divide-y divide-hairline">
        {recipes.map((recipe) => (
          <li key={recipe.id} className="flex items-center gap-3 py-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left text-body"
              onClick={() => setEditing(recipe.id)}
            >
              <span className="block truncate">{recipe.name}</span>
              <span className="tnum block text-caption text-muted">
                {num(recipe.yieldGrams)} {t('units.g')} · {recipe.servings}
              </span>
            </button>
            <button
              type="button"
              aria-label={t('common.delete')}
              className="tappable justify-center px-2 text-muted"
              disabled={saving.busy}
              onClick={() =>
                void saving.run(async () => {
                  await repos.recipes.remove(recipe.id);
                  setUndoId(recipe.id);
                })
              }
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <RecipeEditorSheet
        open={editing !== undefined}
        recipeId={editing ?? undefined}
        onClose={() => setEditing(undefined)}
      />
    </div>
  );
}
