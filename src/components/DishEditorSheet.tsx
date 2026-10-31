/** Блюдо — фиксированная комбинация продуктов (9.3). */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useSaveAction } from '@/app/useSaveAction';
import { useQuery } from '@/data/repositories/hooks';
import { computeDish } from '@/domain/nutrition/recipe';
import type { Nutrients } from '@/domain/model';
import { num } from '@/lib/format';
import { Button, Sheet, TextField, Label } from '@/design-system/primitives';
import { ComponentPicker, type ComponentRow } from './ComponentPicker';

export function DishEditorSheet({
  open,
  onClose,
  dishId,
}: {
  open: boolean;
  onClose: () => void;
  dishId?: string;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const saving = useSaveAction();
  const dish = useQuery(
    (r) => (dishId ? r.dishes.get(dishId) : Promise.resolve(undefined)),
    [dishId],
  );
  const foods = useQuery((r) => r.foods.all()) ?? [];

  const [name, setName] = useState('');
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const dirty =
    name !== (dish?.name ?? '') ||
    JSON.stringify(components) !== JSON.stringify(dish?.components ?? []);
  const valid =
    (!dishId || Boolean(dish)) &&
    Boolean(name.trim()) &&
    components.length > 0 &&
    components.every((component) => component.grams > 0);

  useEffect(() => {
    setName(dish?.name ?? '');
    setComponents(dish?.components ?? []);
  }, [dish, open]);

  const byId = new Map(foods.map((f) => [f.id, f]));
  const math = computeDish(
    components
      .map((c) => ({ grams: c.grams, per100: byId.get(c.foodId)?.per100 }))
      .filter((c): c is { grams: number; per100: Nutrients } => c.per100 != null),
  );

  const save = async () => {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      components,
      totalGrams: math.totalGrams,
      isFavorite: dish?.isFavorite ?? false,
      useCount: dish?.useCount ?? 0,
    };
    if (dishId) await repos.dishes.update(dishId, payload);
    else await repos.dishes.create(payload);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => !saving.busy && onClose()}
      dirty={dirty}
      onSave={valid ? () => void saving.run(save) : undefined}
      title={t('food.dishTitle')}
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

      <div className="tnum mt-4 text-caption text-muted">
        {num(math.totalGrams)} {t('units.g')} · {num(Math.round(math.total.kcal))} {t('units.kcal')}{' '}
        · {t('today.protein')} {num(Math.round(math.total.proteinG))}
      </div>
    </Sheet>
  );
}
