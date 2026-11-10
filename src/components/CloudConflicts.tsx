import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system/primitives';
import { Sheet } from '@/design-system/Sheet';
import {
  chooseWorkspaceConflict,
  readWorkspaceConflicts,
  type WorkspaceConflict,
} from '@/data/cloud/workspace-conflicts';

const hidden = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt']);

function valueText(
  value: unknown,
  locale: string,
  yes: string,
  no: string,
): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? yes : no;
  if (typeof value === 'number')
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(
      value,
    );
  if (Array.isArray(value))
    return (
      value.map((item) => valueText(item, locale, yes, no)).join(' · ') || '—'
    );
  if (typeof value === 'object')
    return (
      Object.entries(value)
        .map(([key, item]) => `${key}: ${valueText(item, locale, yes, no)}`)
        .join(' · ') || '—'
    );
  return String(value);
}

export function CloudConflicts({
  id,
  accountId,
  profileId,
  onResolved,
}: {
  id: string;
  accountId: string;
  profileId: string;
  onResolved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<WorkspaceConflict[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void readWorkspaceConflicts(id, accountId, profileId)
      .then((next) => {
        if (active) setRecords(next);
      })
      .catch(() => {
        if (active) {
          setError(true);
          setRecords([]);
        }
      });
    return () => {
      active = false;
    };
  }, [open, id, accountId, profileId, reload]);

  async function choose(
    record: WorkspaceConflict,
    choice: 'local' | 'remote' | 'merge',
  ) {
    setBusy(true);
    setError(false);
    try {
      await chooseWorkspaceConflict(id, accountId, profileId, record, choice);
      if (records?.length === 1) {
        setOpen(false);
        onResolved();
      } else {
        setRecords((current) => current?.filter((item) => item !== record));
        setReload((value) => value + 1);
      }
    } catch {
      setError(true);
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setError(false);
          setRecords(undefined);
          setOpen(true);
        }}
      >
        {t('cloud.reviewConflicts')}
      </Button>
      <Sheet
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={t('cloud.reviewConflicts')}
      >
        <div className="space-y-3">
          {error && (
            <p role="alert" className="text-caption text-over">
              {t('cloud.conflictChanged')}
            </p>
          )}
          {!records && <p role="status">{t('cloud.loading')}</p>}
          {records?.length === 0 && <p>{t('cloud.noConflictChoices')}</p>}
          {records?.map((record) => {
            const fields = [
              ...new Set([
                ...Object.keys(record.local),
                ...Object.keys(record.remote),
              ]),
            ].filter(
              (key) =>
                !hidden.has(key) &&
                JSON.stringify(record.local[key]) !==
                  JSON.stringify(record.remote[key]),
            );
            const merge = record.type === 'gameState';
            return (
              <section
                key={`${record.type}:${record.id}`}
                className="card space-y-3 p-3"
              >
                <h3 className="text-section">
                  {t(`cloud.recordTypes.${record.type}`, {
                    defaultValue: t('cloud.record'),
                  })}
                </h3>
                {typeof record.local.date === 'string' && (
                  <p className="text-caption text-muted">{record.local.date}</p>
                )}
                {merge ? (
                  <p>{t('cloud.mergeProgressHint')}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['local', 'remote'] as const).map((side) => (
                      <div
                        key={side}
                        className="min-w-0 rounded-xl bg-surface-1 p-3"
                      >
                        <h4 className="text-label">
                          {t(`cloud.${side}Version`)}
                        </h4>
                        {Boolean(record[side].deletedAt) && (
                          <p className="text-caption text-over">
                            {t('cloud.deletedVersion')}
                          </p>
                        )}
                        <dl className="mt-1 space-y-2 text-caption">
                          {fields.map((field) => (
                            <div key={field} className="break-words">
                              <dt className="text-muted">
                                {t(`cloud.recordFields.${field}`, {
                                  defaultValue: field.replace(
                                    /([a-z])([A-Z])/g,
                                    '$1 $2',
                                  ),
                                })}
                              </dt>
                              <dd className="whitespace-pre-wrap">
                                {valueText(
                                  record[side][field],
                                  i18n.language,
                                  t('common.yes', { defaultValue: '✓' }),
                                  t('common.no', { defaultValue: '✗' }),
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <Button
                          className="mt-3"
                          full
                          disabled={busy}
                          onClick={() => void choose(record, side)}
                        >
                          {t(
                            `cloud.keep${side === 'local' ? 'Local' : 'Remote'}`,
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {merge && (
                  <Button
                    full
                    disabled={busy}
                    onClick={() => void choose(record, 'merge')}
                  >
                    {t('cloud.mergeProgress')}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
