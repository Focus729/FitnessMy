import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyImport,
  exportBackup,
  getRecoveryBackup,
  parseBackup,
  type BackupFile,
} from './backup';
import { deleteDb, openDb, recoveryDb } from './db/schema';
import { defaultSettings } from './defaults';

const profile = {
  id: 'backup-test',
  name: 'Test',
  tint: 'a' as const,
  createdAt: new Date().toISOString(),
};
const ts = '2026-10-29T10:00:00.000Z';
const weight = {
  id: 'weight',
  date: '2026-10-29',
  weightKg: 80,
  createdAt: ts,
  updatedAt: ts,
};
const file = (): BackupFile => ({
  format: 'lenta-backup',
  version: 1,
  exportedAt: ts,
  profile,
  tables: { body: [weight] },
  blobs: [],
});
afterEach(async () => {
  vi.restoreAllMocks();
  await deleteDb(profile.id);
  await recoveryDb.snapshots.clear();
  localStorage.clear();
});

describe('safe backup restore', () => {
  it('rejects dangling references and preserves the current profile', async () => {
    await openDb(profile.id).body.put(weight);
    const incoming = file();
    incoming.tables.workoutSets = [
      {
        id: 'set',
        createdAt: ts,
        updatedAt: ts,
        workoutId: 'missing',
        exerciseId: 'missing',
        order: 0,
        weightKg: 60,
        reps: 8,
        type: 'normal',
        isCompleted: true,
        estimated1RM: 76,
      },
    ];
    await expect(applyImport(profile.id, incoming, 'replace')).rejects.toThrow();
    expect(await openDb(profile.id).body.get(weight.id)).toEqual(weight);
  });
  it('does not restore when the recovery snapshot cannot be retained', async () => {
    await openDb(profile.id).body.put(weight);
    vi.spyOn(recoveryDb.snapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    const incoming = file();
    incoming.tables.body = [];
    await expect(applyImport(profile.id, incoming, 'replace')).rejects.toThrow('quota');
    expect(await openDb(profile.id).body.get(weight.id)).toEqual(weight);
  });
  it('redacts provider keys without mutating live settings', async () => {
    const db = openDb(profile.id);
    const settings = defaultSettings();
    settings.ai.apiKey = 'fake-private-key';
    await db.settings.put(settings);
    const exported = await exportBackup(profile);
    expect(JSON.stringify(exported)).not.toContain('fake-private-key');
    expect((await db.settings.get('singleton'))?.ai.apiKey).toBe('fake-private-key');
    expect(() => parseBackup(JSON.stringify(exported))).not.toThrow();
  });
  it('rejects malformed rows before changing any data', async () => {
    const db = openDb(profile.id);
    await db.body.put(weight);
    const invalid = file();
    invalid.tables.body = [{ ...weight, weightKg: 'bad' }];
    await expect(applyImport(profile.id, invalid, 'replace')).rejects.toThrow();
    expect(await db.body.get(weight.id)).toEqual(weight);
  });
  it('rolls back earlier table changes when a later write fails', async () => {
    const db = openDb(profile.id);
    await db.body.put(weight);
    await db.meta.put({ key: 'keep', value: 1 });
    const incoming = file();
    incoming.tables.body = [{ ...weight, weightKg: 90 }];
    incoming.tables.meta = [{ key: 'other', value: 2 }];
    vi.spyOn(db.table('meta'), 'bulkPut').mockRejectedValueOnce(new Error('disk failure'));
    await expect(applyImport(profile.id, incoming, 'replace')).rejects.toThrow('disk failure');
    expect((await db.body.get(weight.id))?.weightKg).toBe(80);
    expect(await db.meta.get('keep')).toEqual({ key: 'keep', value: 1 });
  });
  it('clears blobs on empty replacement and retains a recovery copy', async () => {
    const db = openDb(profile.id);
    await db.body.put(weight);
    // Empty blob already represented in the store is enough to test replacement semantics.
    await db.blobs.put({
      id: 'old',
      mime: 'text/plain',
      data: new Blob(),
      createdAt: ts,
    });
    // jsdom Blob lacks arrayBuffer; inject it on the value read by export.
    vi.spyOn(db.blobs, 'toArray').mockResolvedValueOnce([]);
    await applyImport(profile.id, file(), 'replace');
    expect(await db.blobs.count()).toBe(0);
    expect((await getRecoveryBackup(profile.id))?.tables.body).toEqual([weight]);
  });
});
