import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import {
  attachmentStatus,
  beginAttachment,
  CHUNK_BYTES,
  decodeChunk,
  digestBytes,
  finalizeAttachment,
  putAttachmentChunk,
  readAttachmentChunk,
  restartAttachment,
} from './attachments';

let fixture: ReturnType<typeof testDatabase>;
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.sql.close());
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
async function begin(bytes: Uint8Array, id = 'blob1', account = 'a') {
  return beginAttachment(fixture.db, account, 'p', {
    id,
    mime: 'image/png',
    createdAt: '2020-01-02T03:04:05.000Z',
    byteLength: bytes.length,
    digest: await digestBytes(bytes),
  });
}
describe('owned resumable attachments', () => {
  it('preserves an imported attachment date and Unicode ID', async () => {
    const status = await begin(new Uint8Array([1]), 'фото/старое');
    expect(status.id).toBe('фото/старое');
    expect(status.createdAt).toBe('2020-01-02T03:04:05.000Z');
  });
  it('recovers a corrupt partial upload without changing its ID and protects completed bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await begin(bytes);
    await putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0, 'AQIE');
    await expect(
      finalizeAttachment(fixture.db, 'a', 'p', 'blob1'),
    ).rejects.toMatchObject({ code: 'attachment_digest_mismatch' });
    const reset = await restartAttachment(fixture.db, 'a', 'p', 'blob1', 0);
    expect(reset.uploadRevision).toBe(1);
    expect(reset.uploaded).toEqual([]);
    await putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0, 'AQID');
    await expect(
      restartAttachment(fixture.db, 'a', 'p', 'blob1', 0),
    ).rejects.toMatchObject({ code: 'attachment_upload_changed' });
    expect(
      (await finalizeAttachment(fixture.db, 'a', 'p', 'blob1')).finalized,
    ).toBe(true);
    await expect(
      restartAttachment(fixture.db, 'a', 'p', 'blob1', 1),
    ).rejects.toMatchObject({ code: 'attachment_finalized' });
    expect(
      (await readAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0)).data,
    ).toBe('AQID');
  });
  it('cannot finalize an upload whose chunks were reset after the hash check', async () => {
    await begin(new Uint8Array([1, 2, 3]));
    await putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0, 'AQID');
    const prepare = fixture.db.prepare;
    fixture.db.prepare = (query) => {
      const statement = prepare(query);
      if (!query.startsWith('UPDATE attachments SET finalized=1'))
        return statement;
      return {
        ...statement,
        bind: (...values) => {
          const bound = statement.bind(...values);
          return {
            ...bound,
            run: async () => {
              await restartAttachment(fixture.db, 'a', 'p', 'blob1', 0);
              return bound.run();
            },
          };
        },
      };
    };
    await expect(
      finalizeAttachment(fixture.db, 'a', 'p', 'blob1'),
    ).rejects.toMatchObject({ code: 'attachment_upload_changed' });
    const status = await attachmentStatus(fixture.db, 'a', 'p', 'blob1');
    expect(status.finalized).toBe(false);
    expect(status.uploaded).toEqual([]);
  });
  it('resumes out-of-order chunks, verifies exact bytes and allows identical retries', async () => {
    const bytes = Uint8Array.from(
      { length: CHUNK_BYTES + 17 },
      (_, i) => i % 251,
    );
    await begin(bytes);
    const last = base64(bytes.slice(CHUNK_BYTES));
    await putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 1, last);
    expect((await begin(bytes)).uploaded).toEqual([1]);
    await expect(
      finalizeAttachment(fixture.db, 'a', 'p', 'blob1'),
    ).rejects.toMatchObject({ code: 'attachment_incomplete' });
    await putAttachmentChunk(
      fixture.db,
      'a',
      'p',
      'blob1',
      0,
      base64(bytes.slice(0, CHUNK_BYTES)),
    );
    expect(
      (await finalizeAttachment(fixture.db, 'a', 'p', 'blob1')).finalized,
    ).toBe(true);
    expect(
      (await finalizeAttachment(fixture.db, 'a', 'p', 'blob1')).finalized,
    ).toBe(true);
    await putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 1, last);
    expect(
      (await readAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 1)).data,
    ).toBe(last);
  });
  it('keeps identical attachment IDs separate between owners and hides partial bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await begin(bytes);
    await expect(
      attachmentStatus(fixture.db, 'b', 'p', 'blob1'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      putAttachmentChunk(fixture.db, 'b', 'p', 'blob1', 0, base64(bytes)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      readAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0),
    ).rejects.toMatchObject({ code: 'attachment_incomplete' });
    await begin(new Uint8Array([4]), 'blob1', 'b');
    expect(
      (await attachmentStatus(fixture.db, 'b', 'p', 'blob1')).byteLength,
    ).toBe(1);
    expect(
      (await attachmentStatus(fixture.db, 'a', 'p', 'blob1')).byteLength,
    ).toBe(3);
  });
  it('rejects altered retry chunks and reuse of an ID for different content', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await begin(bytes);
    await putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0, base64(bytes));
    await expect(
      putAttachmentChunk(
        fixture.db,
        'a',
        'p',
        'blob1',
        0,
        base64(new Uint8Array([3, 2, 1])),
      ),
    ).rejects.toMatchObject({ code: 'attachment_chunk_conflict' });
    await expect(begin(new Uint8Array([9, 9, 9]))).rejects.toMatchObject({
      code: 'attachment_id_reused',
    });
    await finalizeAttachment(fixture.db, 'a', 'p', 'blob1');
    expect(
      (await readAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0)).data,
    ).toBe(base64(bytes));
  });
  it('does not finalize corrupt contents even when all chunks arrived', async () => {
    await begin(new Uint8Array([1, 2, 3]));
    await putAttachmentChunk(
      fixture.db,
      'a',
      'p',
      'blob1',
      0,
      base64(new Uint8Array([1, 2, 4])),
    );
    await expect(
      finalizeAttachment(fixture.db, 'a', 'p', 'blob1'),
    ).rejects.toMatchObject({ code: 'attachment_digest_mismatch' });
    expect(
      (await attachmentStatus(fixture.db, 'a', 'p', 'blob1')).finalized,
    ).toBe(false);
  });
  it('bounds manifests, chunk indexes, byte lengths and canonical base64', async () => {
    await begin(new Uint8Array([1, 2, 3]));
    for (const index of [-1, 0.5, 1, 256])
      await expect(
        putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', index, 'AQID'),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      putAttachmentChunk(fixture.db, 'a', 'p', 'blob1', 0, 'AQI='),
    ).rejects.toMatchObject({ status: 400 });
    for (const data of ['', 'AQI', 'AR==', 'AQID\n', 'x'.repeat(90000)])
      expect(() => decodeChunk(data)).toThrow();
    await expect(
      beginAttachment(fixture.db, 'a', 'p', {
        id: 'x',
        mime: 'text/html\r\nInjected: yes',
        byteLength: 1,
        digest: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      beginAttachment(fixture.db, 'a', 'p', {
        id: 'x',
        mime: 'image/png',
        byteLength: 16777217,
        digest: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('reserves unfinished uploads against the global quota without breaking valid retries', async () => {
    const bytes = new Uint8Array([1]);
    await begin(bytes);
    fixture.sql.exec('UPDATE attachments SET reserved_bytes=134217728');
    expect((await begin(bytes)).uploaded).toEqual([]);
    await expect(begin(bytes, 'new')).rejects.toMatchObject({
      code: 'attachment_quota',
    });
    expect(
      fixture.sql.prepare('SELECT COUNT(*) AS n FROM attachments').get(),
    ).toMatchObject({ n: 1 });
  });
});
