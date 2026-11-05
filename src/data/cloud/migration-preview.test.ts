// @vitest-environment node
import { expect, it } from 'vitest';
import { previewCloudMigration } from './migration-preview';
import { defaultSettings } from '../defaults';
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
