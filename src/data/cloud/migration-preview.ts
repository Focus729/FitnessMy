import { parseBackup } from '../backup';
import { validReferences } from '../backupValidation';
import { projectCloudEntity, type CloudEntityType } from './schema';
import { legacyXpGap } from '../../domain/gamification/reconcile';
import type { XpEvent } from '../../domain/model';

export interface MigrationPreview {
  sourceProfileId: string;
  fingerprint: string;
  counts: Record<
    string,
    { records: number; tombstones: number; builtIn: number }
  >;
  attachments: { id: string; bytes: number; digest: string }[];
  originalAttachmentBytes: number;
  reservedAttachmentBytes: number;
  projectedRecordBytes: number;
  conservativeSyncReservationBytes: number;
  legacyXpGap: number;
  issues: { code: string; table?: string; id?: string }[];
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Read-only inventory of a phone backup. Never writes local storage or sends a request. */
export async function previewCloudMigration(
  text: string,
): Promise<MigrationPreview> {
  const backup = parseBackup(text);
  const result: MigrationPreview = {
    sourceProfileId: backup.profile.id,
    fingerprint: '',
    counts: {},
    attachments: [],
    originalAttachmentBytes: 0,
    reservedAttachmentBytes: 0,
    projectedRecordBytes: 0,
    conservativeSyncReservationBytes: 0,
    legacyXpGap: 0,
    issues: [],
  };
  if (!validReferences(backup.tables as Record<string, unknown[]>))
    result.issues.push({ code: 'missing_entity_reference' });
  const projected: { type: string; id: string; value: unknown }[] = [];
  for (const [type, records] of Object.entries(backup.tables)) {
    if (type === 'meta') continue;
    result.counts[type] = {
      records: records.length,
      tombstones: 0,
      builtIn: 0,
    };
    for (const item of records) {
      const row = item as Record<string, unknown>;
      if (row.deletedAt) result.counts[type]!.tombstones++;
      if ((type === 'foods' || type === 'exercises') && row.source === 'seed')
        result.counts[type]!.builtIn++;
      if (type === 'gameState') continue;
      try {
        const value = projectCloudEntity(type as CloudEntityType, row);
        projected.push({ type, id: String(row.id), value });
        result.projectedRecordBytes += new TextEncoder().encode(
          JSON.stringify(value),
        ).length;
      } catch {
        result.issues.push({
          code: 'unsupported_record',
          table: type,
          id: String(row.id),
        });
      }
    }
  }
  const state = backup.tables.gameState?.[0] as { xp?: number } | undefined;
  try {
    result.legacyXpGap = legacyXpGap(
      state?.xp ?? 0,
      (backup.tables.xpEvents ?? []) as XpEvent[],
    );
    if (result.legacyXpGap) result.issues.push({ code: 'legacy_xp_review' });
  } catch {
    result.issues.push({ code: 'progress_history_conflict' });
  }
  for (const file of backup.blobs) {
    try {
      if (file.data.length > 24 * 1024 * 1024) throw new Error();
      const binary = atob(file.data);
      if (btoa(binary) !== file.data) throw new Error();
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      result.attachments.push({
        id: file.id,
        bytes: bytes.length,
        digest: await hash(bytes),
      });
      result.originalAttachmentBytes += bytes.length;
      result.reservedAttachmentBytes +=
        Math.ceil(bytes.length / 3) * 4 +
        Math.ceil(bytes.length / 65536) * 4096 +
        4096;
      if (!bytes.length || bytes.length > 16 * 1024 * 1024)
        result.issues.push({
          code: 'attachment_size_unsupported',
          id: file.id,
        });
    } catch {
      result.issues.push({ code: 'invalid_attachment_encoding', id: file.id });
    }
  }
  const files = new Set(backup.blobs.map((file) => file.id));
  for (const item of backup.tables.recipes ?? []) {
    const row = item as Record<string, unknown>;
    if (typeof row.photoBlobId === 'string' && !files.has(row.photoBlobId))
      result.issues.push({
        code: 'missing_attachment',
        table: 'recipes',
        id: String(row.id),
      });
  }
  if (result.reservedAttachmentBytes > 128 * 1024 * 1024)
    result.issues.push({ code: 'attachment_budget_exceeded' });
  // Upper bound assumes a receipt per record; actual import packing may reduce this.
  result.conservativeSyncReservationBytes =
    result.projectedRecordBytes * 2 + projected.length * 6144;
  if (result.conservativeSyncReservationBytes > 96 * 1024 * 1024)
    result.issues.push({ code: 'sync_capacity_review' });
  projected.sort((a, b) =>
    `${a.type}:${a.id}` < `${b.type}:${b.id}` ? -1 : 1,
  );
  result.attachments.sort((a, b) => (a.id < b.id ? -1 : 1));
  result.fingerprint = await hash(
    new TextEncoder().encode(
      canonical({
        profileId: backup.profile.id,
        projected,
        attachments: result.attachments,
        progress: backup.tables.gameState ?? [],
      }),
    ),
  );
  return result;
}
