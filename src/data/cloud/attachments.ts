import type { BlobRecord } from '../../domain/model';
import { createCloudRequest } from './transport';

const CHUNK_BYTES = 64 * 1024;
const MAX_BYTES = 16 * 1024 * 1024;
export interface FileManifest {
  id: string;
  mime: string;
  byteLength: number;
  digest: string;
  createdAt: string;
}
export interface FileStatus extends FileManifest {
  chunkBytes: number;
  chunkCount: number;
  finalized: boolean;
  uploadRevision: number;
  uploaded: number[];
}
export interface FileTransport {
  begin(manifest: FileManifest): Promise<FileStatus>;
  put(id: string, index: number, data: string): Promise<unknown>;
  finalize(id: string): Promise<FileStatus>;
  status(id: string): Promise<FileStatus>;
  read(id: string, index: number): Promise<{ data: string; digest: string }>;
}
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
function validateStatus(status: FileStatus, id: string): void {
  if (
    !status ||
    typeof status.mime !== 'string' ||
    typeof status.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(status.createdAt)) ||
    typeof status.finalized !== 'boolean' ||
    !Number.isSafeInteger(status.uploadRevision) ||
    status.uploadRevision < 0 ||
    status.id !== id ||
    !Number.isSafeInteger(status.byteLength) ||
    status.byteLength < 1 ||
    status.byteLength > MAX_BYTES ||
    status.chunkBytes !== CHUNK_BYTES ||
    status.chunkCount !== Math.ceil(status.byteLength / CHUNK_BYTES) ||
    !/^[a-f0-9]{64}$/.test(status.digest) ||
    !Array.isArray(status.uploaded) ||
    status.uploaded.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= status.chunkCount,
    )
  )
    throw new Error('invalid_attachment_status');
}

export function createFileTransport(
  profileId: string,
  fetcher: typeof fetch = fetch,
): FileTransport {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profileId))
    throw new Error('invalid_cloud_profile');
  const request = createCloudRequest(fetcher);
  const path = `/api/profiles/${profileId}/attachments`;
  async function status(
    action: string,
    id: string,
    body?: unknown,
  ): Promise<FileStatus> {
    const query = new URLSearchParams({
      action,
      ...(body === undefined ? { id } : {}),
    });
    const result = (await request(
      `${path}?${query}`,
      body,
    )) as unknown as FileStatus;
    validateStatus(result, id);
    return result;
  }
  return {
    begin: (manifest) => status('begin', manifest.id, manifest),
    finalize: (id) => status('finalize', id, { id }),
    status: (id) => status('status', id),
    put: (id, index, data) =>
      request(`${path}?action=put`, { id, index, data }),
    async read(id, index) {
      const query = new URLSearchParams({
        action: 'read',
        id,
        index: String(index),
      });
      const result = await request(`${path}?${query}`);
      if (typeof result.data !== 'string' || typeof result.digest !== 'string')
        throw new Error('invalid_attachment_chunk');
      return { data: result.data, digest: result.digest };
    },
  };
}

/** Resume missing chunks only; failure never changes or deletes the local original. */
export async function uploadAttachment(
  record: BlobRecord,
  transport: FileTransport,
): Promise<void> {
  if (record.data.size < 1 || record.data.size > MAX_BYTES)
    throw new Error('attachment_size_unsupported');
  const bytes = new Uint8Array(await record.data.arrayBuffer());
  const manifest = {
    id: record.id,
    mime: record.mime,
    byteLength: bytes.length,
    digest: await digest(bytes),
    createdAt: record.createdAt,
  };
  const status = await transport.begin(manifest);
  validateStatus(status, record.id);
  if (
    status.digest !== manifest.digest ||
    status.mime !== manifest.mime ||
    status.byteLength !== manifest.byteLength ||
    Date.parse(status.createdAt) !== Date.parse(manifest.createdAt)
  )
    throw new Error('attachment_identity_conflict');
  if (status.finalized) return;
  const uploaded = new Set(status.uploaded);
  for (let index = 0; index < status.chunkCount; index++) {
    if (uploaded.has(index)) continue;
    const chunk = bytes.subarray(
      index * CHUNK_BYTES,
      (index + 1) * CHUNK_BYTES,
    );
    let binary = '';
    for (const byte of chunk) binary += String.fromCharCode(byte);
    await transport.put(record.id, index, btoa(binary));
  }
  const finalized = await transport.finalize(record.id);
  validateStatus(finalized, record.id);
  if (!finalized.finalized || finalized.digest !== manifest.digest)
    throw new Error('attachment_incomplete');
}

/** Verify every chunk and the whole file before returning bytes for an atomic local write. */
export async function downloadAttachment(
  id: string,
  transport: FileTransport,
): Promise<BlobRecord> {
  const status = await transport.status(id);
  validateStatus(status, id);
  if (!status.finalized) throw new Error('attachment_incomplete');
  const bytes = new Uint8Array(status.byteLength);
  for (let index = 0; index < status.chunkCount; index++) {
    const chunk = await transport.read(id, index);
    if (typeof chunk.data !== 'string' || chunk.data.length > 87384)
      throw new Error('invalid_attachment_chunk');
    const binary = atob(chunk.data);
    const decoded = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    if (
      decoded.length !==
        Math.min(CHUNK_BYTES, bytes.length - index * CHUNK_BYTES) ||
      (await digest(decoded)) !== chunk.digest
    )
      throw new Error('attachment_hash_mismatch');
    bytes.set(decoded, index * CHUNK_BYTES);
  }
  if ((await digest(bytes)) !== status.digest)
    throw new Error('attachment_hash_mismatch');
  return {
    id,
    mime: status.mime,
    createdAt: status.createdAt,
    data: new Blob([bytes], { type: status.mime }),
  };
}
