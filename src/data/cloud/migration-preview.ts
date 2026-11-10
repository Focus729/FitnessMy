import { parseBackup, type BackupFile } from '../backup';
import { EXPORTABLE_TABLES } from '../db/schema';
import {
  isCatalogType,
  projectCloudEntity,
  validateCloudWireEntity,
  validateCloudMutation,
  type CloudMutation,
  type CloudEntityType,
} from './schema';
import { catalogWirePayload } from './catalog';
import { loadCatalogRows, type CatalogRows } from '../seed/catalog-rows';
import { createProgressBaseline } from '../../domain/gamification/cloud-progress';
import type { GameState, XpEvent } from '../../domain/model';
import { progressEnvelope } from './progress-wire';
import { MAX_BATCH_BYTES, MAX_BATCH_MUTATIONS } from './limits';
import type { PreparedBatch } from './prepare';
import { entityReferences, hasRequiredReferences } from './references';

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

interface ImportRecord {
  type: CloudEntityType;
  id: string;
  value: Record<string, unknown>;
}

export interface CloudImportPlan {
  preview: MigrationPreview;
  targetProfileId: string;
  profile: BackupFile['profile'];
  files: BackupFile['blobs'];
  batches: PreparedBatch['body'][];
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
  return inspectBackup(parseBackup(text)).then(({ preview }) => preview);
}

async function inspectBackup(backup: BackupFile) {
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
  const projected: ImportRecord[] = [];
  let catalog: CatalogRows | undefined;
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
        let value = projectCloudEntity(type as CloudEntityType, row);
        if (isCatalogType(type)) {
          catalog ??= await loadCatalogRows();
          if (catalog[type].has(String(row.id)) !== (row.source === 'seed'))
            throw new Error('invalid_catalog_identity');
          if (row.source === 'seed') {
            value = catalogWirePayload(type, value, catalog);
            if (
              !Object.keys(value.values as object).length &&
              !(value.removed as string[]).length
            )
              continue;
          }
        }
        validateCloudWireEntity(type, value);
        projected.push({
          type: type as CloudEntityType,
          id: String(row.id),
          value,
        });
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
  const state = (backup.tables.gameState?.[0] as GameState | undefined) ?? {
    id: 'singleton',
    xp: 0,
    level: 1,
    freezes: 0,
    streaks: {},
    unlockedAchievements: [],
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
  try {
    const baseline = createProgressBaseline(
      backup.profile.id,
      state,
      (backup.tables.xpEvents ?? []) as XpEvent[],
    );
    result.legacyXpGap = baseline.legacyXp;
    if (result.legacyXpGap) result.issues.push({ code: 'legacy_xp_review' });
    const value = progressEnvelope(state, {
      key: 'progress',
      baselines: [baseline],
    });
    projected.push({ type: 'gameState', id: value.id, value });
    result.projectedRecordBytes += new TextEncoder().encode(
      JSON.stringify(value),
    ).length;
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
  const ids = new Set(
    projected.map((row) => JSON.stringify([row.type, row.id])),
  );
  const files = new Set(backup.blobs.map((file) => file.id));
  for (const row of projected) {
    const issue = { table: row.type, id: row.id };
    if (!hasRequiredReferences(row.type, row.value))
      result.issues.push({ code: 'missing_entity_reference', ...issue });
    for (const [type, id] of entityReferences(row.type, row.value)) {
      if (type === 'blobs') {
        if (!files.has(id))
          result.issues.push({ code: 'missing_attachment', ...issue });
      } else if (!ids.has(JSON.stringify([type, id]))) {
        if (isCatalogType(type)) {
          catalog ??= await loadCatalogRows();
          if (catalog[type].has(id)) continue;
        }
        result.issues.push({ code: 'missing_entity_reference', ...issue });
      }
    }
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
  const fileMetadata = new Map(
    backup.blobs.map(({ id, mime, createdAt }) => [id, { mime, createdAt }]),
  );
  result.fingerprint = await hash(
    new TextEncoder().encode(
      canonical({
        profileId: backup.profile.id,
        projected,
        attachments: result.attachments.map((file) => ({
          ...file,
          ...fileMetadata.get(file.id),
        })),
      }),
    ),
  );
  return { preview: result, projected };
}

/** Freeze the reviewed snapshot into retryable, reference-ordered requests. */
export async function planCloudImport(
  text: string,
  reviewedFingerprint: string,
): Promise<CloudImportPlan> {
  const backup = parseBackup(text);
  const { preview, projected } = await inspectBackup(backup);
  if (reviewedFingerprint !== preview.fingerprint)
    throw new Error('import_review_changed');
  if (preview.issues.some((issue) => issue.code !== 'legacy_xp_review'))
    throw new Error('import_review_has_blockers');
  const encoder = new TextEncoder();
  const sourceHash = await hash(encoder.encode(backup.profile.id));
  const order = new Map<string, number>(
    EXPORTABLE_TABLES.map((type, index) => [type, index]),
  );
  // XP events are available when the progress baseline becomes visible.
  order.set('gameState', EXPORTABLE_TABLES.length);
  projected.sort((a, b) => order.get(a.type)! - order.get(b.type)!);
  const batches: PreparedBatch['body'][] = [];
  const newBatch = (): PreparedBatch['body'] => ({
    schemaVersion: 1,
    batchId: `import:${preview.fingerprint}:${batches.length}`,
    mutations: [],
  });
  let batch = newBatch();
  let bytes = encoder.encode(JSON.stringify(batch)).length;
  for (const [index, record] of projected.entries()) {
    const mutation: CloudMutation = {
      operationId: `import:${preview.fingerprint}:${index}`,
      expectedRevision: 0,
      type: record.type,
      id: record.id,
      payload: record.value,
    };
    validateCloudMutation(mutation);
    const length = encoder.encode(JSON.stringify(mutation)).length;
    if (
      batch.mutations.length &&
      (batch.mutations.length >= MAX_BATCH_MUTATIONS ||
        bytes + length + 1 > MAX_BATCH_BYTES)
    ) {
      batches.push(batch);
      batch = newBatch();
      bytes = encoder.encode(JSON.stringify(batch)).length;
    }
    if (bytes + length > MAX_BATCH_BYTES)
      throw new Error('import_record_too_large');
    bytes += length + (batch.mutations.length ? 1 : 0);
    batch.mutations.push(mutation);
  }
  if (batch.mutations.length) batches.push(batch);
  return {
    preview,
    targetProfileId: `import-${sourceHash}`,
    profile: {
      id: backup.profile.id,
      name: backup.profile.name,
      ...(backup.profile.tint === 'a' || backup.profile.tint === 'b'
        ? { tint: backup.profile.tint }
        : {}),
    },
    files: backup.blobs.map(({ id, mime, data, createdAt }) => ({
      id,
      mime,
      data,
      createdAt,
    })),
    batches,
  };
}
