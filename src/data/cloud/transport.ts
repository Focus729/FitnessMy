import type { SyncTransport } from './sync-once';
import type { RemoteChange, RemotePage } from './receive';
import { validateCloudWireEntity } from './schema';
import { MAX_BATCH_MUTATIONS } from './limits';

export class SyncRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfter = 0,
    public readonly code?: 'sync_revision_conflict' | 'sync_xp_award_conflict',
  ) {
    super(
      status === 401 || status === 403
        ? 'sync_sign_in_required'
        : status === 409
          ? 'sync_conflict'
          : status === 429
            ? 'sync_rate_limited'
            : 'sync_request_failed',
    );
  }
}
function changes(value: unknown, limit = 100): asserts value is RemoteChange[] {
  if (!Array.isArray(value) || value.length > limit)
    throw new Error('invalid_sync_response');
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.operationId !== 'string' ||
      typeof item.type !== 'string' ||
      typeof item.id !== 'string' ||
      !Number.isSafeInteger(item.revision) ||
      item.revision < 1 ||
      !Number.isSafeInteger(item.sequence) ||
      item.sequence < 1
    )
      throw new Error('invalid_sync_response');
    validateCloudWireEntity(item.type, item.payload);
    if (item.payload.id !== item.id) throw new Error('invalid_sync_response');
  }
}

export function createCloudRequest(fetcher: typeof fetch = fetch) {
  async function request(
    url: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    if (!url.startsWith('/api/profiles/') || url.startsWith('//'))
      throw new Error('invalid_cloud_path');
    const response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const hint = Number(response.headers.get('Retry-After'));
      const category = response.headers.get('X-Sync-Error');
      throw new SyncRequestError(
        response.status,
        Number.isFinite(hint) ? Math.min(3600, Math.max(0, hint)) : 0,
        response.status === 409 &&
          (category === 'sync_revision_conflict' ||
            category === 'sync_xp_award_conflict')
          ? category
          : undefined,
      );
    }
    if (
      response.headers.get('Content-Type')?.split(';')[0]?.trim() !==
      'application/json'
    )
      throw new Error('invalid_sync_response');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('invalid_sync_response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 512 * 1024) {
          await reader.cancel();
          throw new Error('sync_response_too_large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      throw new Error('invalid_sync_response');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('invalid_sync_response');
    return parsed as Record<string, unknown>;
  }
  return request;
}

export function createSyncTransport(
  profileId: string,
  fetcher: typeof fetch = fetch,
): SyncTransport {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profileId))
    throw new Error('invalid_cloud_profile');
  const path = `/api/profiles/${profileId}/sync`;
  const request = createCloudRequest(fetcher);
  return {
    async push(body) {
      const result = await request(path, body);
      if (result.batchId !== body.batchId)
        throw new Error('invalid_sync_response');
      changes(result.changes, MAX_BATCH_MUTATIONS);
      return { batchId: body.batchId, changes: result.changes };
    },
    async pull(after, watermark) {
      const query = new URLSearchParams({ after: String(after) });
      if (watermark !== undefined) query.set('watermark', String(watermark));
      const result = await request(`${path}?${query}`);
      changes(result.changes);
      if (
        ![result.cursor, result.watermark].every(
          (n) => Number.isSafeInteger(n) && Number(n) >= 0,
        ) ||
        typeof result.done !== 'boolean'
      )
        throw new Error('invalid_sync_response');
      return result as unknown as RemotePage;
    },
  };
}
