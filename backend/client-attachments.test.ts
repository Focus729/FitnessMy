import { beforeEach, afterEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import {
  beginAttachment,
  putAttachmentChunk,
  finalizeAttachment,
  attachmentStatus,
  readAttachmentChunk,
} from './attachments';
import {
  uploadAttachment,
  downloadAttachment,
  createFileTransport,
  type FileTransport,
} from '../src/data/cloud/attachments';
import { attachmentApi } from './attachment-api';
let fixture: ReturnType<typeof testDatabase>;
let transport: FileTransport;
beforeEach(() => {
  fixture = testDatabase();
  transport = {
    begin: (input) => beginAttachment(fixture.db, 'a', 'p', input),
    put: (id, index, data) =>
      putAttachmentChunk(fixture.db, 'a', 'p', id, index, data),
    finalize: (id) => finalizeAttachment(fixture.db, 'a', 'p', id),
    status: (id) => attachmentStatus(fixture.db, 'a', 'p', id),
    read: (id, index) => readAttachmentChunk(fixture.db, 'a', 'p', id, index),
  };
});
afterEach(() => fixture.sql.close());
it('round trips through the bounded HTTP adapter and attachment handler', async () => {
  const origin = 'https://fixture.invalid';
  const fetcher: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    if (init?.method === 'POST') headers.set('Origin', origin);
    return attachmentApi(
      new Request(new URL(String(url), origin), { ...init, headers }),
      fixture.db,
      'a',
      origin,
    );
  };
  const http = createFileTransport('p', fetcher);
  await uploadAttachment(
    {
      id: 'фото/1',
      mime: 'image/png',
      createdAt: '2020-01-01T00:00:00.000Z',
      data: new Blob(['bytes']),
    },
    http,
  );
  expect(await (await downloadAttachment('фото/1', http)).data.text()).toBe(
    'bytes',
  );
});
it('resumes after a lost chunk response and verifies original bytes on download', async () => {
  const bytes = new Uint8Array(65540).fill(93);
  const record = {
    id: 'photo',
    mime: 'image/png',
    createdAt: '2020-01-01T12:00:00.000Z',
    data: new Blob([bytes]),
  };
  await expect(
    uploadAttachment(record, {
      ...transport,
      put: async (id, index, data) => {
        await transport.put(id, index, data);
        throw new Error('lost response');
      },
    }),
  ).rejects.toThrow('lost response');
  const uploaded: number[] = [];
  await uploadAttachment(record, {
    ...transport,
    put: async (id, index, data) => {
      uploaded.push(index);
      return transport.put(id, index, data);
    },
  });
  expect(uploaded).toEqual([1]);
  const downloaded = await downloadAttachment('photo', transport);
  expect(new Uint8Array(await downloaded.data.arrayBuffer())).toEqual(bytes);
  expect(downloaded.createdAt).toBe(record.createdAt);
  expect(new Uint8Array(await record.data.arrayBuffer())).toEqual(bytes);
});
it('refuses corrupted download bytes', async () => {
  await uploadAttachment(
    {
      id: 'photo',
      mime: 'image/png',
      createdAt: '2020-01-01T12:00:00.000Z',
      data: new Blob(['abc']),
    },
    transport,
  );
  await expect(
    downloadAttachment('photo', {
      ...transport,
      read: async (id, index) => ({
        ...(await transport.read(id, index)),
        data: btoa('xyz'),
      }),
    }),
  ).rejects.toThrow('attachment_hash_mismatch');
});
