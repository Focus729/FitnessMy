/**
 * Оценка расхода кардио по значениям МЕТ — раздел 10.4.
 * Результат помечается как оценочный и редактируется вручную.
 */
import type { CardioSession } from '@/domain/model';

export type CardioKind = CardioSession['kind'];

/** МЕТ по умолчанию для каждого типа (умеренная интенсивность). */
export const MET_VALUES: Record<CardioKind, number> = {
  run: 9.8,
  walk: 3.5,
  bike: 7.5,
  swim: 7.0,
  row: 7.0,
  elliptical: 5.0,
  other: 5.0,
};

/**
 * Уточнение МЕТ бега и ходьбы по темпу, если задана дистанция:
 * это единственные виды, где скорость меняет расход в разы.
 */
export function metFor(kind: CardioKind, durationSec: number, distanceM?: number): number {
  const base = MET_VALUES[kind];
  if (!distanceM || durationSec <= 0) return base;
  const kmh = (distanceM / 1000 / (durationSec / 3600));

  if (kind === 'run') {
    if (kmh < 8) return 8.3;
    if (kmh < 9.7) return 9.8;
    if (kmh < 11.3) return 11.0;
    if (kmh < 12.9) return 11.8;
    return 14.5;
  }
  if (kind === 'walk') {
    if (kmh < 4) return 2.8;
    if (kmh < 5.5) return 3.5;
    if (kmh < 6.5) return 5.0;
    return 6.3;
  }
  if (kind === 'bike') {
    if (kmh < 16) return 4.0;
    if (kmh < 19) return 6.8;
    if (kmh < 22.5) return 8.0;
    return 10.0;
  }
  return base;
}

/** ккал ≈ МЕТ × вес(кг) × часы. */
export function estimateKcal(args: {
  kind: CardioKind;
  durationSec: number;
  weightKg: number;
  distanceM?: number;
}): number {
  const met = metFor(args.kind, args.durationSec, args.distanceM);
  return Math.round(met * args.weightKg * (args.durationSec / 3600));
}

/** Темп мин/км — для отображения в журнале. */
export function paceMinPerKm(durationSec: number, distanceM: number): number | undefined {
  if (distanceM <= 0) return undefined;
  return Math.round(((durationSec / 60) / (distanceM / 1000)) * 10) / 10;
}
