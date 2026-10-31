export type UnitSystem = 'metric' | 'imperial';
export type Measure = 'mass' | 'length' | 'distance';
const factor = (kind: Measure) =>
  ({ mass: 2.2046226218487757, length: 1 / 2.54, distance: 1 / 1.609344 })[kind];
export const toDisplay = (value: number, kind: Measure, units: UnitSystem) =>
  units === 'imperial' ? value * factor(kind) : value;
export const toCanonical = (value: number, kind: Measure, units: UnitSystem) =>
  units === 'imperial' ? value / factor(kind) : value;
export const unitKey = (kind: Measure, units: UnitSystem) =>
  kind === 'mass'
    ? units === 'imperial'
      ? 'lb'
      : 'kg'
    : kind === 'distance'
      ? units === 'imperial'
        ? 'mi'
        : 'km'
      : units === 'imperial'
        ? 'in'
        : 'cm';
