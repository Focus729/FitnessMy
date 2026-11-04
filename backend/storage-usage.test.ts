import { afterEach, beforeEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { profileStorageUsage } from './storage-usage';

let fixture: ReturnType<typeof testDatabase>;
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.sql.close());

it('reports zero usage for an empty owned profile', async () => {
  expect(await profileStorageUsage(fixture.db, 'a', 'p')).toEqual({
    records: 0,
    changes: 0,
    receipts: 0,
    syncLogicalBytes: 0,
    attachments: 0,
    unfinishedAttachments: 0,
    attachmentOriginalBytes: 0,
    attachmentReservedBytes: 0,
  });
});

it('keeps original attachment bytes separate from reservations and isolates owners', async () => {
  const insert = fixture.sql.prepare(`INSERT INTO attachments
    (account_id,profile_id,id,mime,byte_length,digest,chunk_count,reserved_bytes,finalized,created_at)
    VALUES(?,'p',?,'image/png',?,'fixture',1,?, ?,0)`);
  insert.run('a', 'one', 100, 5000, 0);
  insert.run('a', 'two', 200, 6000, 1);
  insert.run('b', 'foreign', 999, 9000, 0);
  expect(await profileStorageUsage(fixture.db, 'a', 'p')).toMatchObject({
    attachments: 2,
    unfinishedAttachments: 1,
    attachmentOriginalBytes: 300,
    attachmentReservedBytes: 11000,
  });
  await expect(
    profileStorageUsage(fixture.db, 'foreign', 'p'),
  ).rejects.toMatchObject({ status: 404 });
});

it('returns a sanitized failure when usage cannot be measured', async () => {
  fixture.sql.exec('DROP TABLE sync_receipts');
  await expect(profileStorageUsage(fixture.db, 'a', 'p')).rejects.toMatchObject(
    { status: 503, message: 'storage_usage_unavailable' },
  );
});
