import { expect, it } from 'vitest';
import foods from '../seed/foods.json';
import { applyCatalogOverride, projectCatalogOverride } from './catalog';

const baseline = {
  ...foods[0]!,
  source: 'seed',
  isFavorite: false,
  useCount: 0,
  verified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
it('does not upload unchanged catalogs or initialization timestamps', () => {
  expect(
    projectCatalogOverride(
      'foods',
      { ...baseline, updatedAt: '2026-02-01T00:00:00.000Z' },
      baseline,
      '1',
    ),
  ).toBeNull();
});
it('round trips preferences and custom edits without copying the whole catalog record', () => {
  const edited = { ...baseline, isFavorite: true, name: 'Custom name' };
  const patch = projectCatalogOverride('foods', edited, baseline, '1')!;
  expect(patch.values).toEqual({ isFavorite: true, name: 'Custom name' });
  expect(applyCatalogOverride('foods', baseline, patch, '1')).toEqual(edited);
  expect(() => applyCatalogOverride('foods', baseline, patch, '2')).toThrow(
    'catalog_version_mismatch',
  );
});
it('rejects identity and invalid field edits', () => {
  const patch = {
    id: baseline.id,
    catalogVersion: '1',
    values: { id: 'foreign' },
    removed: [],
  };
  expect(() => applyCatalogOverride('foods', baseline, patch, '1')).toThrow(
    'invalid_catalog_override',
  );
  expect(() =>
    applyCatalogOverride(
      'foods',
      baseline,
      { ...patch, values: { secret: 'x' } },
      '1',
    ),
  ).toThrow();
});
