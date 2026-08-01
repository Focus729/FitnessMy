/**
 * Добавление еды — раздел 9.2. Вкладки сверху, порядок настраивается.
 *
 * Вкладка «Частое» — первая по умолчанию и есть путь на 5 секунд (S1):
 * одно нажатие на плитку = запись с последней использованной граммовкой.
 *
 * AI-вкладки не показываются вообще, если AI выключен или нет ключа (15.1.7).
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { award } from '@/app/gamification';
import type { AddFoodTab, Food, LocalDate, MealSlot, Nutrients } from '@/domain/model';
import { scale } from '@/domain/nutrition/nutrients';
import { computeDish, computeRecipe } from '@/domain/nutrition/recipe';
import { parseFoodText } from '@/domain/nutrition/textParse';
import { addDays, toLocalTime, today as todayFn } from '@/lib/date';
import { num } from '@/lib/format';
import { cacheExternalFood, FoodSourceError, searchOnline } from '@/adapters/food';
import { findByBarcode } from '@/adapters/food';
import { isFeatureAvailable, recognizeFoodPhoto, type AIFoodDraft } from '@/adapters/ai';
import { Button, NumberField, Sheet, TextField, Tile } from '@/design-system/primitives';
import { GramsSheet, type GramsTarget } from './GramsSheet';
import { BarcodeScanner } from './BarcodeScanner';
import { FoodEditorSheet } from './FoodEditorSheet';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

type Pending =
  | { kind: 'food'; food: Food }
  | { kind: 'dish'; id: string; name: string; per100: Nutrients; totalGrams: number }
  | { kind: 'recipe'; id: string; name: string; per100: Nutrients; servingGrams: number };

export function AddFoodSheet({
  open,
  onClose,
  date,
  initialSlotId,
}: {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  initialSlotId?: string;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();

  const slots = useMemo(
    () => [...settings.mealSlots].sort((a, b) => a.order - b.order),
    [settings.mealSlots],
  );
  const [slotId, setSlotId] = useState(initialSlotId ?? slots[0]?.id ?? 'breakfast');
  const [tab, setTab] = useState<AddFoodTab>(settings.addFoodTabs[0] ?? 'frequent');
  const [pending, setPending] = useState<Pending | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPreset, setEditorPreset] = useState<Partial<Food> | undefined>();

  const slotLabel = useCallback(
    (slot: MealSlot) => (isDefaultSlot(slot.id) ? t(`slots.${slot.id}`, slot.name) : slot.name),
    [t],
  );

  const visibleTabs = useMemo<AddFoodTab[]>(() => {
    const tabs: AddFoodTab[] = settings.addFoodTabs.filter(
      (x) => x !== 'photoAi' && x !== 'textAi',
    );
    if (isFeatureAvailable(settings.ai, 'photoFood')) tabs.push('photoAi');
    // Текстовый разбор работает и без AI — детерминированным парсером (15.2).
    tabs.push('textAi');
    return tabs;
  }, [settings.addFoodTabs, settings.ai]);

  const addEntry = async (args: {
    kind: 'food' | 'dish' | 'recipe' | 'quick';
    refId?: string;
    quickName?: string;
    grams?: number;
    nutrients: Nutrients;
    inputMethod: 'search' | 'barcode' | 'quick' | 'photo' | 'text' | 'repeat';
    novaGroup?: 1 | 2 | 3 | 4;
    aiGenerated?: boolean;
    aiConfidence?: 'low' | 'medium' | 'high';
  }) => {
    await repos.diary.create({
      date,
      time: toLocalTime(),
      mealSlotId: slotId,
      ...args,
    });
    if (args.kind === 'food' && args.refId) await repos.foods.markUsed(args.refId, args.grams);
    await award(repos, 'dayLogged', date);
  };

  const gramsTarget: GramsTarget | null = pending
    ? pending.kind === 'food'
      ? {
          name: pending.food.name,
          per100: pending.food.per100,
          servings: pending.food.servings,
          basis: pending.food.basis,
          lastGrams: pending.food.lastGrams,
        }
      : pending.kind === 'dish'
        ? {
            name: pending.name,
            per100: pending.per100,
            servings: [{ id: 'whole', name: t('food.dishTitle'), grams: pending.totalGrams, isDefault: true }],
            basis: 'mass',
          }
        : {
            name: pending.name,
            per100: pending.per100,
            servings: [
              { id: 'serving', name: t('food.recipeServings'), grams: pending.servingGrams, isDefault: true },
            ],
            basis: 'mass',
          }
    : null;

  return (
    <>
      <Sheet open={open && !pending} onClose={onClose} title={t('food.addTitle')}>
        <div className="no-scrollbar -mx-4 mb-3 flex gap-1 overflow-x-auto px-4">
          {visibleTabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-[36px] shrink-0 rounded-lg px-3 text-caption font-semibold ${
                tab === key ? 'bg-ink text-paper' : 'text-muted'
              }`}
            >
              {t(`food.tabs.${key}`)}
            </button>
          ))}
        </div>

        {tab === 'frequent' ? (
          <FrequentTab onPick={(food) => setPending({ kind: 'food', food })} />
        ) : null}

        {tab === 'search' ? (
          <SearchTab
            onPick={(food) => setPending({ kind: 'food', food })}
            onCreate={(preset) => {
              setEditorPreset(preset);
              setEditorOpen(true);
            }}
          />
        ) : null}

        {tab === 'barcode' ? (
          <BarcodeTab
            onPick={(food) => setPending({ kind: 'food', food })}
            onCreate={(preset) => {
              setEditorPreset(preset);
              setEditorOpen(true);
            }}
          />
        ) : null}

        {tab === 'quick' ? (
          <QuickTab
            onSubmit={async (name, kcal) => {
              await addEntry({
                kind: 'quick',
                quickName: name,
                nutrients: { kcal, proteinG: 0, fatG: 0, carbG: 0 },
                inputMethod: 'quick',
              });
              onClose();
            }}
          />
        ) : null}

        {tab === 'dishes' ? (
          <DishesTab
            onPick={(dish) => setPending(dish)}
          />
        ) : null}

        {tab === 'recipes' ? <RecipesTab onPick={(recipe) => setPending(recipe)} /> : null}

        {tab === 'copyDay' ? (
          <CopyDayTab
            date={date}
            onDone={onClose}
          />
        ) : null}

        {tab === 'textAi' ? (
          <TextTab
            onAdd={async (items) => {
              for (const item of items) {
                await addEntry({
                  kind: 'food',
                  refId: item.foodId,
                  grams: item.grams,
                  nutrients: item.nutrients,
                  inputMethod: 'text',
                });
              }
              onClose();
            }}
          />
        ) : null}

        {tab === 'photoAi' ? (
          <PhotoTab
            onAdd={async (drafts) => {
              for (const d of drafts) {
                await addEntry({
                  kind: 'quick',
                  quickName: d.name,
                  grams: d.grams,
                  nutrients: {
                    kcal: d.kcal,
                    proteinG: d.proteinG,
                    fatG: d.fatG,
                    carbG: d.carbG,
                  },
                  inputMethod: 'photo',
                  aiGenerated: true,
                  aiConfidence: d.confidence,
                });
              }
              onClose();
            }}
          />
        ) : null}
      </Sheet>

      <GramsSheet
        open={pending != null}
        onClose={() => setPending(null)}
        target={gramsTarget}
        slots={slots}
        slotId={slotId}
        onSlotChange={setSlotId}
        slotLabel={slotLabel}
        onSubmit={async (grams) => {
          if (!pending) return;
          if (pending.kind === 'food') {
            await addEntry({
              kind: 'food',
              refId: pending.food.id,
              grams,
              nutrients: scale(pending.food.per100, grams),
              inputMethod: 'search',
              novaGroup: pending.food.novaGroup,
            });
          } else {
            await addEntry({
              kind: pending.kind,
              refId: pending.id,
              grams,
              nutrients: scale(pending.per100, grams),
              inputMethod: 'search',
            });
          }
          setPending(null);
          onClose();
        }}
      />

      <FoodEditorSheet
        open={editorOpen}
        preset={editorPreset}
        onClose={() => setEditorOpen(false)}
        onSaved={(food) => {
          setEditorOpen(false);
          setPending({ kind: 'food', food });
        }}
      />
    </>
  );
}

function isDefaultSlot(id: string): boolean {
  return ['breakfast', 'lunch', 'dinner', 'snack'].includes(id);
}

/* ─────────────────────────────── Вкладки ───────────────────────────────────── */

