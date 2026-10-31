import { expect, it } from 'vitest';
import { toCanonical, toDisplay } from './units';

it('converts mass and length without changing the canonical value on a round trip', () => {
  expect(toDisplay(2.54, 'length', 'imperial')).toBeCloseTo(1);
  expect(toCanonical(220.46226218487757, 'mass', 'imperial')).toBeCloseTo(100);
  expect(toCanonical(1, 'distance', 'imperial')).toBeCloseTo(1.609344);
  for (const kind of ['mass', 'length', 'distance'] as const) {
    for (const value of [0, 0.5, 80.5, 175])
      expect(toCanonical(toDisplay(value, kind, 'imperial'), kind, 'imperial')).toBeCloseTo(
        value,
        10,
      );
  }
});
