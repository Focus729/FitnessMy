/**
 * Напоминание о резервной копии — раздел 2.3, пункт 3 (MUST).
 *
 * «Модальное окно, которое нельзя пропустить одним нажатием»: закрыть его можно
 * либо скачав копию, либо явно отложив на сутки.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBackup, exportBackup, needsBackupReminder } from '@/data/backup';
import { getProfileRef } from '@/data/profiles';
import { useSession } from '@/app/store';
import { Button, Sheet } from '@/design-system/primitives';

const SNOOZE_KEY = 'lenta.backupSnoozeUntil';

export function BackupReminder({
  lastBackupAt,
  onDone,
}: {
  lastBackupAt?: string;
  onDone: (at: string) => void;
}) {
  const { t } = useTranslation();
  const { activeProfileId } = useSession();
  const [snoozed, setSnoozed] = useState(() => {
    const until = localStorage.getItem(SNOOZE_KEY);
    return until != null && new Date(until).getTime() > Date.now();
  });

  const ref = activeProfileId ? getProfileRef(activeProfileId) : undefined;
  // Отсчёт ведём от последней копии, а если её не было — от создания профиля:
  // напоминать в первый же день, когда терять ещё нечего, бессмысленно (2.3).
  const since = lastBackupAt ?? ref?.createdAt;
  const open = !snoozed && needsBackupReminder(since);
  if (!open || !activeProfileId || !ref) return null;

  const days = since ? Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000) : 0;

  const snooze = () => {
    const until = new Date(Date.now() + 86_400_000).toISOString();
    localStorage.setItem(SNOOZE_KEY, until);
    setSnoozed(true);
  };

  const save = async () => {
    const backup = await exportBackup(ref);
    downloadBackup(backup, ref.name);
    localStorage.removeItem(SNOOZE_KEY);
    onDone(new Date().toISOString());
  };

  return (
    <Sheet open onClose={snooze} title={t('backup.reminderTitle')}>
      <p className="text-body text-muted">
        {lastBackupAt ? t('backup.reminderBody', { days }) : t('backup.reminderNever')}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button variant="primary" full onClick={() => void save()}>
          {t('backup.reminderAction')}
        </Button>
        <Button variant="ghost" full onClick={snooze}>
          {t('backup.reminderLater')}
        </Button>
      </div>
    </Sheet>
  );
}
