import type { Database } from './db';
import { HttpError } from './http';

export const CHUNK_BYTES = 64 * 1024;
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;
export interface AttachmentManifest {
  id: string;
  mime: string;
  byteLength: number;
  digest: string;
  createdAt: string;
}
interface AttachmentRow {
  id: string;
  mime: string;
  byte_length: number;
  digest: string;
  chunk_count: number;
  finalized: number;
  upload_revision: number;
  created_at: number;
}
const hex = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const identifier = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 200 &&
  !Array.from(v).some((character) => character.charCodeAt(0) < 32);
export async function digestBytes(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
async function get(
  db: Database,
  account: string,
  profile: string,
  id: string,
): Promise<AttachmentRow> {
  const row = await db
    .prepare(
      'SELECT * FROM attachments WHERE account_id=? AND profile_id=? AND id=?',
    )
    .bind(account, profile, id)
    .first<AttachmentRow>();
  if (!row) throw new HttpError(404, 'attachment_not_found');
  return row;
}
function manifest(value: unknown): asserts value is AttachmentManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'invalid_attachment');
  const v = value as AttachmentManifest;
  if (
    Object.keys(v).some(
      (key) =>
        !['id', 'mime', 'byteLength', 'digest', 'createdAt'].includes(key),
    ) ||
    !identifier(v.id) ||
    typeof v.mime !== 'string' ||
    !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(v.mime) ||
    v.mime.length > 127 ||
    !Number.isSafeInteger(v.byteLength) ||
    v.byteLength < 1 ||
    v.byteLength > MAX_ATTACHMENT_BYTES ||
    !hex(v.digest) ||
    typeof v.createdAt !== 'string' ||
    v.createdAt.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v.createdAt) ||
    !Number.isFinite(Date.parse(v.createdAt))
  )
    throw new HttpError(400, 'invalid_attachment');
}
/** Reserve before uploading. Original bytes remain local if size/quota/transport fails. */
export async function beginAttachment(
  db: Database,
  account: string,
  profile: string,
  input: unknown,
) {
  manifest(input);
  const value = { ...input };
  if (
    !(await db
      .prepare('SELECT id FROM profiles WHERE account_id=? AND id=?')
      .bind(account, profile)
      .first())
  )
    throw new HttpError(404, 'profile_not_found');
  const chunks = Math.ceil(value.byteLength / CHUNK_BYTES);
  // Includes base64 expansion and conservative per-chunk/index overhead. Not a physical disk measurement.
  const reservation =
    Math.ceil(value.byteLength / 3) * 4 + chunks * 4096 + 4096;
  try {
    await db
      .prepare(
        `INSERT INTO attachments(account_id,profile_id,id,mime,byte_length,digest,chunk_count,reserved_bytes,created_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,profile_id,id) DO NOTHING`,
      )
      .bind(
        account,
        profile,
        value.id,
        value.mime,
        value.byteLength,
        value.digest,
        chunks,
        reservation,
        Date.parse(value.createdAt),
      )
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes('attachment_quota'))
      throw new HttpError(413, 'attachment_quota');
    throw new HttpError(503, 'attachment_write_failed');
  }
  const row = await get(db, account, profile, value.id);
  if (
    row.mime !== value.mime ||
    row.byte_length !== value.byteLength ||
    row.digest !== value.digest ||
    row.created_at !== Date.parse(value.createdAt)
  )
    throw new HttpError(409, 'attachment_id_reused');
  return attachmentStatus(db, account, profile, value.id);
}
export async function attachmentStatus(
  db: Database,
  account: string,
  profile: string,
  id: string,
) {
  const row = await get(db, account, profile, id);
  const uploaded = await db
    .prepare(
      `SELECT chunk_index FROM attachment_chunks
    WHERE account_id=? AND profile_id=? AND attachment_id=? ORDER BY chunk_index`,
    )
    .bind(account, profile, id)
    .all<{ chunk_index: number }>();
  return {
    id: row.id,
    mime: row.mime,
    byteLength: row.byte_length,
    digest: row.digest,
    createdAt: new Date(row.created_at).toISOString(),
    chunkBytes: CHUNK_BYTES,
    chunkCount: row.chunk_count,
    finalized: row.finalized === 1,
    uploadRevision: row.upload_revision,
    uploaded: uploaded.results.map((chunk) => chunk.chunk_index),
  };
}
export function decodeChunk(data: unknown): Uint8Array {
  if (
    typeof data !== 'string' ||
    data.length === 0 ||
    data.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data,
    )
  )
    throw new HttpError(400, 'invalid_attachment_chunk');
  const binary = atob(data);
  if (btoa(binary) !== data)
    throw new HttpError(400, 'invalid_attachment_chunk');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
