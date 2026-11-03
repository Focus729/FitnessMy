import type { Database } from './db';
import { HttpError, json, sameOrigin } from './http';

export interface CloudProfile {
  id: string;
  name: string;
  tint: 'a' | 'b';
  revision: number;
  createdAt: number;
  updatedAt: number;
}
const columns =
  'id,name,tint,revision,created_at AS createdAt,updated_at AS updatedAt';
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);

/** Bound the actual stream, including requests without Content-Length. */
export async function readJson(
  request: Request,
  limit = 4096,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new HttpError(415, 'json_required');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'invalid_json');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'request_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const data: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export async function profilesApi(
  request: Request,
  db: Database,
  accountId: string,
  origin: string,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/profiles' && request.method === 'GET') {
    const rows = await db
      .prepare(
        `SELECT ${columns} FROM profiles WHERE account_id=? ORDER BY created_at,id LIMIT 101`,
      )
      .bind(accountId)
      .all<CloudProfile>();
    return json({ profiles: rows.results });
  }
  const id = path.startsWith('/api/profiles/')
    ? path.slice('/api/profiles/'.length)
    : '';
  if (!validId(id)) throw new HttpError(404, 'not_found');
  if (request.method === 'GET') {
    const profile = await db
      .prepare(`SELECT ${columns} FROM profiles WHERE account_id=? AND id=?`)
      .bind(accountId, id)
      .first<CloudProfile>();
    if (!profile) throw new HttpError(404, 'not_found');
    return json({ profile });
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'method_not_allowed');
  sameOrigin(request, origin);
  const data = await readJson(request);
  if (
    Object.keys(data).some(
      (key) => !['name', 'tint', 'expectedRevision'].includes(key),
    ) ||
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    data.name.trim().length > 80 ||
    [...data.name].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    !['a', 'b'].includes(String(data.tint)) ||
    !Number.isSafeInteger(data.expectedRevision) ||
    Number(data.expectedRevision) < 0
  )
    throw new HttpError(400, 'invalid_profile');
  const name = data.name.trim();
  const revision = Number(data.expectedRevision);
  const now = Math.floor(Date.now() / 1000);
  if (revision === 0) {
    // Stable client ID makes creation retry-safe; the quota check is in the same SQL statement.
    await db
      .prepare(
        `INSERT INTO profiles(account_id,id,name,tint,created_at,updated_at)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM profiles WHERE account_id=?) < 100
      ON CONFLICT(account_id,id) DO NOTHING`,
      )
      .bind(accountId, id, name, data.tint, now, now, accountId)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE profiles SET name=?,tint=?,revision=revision+1,updated_at=?
      WHERE account_id=? AND id=? AND revision=?`,
      )
      .bind(name, data.tint, now, accountId, id, revision)
      .run();
  }
  const current = await db
    .prepare(`SELECT ${columns} FROM profiles WHERE account_id=? AND id=?`)
    .bind(accountId, id)
    .first<CloudProfile>();
  if (!current)
    throw new HttpError(
      revision === 0 ? 409 : 404,
      revision === 0 ? 'profile_limit' : 'not_found',
    );
  // An identical retry is safe; a divergent version is never silently replaced.
  if (
    current.name !== name ||
    current.tint !== data.tint ||
    current.revision !== revision + 1
  )
    return json({ error: 'profile_conflict', current }, 409);
  return json({ profile: current });
}
