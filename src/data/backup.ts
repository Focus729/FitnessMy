/**
 * Резервные копии — раздел 16.2.
 *
 * Формат зафиксирован в ТЗ. Импорт ОБЯЗАН проверять format и version и
 * корректно отказывать при несовпадении с понятным сообщением.
 * Слияние: побеждает запись с более поздним updatedAt, удалённые не воскресают.
 */
import { openDb, recoveryDb, EXPORTABLE_TABLES, type ExportableTable } from '@/data/db/schema';
import type { ProfileRef } from '@/data/profiles';
import { getProfileRef } from '@/data/profiles';
import { validBackupPayload, validReferences } from './backupValidation';

export const BACKUP_FORMAT = 'lenta-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  profile: { id: string; name: string; tint?: string };
  tables: Partial<Record<ExportableTable, unknown[]>>;
  blobs: { id: string; mime: string; data: string; createdAt: string }[];
}

export interface ImportPreview {
  /** Таблица → сколько записей добавится / обновится / останется без изменений. */
  perTable: Record<string, { added: number; updated: number; unchanged: number }>;
  totalAdded: number;
  totalUpdated: number;
  totalRemoved: number;
  blobs: number;
  exportedAt: string;
  profileName: string;
}

export type ImportMode = 'replace' | 'merge' | 'preview';

export class BackupFormatError extends Error {
  constructor(
    public readonly reason: 'format' | 'version' | 'parse',
    public readonly detail?: string,
  ) {
    super(reason);
    this.name = 'BackupFormatError';
  }
}

/* ────────────────────────────────── Экспорт ────────────────────────────────── */

export async function exportBackup(profile: ProfileRef): Promise<BackupFile> {
  const db = openDb(profile.id);
  const tables: BackupFile['tables'] = {};

  const blobRows = await db.transaction(
    'r',
    [...EXPORTABLE_TABLES.map((name) => db.table(name)), db.blobs],
    async () => {
      for (const name of EXPORTABLE_TABLES)
        tables[name] = redactCredentials(await db.table(name).toArray());
      return db.blobs.toArray();
    },
  );
  const blobs = await Promise.all(
    blobRows.map(async (b) => ({
      id: b.id,
      mime: b.mime,
      data: await blobToBase64(b.data),
      createdAt: b.createdAt,
    })),
  );

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile: { id: profile.id, name: profile.name, tint: profile.tint },
    tables,
    blobs,
  };
}

/** Имя файла: lenta-<имя профиля>-<дата>.json (16.2). */
export function backupFileName(profileName: string, date = new Date()): string {
  const safe = profileName.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'profile';
  return `lenta-${safe}-${date.toISOString().slice(0, 10)}.json`;
}

export function downloadBackup(backup: BackupFile, profileName: string): void {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(profileName);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ────────────────────────────────── Импорт ─────────────────────────────────── */

export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFormatError('parse');
  }
  const file = parsed as Partial<BackupFile>;
  if (file?.format !== BACKUP_FORMAT) throw new BackupFormatError('format', String(file?.format));
  if (file?.version !== BACKUP_VERSION)
    throw new BackupFormatError('version', String(file?.version));
  if (!validBackupPayload(file, EXPORTABLE_TABLES)) throw new BackupFormatError('parse');
  return file as BackupFile;
}

function redactCredentials<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item: unknown) =>
      /^(apiKey|pinHash|accessToken|refreshToken)$/i.test(key) ? null : item,
    ),
  ) as T;
}

interface Versioned {
  id?: string;
  key?: string;
  updatedAt?: string;
  deletedAt?: string;
}

function keyOf(row: Versioned, table: string): string | undefined {
  return table === 'meta' ? row.key : row.id;
}

/** Предпросмотр: сколько записей будет добавлено или изменено, без применения. */
export async function previewImport(
  profileId: string,
  file: BackupFile,
  mode: 'replace' | 'merge' = 'merge',
): Promise<ImportPreview> {
  if (file.format !== BACKUP_FORMAT) throw new BackupFormatError('format');
  if (file.version !== BACKUP_VERSION) throw new BackupFormatError('version');
  if (!validBackupPayload(file, EXPORTABLE_TABLES)) throw new BackupFormatError('parse');
  const db = openDb(profileId);
  const perTable: ImportPreview['perTable'] = {};
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;

  for (const name of EXPORTABLE_TABLES) {
    const incoming = (file.tables[name] ?? []) as Versioned[];
    const existing = (await db.table(name).toArray()) as Versioned[];
    const incomingKeys = new Set(incoming.map((r) => keyOf(r, name)));
    totalRemoved += existing.filter((r) => !incomingKeys.has(keyOf(r, name))).length;
    const byKey = new Map(existing.map((r) => [keyOf(r, name), r]));

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const row of incoming) {
      const current = byKey.get(keyOf(row, name));
      if (!current) added++;
      else if (
        mode === 'replace' ? JSON.stringify(row) !== JSON.stringify(current) : isNewer(row, current)
      )
        updated++;
      else unchanged++;
    }
    perTable[name] = { added, updated, unchanged };
    totalAdded += added;
    totalUpdated += updated;
  }

  return {
    perTable,
    totalAdded,
    totalUpdated,
    totalRemoved,
    blobs: file.blobs?.length ?? 0,
    exportedAt: file.exportedAt,
    profileName: file.profile?.name ?? '',
  };
}

