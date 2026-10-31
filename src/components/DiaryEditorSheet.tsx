import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiaryEntry, MealSlot, Nutrients } from '@/domain/model';
import { useRepos } from '@/data/repositories/context';
import { mul } from '@/domain/nutrition/nutrients';
import { Button, NumberField, Sheet, TextField } from '@/design-system/primitives';

export function DiaryEditorSheet({
  entry,
  name,
  slots,
  onClose,
}: {
  entry: DiaryEntry;
  name: string;
  slots: MealSlot[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [draft, setDraft] = useState(entry);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState(false);
  const dirty = JSON.stringify(entry) !== JSON.stringify(draft);
  const valid =
    draft.date &&
    draft.time &&
    draft.mealSlotId &&
    (draft.grams == null || draft.grams > 0) &&
    Object.values(draft.nutrients).every((v) => v == null || (Number.isFinite(v) && v >= 0));
  const save = async (duplicate = false) => {
    if (lock.current || !valid) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      if (duplicate) {
        const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = draft;
        void _id;
        void _created;
        void _updated;
        await repos.diary.create(copy);
      } else await repos.diary.update(entry.id, draft);
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <Sheet
      open
      title={t('common.edit')}
      onClose={() => !busy && onClose()}
      dirty={dirty}
      onSave={valid ? () => void save() : undefined}
      footer={
        <Button variant="primary" full disabled={busy || !valid} onClick={() => void save()}>
          {t(busy ? 'common.loading' : 'common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField
          value={draft.quickName ?? name}
          onChange={(quickName) => setDraft({ ...draft, quickName })}
          aria-label={t('common.name')}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="date"
            className="min-h-touch min-w-0 rounded-xl border border-hairline bg-surface px-3"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            aria-label={t('common.date')}
          />
          <input
            type="time"
            className="min-h-touch min-w-0 rounded-xl border border-hairline bg-surface px-3"
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            aria-label={t('common.time')}
          />
        </div>
        <select
          className="min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
          value={draft.mealSlotId}
          onChange={(e) => setDraft({ ...draft, mealSlotId: e.target.value })}
          aria-label={t('settings.mealSlots')}
        >
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.name === slot.id ? t(`slots.${slot.id}`, slot.name) : slot.name}
            </option>
          ))}
        </select>
        {entry.grams != null ? (
          <NumberField
            value={draft.grams ?? ''}
            suffix={t('units.g')}
            aria-label={t('food.gramsTitle')}
            onChange={(grams) =>
              setDraft({
                ...draft,
                grams: grams === '' ? 0 : grams,
                nutrients: mul(entry.nutrients, (grams || 0) / (entry.grams || 1)),
              })
            }
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {(['kcal', 'proteinG', 'fatG', 'carbG'] as const).map((key) => (
            <label key={key} className="text-caption text-muted">
              {t(
                key === 'kcal'
                  ? 'units.kcal'
                  : `today.${key === 'proteinG' ? 'protein' : key === 'fatG' ? 'fat' : 'carb'}`,
              )}
              <NumberField
                value={draft.nutrients[key]}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    nutrients: {
                      ...draft.nutrients,
                      [key]: value || 0,
                    } as Nutrients,
                  })
                }
              />
            </label>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-over">
            {t('errors.saveFailed')}
          </p>
        ) : null}
        <Button disabled={busy || !valid} full onClick={() => void save(true)}>
          {t('food.duplicateEntry')}
        </Button>
      </div>
    </Sheet>
  );
}
