import { beforeEach, afterEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { attachmentApi } from './attachment-api';
import { digestBytes } from './attachments';
let fixture: ReturnType<typeof testDatabase>;
const origin = 'https://fixture.invalid';
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.sql.close());
const call = (query: string, body?: unknown, account = 'a') =>
  attachmentApi(
    new Request(
      `${origin}/api/profiles/p/attachments?${query}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    ),
    fixture.db,
    account,
    origin,
  );
it('uploads, finalizes and reads a Unicode attachment ID without exposing it to another owner', async () => {
  const id = 'фото/1';
  const bytes = new TextEncoder().encode('abc');
  expect(
    (
      await call('action=begin', {
        id,
        mime: 'image/png',
        byteLength: 3,
        digest: await digestBytes(bytes),
        createdAt: '2020-01-01T00:00:00.000Z',
      })
    ).status,
  ).toBe(200);
  expect(
    (await call('action=put', { id, index: 0, data: btoa('abc') })).status,
  ).toBe(200);
  expect((await call('action=finalize', { id })).status).toBe(200);
  const query = new URLSearchParams({ action: 'read', id, index: '0' });
  expect(await (await call(query.toString())).json()).toMatchObject({
    data: btoa('abc'),
  });
  expect((await call(query.toString(), undefined, 'b')).status).toBe(404);
});
it('rejects ambiguous queries and unsupported methods', async () => {
  expect((await call('action=status&id=a&id=b')).status).toBe(400);
  expect((await call('action=finalize')).status).toBe(405);
  expect(
    (await call('action=restart', { id: 'x', extra: 'private' })).status,
  ).toBe(400);
});
