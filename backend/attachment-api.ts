import type { Database } from './db';
import { HttpError, json, sameOrigin } from './http';
import { readJson } from './profiles';
import { consumeSyncRequest, SyncRateLimitError } from './sync-rate-limit';
import {
  beginAttachment,
  attachmentStatus,
  putAttachmentChunk,
  finalizeAttachment,
  restartAttachment,
  readAttachmentChunk,
} from './attachments';

/** Trusted account identity is supplied by the Worker session layer. */
export async function attachmentApi(
  request: Request,
  db: Database,
  accountId: string,
  origin: string,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})\/attachments$/.exec(
      url.pathname,
    );
    if (!match) throw new HttpError(404, 'not_found');
    const profile = match[1]!;
    for (const key of url.searchParams.keys())
      if (
        !['action', 'id', 'index'].includes(key) ||
        url.searchParams.getAll(key).length !== 1
      )
        throw new HttpError(400, 'invalid_attachment_query');
    const action = url.searchParams.get('action');
    const read = action === 'status' || action === 'read';
    if (
      (read && request.method !== 'GET') ||
      (!read && request.method !== 'POST')
    )
      throw new HttpError(405, 'method_not_allowed');
    if (!read) sameOrigin(request, origin);
    await consumeSyncRequest(db, accountId, 'attachment');
    if (!read && (url.searchParams.has('id') || url.searchParams.has('index')))
      throw new HttpError(400, 'invalid_attachment_query');
    if (read) {
      const id = url.searchParams.get('id');
      if (!id || id.length > 200)
        throw new HttpError(400, 'invalid_attachment_query');
      if (action === 'status') {
        if (url.searchParams.has('index'))
          throw new HttpError(400, 'invalid_attachment_query');
        return json(await attachmentStatus(db, accountId, profile, id));
      }
      const index = url.searchParams.get('index');
      if (!index || !/^(0|[1-9]\d{0,2})$/.test(index))
        throw new HttpError(400, 'invalid_attachment_query');
      return json(
        await readAttachmentChunk(db, accountId, profile, id, Number(index)),
      );
    }
    const data = await readJson(request, 96 * 1024);
    if (action === 'begin')
      return json(await beginAttachment(db, accountId, profile, data));
    const allowed =
      action === 'put'
        ? ['id', 'index', 'data']
        : action === 'restart'
          ? ['id', 'expectedRevision']
          : action === 'finalize'
            ? ['id']
            : [];
    if (
      !allowed.length ||
      Object.keys(data).some((key) => !allowed.includes(key)) ||
      typeof data.id !== 'string' ||
      !data.id ||
      data.id.length > 200
    )
      throw new HttpError(400, 'invalid_attachment_request');
    if (action === 'put')
      return json(
        await putAttachmentChunk(
          db,
          accountId,
          profile,
          data.id,
          data.index as number,
          data.data,
        ),
      );
    if (action === 'restart')
      return json(
        await restartAttachment(
          db,
          accountId,
          profile,
          data.id,
          data.expectedRevision as number,
        ),
      );
    return json(await finalizeAttachment(db, accountId, profile, data.id));
  } catch (error) {
    if (error instanceof SyncRateLimitError)
      return json({ error: error.code }, 429, {
        'Retry-After': String(error.retryAfter),
      });
    if (error instanceof HttpError)
      return json({ error: error.code }, error.status);
    return json({ error: 'attachment_temporarily_unavailable' }, 503);
  }
}
