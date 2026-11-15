import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRepos } from "@/data/repositories/context";
import { ingredientKey } from "@/data/repositories/meal-candidates";
import { useSaveAction } from "@/app/useSaveAction";
import {
  MAX_EXCLUDED_INGREDIENTS,
  MAX_PREFERRED_INGREDIENTS,
} from "@/domain/nutrition/food-preferences";
import { searchFoods } from "@/domain/nutrition/search";
import type { Food } from "@/domain/model";
import {
  Button,
  Segmented,
  Sheet,
  TextField,
} from "@/design-system/primitives";

type IngredientStatus = "available" | "excluded";
function statusMap(available: string[], excluded: string[]) {
  const statuses = new Map<string, IngredientStatus>();
  available.forEach((id) => statuses.set(id, "available"));
  excluded.forEach((id) => statuses.set(id, "excluded"));
  return statuses;
}

export function PreferredIngredientsSheet({
  foods,
  selected,
  excluded,
  importLegacy,
  locale,
  close,
}: {
  foods: Food[];
  selected: string[];
  excluded: string[];
  importLegacy: boolean;
  locale: "ru" | "en";
  close: () => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const save = useSaveAction();
  const [initial] = useState(() => statusMap(selected, excluded));
  const [draft, setDraft] = useState(() => statusMap(selected, excluded));
  const [mode, setMode] = useState<IngredientStatus>("available");
  const [query, setQuery] = useState("");
  const labels = useMemo(() => {
    const result = new Map<string, string>();
    for (const food of foods) {
      const key = ingredientKey(food.id);
      if (!result.has(key) || key === food.id)
        result.set(key, food.nameI18n?.[locale] ?? food.name);
    }
    return result;
  }, [foods, locale]);
  const matches = [
    ...new Set(
      searchFoods(foods, query, 45).map((food) => ingredientKey(food.id)),
    ),
  ].slice(0, 20);
  const same = (statuses: Map<string, IngredientStatus>) =>
    statuses.size === initial.size &&
    [...statuses].every(([id, status]) => initial.get(id) === status);
  const dirty = !same(draft);
  const changedElsewhere = !same(statusMap(selected, excluded));
  const entries = [...draft].filter(([, status]) => status === mode);
  const limit =
    mode === "available" ? MAX_PREFERRED_INGREDIENTS : MAX_EXCLUDED_INGREDIENTS;
  const toggle = (id: string) =>
    setDraft((current) => {
      const next = new Map(current);
      if (next.get(id) === mode) next.delete(id);
      else if (entries.length < limit) next.set(id, mode);
      return next;
    });
  const submit = () =>
    void save.run(async () => {
      const idsFor = (status: IngredientStatus) =>
        [...draft]
          .filter(([, value]) => value === status)
          .map(([id]) => id)
          .sort();
      const nextExcluded = idsFor("excluded");
      await repos.settings.update({
        preferredIngredientIds: idsFor("available"),
        ...(importLegacy || nextExcluded.length || excluded.length
          ? { excludedIngredientIds: nextExcluded }
          : {}),
      });
      close();
    });
  return (
    <Sheet
      open
      title={t("adaptive.preferred")}
      onClose={() => !save.busy && close()}
      dirty={dirty && !save.busy}
      onSave={changedElsewhere ? undefined : submit}
      footer={
        <Button
          full
          variant="primary"
          onClick={submit}
          disabled={(!dirty && !importLegacy) || save.busy || changedElsewhere}
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-muted">{t("adaptive.preferredHint")}</p>
        <Segmented<IngredientStatus>
          ariaLabel={t("adaptive.ingredientStatus")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "available", label: t("adaptive.available") },
            { value: "excluded", label: t("adaptive.neverUse") },
          ]}
        />
        {importLegacy && (
          <p className="text-caption text-muted">
            {t("adaptive.importExclusions")}
          </p>
        )}
        {changedElsewhere && (
          <p role="alert">{t("adaptive.preferencesChanged")}</p>
        )}
        {save.state === "error" && <p role="alert">{t("errors.saveFailed")}</p>}
        <div className="flex flex-wrap gap-2">
          {entries.map(([id]) => (
            <Button
              key={id}
              onClick={() => toggle(id)}
              disabled={save.busy}
              aria-label={t("adaptive.removePreferred", {
                name: labels.get(id) ?? id,
              })}
            >
              {labels.get(id) ?? id} <span aria-hidden="true">×</span>
            </Button>
          ))}
        </div>
        {entries.length === 0 && (
          <p className="text-caption text-muted">
            {t(
              mode === "available"
                ? "adaptive.noAvailable"
                : "adaptive.noExcluded",
            )}
          </p>
        )}
        <TextField
          type="search"
          aria-label={t("adaptive.findIngredient")}
          placeholder={t("adaptive.findIngredient")}
          value={query}
          onChange={setQuery}
        />
        {entries.length >= limit && (
          <p>{t("adaptive.preferredLimit", { count: limit })}</p>
        )}
        {matches.length ? (
          <ul className="grid gap-1">
            {matches.map((id) => (
              <li key={id}>
                <Button
                  full
                  onClick={() => toggle(id)}
                  aria-pressed={draft.get(id) === mode}
                  variant={draft.get(id) === mode ? "primary" : "secondary"}
                  disabled={
                    save.busy ||
                    (draft.get(id) !== mode && entries.length >= limit)
                  }
                >
                  {labels.get(id) ?? id}
                  {draft.has(id) && draft.get(id) !== mode && (
                    <span className="text-caption text-muted">
                      {t(
                        mode === "available"
                          ? "adaptive.neverUse"
                          : "adaptive.available",
                      )}
                    </span>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">{t("adaptive.noIngredientMatches")}</p>
        )}
      </div>
    </Sheet>
  );
}
