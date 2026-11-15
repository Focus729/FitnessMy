import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRepos } from "@/data/repositories/context";
import { ingredientKey } from "@/data/repositories/meal-candidates";
import { useSaveAction } from "@/app/useSaveAction";
import { MAX_PREFERRED_INGREDIENTS } from "@/domain/nutrition/food-preferences";
import { searchFoods } from "@/domain/nutrition/search";
import type { Food } from "@/domain/model";
import { Button, Sheet, TextField } from "@/design-system/primitives";

export function PreferredIngredientsSheet({
  foods,
  selected,
  locale,
  close,
}: {
  foods: Food[];
  selected: string[];
  locale: "ru" | "en";
  close: () => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const save = useSaveAction();
  const [initial] = useState(() => new Set(selected));
  const [draft, setDraft] = useState(() => new Set(selected));
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
  const dirty =
    draft.size !== initial.size || [...draft].some((id) => !initial.has(id));
  const changedElsewhere =
    selected.length !== initial.size || selected.some((id) => !initial.has(id));
  const toggle = (id: string) =>
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PREFERRED_INGREDIENTS) next.add(id);
      return next;
    });
  const submit = () =>
    void save.run(async () => {
      await repos.settings.update({
        preferredIngredientIds: [...draft].sort(),
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
          disabled={!dirty || save.busy || changedElsewhere}
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-muted">{t("adaptive.preferredHint")}</p>
        {changedElsewhere && (
          <p role="alert">{t("adaptive.preferencesChanged")}</p>
        )}
        {save.state === "error" && <p role="alert">{t("errors.saveFailed")}</p>}
        <div className="flex flex-wrap gap-2">
          {[...draft].map((id) => (
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
        <TextField
          type="search"
          aria-label={t("adaptive.findIngredient")}
          placeholder={t("adaptive.findIngredient")}
          value={query}
          onChange={setQuery}
        />
        {draft.size >= MAX_PREFERRED_INGREDIENTS && (
          <p>
            {t("adaptive.preferredLimit", { count: MAX_PREFERRED_INGREDIENTS })}
          </p>
        )}
        {matches.length ? (
          <ul className="grid gap-1">
            {matches.map((id) => (
              <li key={id}>
                <Button
                  full
                  onClick={() => toggle(id)}
                  aria-pressed={draft.has(id)}
                  variant={draft.has(id) ? "primary" : "secondary"}
                  disabled={
                    save.busy ||
                    (!draft.has(id) && draft.size >= MAX_PREFERRED_INGREDIENTS)
                  }
                >
                  {labels.get(id) ?? id}
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
