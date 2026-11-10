// @vitest-environment node
import { expect, it } from 'vitest';
import { planCloudImport, previewCloudMigration } from './migration-preview';
import { defaultSettings } from '../defaults';
import { loadCatalogRows } from '../seed/catalog-rows';
const stamp = '2026-11-05T10:00:00.000Z';
const file = () => ({
  format: 'lenta-backup',
  version: 1,
  exportedAt: stamp,
  profile: { id: 'phone', name: 'Fixture' },
  tables: {
    water: [
      {
        id: 'w',
        date: '2026-11-05',
        time: '10:00',
        ml: 250,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  },
  blobs: [] as { id: string; mime: string; data: string; createdAt: string }[],
});
it('counts records and original attachment bytes without modifying the backup', async () => {
  const backup = file();
  backup.blobs.push({
    id: 'photo',
    mime: 'image/png',
    data: btoa('abc'),
    createdAt: stamp,
  });
  const before = JSON.stringify(backup);
  const preview = await previewCloudMigration(before);
  expect(preview.counts.water!.records).toBe(1);
  expect(preview.originalAttachmentBytes).toBe(3);
  expect(preview.reservedAttachmentBytes).toBeGreaterThan(3);
  expect(preview.issues).toEqual([]);
  expect(JSON.stringify(backup)).toBe(before);
});
it('does not include local credentials or change identity for preference-only edits', async () => {
  const settings = defaultSettings();
  settings.ai.apiKey = 'private-key';
  const backup = {
    ...file(),
    tables: { ...file().tables, settings: [settings] },
  };
  const first = await previewCloudMigration(JSON.stringify(backup));
  settings.ai.apiKey = 'different-private-key';
  settings.locale = settings.locale === 'ru' ? 'en' : 'ru';
  const second = await previewCloudMigration(JSON.stringify(backup));
  expect(second.fingerprint).toBe(first.fingerprint);
  expect(JSON.stringify(first)).not.toContain('private-key');
});
it('reports invalid file encoding instead of silently omitting it', async () => {
  const backup = file();
  backup.blobs.push({
    id: 'photo',
    mime: 'image/png',
    data: '!!',
    createdAt: stamp,
  });
  expect(
    (await previewCloudMigration(JSON.stringify(backup))).issues,
  ).toContainEqual({ code: 'invalid_attachment_encoding', id: 'photo' });
});
it('excludes shipped catalogs from the upload estimate and includes actual overrides', async () => {
  const defaults = await loadCatalogRows();
  const backup = {
    ...file(),
    tables: {
      ...file().tables,
      foods: [...defaults.foods.values()].map((row) => ({
        ...row,
        createdAt: stamp,
        updatedAt: stamp,
      })),
      exercises: [...defaults.exercises.values()].map((row) => ({
        ...row,
        createdAt: stamp,
        updatedAt: stamp,
      })),
    },
  };
  const withoutCatalogs = await previewCloudMigration(JSON.stringify(file()));
  const initial = await previewCloudMigration(JSON.stringify(backup));
  expect(initial.issues).toEqual([]);
  expect(initial.projectedRecordBytes).toBe(
    withoutCatalogs.projectedRecordBytes,
  );
  expect(initial.fingerprint).toBe(withoutCatalogs.fingerprint);
  backup.tables.foods[0]!.isFavorite = true;
  const edited = await previewCloudMigration(JSON.stringify(backup));
  expect(edited.projectedRecordBytes).toBeGreaterThan(
    initial.projectedRecordBytes,
  );
  expect(edited.fingerprint).not.toBe(initial.fingerprint);
});
it('freezes a reviewed backup into stable bounded batches and puts XP before the baseline', async () => {
  const backup = file();
  const item = backup.tables.water[0]!;
  const text = JSON.stringify({
    ...backup,
    tables: {
      water: Array.from({ length: 201 }, (_, index) => ({
        ...item,
        id: `water:${index}`,
      })),
      xpEvents: [
        {
          id: 'event',
          createdAt: stamp,
          updatedAt: stamp,
          date: item.date,
          amount: 30,
          reason: 'workout',
          dedupeKey: 'workout:1',
        },
      ],
      gameState: [
        {
          id: 'singleton',
          updatedAt: stamp,
          xp: 100,
          level: 2,
          freezes: 1,
          unlockedAchievements: [],
          streaks: {},
        },
      ],
    },
  });
  const preview = await previewCloudMigration(text);
  const first = await planCloudImport(text, preview.fingerprint);
  expect(first).toEqual(await planCloudImport(text, preview.fingerprint));
  expect(first.batches.map((batch) => batch.mutations.length)).toEqual([
    200, 3,
  ]);
  const last = first.batches.at(-1)!.mutations;
  expect(last.map((item) => item.type)).toEqual([
    'water',
    'xpEvents',
    'gameState',
  ]);
  expect(last.at(-1)?.payload.baselines).toMatchObject([
    { sourceProfileId: 'phone', legacyXp: 70 },
  ]);
  expect(last.at(-1)?.payload).not.toHaveProperty('freezes');
  await expect(
    planCloudImport(text.replace('"ml":250', '"ml":500'), preview.fingerprint),
  ).rejects.toThrow('import_review_changed');
});

it('blocks a broken plan reference before creating import requests', async () => {
  const backup = file();
  const text = JSON.stringify({
    ...backup,
    tables: {
      ...backup.tables,
      shoppingLists: [
        {
          id: 'shopping',
          mealPlanId: 'missing',
          items: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
    },
  });
  const preview = await previewCloudMigration(text);
  expect(preview.issues).toContainEqual({
    code: 'missing_entity_reference',
    table: 'shoppingLists',
    id: 'shopping',
  });
  await expect(planCloudImport(text, preview.fingerprint)).rejects.toThrow(
    'import_review_has_blockers',
  );
});