function FrequentTab({ onPick }: { onPick: (food: Food) => void }) {
  const { t } = useTranslation();
  const foods = useQuery((r) => r.foods.frequent(12));

  if (!foods) return null;
  if (foods.length === 0) {
    return <p className="py-6 text-body text-muted">{t('food.frequentEmpty')}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {foods.map((food) => (
        <Tile
          key={food.id}
          title={food.name}
          subtitle={
            food.lastGrams != null
              ? `${num(food.lastGrams)} · ${num(Math.round((food.per100.kcal * food.lastGrams) / 100))}`
              : `${num(food.per100.kcal)} / 100`
          }
          accent={food.isFavorite}
          onClick={() => onPick(food)}
        />
      ))}
    </div>
  );
}

function SearchTab({
  onPick,
  onCreate,
}: {
  onPick: (food: Food) => void;
  onCreate: (preset?: Partial<Food>) => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [query, setQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState<Food[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'offline' | 'failed'>('idle');

  const local = useQuery((r) => r.foods.search(query, 40), [query]) ?? [];

  const runOnline = async () => {
    setStatus('loading');
    setOnlineResults(null);
    try {
      const external = await searchOnline(query);
      const saved: Food[] = [];
      for (const item of external) saved.push(await cacheExternalFood(repos, item));
      setOnlineResults(saved);
      setStatus('idle');
    } catch (e) {
      setStatus(e instanceof FoodSourceError && e.kind === 'offline' ? 'offline' : 'failed');
    }
  };

  return (
    <div>
      <TextField
        value={query}
        onChange={setQuery}
        placeholder={t('food.searchPlaceholder')}
        aria-label={t('food.searchPlaceholder')}
        autoFocus
      />

      <ul className="mt-2 divide-y divide-hairline">
        {local.map((food) => (
          <FoodRow key={food.id} food={food} onPick={onPick} />
        ))}
        {onlineResults?.map((food) => (
          <FoodRow key={food.id} food={food} onPick={onPick} />
        ))}
      </ul>

      {query.trim() ? (
        <div className="mt-4 space-y-2">
          {/* Живой запрос в сеть — только по явному нажатию (7.1, пункт 6) */}
          <Button full onClick={() => void runOnline()} disabled={status === 'loading'}>
            {t('food.searchOnline')}
          </Button>
          <p className="text-caption text-muted">{t('food.searchOnlineHint')}</p>
          {status === 'offline' ? (
            <p className="text-caption text-muted">{t('errors.networkOffline')}</p>
          ) : null}
          {status === 'failed' ? (
            <p className="text-caption text-muted">{t('errors.networkFailed')}</p>
          ) : null}
          <Button variant="ghost" full onClick={() => onCreate({ name: query })}>
            {t('food.createFood')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FoodRow({ food, onPick }: { food: Food; onPick: (food: Food) => void }) {
  const { t } = useTranslation();
  const repos = useRepos();
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onPick(food)}
        className="flex min-h-touch flex-1 items-center gap-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">{food.name}</span>
          <span className="block text-caption text-muted">
            {food.brand ? `${food.brand} · ` : ''}
            {t(`food.sourceLabel.${food.source}`)}
          </span>
        </span>
        <span className="tnum shrink-0 text-num">{num(food.per100.kcal)}</span>
      </button>
      <button
        type="button"
        aria-label={food.isFavorite ? t('food.unfavorite') : t('food.favorite')}
        className={`tappable justify-center px-2 ${food.isFavorite ? 'text-accent' : 'text-muted'}`}
        onClick={() => void repos.foods.toggleFavorite(food.id)}
      >
        <span aria-hidden="true">{food.isFavorite ? '★' : '☆'}</span>
      </button>
    </li>
  );
}

function BarcodeTab({
  onPick,
  onCreate,
}: {
  onPick: (food: Food) => void;
  onCreate: (preset?: Partial<Food>) => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [notFound, setNotFound] = useState<string | null>(null);

  const handle = useCallback(
    async (code: string) => {
      const local = await repos.foods.byBarcode(code);
      if (local) return onPick(local);
      try {
        const external = await findByBarcode(code);
        if (external) {
          const saved = await cacheExternalFood(repos, external);
          return onPick(saved);
        }
      } catch {
        /* сеть недоступна — предложим создать вручную */
      }
      setNotFound(code);
    },
    [repos, onPick],
  );

  if (notFound) {
    return (
      <div>
        <p className="text-body text-muted">{t('food.barcodeNotFound')}</p>
        <Button
          variant="primary"
          full
          className="mt-3"
          onClick={() => onCreate({ barcode: notFound })}
        >
          {t('food.createFood')}
        </Button>
      </div>
    );
  }

  return <BarcodeScanner onDetected={(code) => void handle(code)} />;
}

function QuickTab({ onSubmit }: { onSubmit: (name: string, kcal: number) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | ''>('');

  return (
    <div className="space-y-3">
      <div>
        <TextField
          value={name}
          onChange={setName}
          placeholder={t('food.quickName')}
          aria-label={t('food.quickName')}
        />
        <p className="mt-1 text-caption text-muted">{t('food.quickNameHint')}</p>
      </div>
      <NumberField
        value={kcal}
        onChange={setKcal}
        suffix={t('units.kcal')}
        big
        autoFocus
        aria-label={t('food.quickKcal')}
      />
      <Button
        variant="primary"
        full
        disabled={kcal === '' || kcal <= 0}
        onClick={() => onSubmit(name, kcal === '' ? 0 : kcal)}
      >
        {t('common.save')}
      </Button>
    </div>
  );
}

function DishesTab({ onPick }: { onPick: (p: Pending) => void }) {
  const { t } = useTranslation();
  const data = useQuery(async (r) => {
    const [dishes, foods] = await Promise.all([r.dishes.all(), r.foods.all()]);
    const byId = new Map(foods.map((f) => [f.id, f]));
    return dishes.map((dish) => {
      const math = computeDish(
        dish.components
          .map((c) => ({ grams: c.grams, per100: byId.get(c.foodId)?.per100 }))
          .filter((c): c is { grams: number; per100: Nutrients } => c.per100 != null),
      );
      return { dish, math };
    });
  });

  if (!data?.length) return <p className="py-6 text-body text-muted">{t('common.empty')}</p>;

  return (
    <ul className="divide-y divide-hairline">
      {data.map(({ dish, math }) => (
        <li key={dish.id}>
          <button
            type="button"
            className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
            onClick={() =>
              onPick({
                kind: 'dish',
                id: dish.id,
                name: dish.name,
                per100: math.per100,
                totalGrams: math.totalGrams || dish.totalGrams,
              })
            }
          >
            <span className="flex-1 truncate text-body">{dish.name}</span>
            <span className="tnum text-num">{num(Math.round(math.total.kcal))}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecipesTab({ onPick }: { onPick: (p: Pending) => void }) {
  const { t } = useTranslation();
  const data = useQuery(async (r) => {
    const [recipes, foods] = await Promise.all([r.recipes.all(), r.foods.all()]);
    const byId = new Map(foods.map((f) => [f.id, f]));
    return recipes.map((recipe) => {
      const math = computeRecipe(
        recipe.components
          .map((c) => ({ grams: c.grams, per100: byId.get(c.foodId)?.per100 }))
          .filter((c): c is { grams: number; per100: Nutrients } => c.per100 != null),
        recipe.yieldGrams,
        recipe.servings,
      );
      return { recipe, math };
    });
  });

  if (!data?.length) return <p className="py-6 text-body text-muted">{t('common.empty')}</p>;

  return (
    <ul className="divide-y divide-hairline">
      {data.map(({ recipe, math }) => (
        <li key={recipe.id}>
          <button
            type="button"
            className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
            onClick={() =>
              onPick({
                kind: 'recipe',
                id: recipe.id,
                name: recipe.name,
                per100: math.per100Cooked,
                servingGrams: math.servingGrams,
              })
            }
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body">{recipe.name}</span>
              <span className="block text-caption text-muted">
                {t('food.recipePerServing', { grams: num(math.servingGrams) })}
              </span>
            </span>
            <span className="tnum text-num">{num(Math.round(math.perServing.kcal))}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CopyDayTab({ date, onDone }: { date: LocalDate; onDone: () => void }) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [from, setFrom] = useState(addDays(date, -1));
  const [copied, setCopied] = useState<number | null>(null);

  const run = async (source: string) => {
    const count = await repos.diary.copyDay(source, date);
    setCopied(count);
    if (count > 0) setTimeout(onDone, 800);
  };

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted">{t('food.copyDayHint')}</p>
      <Button variant="primary" full onClick={() => void run(addDays(date, -1))}>
        {t('food.copyYesterday')}
      </Button>
      <input
        type="date"
        value={from}
        max={todayFn()}
        onChange={(e) => setFrom(e.target.value)}
        className="min-h-touch w-full rounded-xl border border-hairline bg-surface px-3 text-body"
        aria-label={t('food.copyDayTitle')}
      />
      <Button full onClick={() => void run(from)}>
        {t('common.apply')}
      </Button>
      {copied != null ? (
        <p className="text-caption text-muted">{t('food.copied', { count: copied })}</p>
      ) : null}
    </div>
  );
}

/**
 * Разбор текста. Основная реализация — детерминированный парсер (15.2),
 * работает без сети и без ключа.
 */
function TextTab({
  onAdd,
}: {
  onAdd: (items: { foodId: string; grams: number; nutrients: Nutrients }[]) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const foods = useQueryWithDefault((r) => r.foods.all(), EMPTY);

  const parsed = useMemo(
    () => (text.trim() ? parseFoodText(text, foods) : []),
    [text, foods],
  );
  const resolved = parsed.filter((p) => p.food && p.grams != null);

  return (
    <div className="space-y-3">
      <TextField
        value={text}
        onChange={setText}
        placeholder={t('ai.textParsePlaceholder')}
        aria-label={t('ai.textParseTitle')}
      />
      <p className="text-caption text-muted">{t('ai.textParseLocal')}</p>

      <ul className="divide-y divide-hairline">
        {parsed.map((item, i) => (
          <li key={`${item.raw}-${i}`} className="py-2">
            {item.food ? (
              <div className="flex items-center gap-3">
                <span className="flex-1 truncate text-body">{item.food.name}</span>
                <span className="tnum text-caption text-muted">
                  {num(item.grams ?? 0)} {t('units.g')}
                </span>
              </div>
            ) : (
              <p className="text-caption text-muted">
                {t('ai.textParseNotFound', { query: item.query })}
              </p>
            )}
          </li>
        ))}
      </ul>

      <Button
        variant="primary"
        full
        disabled={resolved.length === 0}
        onClick={() =>
          onAdd(
            resolved.map((item) => ({
              foodId: (item.food as Food).id,
              grams: item.grams as number,
              nutrients: scale((item.food as Food).per100, item.grams as number),
            })),
          )
        }
      >
        {t('common.add')}
      </Button>
    </div>
  );
}

/**
 * Еда по фото — единственная функция без детерминированной замены (15.2).
 * Вкладка вообще не появляется, если AI выключен или нет ключа.
 *
 * Ответ AI — всегда черновик: он попадает в форму редактирования,
 * а не сразу в дневник (15.1.6).
 */
function PhotoTab({ onAdd }: { onAdd: (drafts: AIFoodDraft[]) => void }) {
  const { t, i18n } = useTranslation();
  const repos = useRepos();
  const [drafts, setDrafts] = useState<AIFoodDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    setFailed(false);
    try {
      const base64 = await fileToBase64(file);
      setDrafts(await recognizeFoodPhoto(repos, base64, file.type, i18n.language));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="tappable justify-center rounded-xl border border-hairline px-4 text-caption">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pick(file);
          }}
        />
        {busy ? t('common.loading') : t('ai.feature.photoFood')}
      </label>

      <p className="text-caption text-muted">{t('ai.photoDisclaimer')}</p>
      {failed ? <p className="text-caption text-muted">{t('errors.aiFailed')}</p> : null}

      {drafts ? (
        <>
          <p className="text-caption text-muted">{t('ai.draftNotice')}</p>
          <ul className="divide-y divide-hairline">
            {drafts.map((d, i) => (
              <li key={`${d.name}-${i}`} className="flex items-center gap-3 py-2">
                <span className="flex-1 truncate text-body">{d.name}</span>
                <span className="tnum text-caption text-muted">
                  {num(d.grams)} {t('units.g')}
                </span>
                <span className="tnum text-num">{num(Math.round(d.kcal))}</span>
              </li>
            ))}
          </ul>
          <Button variant="primary" full disabled={drafts.length === 0} onClick={() => onAdd(drafts)}>
            {t('common.add')}
          </Button>
        </>
      ) : null}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}