function isNewer(incoming: Versioned, current: Versioned): boolean {
  if (!incoming.updatedAt) return false;
  if (!current.updatedAt) return true;
  return incoming.updatedAt > current.updatedAt;
}

/**
 * Применение импорта.
 * `replace` — полная замена содержимого таблиц.
 * `merge` — слияние: побеждает более поздний updatedAt, удалённые не воскресают.
 */
export async function applyImport(
  profileId: string,
  file: BackupFile,
  mode: 'replace' | 'merge',
): Promise<ImportPreview> {
  const preview = await previewImport(profileId, file, mode);
  const db = openDb(profileId);
  // Convert blobs before opening a transaction; decoding failure cannot clear data.
  const blobs = file.blobs.map((b) => ({
    ...b,
    data: base64ToBlob(b.data, b.mime),
  }));
  const ref = getProfileRef(profileId) ?? {
    id: profileId,
    name: profileId,
    tint: 'a' as const,
    createdAt: new Date().toISOString(),
  };
  const recovery = await exportBackup(ref);
  // Failure to retain the recovery copy prevents replacement.
  await recoveryDb.snapshots.put({ profileId, backup: recovery });

  await db.transaction(
    'rw',
    [...EXPORTABLE_TABLES.map((name) => db.table(name)), db.blobs],
    async () => {
      const effective: Record<string, unknown[]> = {};
      for (const name of EXPORTABLE_TABLES) {
        const incoming = (file.tables[name] ?? []) as Versioned[];
        if (mode === 'replace') effective[name] = incoming;
        else {
          const merged = new Map(
            ((await db.table(name).toArray()) as Versioned[]).map((row) => [keyOf(row, name), row]),
          );
          for (const row of incoming) {
            const current = merged.get(keyOf(row, name));
            if (!current || isNewer(row, current)) merged.set(keyOf(row, name), row);
          }
          effective[name] = [...merged.values()];
        }
      }
      if (!validReferences(effective))
        throw new BackupFormatError('parse', 'Unresolved references');
      for (const name of EXPORTABLE_TABLES) {
        const incoming = redactCredentials(file.tables[name] ?? []).map((row) =>
          name === 'habits'
            ? {
                ...(row as object),
                polarity: (row as { polarity?: string }).polarity ?? 'build',
              }
            : row,
        ) as Versioned[];
        const table = db.table(name);

        if (mode === 'replace') {
          await table.clear();
          if (incoming.length) await table.bulkPut(incoming);
          continue;
        }

        if (incoming.length === 0) continue;
        const existing = (await table.toArray()) as Versioned[];
        const byKey = new Map(existing.map((r) => [keyOf(r, name), r]));
        const toPut: Versioned[] = [];

        for (const row of incoming) {
          const current = byKey.get(keyOf(row, name));
          if (!current) {
            toPut.push(row);
            continue;
          }
          // Удалённые не воскресают: если текущая запись удалена позже — оставляем её.
          if (isNewer(row, current)) toPut.push(row);
        }
        if (toPut.length) await table.bulkPut(toPut);
      }

      if (mode === 'replace') await db.blobs.clear();
      if (blobs.length) await db.blobs.bulkPut(blobs);
    },
  );

  return preview;
}

export async function getRecoveryBackup(profileId: string): Promise<BackupFile | undefined> {
  const row = await recoveryDb.snapshots.get(profileId);
  return row ? parseBackup(JSON.stringify(row.backup)) : undefined;
}

/* ─────────────────────────── Кодирование двоичных данных ───────────────────── */

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ──────────────────────── Напоминание о копии (2.3, MUST) ──────────────────── */

export const BACKUP_REMINDER_DAYS = 7;

export function needsBackupReminder(lastBackupAt: string | undefined, now = new Date()): boolean {
  if (!lastBackupAt) return true;
  const days = (now.getTime() - new Date(lastBackupAt).getTime()) / 86_400_000;
  return days >= BACKUP_REMINDER_DAYS;
}

/** Объём данных профиля — показывается в настройках (2.3, пункт 4). */
export async function estimateStorage(): Promise<{
  usageBytes: number;
  quotaBytes: number;
  persisted: boolean;
}> {
  const persisted =
    typeof navigator !== 'undefined' && navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : false;
  const estimate =
    typeof navigator !== 'undefined' && navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : { usage: 0, quota: 0 };
  return {
    usageBytes: estimate.usage ?? 0,
    quotaBytes: estimate.quota ?? 0,
    persisted,
  };
}

/**
 * Запрос устойчивого хранилища (2.3, пункт 1).
 * Без него Safari на iOS удаляет данные сайта после 7 дней бездействия.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
