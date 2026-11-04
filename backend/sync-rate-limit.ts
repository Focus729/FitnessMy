import type { Database } from './db';
import { HttpError } from './http';

export const SYNC_REQUEST_LIMITS = {
  read: 120,
  write: 60,
  attachment: 120,
} as const;
export type SyncOperation = keyof typeof SYNC_REQUEST_LIMITS;
export class SyncRateLimitError extends HttpError {
  constructor(public readonly retryAfter: number) {
    super(429, 'sync_rate_limited');
  }
}

/** Call after authentication and before body parsing/storage work. Time is server-owned. */
export async function consumeSyncRequest(
  db: Database,
  accountId: string,
  operation: SyncOperation,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 0 ||
    !Object.hasOwn(SYNC_REQUEST_LIMITS, operation)
  )
    throw new HttpError(400, 'invalid_rate_context');
  const windowStart = Math.floor(nowSeconds / 60) * 60;
  let accepted: { requests: number } | null;
  try {
    accepted = await db
      .prepare(
        `
      INSERT INTO sync_rate_limits(account_id,operation,window_start,requests) VALUES(?,?,?,1)
      ON CONFLICT(account_id,operation) DO UPDATE SET
        window_start=excluded.window_start,
        requests=CASE WHEN sync_rate_limits.window_start < excluded.window_start THEN 1 ELSE sync_rate_limits.requests+1 END
      WHERE sync_rate_limits.window_start < excluded.window_start
        OR (sync_rate_limits.window_start = excluded.window_start AND sync_rate_limits.requests < ?)
      RETURNING requests
    `,
      )
      .bind(accountId, operation, windowStart, SYNC_REQUEST_LIMITS[operation])
      .first<{ requests: number }>();
  } catch {
    throw new HttpError(503, 'sync_rate_limit_unavailable');
  }
  if (!accepted) throw new SyncRateLimitError(windowStart + 60 - nowSeconds);
}
