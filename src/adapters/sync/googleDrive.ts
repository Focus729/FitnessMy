/**
 * Резервные копии на Google Диск — раздел 16.3.
 *
 * Это РЕЗЕРВНОЕ КОПИРОВАНИЕ, а не синхронизация в реальном времени: формулировки
 * в интерфейсе именно такие, чтобы не создавать ложных ожиданий.
 *
 * Файлы кладутся в appDataFolder — служебную папку приложения, невидимую в
 * интерфейсе Диска и недоступную другим приложениям. Область доступа —
 * drive.appdata, ничего больше.
 *
 * Подключение опционально и выключено по умолчанию. Пошаговая настройка
 * Google Cloud Console — в docs/google-drive-setup.md.
 */
import type { BackupFile } from '@/data/backup';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES = 'https://www.googleapis.com/drive/v3/files';

/** Храним не более 5 последних копий (16.3). */
export const KEEP_BACKUPS = 5;

export class DriveError extends Error {
  constructor(public readonly kind: 'noClientId' | 'auth' | 'network' | 'notConfigured') {
    super(kind);
    this.name = 'DriveError';
  }
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
  callback: (response: { access_token?: string; error?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; error?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new DriveError('network'));
    document.head.appendChild(script);
  });
}

/** Запрашивает токен доступа. Требует явного действия пользователя. */
export async function authorize(clientId: string): Promise<string> {
  if (!clientId) throw new DriveError('noClientId');
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new DriveError('notConfigured');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) return reject(new DriveError('auth'));
        // Токен живёт около часа; точное время нам не сообщают.
        cachedToken = { value: response.access_token, expiresAt: Date.now() + 55 * 60_000 };
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export function forgetToken(): void {
  cachedToken = null;
}

export interface DriveBackupInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
}

export async function listBackups(token: string): Promise<DriveBackupInfo[]> {
  const url =
    `${FILES}?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)` +
    '&orderBy=modifiedTime desc&pageSize=20';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new DriveError(res.status === 401 ? 'auth' : 'network');
  const data = (await res.json()) as { files?: { id: string; name: string; modifiedTime: string; size?: string }[] };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    size: Number(f.size ?? 0),
  }));
}

export async function uploadBackup(token: string, backup: BackupFile, name: string): Promise<string> {
  const metadata = { name, parents: ['appDataFolder'] };
  const boundary = `lenta-${Date.now()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify(backup)}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new DriveError(res.status === 401 ? 'auth' : 'network');
  const data = (await res.json()) as { id: string };

  await pruneOldBackups(token);
  return data.id;
}

export async function downloadBackup(token: string, fileId: string): Promise<BackupFile> {
  const res = await fetch(`${FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new DriveError(res.status === 401 ? 'auth' : 'network');
  return (await res.json()) as BackupFile;
}

async function pruneOldBackups(token: string): Promise<void> {
  const files = await listBackups(token);
  for (const file of files.slice(KEEP_BACKUPS)) {
    await fetch(`${FILES}/${file.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

/** Пора ли автосохранять копию: не чаще раза в 24 часа (16.3). */
export function shouldAutoBackup(lastBackupAt: string | undefined, now = new Date()): boolean {
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() > 24 * 3_600_000;
}
