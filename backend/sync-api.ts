import type { Database } from './db';
import { HttpError, json, sameOrigin } from './http';
import { readJson } from './profiles';
import { commitSyncBatch, pullSyncChanges } from './sync-store';
import { consumeSyncRequest, SyncRateLimitError } from './sync-rate-limit';
import { profileStorageUsage } from './storage-usage';

/** Caller must derive accountId from sessionIdentity, never from request input. */
export async function syncApi(
  request: Request,
  db: Database,
  accountId: string,
  origin: string,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})\/(sync|usage)$/.exec(
      url.pathname,
    );
    if (!match) throw new HttpError(404, 'not_found');
    const [, profile, action] = match;
    if (
      request.method !== 'GET' &&
      !(request.method === 'POST' && action === 'sync')
    )
      throw new HttpError(405, 'method_not_allowed');
    if (request.method === 'POST') sameOrigin(request, origin);
    await consumeSyncRequest(
      db,
      accountId,
      request.method === 'GET' ? 'read' : 'write',
    );
    if (action === 'usage') {
      if (url.search) throw new HttpError(400, 'invalid_sync_query');
      return json({
        usage: await profileStorageUsage(db, accountId, profile!),
      });
    }
    if (request.method === 'POST') {
      if (url.search) throw new HttpError(400, 'invalid_sync_query');
      const batch = await readJson(request, 256 * 1024);
      const changes = await commitSyncBatch(db, accountId, profile!, batch);
      return json({ batchId: batch.batchId, changes });
    }
    for (const key of url.searchParams.keys()) {
      if (
        !['after', 'watermark', 'limit', 'mode'].includes(key) ||
        url.searchParams.getAll(key).length !== 1
      )
        throw new HttpError(400, 'invalid_sync_query');
    }
    const integer = (key: string, fallback?: number) => {
      const raw = url.searchParams.get(key);
      if (raw === null) return fallback;
      if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))
        throw new HttpError(400, 'invalid_sync_query');
      return Number(raw);
    };
    const mode = url.searchParams.get('mode') ?? 'changes';
    if (mode !== 'changes' && mode !== 'snapshot')
      throw new HttpError(400, 'invalid_sync_query');
    return json(
      await pullSyncChanges(
        db,
        accountId,
        profile!,
        integer('after', 0),
        integer('watermark'),
        integer('limit', 50),
        mode,
      ),
    );
  } catch (error) {
    if (error instanceof SyncRateLimitError)
      return json({ error: error.code }, 429, {
        'Retry-After': String(error.retryAfter),
      });
    if (error instanceof HttpError)
      return json({ error: error.code }, error.status);
    return json({ error: 'sync_temporarily_unavailable' }, 503);
  }
}
