/**
 * Создание и правка продукта — раздел 7.1, слой 3.
 * «Из двух полей минимум (название + калорийность), остальное опционально.»
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useSaveAction } from '@/app/useSaveAction';
import type { Food } from '@/domain/model';
import { searchKeyFor } from '@/domain/nutrition/search';
import { Button, NumberField, Sheet, TextField, Label } from '@/design-system/primitives';

export function FoodEditorSheet(props: Parameters<typeof FoodEditorSession>[0]) {
  return props.open ? <FoodEditorSession {...props} /> : null;
}

function FoodEditorSession({
  open,
  onClose,
  onSaved,
  preset,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (food: Food) => void;
  preset?: Partial<Food>;
  existing?: Food;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const saving = useSaveAction();

  const [name, setName] = useState(existing?.name ?? preset?.name ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? preset?.brand ?? '');
  const [kcal, setKcal] = useState<number | ''>(
    existing?.per100.kcal ?? preset?.per100?.kcal ?? '',
  );
  const [protein, setProtein] = useState<number | ''>(existing?.per100.proteinG ?? '');
  const [fat, setFat] = useState<number | ''>(existing?.per100.fatG ?? '');
  const [carb, setCarb] = useState<number | ''>(existing?.per100.carbG ?? '');
  const [fiber, setFiber] = useState<number | ''>(existing?.per100.fiberG ?? '');
  const [servingName, setServingName] = useState('');
  const [servingGrams, setServingGrams] = useState<number | ''>('');
  const [initial] = useState(() =>
    JSON.stringify([name, brand, kcal, protein, fat, carb, fiber, servingName, servingGrams]),
  );
  const dirty =
    initial !==
    JSON.stringify([name, brand, kcal, protein, fat, carb, fiber, servingName, servingGrams]);
  const valid =
    Boolean(name.trim()) &&
    kcal !== '' &&
    [kcal, protein, fat, carb, fiber].every(
      (value) => value === '' || (Number.isFinite(value) && value >= 0),
    ) &&
    (!servingName.trim() || (servingGrams !== '' && servingGrams > 0));

  const save = async () => {
    if (!valid) return;
    const per100 = {
      kcal,
      proteinG: protein === '' ? 0 : protein,
      fatG: fat === '' ? 0 : fat,
      carbG: carb === '' ? 0 : carb,
      ...(fiber === '' ? {} : { fiberG: fiber }),
    };
    const servings =
      servingName.trim() && servingGrams !== ''
        ? [{ id: 'custom', name: servingName.trim(), grams: servingGrams, isDefault: true }]
        : (existing?.servings ?? []);

    const base = {
      name: name.trim(),
      brand: brand.trim() || undefined,
      per100,
      servings,
      basis: existing?.basis ?? 'mass',
      barcode: existing?.barcode ?? preset?.barcode,
      source: 'user' as const,
      verified: true,
      isFavorite: existing?.isFavorite ?? false,
      useCount: existing?.useCount ?? 0,
    };
    const searchKey = searchKeyFor(base as Food);

    if (existing) {
      await repos.foods.update(existing.id, { ...base, searchKey });
      const updated = await repos.foods.get(existing.id);
      if (updated) onSaved(updated);
      return;
    }
    onSaved(await repos.foods.create({ ...base, searchKey }));
  };

  return (
    <Sheet
      open={open}
      onClose={() => !saving.busy && onClose()}
      dirty={dirty}
      onSave={valid ? () => void saving.run(save) : undefined}
      title={t('food.createFood')}
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
      <p className="text-caption text-muted">{t('food.createFoodMinimal')}</p>

      <div className="mt-3 space-y-3">
        <TextField
          value={name}
          onChange={setName}
          aria-label={t('common.name')}
          placeholder={t('common.name')}
        />
        <div>
          <Label>{t('food.per100', { unit: t('units.g') })}</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <NumberField
              value={kcal}
              onChange={setKcal}
              suffix={t('units.kcal')}
              aria-label={t('units.kcal')}
            />
            <NumberField
              value={protein}
              onChange={setProtein}
              suffix={t('today.protein')}
              aria-label={t('today.proteinFull')}
            />
            <NumberField
              value={fat}
              onChange={setFat}
              suffix={t('today.fat')}
              aria-label={t('today.fatFull')}
            />
            <NumberField
              value={carb}
              onChange={setCarb}
              suffix={t('today.carb')}
              aria-label={t('today.carbFull')}
            />
            <NumberField
              value={fiber}
              onChange={setFiber}
              suffix={t('today.fiber')}
              aria-label={t('today.fiberFull')}
            />
          </div>
        </div>
        <div>
          <Label>{t('food.servings')}</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <TextField
              value={servingName}
              onChange={setServingName}
              aria-label={t('food.servings')}
            />
            <NumberField
              value={servingGrams}
              onChange={setServingGrams}
              suffix={t('units.g')}
              aria-label={t('units.g')}
            />
          </div>
        </div>
        <TextField value={brand} onChange={setBrand} aria-label="brand" placeholder="—" />
      </div>
    </Sheet>
  );
}
