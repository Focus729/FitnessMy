import { MeasureField } from '@/components/MeasureField';
import { toDisplay, unitKey } from '@/lib/units';
/**
 * Настройки — разделы 16 (данные, профили, копии, Диск), 15 (AI),
 * 18/19.4 (вид, приватность), 8.2 (норма и её пересчёт).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@/data/repositories/hooks';
import { useProfile, useSettings, useUpdateSettings } from '@/app/hooks';
import { useSession } from '@/app/store';
import { destroyProfile, getProfileRef, setPin } from '@/data/profiles';
import {
  applyImport,
  BackupFormatError,
  downloadBackup,
  type BackupFile,
  estimateStorage,
  exportBackup,
  getRecoveryBackup,
  parseBackup,
  previewImport,
  requestPersistentStorage,
  type ImportPreview,
} from '@/data/backup';
import {
  authorize,
  DriveError,
  downloadBackup as driveDownload,
  listBackups,
  uploadBackup,
  type DriveBackupInfo,
} from '@/adapters/sync/googleDrive';
import { PROVIDERS } from '@/adapters/ai';
import {
  calculateTargets,
  shouldOfferRecalc,
  targetInputFromProfile,
} from '@/domain/nutrition/targets';
import { backupFileName } from '@/data/backup';
import { bytes, isoDateTime, num } from '@/lib/format';
import {
  Button,
  Label,
  NumberField,
  Segmented,
  Sheet,
  TextField,
  Toggle,
} from '@/design-system/primitives';

const APP_VERSION = '0.7.0';

export function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-title">{t('settings.title')}</h1>

      <Section title={t('settings.sections.appearance')}>
        <Field label={t('settings.language')}>
          <Segmented
            ariaLabel={t('settings.language')}
            value={settings.locale}
            options={[
              { value: 'ru' as const, label: 'Русский' },
              { value: 'en' as const, label: 'English' },
            ]}
            onChange={(v) => void update({ locale: v })}
          />
        </Field>
        <Field label={t('settings.theme')}>
          <Segmented
            ariaLabel={t('settings.theme')}
            value={settings.theme}
            options={[
              { value: 'light' as const, label: t('settings.themes.light') },
              { value: 'dark' as const, label: t('settings.themes.dark') },
              { value: 'system' as const, label: t('settings.themes.system') },
            ]}
            onChange={(v) => void update({ theme: v })}
          />
        </Field>
        <Field label={t('settings.units')}>
          <Segmented
            ariaLabel={t('settings.units')}
            value={settings.units}
            options={[
              { value: 'metric' as const, label: t('settings.unitsMetric') },
              {
                value: 'imperial' as const,
                label: t('settings.unitsImperial'),
              },
            ]}
            onChange={(v) => void update({ units: v })}
          />
        </Field>
        <Field label={t('settings.firstDayOfWeek')}>
          <Segmented
            ariaLabel={t('settings.firstDayOfWeek')}
            value={settings.firstDayOfWeek}
            options={[
              { value: 1 as const, label: t('settings.monday') },
              { value: 7 as const, label: t('settings.sunday') },
            ]}
            onChange={(v) => void update({ firstDayOfWeek: v })}
          />
        </Field>
      </Section>

      <TargetsSection />

      <Section title={t('settings.sections.modules')}>
        <Toggle
          checked={settings.gamificationEnabled}
          onChange={(v) => void update({ gamificationEnabled: v })}
          label={t('settings.gamification')}
          hint={t('settings.gamificationHint')}
        />
        <Toggle
          checked={settings.showSteps}
          onChange={(v) => void update({ showSteps: v })}
          label={t('settings.showSteps')}
        />
        <Toggle
          checked={settings.showSleep}
          onChange={(v) => void update({ showSleep: v })}
          label={t('settings.showSleep')}
        />
        <Toggle
          checked={settings.fasting.enabled}
          onChange={(v) => void update({ fasting: { ...settings.fasting, enabled: v } })}
          label={t('settings.fasting')}
          hint={t('food.fastingAuto')}
        />
        {settings.fasting.enabled ? (
          <Field label={t('food.fastingScheme')}>
            <Segmented
              ariaLabel={t('food.fastingScheme')}
              value={settings.fasting.windowHours}
              options={[8, 6, 4].map((h) => ({
                value: h,
                label: `${24 - h}:${h}`,
              }))}
              onChange={(v) =>
                void update({
                  fasting: { ...settings.fasting, windowHours: v },
                })
              }
            />
          </Field>
        ) : null}
      </Section>

      <MealSlotsSection />
      <PlatesSection />
      <DataSection />
      <AISection />

      <Section title={t('settings.sections.about')}>
        <p className="text-body text-muted">{t('settings.aboutBody')}</p>
        <p className="text-caption text-muted">{t('settings.aboutMedical')}</p>
        <Label>{t('settings.attribution')}</Label>
        <ul className="space-y-1 text-caption text-muted">
          <li>{t('settings.attributionUsda')}</li>
          <li>{t('settings.attributionOff')}</li>
          <li>{t('settings.attributionExercises')}</li>
        </ul>
        <p className="text-caption text-muted">{t('settings.version', { version: APP_VERSION })}</p>
      </Section>
    </div>
  );
}

/* ─────────────────────── Норма и её пересчёт (8.2) ─────────────────────────── */

function TargetsSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const profile = useProfile();
  const latest = useQuery((r) => r.body.latestWeight());

  const offer =
    profile && latest && shouldOfferRecalc(settings.targets, latest.weightKg)
      ? calculateTargets(targetInputFromProfile(profile, latest.weightKg))
      : null;

  return (
    <Section title={t('settings.sections.targets')}>
      {/* Молча цифру не меняем никогда — только с явным подтверждением (8.2) */}
      {offer ? (
        <div className="card p-3">
          <p className="text-body">
            {t('settings.recalcOffer', {
              from: num(settings.targets.kcal),
              to: num(offer.targets.kcal),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => void update({ targets: offer.targets })}>
              {t('settings.recalcApply')}
            </Button>
            <Button
              onClick={() =>
                void update({
                  targets: {
                    ...settings.targets,
                    basedOnWeightKg: latest?.weightKg,
                  },
                })
              }
            >
              {t('settings.recalcKeep')}
            </Button>
          </div>
        </div>
      ) : null}

      <Field label={t('settings.targetsMode')}>
        <Segmented
          ariaLabel={t('settings.targetsMode')}
          value={settings.targets.mode}
          options={[
            {
              value: 'calculated' as const,
              label: t('settings.targetsCalculated'),
            },
            { value: 'manual' as const, label: t('settings.targetsManual') },
          ]}
          onChange={(v) => void update({ targets: { ...settings.targets, mode: v } })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <TargetField label={t('units.kcal')} value={settings.targets.kcal} field="kcal" />
        <TargetField
          label={t('today.proteinFull')}
          value={settings.targets.proteinG}
          field="proteinG"
        />
        <TargetField label={t('today.fatFull')} value={settings.targets.fatG} field="fatG" />
        <TargetField label={t('today.carbFull')} value={settings.targets.carbG} field="carbG" />
        <TargetField label={t('today.fiberFull')} value={settings.targets.fiberG} field="fiberG" />
        <TargetField label={t('today.water')} value={settings.targets.waterMl} field="waterMl" />
      </div>
    </Section>
  );
}

function TargetField({
  label,
  value,
  field,
}: {
  label: string;
  value: number;
  field: 'kcal' | 'proteinG' | 'fatG' | 'carbG' | 'fiberG' | 'waterMl';
}) {
  const settings = useSettings();
  const update = useUpdateSettings();
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">
        <NumberField
          value={value}
          aria-label={label}
          onChange={(v) =>
            void update({
              targets: {
                ...settings.targets,
                [field]: v === '' ? 0 : v,
                mode: 'manual',
              },
            })
          }
        />
      </div>
    </div>
  );
}

/* ───────────────────── Слоты приёмов пищи (9.1 / B5-б) ─────────────────────── */

function MealSlotsSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const [name, setName] = useState('');

  const rename = (id: string, next: string) =>
    void update({
      mealSlots: settings.mealSlots.map((s) => (s.id === id ? { ...s, name: next } : s)),
    });

  return (
    <Section title={t('settings.sections.meals')}>
      <ul className="space-y-2">
        {settings.mealSlots
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((slot) => (
            <li key={slot.id} className="flex items-center gap-2">
              <TextField
                value={
                  ['breakfast', 'lunch', 'dinner', 'snack'].includes(slot.id) &&
                  slot.name === slot.id
                    ? t(`slots.${slot.id}`, slot.name)
                    : slot.name
                }
                onChange={(v) => rename(slot.id, v)}
                aria-label={t('settings.mealSlots')}
              />
              <button
                type="button"
                aria-label={t('common.delete')}
                disabled={settings.mealSlots.length <= 1}
                className="tappable justify-center px-2 text-muted"
                onClick={() =>
                  void update({
                    mealSlots: settings.mealSlots.filter((s) => s.id !== slot.id),
                  })
                }
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
      </ul>
      <div className="flex gap-2">
        <TextField value={name} onChange={setName} aria-label={t('settings.addSlot')} />
        <Button
          disabled={!name.trim()}
          onClick={() => {
            void update({
              mealSlots: [
                ...settings.mealSlots,
                {
                  id: `slot-${Date.now()}`,
                  name: name.trim(),
                  order: settings.mealSlots.length + 1,
                },
              ],
            });
            setName('');
          }}
        >
          {t('common.add')}
        </Button>
      </div>
    </Section>
  );
}

/* ────────────────── Набор блинов и таймер отдыха (10.1) ────────────────────── */

function PlatesSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  return (
    <Section title={t('settings.plates')}>
      <Field label={t('settings.barWeight')}>
        <MeasureField
          value={settings.plates.barKg}
          aria-label={t('settings.barWeight')}
          suffix={t(`units.${unitKey('mass', settings.units)}`)}
          onChange={(v) =>
            void update({
              plates: { ...settings.plates, barKg: v === '' ? 20 : v },
            })
          }
        />
      </Field>
      <p className="tnum text-caption text-muted">
        {settings.plates.availableKg
          .map((p) => num(toDisplay(p, 'mass', settings.units), 2))
          .join(' · ')}
      </p>

      <Field label={t('settings.restDefault')}>
        <NumberField
          value={settings.restTimer.defaultSec}
          aria-label={t('settings.restDefault')}
          suffix={t('units.sec')}
          onChange={(v) =>
            void update({
              restTimer: {
                ...settings.restTimer,
                defaultSec: v === '' ? 120 : v,
              },
            })
          }
        />
      </Field>
      <Toggle
        checked={settings.restTimer.vibrate}
        onChange={(v) => void update({ restTimer: { ...settings.restTimer, vibrate: v } })}
        label={t('settings.restVibrate')}
      />
      <Toggle
        checked={settings.restTimer.sound}
        onChange={(v) => void update({ restTimer: { ...settings.restTimer, sound: v } })}
        label={t('settings.restSound')}
      />
    </Section>
  );
}

/* ────────────────────── Данные, копии, Диск (16, 19.4) ─────────────────────── */

function DataSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const { activeProfileId, refresh, leave } = useSession();
  const [storage, setStorage] = useState<{
    usageBytes: number;
    quotaBytes: number;
    persisted: boolean;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [dataError, setDataError] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const recovery = useQuery(async (r) => getRecoveryBackup(r.profileId));

  useEffect(() => {
    void estimateStorage()
      .then(setStorage)
      .catch(() => setStorageUnavailable(true));
  }, []);

  const ref = activeProfileId ? getProfileRef(activeProfileId) : undefined;

  const doExport = async () => {
    if (!ref) return;
    const backup = await exportBackup(ref);
    downloadBackup(backup, ref.name);
    await update({
      sync: { ...settings.sync, lastBackupAt: new Date().toISOString() },
    });
  };

  const wipe = async () => {
    if (!activeProfileId) return;
    await destroyProfile(activeProfileId);
    refresh();
    leave();
  };

  return (
    <Section title={t('settings.sections.data')}>
      <p className="text-body text-muted">{t('settings.dataWhatBody')}</p>
      <p className="text-caption text-muted">{t('settings.deviceStorageHint')}</p>
      {dataError ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {recovery ? (
        <Button onClick={() => downloadBackup(recovery, `${recovery.profile.name}-recovery`)}>
          {t('backup.downloadRecovery')}
        </Button>
      ) : null}

      <div className="tnum text-caption text-muted">
        <div>
          {storageUnavailable
            ? t('settings.storageUnavailable')
            : storage?.persisted
              ? t('settings.storagePersisted')
              : t('settings.storageNotPersisted')}
        </div>
        {storage ? (
          <div>
            {t('settings.storageUsage', {
              usage: bytes(storage.usageBytes),
              quota: bytes(storage.quotaBytes),
            })}
          </div>
        ) : null}
        <div>
          {settings.sync.lastBackupAt
            ? t('settings.lastBackup', {
                date: isoDateTime(settings.sync.lastBackupAt),
              })
            : t('settings.lastBackupNever')}
        </div>
      </div>

      {!storage?.persisted ? (
        <Button
          onClick={() =>
            void requestPersistentStorage()
              .then(() =>
                estimateStorage().then((next) => {
                  setStorage(next);
                  setStorageUnavailable(false);
                }),
              )
              .catch(() => setStorageUnavailable(true))
          }
        >
          {t('onboarding.enablePersist')}
        </Button>
      ) : null}

      <div className="flex gap-2">
        <Button full onClick={() => void doExport().catch(() => setDataError(true))}>
          {t('settings.exportBackup')}
        </Button>
        <Button full onClick={() => setImportOpen(true)}>
          {t('settings.importBackup')}
        </Button>
      </div>

      <GoogleDriveBlock />

      <Field label={t('profiles.pinSet')}>
        <div className="flex gap-2">
          <TextField
            type="password"
            inputMode="numeric"
            value={pinValue}
            onChange={(value) => setPinValue(value.replace(/\D/g, '').slice(0, 6))}
            aria-label={t('profiles.pinSet')}
            maxLength={6}
            className="flex-1"
          />
          <Button
            disabled={!activeProfileId || (pinValue !== '' && pinValue.length < 4)}
            onClick={() => {
              if (!activeProfileId) return;
              void setPin(activeProfileId, pinValue === '' ? null : String(pinValue)).then(refresh);
              setPinValue('');
            }}
          >
            {pinValue === '' ? t('profiles.pinRemove') : t('common.save')}
          </Button>
        </div>
        <p className="mt-1 text-caption text-muted">{t('profiles.pinDisclaimer')}</p>
      </Field>

      <Button variant="danger" full onClick={() => setDeleteOpen(true)}>
        {t('settings.deleteAll')}
      </Button>

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('profiles.deleteTitle', { name: ref?.name ?? '' })}
      >
        <p className="text-body text-muted">{t('settings.deleteAllWarning')}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" full onClick={() => void doExport()}>
            {t('profiles.downloadFirst')}
          </Button>
          <Button variant="danger" full onClick={() => void wipe()}>
            {t('settings.deleteAll')}
          </Button>
          <Button variant="ghost" full onClick={() => setDeleteOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { activeProfileId } = useSession();
  const [mode, setMode] = useState<'replace' | 'merge' | 'preview'>('preview');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [selected, setSelected] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file: File) => {
    if (!activeProfileId) return;
    setError(null);
    setDone(false);
    setSelected(null);
    setPreview(null);
    try {
      const backup = parseBackup(await file.text());
      setPreview(
        await previewImport(activeProfileId, backup, mode === 'replace' ? 'replace' : 'merge'),
      );
      setSelected(backup);
    } catch (e) {
      if (e instanceof BackupFormatError) {
        setError(
          e.reason === 'version'
            ? t('backup.errVersion', { version: e.detail })
            : e.reason === 'format'
              ? t('backup.errFormat')
              : t('backup.errParse'),
        );
        return;
      }
      setError(t('errors.importFailed'));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('backup.importTitle')}
    >
      <Segmented
        ariaLabel={t('backup.importMode')}
        value={mode}
        options={[
          { value: 'preview' as const, label: t('backup.modePreview') },
          { value: 'merge' as const, label: t('backup.modeMerge') },
          { value: 'replace' as const, label: t('backup.modeReplace') },
        ]}
        onChange={(value) => {
          if (busy) return;
          setMode(value);
          setDone(false);
          if (selected && activeProfileId)
            void previewImport(activeProfileId, selected, value === 'replace' ? 'replace' : 'merge')
              .then(setPreview)
              .catch(() => setError(t('errors.importFailed')));
        }}
      />
      <p className="mt-2 text-caption text-muted">
        {mode === 'replace' ? t('backup.modeReplaceHint') : t('backup.modeMergeHint')}
      </p>

      <label className="tappable mt-4 justify-center rounded-xl border border-hairline px-4 text-caption">
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handle(file);
          }}
        />
        {t('backup.importChoose')}
      </label>

      {error ? <p className="mt-3 text-caption text-over">{error}</p> : null}

      {preview ? (
        <div className="mt-3 text-caption text-muted">
          <p>
            {t('backup.previewFrom', {
              date: isoDateTime(preview.exportedAt),
              name: preview.profileName,
            })}
          </p>
          {mode === 'replace' ? (
            <p>{t('backup.removed', { count: preview.totalRemoved })}</p>
          ) : null}
          <p>{t('backup.credentialsOmitted')}</p>
          {selected && mode !== 'preview' && !done ? (
            <Button
              disabled={busy}
              variant="primary"
              onClick={async () => {
                if (!activeProfileId || busy) return;
                setBusy(true);
                setError(null);
                try {
                  await applyImport(activeProfileId, selected, mode);
                  setDone(true);
                } catch {
                  setError(t('errors.importFailed'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t(busy ? 'common.loading' : 'common.apply')}
            </Button>
          ) : null}
          <p className="tnum">
            {t('backup.previewResult', {
              added: preview.totalAdded,
              updated: preview.totalUpdated,
            })}
          </p>
          {done ? <p className="text-good">{t('backup.importDone')}</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function GoogleDriveBlock() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const { activeProfileId } = useSession();
  const [clientId, setClientId] = useState(settings.sync.gdriveClientId ?? '');
  const [backups, setBackups] = useState<DriveBackupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    backup: BackupFile;
    preview: ImportPreview;
  } | null>(null);
  const [applying, setApplying] = useState(false);

  const save = async () => {
    if (!activeProfileId) return;
    const ref = getProfileRef(activeProfileId);
    if (!ref) return;
    try {
      const token = await authorize(clientId);
      const backup = await exportBackup(ref);
      await uploadBackup(token, backup, backupFileName(ref.name));
      await update({
        sync: {
          provider: 'gdrive',
          gdriveClientId: clientId,
          lastBackupAt: new Date().toISOString(),
        },
      });
      setBackups(await listBackups(token));
      setError(null);
    } catch (e) {
      setError(
        e instanceof DriveError ? t('settings.gdriveSetupNeeded') : t('errors.networkFailed'),
      );
    }
  };

  const restore = async (fileId: string) => {
    if (!activeProfileId) return;
    try {
      const token = await authorize(clientId);
      const backup = await driveDownload(token, fileId);
      setPending({
        backup,
        preview: await previewImport(activeProfileId, backup),
      });
      setError(null);
    } catch {
      setError(t('errors.networkFailed'));
    }
  };

  return (
    <div className="space-y-2">
      <Label>{t('settings.gdrive')}</Label>
      <Sheet
        open={pending != null}
        onClose={() => {
          if (!applying) setPending(null);
        }}
        title={t('backup.importTitle')}
      >
        {pending ? (
          <>
            <p>
              {t('backup.previewResult', {
                added: pending.preview.totalAdded,
                updated: pending.preview.totalUpdated,
              })}
            </p>
            <p className="my-3 text-caption text-muted">{t('backup.credentialsOmitted')}</p>
            <Button
              disabled={applying}
              onClick={() => {
                if (!activeProfileId || applying) return;
                setApplying(true);
                void applyImport(activeProfileId, pending.backup, 'merge')
                  .then(() => setPending(null))
                  .catch(() => setError(t('errors.saveFailed')))
                  .finally(() => setApplying(false));
              }}
            >
              {t('common.apply')}
            </Button>
            {error ? <p role="alert">{error}</p> : null}
          </>
        ) : null}
      </Sheet>
      <p className="text-caption text-muted">{t('settings.gdriveHint')}</p>
      <p className="text-caption text-muted">{t('settings.gdriveOptional')}</p>

      <TextField
        value={clientId}
        onChange={setClientId}
        aria-label={t('settings.gdriveClientId')}
        placeholder={t('settings.gdriveClientId')}
      />
      <p className="text-caption text-muted">{t('settings.gdriveSetupNeeded')}</p>

      <div className="flex gap-2">
        <Button full disabled={!clientId.trim()} onClick={() => void save()}>
          {t('settings.gdriveSaveNow')}
        </Button>
        <Button
          full
          disabled={!clientId.trim()}
          onClick={() =>
            void authorize(clientId)
              .then(listBackups)
              .then(setBackups)
              .catch(() => setError(t('errors.networkFailed')))
          }
        >
          {t('settings.gdriveRestore')}
        </Button>
      </div>

      {error ? <p className="text-caption text-over">{error}</p> : null}

      {backups ? (
        <ul className="divide-y divide-hairline">
          {backups.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
                onClick={() => void restore(b.id)}
              >
                <span className="flex-1 truncate text-caption">{b.name}</span>
                <span className="tnum text-caption text-muted">{isoDateTime(b.modifiedTime)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────── AI (15) ─────────────────────────────────── */

function AISection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const ai = settings.ai;
  const provider = PROVIDERS.find((p) => p.id === ai.provider);

  const patchAI = (patch: Partial<typeof ai>) => void update({ ai: { ...ai, ...patch } });

  return (
    <Section title={t('settings.sections.ai')}>
      <Toggle
        checked={ai.enabled}
        onChange={(v) => patchAI({ enabled: v })}
        label={t('ai.master')}
        hint={t('ai.masterHint')}
      />

      {ai.enabled ? (
        <>
          <Field label={t('ai.provider')}>
            <Segmented
              ariaLabel={t('ai.provider')}
              value={ai.provider ?? ''}
              options={PROVIDERS.map((p) => ({ value: p.id, label: p.id }))}
              onChange={(v) =>
                patchAI({
                  provider: v,
                  model: PROVIDERS.find((p) => p.id === v)?.models[0] ?? null,
                })
              }
            />
          </Field>

          {provider ? (
            <Field label={t('ai.model')}>
              <Segmented
                ariaLabel={t('ai.model')}
                value={ai.model ?? ''}
                options={provider.models.map((m) => ({ value: m, label: m }))}
                onChange={(v) => patchAI({ model: v })}
              />
            </Field>
          ) : null}

          <Field label={t('ai.apiKey')}>
            <TextField
              value={ai.apiKey ?? ''}
              onChange={(v) => patchAI({ apiKey: v || null })}
              aria-label={t('ai.apiKey')}
              type="password"
              autoComplete="off"
            />
            <p className="mt-1 text-caption text-muted">{t('ai.apiKeyHint')}</p>
          </Field>

          <Label>{t('ai.features')}</Label>
          {(Object.keys(ai.features) as (keyof typeof ai.features)[]).map((key) => (
            <Toggle
              key={key}
              checked={ai.features[key]}
              onChange={(v) => patchAI({ features: { ...ai.features, [key]: v } })}
              label={t(`ai.feature.${key}`)}
            />
          ))}

          <Field label={t('ai.callLimit')}>
            <NumberField
              value={ai.monthlyCallLimit}
              aria-label={t('ai.callLimit')}
              onChange={(v) => patchAI({ monthlyCallLimit: v === '' ? 200 : v })}
            />
            <p className="tnum mt-1 text-caption text-muted">
              {t('ai.callsUsed', {
                used: ai.callsThisMonth,
                limit: ai.monthlyCallLimit,
              })}
            </p>
          </Field>

          <p className="text-caption text-muted">{t('ai.photoAccuracy')}</p>
          <p className="text-caption text-muted">{t('ai.estimateCost')}</p>
        </>
      ) : null}
    </Section>
  );
}

/* ─────────────────────────────── Обёртки ───────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-section">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
