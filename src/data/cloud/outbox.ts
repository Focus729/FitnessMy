import Dexie, { type DBCore, type DBCoreTransaction } from 'dexie';
import {
  CLOUD_ENTITY_TYPES,
  projectCloudEntity,
  type CloudEntityType,
} from './schema';

export const CLOUD_STORES = {
  cloudState: 'key',
  cloudOutbox:
    '++sequence,&operationId,&[transactionId+entityType+entityId],transactionId,[entityType+entityId],status',
  cloudVersions: '[entityType+entityId]',
} as const;
export interface CloudLink {
  key: 'link';
  accountId: string;
  profileId: string;
  locked: boolean;
}
export interface CloudVersion {
  entityType: string;
  entityId: string;
  serverRevision: number;
  localHead?: string;
  acknowledgedOperationId?: string;
  acknowledgedRevision?: number;
}
export interface OutboxEntry {
  sequence?: number;
  operationId: string;
  transactionId: string;
  accountId: string;
  profileId: string;
  entityType: string;
  entityId: string;
  kind: 'put' | 'delete';
  value: Record<string, unknown>;
  baseRevision: number;
  predecessor?: string;
  status: 'pending';
  createdAt: number;
}
const tracked = new Set<string>([...CLOUD_ENTITY_TYPES, 'gameState', 'blobs']);
const suppressed = new WeakSet<DBCoreTransaction>();
type Row = Record<string, unknown>;
function object(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function sameBusinessValue(a: Row | undefined, b: Row): boolean {
  if (!a) return false;
  const before = { ...a };
  const after = { ...b };
  delete before.updatedAt;
  delete after.updatedAt;
  return stable(before) === stable(after);
}
function project(type: string, value: unknown): Row {
  if (!object(value)) throw new Error('invalid_cloud_capture');
  if (type === 'blobs') {
    if (
      typeof value.id !== 'string' ||
      typeof value.mime !== 'string' ||
      typeof value.createdAt !== 'string' ||
      !(value.data instanceof Blob) ||
      Object.keys(value).some(
        (key) => !['id', 'mime', 'createdAt', 'data'].includes(key),
      )
    )
      throw new Error('invalid_cloud_attachment');
    return {
      id: value.id,
      mime: value.mime,
      createdAt: value.createdAt,
      data: value.data,
    };
  }
  if (type === 'gameState') {
    // A durable local snapshot, not a wire payload. Progress reconciliation must run before sending it.
    const allowed = [
      'id',
      'xp',
      'level',
      'freezes',
      'streaks',
      'unlockedAchievements',
      'updatedAt',
    ];
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      throw new Error('invalid_cloud_progress');
    return structuredClone(value);
  }
  return projectCloudEntity(type as CloudEntityType, value);
}

/** Explicit, transaction-scoped origin. Never suppress unrelated writes in another tab/transaction. */
export function withoutCloudCapture<T>(
  db: Dexie,
  stores: string[],
  work: () => Promise<T>,
): Promise<T> {
  if (Dexie.currentTransaction?.db === db)
    throw new Error('cloud_origin_requires_own_transaction');
  return db.transaction('rw', stores, async (tx) => {
    suppressed.add(tx.idbtrans);
    return work();
  });
}

/** Captures every runtime write in the same native transaction. No account link means local-only. */
export function installCloudOutbox(db: Dexie): void {
  db.use({
    stack: 'dbcore',
    name: 'FitnessMyOutbox',
    level: 10,
    create(down: DBCore) {
      // Dexie rebuilds the stack for intermediate schemas during upgrades from v1/v2.
      if (
        !Object.keys(CLOUD_STORES).every((name) =>
          down.schema.tables.some((table) => table.name === name),
        )
      )
        return down;
      const contexts = new WeakMap<
        DBCoreTransaction,
        { id: string; entries: Map<string, OutboxEntry> }
      >();
      const state = down.table('cloudState');
      const outbox = down.table('cloudOutbox');
      const versions = down.table('cloudVersions');
      return {
        ...down,
        transaction(stores, mode, options) {
          const scope =
            mode === 'readwrite' && stores.some((name) => tracked.has(name))
              ? [...new Set([...stores, ...Object.keys(CLOUD_STORES)])]
              : stores;
          return down.transaction(scope, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!tracked.has(name)) return table;
          return {
            ...table,
            async mutate(request) {
              if (suppressed.has(request.trans)) return table.mutate(request);
              const link = (await state.get({
                trans: request.trans,
                key: 'link',
              })) as CloudLink | undefined;
              if (!link) return table.mutate(request);
              if (link.locked) throw new Error('cloud_workspace_locked');
              const context = contexts.get(request.trans) ?? {
                id: crypto.randomUUID(),
                entries: new Map<string, OutboxEntry>(),
              };
              contexts.set(request.trans, context);
              try {
                let keys: unknown[];
                let before: unknown[];
                if (request.type === 'deleteRange') {
                  before = (
                    await table.query({
                      trans: request.trans,
                      values: true,
                      query: {
                        index: table.schema.primaryKey,
                        range: request.range,
                      },
                    })
                  ).result;
                  keys = before.map((value) =>
                    table.schema.primaryKey.extractKey!(value),
                  );
                } else {
                  keys =
                    request.type === 'delete'
                      ? request.keys
                      : (request.keys ??
                        request.values.map((value) =>
                          table.schema.primaryKey.extractKey!(value),
                        ));
                  before = await table.getMany({ trans: request.trans, keys });
                }
                const result = await table.mutate(request);
                const deleted =
                  request.type === 'delete' || request.type === 'deleteRange';
                const after = deleted
                  ? []
                  : await table.getMany({ trans: request.trans, keys });
                for (let i = 0; i < keys.length; i++) {
                  if (
                    Object.hasOwn(result.failures, i) ||
                    (deleted ? before[i] : after[i]) === undefined
                  )
                    continue;
                  const value = project(name, deleted ? before[i] : after[i]);
                  const old =
                    before[i] === undefined
                      ? undefined
                      : project(name, before[i]);
                  if (
                    !deleted &&
                    name !== 'blobs' &&
                    sameBusinessValue(old, value)
                  )
                    continue;
                  const entityId = String(keys[i]);
                  const key = JSON.stringify([name, entityId]);
                  const existing = context.entries.get(key);
                  const version = (await versions.get({
                    trans: request.trans,
                    key: [name, entityId],
                  })) as CloudVersion | undefined;
                  const entry: OutboxEntry = {
                    ...existing,
                    operationId: existing?.operationId ?? crypto.randomUUID(),
                    transactionId: context.id,
                    accountId: link.accountId,
                    profileId: link.profileId,
                    entityType: name,
                    entityId,
                    kind: deleted ? 'delete' : 'put',
                    value,
                    baseRevision:
                      existing?.baseRevision ?? version?.serverRevision ?? 0,
                    predecessor: existing
                      ? existing.predecessor
                      : version?.localHead,
                    status: 'pending',
                    createdAt: existing?.createdAt ?? Date.now(),
                  };
                  const saved = await outbox.mutate({
                    type: 'put',
                    trans: request.trans,
                    values: [entry],
                  });
                  if (saved.numFailures)
                    throw new Error('cloud_outbox_write_failed');
                  entry.sequence = saved.results![0] as number;
                  context.entries.set(key, entry);
                  const savedVersion = await versions.mutate({
                    type: 'put',
                    trans: request.trans,
                    values: [
                      {
                        ...version,
                        entityType: name,
                        entityId,
                        serverRevision: version?.serverRevision ?? 0,
                        localHead: entry.operationId,
                      },
                    ],
                  });
                  if (savedVersion.numFailures)
                    throw new Error('cloud_version_write_failed');
                }
                return result;
              } catch (error) {
                // Even a caller catching the error cannot commit a local write without its queue entry.
                request.trans.abort();
                throw error;
              }
            },
          };
        },
      };
    },
  });
}