export async function putAttachmentChunk(
  db: Database,
  account: string,
  profile: string,
  id: string,
  index: number,
  input: unknown,
) {
  if (!Number.isInteger(index) || index < 0 || index >= 256)
    throw new HttpError(400, 'invalid_attachment_chunk');
  const bytes = decodeChunk(input);
  const row = await get(db, account, profile, id);
  const expectedLength =
    index === row.chunk_count - 1
      ? row.byte_length - index * CHUNK_BYTES
      : CHUNK_BYTES;
  if (index >= row.chunk_count || bytes.length !== expectedLength)
    throw new HttpError(400, 'invalid_attachment_chunk');
  const digest = await digestBytes(bytes);
  try {
    await db
      .prepare(
        `INSERT INTO attachment_chunks(account_id,profile_id,attachment_id,chunk_index,digest,data)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM attachments
        WHERE account_id=? AND profile_id=? AND id=? AND upload_revision=?)
      ON CONFLICT(account_id,profile_id,attachment_id,chunk_index) DO NOTHING`,
      )
      .bind(
        account,
        profile,
        id,
        index,
        digest,
        input,
        account,
        profile,
        id,
        row.upload_revision,
      )
      .run();
  } catch {
    throw new HttpError(503, 'attachment_write_failed');
  }
  const stored = await db
    .prepare(
      `SELECT digest FROM attachment_chunks
    WHERE account_id=? AND profile_id=? AND attachment_id=? AND chunk_index=?`,
    )
    .bind(account, profile, id, index)
    .first<{ digest: string }>();
  if (stored?.digest !== digest)
    throw new HttpError(409, 'attachment_chunk_conflict');
  return { index, digest };
}
export async function finalizeAttachment(
  db: Database,
  account: string,
  profile: string,
  id: string,
) {
  const row = await get(db, account, profile, id);
  if (row.finalized) return attachmentStatus(db, account, profile, id);
  const chunks = await db
    .prepare(
      `SELECT chunk_index,data FROM attachment_chunks
    WHERE account_id=? AND profile_id=? AND attachment_id=? ORDER BY chunk_index`,
    )
    .bind(account, profile, id)
    .all<{ chunk_index: number; data: string }>();
  if (chunks.results.length !== row.chunk_count)
    throw new HttpError(409, 'attachment_incomplete');
  const bytes = new Uint8Array(row.byte_length);
  for (let i = 0; i < row.chunk_count; i++) {
    const chunk = chunks.results[i];
    if (chunk.chunk_index !== i)
      throw new HttpError(409, 'attachment_incomplete');
    bytes.set(decodeChunk(chunk.data), i * CHUNK_BYTES);
  }
  if ((await digestBytes(bytes)) !== row.digest)
    throw new HttpError(409, 'attachment_digest_mismatch');
  // Chunks are immutable within an upload revision; a concurrent restart invalidates this hash check.
  await db
    .prepare(
      'UPDATE attachments SET finalized=1 WHERE account_id=? AND profile_id=? AND id=? AND upload_revision=?',
    )
    .bind(account, profile, id, row.upload_revision)
    .run();
  const status = await attachmentStatus(db, account, profile, id);
  if (!status.finalized) throw new HttpError(409, 'attachment_upload_changed');
  return status;
}

/** Explicit retry recovery only. Finalized files can never be reset by this operation. */
export async function restartAttachment(
  db: Database,
  account: string,
  profile: string,
  id: string,
  expectedRevision: number,
) {
  const row = await get(db, account, profile, id);
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new HttpError(400, 'invalid_upload_revision');
  if (row.finalized) throw new HttpError(409, 'attachment_finalized');
  if (row.upload_revision !== expectedRevision)
    throw new HttpError(409, 'attachment_upload_changed');
  const results = await db.batch([
    db
      .prepare(
        `DELETE FROM attachment_chunks WHERE account_id=? AND profile_id=? AND attachment_id=?
      AND EXISTS(SELECT 1 FROM attachments WHERE account_id=? AND profile_id=? AND id=? AND finalized=0 AND upload_revision=?)`,
      )
      .bind(account, profile, id, account, profile, id, expectedRevision),
    db
      .prepare(
        `UPDATE attachments SET upload_revision=upload_revision+1
      WHERE account_id=? AND profile_id=? AND id=? AND finalized=0 AND upload_revision=?`,
      )
      .bind(account, profile, id, expectedRevision),
  ]);
  if (results[1].meta.changes !== 1)
    throw new HttpError(409, 'attachment_upload_changed');
  return attachmentStatus(db, account, profile, id);
}
export async function readAttachmentChunk(
  db: Database,
  account: string,
  profile: string,
  id: string,
  index: number,
) {
  const row = await get(db, account, profile, id);
  if (!row.finalized) throw new HttpError(409, 'attachment_incomplete');
  if (!Number.isInteger(index) || index < 0 || index >= row.chunk_count)
    throw new HttpError(404, 'attachment_chunk_not_found');
  const chunk = await db
    .prepare(
      `SELECT data,digest FROM attachment_chunks
    WHERE account_id=? AND profile_id=? AND attachment_id=? AND chunk_index=?`,
    )
    .bind(account, profile, id, index)
    .first<{ data: string; digest: string }>();
  if (!chunk) throw new HttpError(503, 'attachment_unavailable');
  return chunk;
}
