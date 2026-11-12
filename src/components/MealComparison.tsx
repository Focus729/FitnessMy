import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/design-system/primitives";
import type { MealSlot } from "@/domain/model";
import type {
  DailyMenu,
  Macros,
  MealSelection,
} from "@/domain/nutrition/daily-plan";

export function MealComparison({
  menus,
  selected,
  recommended,
  choose,
  slotName,
  macro,
  preview,
  skip,
  busy,
}: {
  menus: DailyMenu[];
  selected: string | undefined;
  recommended?: string;
  choose: (menu: DailyMenu) => void;
  slotName: (slot: MealSlot) => string;
  macro: (value: Macros) => string;
  preview?: (slot: string, meal: MealSelection) => void;
  skip?: (slot: string) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const comparisonId = useId();
  if (!menus.length) return null;
  return (
    <div className="menu-comparison">
      {menus.length > 1 && (
        <div
          className="menu-switch"
          role="group"
          aria-label={t("adaptive.alternatives")}
        >
          {menus.map((menu, index) => (
            <Button
              key={index}
              aria-controls={`${comparisonId}-${index}`}
              aria-pressed={selected === menu.id}
              onClick={() => choose(menu)}
            >
              {t("adaptive.menu", { number: index + 1 })}
            </Button>
          ))}
        </div>
      )}
      <div className="menu-grid">
        {menus.map((menu, index) => {
          const title = t("adaptive.menu", { number: index + 1 });
          const active = selected === menu.id;
          return (
            <article
              key={menu.id}
              id={`${comparisonId}-${index}`}
              aria-label={title}
              className="menu-frame"
              data-selected={active}
            >
              <header className="menu-frame-header">
                <h3>{title}</h3>
                {recommended === menu.id && (
                  <span className="menu-badge">{t("adaptive.hermesPick")}</span>
                )}
                <p className="text-caption text-muted">
                  {t("adaptive.menuTotal")}
                </p>
                <p className="tnum menu-numbers">{macro(menu.totals)}</p>
                <p className="text-caption text-muted">
                  {t("adaptive.projected", { values: macro(menu.projected) })}
                </p>
              </header>
              {menus.length > 1 && (
                <Button
                  className="menu-select"
                  aria-pressed={active}
                  onClick={() => choose(menu)}
                >
                  {t(active ? "adaptive.selected" : "adaptive.choose")}
                </Button>
              )}
              <ul className="menu-meals">
                {menu.meals.map(({ slot, selection }) => (
                  <li className="menu-meal" key={slot.id}>
                    <p className="text-label uppercase text-muted">
                      {slotName(slot)}
                    </p>
                    {selection ? (
                      <>
                        <p className="menu-dish">{selection.name}</p>
                        <p className="tnum text-caption text-muted">
                          {selection.parts.reduce(
                            (n, part) => n + part.grams,
                            0,
                          )}{" "}
                          {t("units.g")} · {macro(selection.nutrients)}
                        </p>
                        {preview && (
                          <Button onClick={() => preview(slot.id, selection)}>
                            {t("adaptive.preview")}
                          </Button>
                        )}
                      </>
                    ) : (
                      <p className="text-caption text-muted">
                        {t("adaptive.noChoice")}
                      </p>
                    )}
                    {skip && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => skip(slot.id)}
                      >
                        {t("adaptive.skip")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
