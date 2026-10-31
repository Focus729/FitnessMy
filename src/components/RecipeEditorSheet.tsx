/**
 * Рецепт с уварочным коэффициентом — раздел 9.3.
 * Пользователь вводит вес ингредиентов и ВЕС ГОТОВОГО блюда; приложение считает
 * ценность на 100 г готового и на порцию.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useSaveAction } from '@/app/useSaveAction';
import { useQuery } from '@/data/repositories/hooks';
import { computeRecipe } from '@/domain/nutrition/recipe';
import type { Nutrients } from '@/domain/model';
import { num } from '@/lib/format';
import { Button, NumberField, Sheet, TextField, Label } from '@/design-system/primitives';
import { ComponentPicker, type ComponentRow } from './ComponentPicker';

export function RecipeEditorSheet({
  open,
  onClose,
  recipeId,
}: {
  open: boolean;
  onClose: () => void;
  recipeId?: string;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const saving = useSaveAction();
  const recipe = useQuery(
    (r) => (recipeId ? r.recipes.get(recipeId) : Promise.resolve(undefined)),
    [recipeId],
  );
  const foods = useQuery((r) => r.foods.all()) ?? [];

  const [name, setName] = useState('');
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [yieldGrams, setYieldGrams] = useState<number | ''>('');
  const [servings, setServings] = useState<number | ''>(4);
  const dirty =
    name !== (recipe?.name ?? '') ||
    JSON.stringify(components) !== JSON.stringify(recipe?.components ?? []) ||
    yieldGrams !== (recipe?.yieldGrams ?? '') ||
    servings !== (recipe?.servings ?? 4);
  const valid =
    (!recipeId || Boolean(recipe)) &&
    Boolean(name.trim()) &&
    components.length > 0 &&
    components.every((component) => component.grams > 0) &&
    (yieldGrams === '' || yieldGrams > 0) &&
    (servings === '' || servings > 0);

  useEffect(() => {
    setName(recipe?.name ?? '');
    setComponents(recipe?.components ?? []);
    setYieldGrams(recipe?.yieldGrams ?? '');
    setServings(recipe?.servings ?? 4);
  }, [recipe, open]);

  const byId = new Map(foods.map((f) => [f.id, f]));
  const math = computeRecipe(
    components
      .map((c) => ({ grams: c.grams, per100: byId.get(c.foodId)?.per100 }))
      .filter((c): c is { grams: number; per100: Nutrients } => c.per100 != null),
    yieldGrams === '' ? 0 : yieldGrams,
    servings === '' ? 1 : servings,
  );

  const save = async () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      components,
      yieldGrams: yieldGrams === '' ? math.rawGrams : yieldGrams,
      servings: servings === '' ? 1 : servings,
      isFavorite: recipe?.isFavorite ?? false,
      useCount: recipe?.useCount ?? 0,
    };
    if (recipeId) await repos.recipes.update(recipeId, payload);
    else await repos.recipes.create(payload);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => !saving.busy && onClose()}
      dirty={dirty}
      onSave={valid ? () => void saving.run(save) : undefined}
      title={t('food.recipeTitle')}
      footer={
        <Button
          variant="primary"
          full
          disabled={!valid || saving.busy}
          onClick={() => void saving.run(save)}
        >
          {t('common.save')}
        </Button>
      }
    >
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      <TextField
        value={name}
        onChange={setName}
        aria-label={t('common.name')}
        placeholder={t('common.name')}
      />

      <div className="mt-4">
        <Label>{t('food.dishComponents')}</Label>
        <div className="mt-2">
          <ComponentPicker components={components} onChange={setComponents} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <Label>{t('food.recipeYield')}</Label>
          <div className="mt-1">
            <NumberField
              value={yieldGrams}
              onChange={setYieldGrams}
              suffix={t('units.g')}
              aria-label={t('food.recipeYield')}
            />
          </div>
        </div>
        <div>
          <Label>{t('food.recipeServings')}</Label>
          <div className="mt-1">
            <NumberField
              value={servings}
              onChange={setServings}
              aria-label={t('food.recipeServings')}
            />
          </div>
        </div>
      </div>
      <p className="mt-1 text-caption text-muted">{t('food.recipeYieldHint')}</p>

      <dl className="tnum mt-4 space-y-1 text-caption text-muted">
        <div className="flex justify-between">
          <dt>{t('food.recipeYieldFactor', { factor: math.yieldFactor })}</dt>
          <dd>
            {num(math.rawGrams)} → {num(math.yieldGrams)} {t('units.g')}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('food.per100', { unit: t('units.g') })}</dt>
          <dd>
            {num(Math.round(math.per100Cooked.kcal))} {t('units.kcal')}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('food.recipePerServing', { grams: num(math.servingGrams) })}</dt>
          <dd>
            {num(Math.round(math.perServing.kcal))} {t('units.kcal')}
          </dd>
        </div>
      </dl>
    </Sheet>
  );
}
