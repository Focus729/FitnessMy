// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createSyncTransport } from './transport';
it('uses same-origin credentials and refuses HTML login/app fallbacks', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response('<html>login</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
  );
  await expect(createSyncTransport('p', fetcher).pull(0)).rejects.toThrow(
    'invalid_sync_response',
  );
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
  });
});
it('preserves actionable status and bounded retry hint without exposing response bodies', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response('private details', {
        status: 429,
        headers: { 'Retry-After': '60' },
      }),
  );
  await expect(createSyncTransport('p', fetcher).pull(0)).rejects.toMatchObject(
    { status: 429, retryAfter: 60, message: 'sync_rate_limited' },
  );
});
it('bounds the actual response stream', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(' '.repeat(512 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  await expect(createSyncTransport('p', fetcher).pull(0)).rejects.toThrow(
    'sync_response_too_large',
  );
});
it('accepts a valid empty page and rejects invalid record envelopes', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ changes: [], cursor: 0, watermark: 0, done: true }),
  );
  expect(await createSyncTransport('p', fetcher).pull(0)).toMatchObject({
    done: true,
  });
  fetcher.mockResolvedValueOnce(
    Response.json({ changes: [{}], cursor: 1, watermark: 1, done: true }),
  );
  await expect(createSyncTransport('p', fetcher).pull(0)).rejects.toThrow(
    'invalid_sync_response',
  );
});
