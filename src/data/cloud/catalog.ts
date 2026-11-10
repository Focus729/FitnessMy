import {
  projectCloudEntity,
  validateCloudEntity,
  type CatalogType,
} from './schema';
import type { CatalogRows } from '../seed/catalog-rows';
import { SEED_VERSION } from '../seed/version';

export interface CatalogOverride {
  id: string;
  catalogVersion: string;
  values: Record<string, unknown>;
  removed: string[];
}

function catalogBaseline(
  type: CatalogType,
  id: string,
  catalog: CatalogRows | undefined,
  stamp: unknown,
) {
  const row = catalog?.[type].get(id);
  if (!row) throw new Error('catalog_baseline_unavailable');
  return { ...row, createdAt: stamp, updatedAt: stamp };
}

export function catalogWirePayload(
  type: CatalogType,
  record: Record<string, unknown>,
  catalog: CatalogRows | undefined,
): Record<string, unknown> {
  const id = String(record.id);
  const catalogVersion = String(SEED_VERSION);
  const baseline = catalogBaseline(type, id, catalog, record.createdAt);
  // An empty override restores the shipped defaults after a prior edit.
  const override = projectCatalogOverride(
    type,
    record,
    baseline,
    catalogVersion,
  ) ?? { id, catalogVersion, values: {}, removed: [] };
  return { ...override, updatedAt: record.updatedAt };
}

export function hydrateCatalogRecord(
  type: CatalogType,
  payload: Record<string, unknown>,
  catalog: CatalogRows | undefined,
  localCreatedAt?: string,
): Record<string, unknown> {
  const baseline = catalogBaseline(
    type,
    String(payload.id),
    catalog,
    localCreatedAt ?? payload.updatedAt,
  );
  return {
    ...applyCatalogOverride(
      type,
      baseline,
      payload as unknown as CatalogOverride,
      String(SEED_VERSION),
    ),
    updatedAt: payload.updatedAt,
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Compare with the exact seeded baseline; defaults never become uploaded user edits. */
export function projectCatalogOverride(
  type: 'foods' | 'exercises',
  record: unknown,
  baseline: unknown,
  catalogVersion: string,
): CatalogOverride | null {
  const current = projectCloudEntity(type, record);
  const base = projectCloudEntity(type, baseline);
  if (
    current.id !== base.id ||
    current.source !== 'seed' ||
    base.source !== 'seed' ||
    !catalogVersion
  ) {
    throw new Error('catalog_identity_mismatch');
  }
  const values: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(current)])) {
    if (['id', 'source', 'createdAt', 'updatedAt'].includes(key)) continue;
    if (canonical(base[key]) === canonical(current[key])) continue;
    if (current[key] === undefined) removed.push(key);
    else values[key] = current[key];
  }
  if (!Object.keys(values).length && !removed.length) return null;
  return {
    id: String(current.id),
    catalogVersion,
    values,
    removed: removed.sort(),
  };
}

/** Never apply an override to an unknown catalog version or allow identity replacement. */
export function applyCatalogOverride(
  type: 'foods' | 'exercises',
  baseline: unknown,
  override: CatalogOverride,
  catalogVersion: string,
): Record<string, unknown> {
  const base = projectCloudEntity(type, baseline);
  if (
    base.id !== override.id ||
    base.source !== 'seed' ||
    override.catalogVersion !== catalogVersion
  ) {
    throw new Error('catalog_version_mismatch');
  }
  const protectedKeys = [
    'id',
    'source',
    'createdAt',
    'updatedAt',
    '__proto__',
    'constructor',
    'prototype',
  ];
  if (
    [...Object.keys(override.values), ...override.removed].some((key) =>
      protectedKeys.includes(key),
    ) ||
    override.removed.some((key) => Object.hasOwn(override.values, key))
  )
    throw new Error('invalid_catalog_override');
  const result = { ...base, ...structuredClone(override.values) };
  for (const key of override.removed) delete result[key];
  validateCloudEntity(type, result);
  return result;
}
