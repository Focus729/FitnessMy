/**
 * Экран выбора граммовки — раздел 9.2. Критичен для скорости.
 *
 *   • крупное числовое поле, клавиатура открыта сразу, значение выделено;
 *   • быстрые кнопки: последняя граммовка, порции продукта, ±10/±50 г;
 *   • пищевая ценность пересчитывается на лету;
 *   • кнопка сохранения фиксирована внизу, доступна одной рукой.
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Food, MealSlot, Nutrients, Serving } from '@/domain/model';
import { scale } from '@/domain/nutrition/nutrients';
import { num } from '@/lib/format';
import { Button, NumberField, Segmented, Sheet } from '@/design-system/primitives';

export interface GramsTarget {
  id?: string;
  name: string;
  per100: Nutrients;
  servings: Serving[];
  basis: Food['basis'];
  lastGrams?: number;
}

export function GramsSheet({
  open,
  onClose,
  target,
  slots,
  slotId,
  onSlotChange,
  onSubmit,
  slotLabel,
}: {
  open: boolean;
  onClose: () => void;
  target: GramsTarget | null;
  slots: MealSlot[];
  slotId: string;
  onSlotChange: (id: string) => void;
  onSubmit: (grams: number, servingId?: string) => void | Promise<void>;
  slotLabel: (slot: MealSlot) => string;
}) {
  const { t } = useTranslation();
  const initial = target?.lastGrams ?? target?.servings.find((s) => s.isDefault)?.grams ?? 100;
  const [grams, setGrams] = useState<number | ''>(initial);
  const [key, setKey] = useState(target?.id ?? target?.name ?? '');
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Сброс значения при смене продукта — без useEffect, по производному ключу.
  if (target && key !== (target.id ?? target.name)) {
    setKey(target.id ?? target.name);
    setGrams(initial);
  }

  const value = grams === '' ? 0 : grams;
  const save = async () => {
    if (saving.current || value <= 0 || !Number.isFinite(value)) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    try {
      await onSubmit(value);
      onClose();
    } catch {
      setError(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const nutrients = useMemo(() => (target ? scale(target.per100, value) : null), [target, value]);

  if (!target) return null;
  const unit = target.basis === 'volume' ? t('units.ml') : t('units.g');

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!saving.current) onClose();
      }}
      dirty={grams !== initial}
      onSave={save}
      title={target.name}
      footer={
        <Button variant="primary" full disabled={value <= 0 || busy} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      {error ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      <div className="mt-2">
        <NumberField
          value={grams}
          onChange={setGrams}
          suffix={unit}
          big
          autoFocus
          aria-label={t('food.gramsTitle')}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {target.lastGrams != null ? (
          <QuickButton onClick={() => setGrams(target.lastGrams as number)}>
            {t('food.lastUsed')} {num(target.lastGrams)}
          </QuickButton>
        ) : null}
        {target.servings.map((s) => (
          <QuickButton key={s.id} onClick={() => setGrams(s.grams)}>
            {s.name} · {num(s.grams)}
          </QuickButton>
        ))}
        <QuickButton onClick={() => setGrams(Math.max(0, value - 50))}>−50</QuickButton>
        <QuickButton onClick={() => setGrams(Math.max(0, value - 10))}>−10</QuickButton>
        <QuickButton onClick={() => setGrams(value + 10)}>+10</QuickButton>
        <QuickButton onClick={() => setGrams(value + 50)}>+50</QuickButton>
      </div>

      {nutrients ? (
        <dl className="tnum mt-5 grid grid-cols-4 gap-2 text-center">
          <Cell label={t('units.kcal')} value={Math.round(nutrients.kcal)} />
          <Cell label={t('today.protein')} value={Math.round(nutrients.proteinG)} />
          <Cell label={t('today.fat')} value={Math.round(nutrients.fatG)} />
          <Cell label={t('today.carb')} value={Math.round(nutrients.carbG)} />
        </dl>
      ) : null}

      <div className="mt-5">
        <div className="text-label uppercase text-muted">{t('common.select')}</div>
        <div className="mt-1">
          <Segmented
            ariaLabel={t('food.addToSlot', { slot: '' })}
            value={slotId}
            options={slots.map((s) => ({ value: s.id, label: slotLabel(s) }))}
            onChange={onSlotChange}
          />
        </div>
      </div>
    </Sheet>
  );
}

function QuickButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tnum min-h-touch rounded-xl border border-hairline px-3 text-caption"
    >
      {children}
    </button>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-num">{num(value)}</dd>
      <dt className="text-[10px] uppercase text-muted">{label}</dt>
    </div>
  );
}
