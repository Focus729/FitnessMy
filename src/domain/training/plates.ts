/**
 * Плита-калькулятор — раздел 10.1 (C2-е).
 *
 * Раскладка блинов НА ОДНУ СТОРОНУ. Если точный вес набрать нельзя,
 * показываем ближайший достижимый.
 */

export interface PlatePlan {
  /** Блины на одну сторону, от тяжёлых к лёгким. */
  perSide: number[];
  /** Фактический вес штанги с этой раскладкой. */
  achievableKg: number;
  /** Совпадает ли с запрошенным. */
  exact: boolean;
  barKg: number;
}

export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BAR_KG = 20;

/**
 * Жадный подбор: набор блинов стандартный, жадный алгоритм на нём оптимален
 * и, в отличие от перебора, мгновенен.
 */
export function planPlates(
  targetKg: number,
  barKg: number = DEFAULT_BAR_KG,
  available: number[] = DEFAULT_PLATES,
  /** Сколько блинов каждого номинала есть в наличии (на одну сторону). */
  countPerPlate = 10,
): PlatePlan {
  const perSideTarget = (targetKg - barKg) / 2;
  if (perSideTarget <= 0) {
    return { perSide: [], achievableKg: barKg, exact: targetKg === barKg, barKg };
  }

  const plates = [...available].sort((a, b) => b - a);
  const perSide: number[] = [];
  let remaining = perSideTarget;

  for (const plate of plates) {
    let used = 0;
    while (remaining >= plate - 1e-9 && used < countPerPlate) {
      perSide.push(plate);
      remaining = round2(remaining - plate);
      used++;
    }
  }

  const loaded = perSide.reduce((s, p) => s + p, 0);
  const achievableKg = round2(barKg + loaded * 2);
  return {
    perSide,
    achievableKg,
    exact: Math.abs(achievableKg - targetKg) < 1e-9,
    barKg,
  };
}

/** Ближайший вес, который вообще можно набрать этим набором блинов. */
export function nearestAchievable(
  targetKg: number,
  barKg: number = DEFAULT_BAR_KG,
  available: number[] = DEFAULT_PLATES,
): number {
  const below = planPlates(targetKg, barKg, available).achievableKg;
  const smallest = Math.min(...available);
  const above = round2(below + smallest * 2);
  return Math.abs(targetKg - below) <= Math.abs(above - targetKg) ? below : above;
}

/** Компактная запись раскладки: 25×2 + 10 + 2.5. */
export function summarizePlates(perSide: number[]): { plate: number; count: number }[] {
  const out: { plate: number; count: number }[] = [];
  for (const p of perSide) {
    const last = out[out.length - 1];
    if (last && last.plate === p) last.count++;
    else out.push({ plate: p, count: 1 });
  }
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
