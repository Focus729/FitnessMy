import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { testDatabase } from './test-database';
import { commitSyncBatch } from './sync-store';
import type { CloudMutation, CloudEntityType } from '../src/data/cloud/schema';
import {
  beginAttachment,
  digestBytes,
  finalizeAttachment,
  putAttachmentChunk,
} from './attachments';
import catalog from './catalog-ids.json';
let fixture: ReturnType<typeof testDatabase>;
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.sql.close());
const stamp = '2026-11-04T00:00:00.000Z';
const mutation = (
  type: CloudEntityType,
  id: string,
  fields: Record<string, unknown>,
): CloudMutation => ({
  operationId: crypto.randomUUID(),
  type,
  id,
  expectedRevision: 0,
  payload: { id, createdAt: stamp, updatedAt: stamp, ...fields },
});
const push = (mutations: CloudMutation[], owner = 'a') =>
  commitSyncBatch(fixture.db, owner, 'p', {
    schemaVersion: 1,
    batchId: crypto.randomUUID(),
    mutations,
  });
const recipe = (photoBlobId?: string) =>
  mutation('recipes', 'recipe1', {
    name: 'Fixture',
    components: [{ foodId: catalog.foods[0], grams: 100 }],
    yieldGrams: 100,
    servings: 1,
    isFavorite: false,
    useCount: 0,
    ...(photoBlobId ? { photoBlobId } : {}),
  });
const workout = () =>
  mutation('workouts', 'workout1', {
    date: '2026-11-04',
    startedAt: stamp,
    name: 'Fixture',
    totalVolumeKg: 0,
    totalSets: 0,
    exerciseOrder: [catalog.exercises[0]],
  });
const set = () =>
  mutation('workoutSets', 'set1', {
    workoutId: 'workout1',
    exerciseId: catalog.exercises[0],
    order: 0,
    weightKg: 20,
    reps: 5,
    type: 'normal',
    isCompleted: true,
    estimated1RM: 23,
  });
describe('sync reference integrity', () => {
  it('keeps the generated catalog ID manifest in sync with both asset catalogs', () => {
    for (const name of ['foods', 'exercises'] as const) {
      const rows = JSON.parse(
        readFileSync(
          new URL(`../src/data/seed/${name}.json`, import.meta.url),
          'utf8',
        ),
      ) as { id: string }[];
      expect(catalog[name]).toEqual(rows.map((row) => row.id).sort());
    }
  });
  it('allows real built-in catalog IDs without uploading the catalogs', async () => {
    expect(await push([recipe()])).toHaveLength(1);
  });
  it('rejects dangling and foreign-parent references before creating a receipt', async () => {
    await expect(push([set()])).rejects.toMatchObject({
      code: 'entity_reference_unavailable',
    });
    await push([workout()], 'b');
    await expect(push([set()])).rejects.toMatchObject({
      code: 'entity_reference_unavailable',
    });
    expect(
      fixture.sql
        .prepare("SELECT COUNT(*) AS n FROM sync_receipts WHERE account_id='a'")
        .get(),
    ).toMatchObject({ n: 0 });
  });
  it('supports related records in any order inside the same atomic batch', async () => {
    expect(await push([set(), workout()])).toHaveLength(2);
  });
  it('keeps tombstoned parents usable for historical records', async () => {
    const parent = workout();
    parent.payload.deletedAt = stamp;
    await push([parent]);
    expect(await push([set()])).toHaveLength(1);
  });
  it('requires finalized owned attachment bytes before publishing a reference', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = {
      createdAt: stamp,
      id: 'photo1',
      mime: 'image/png',
      byteLength: 3,
      digest: await digestBytes(bytes),
    };
    await beginAttachment(fixture.db, 'b', 'p', manifest);
    await putAttachmentChunk(fixture.db, 'b', 'p', 'photo1', 0, 'AQID');
    await finalizeAttachment(fixture.db, 'b', 'p', 'photo1');
    await expect(push([recipe('photo1')])).rejects.toMatchObject({
      code: 'entity_reference_unavailable',
    });
    await beginAttachment(fixture.db, 'a', 'p', manifest);
    await putAttachmentChunk(fixture.db, 'a', 'p', 'photo1', 0, 'AQID');
    await expect(push([recipe('photo1')])).rejects.toMatchObject({
      code: 'entity_reference_unavailable',
    });
    await finalizeAttachment(fixture.db, 'a', 'p', 'photo1');
    expect(await push([recipe('photo1')])).toHaveLength(1);
  });
  it('requires a food reference for diary records and templates except quick entries', async () => {
    const entry = {
      time: '10:00',
      mealSlotId: 'breakfast',
      kind: 'food',
      inputMethod: 'search',
      nutrients: { kcal: 1, proteinG: 0, fatG: 0, carbG: 0 },
    };
    await expect(
      push([mutation('diary', 'diary1', { ...entry, date: '2026-11-04' })]),
    ).rejects.toMatchObject({ code: 'missing_entity_reference' });
    await expect(
      push([
        mutation('dayTemplates', 'template1', {
          name: 'Fixture',
          entries: [entry],
        }),
      ]),
    ).rejects.toMatchObject({ code: 'missing_entity_reference' });
    expect(
      await push([
        mutation('diary', 'quick1', {
          ...entry,
          kind: 'quick',
          date: '2026-11-04',
        }),
      ]),
    ).toHaveLength(1);
  });
});
