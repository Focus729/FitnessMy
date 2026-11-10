import type { Database } from './db';
import { HttpError } from './http';
import {
  entityReferences,
  hasRequiredReferences,
  type Reference,
} from '../src/data/cloud/references';
import type { CloudMutation } from '../src/data/cloud/schema';
import catalog from './catalog-ids.json' with { type: 'json' };

const foods = new Set(catalog.foods);
const exercises = new Set(catalog.exercises);
export async function validateReferences(
  db: Database,
  account: string,
  profile: string,
  mutations: CloudMutation[],
) {
  const incoming = new Set(
    mutations.map((mutation) => JSON.stringify([mutation.type, mutation.id])),
  );
  const references = new Map<string, Reference>();
  for (const mutation of mutations) {
    if (mutation.type === 'foods' || mutation.type === 'exercises') {
      const builtIn = (mutation.type === 'foods' ? foods : exercises).has(
        mutation.id,
      );
      if (builtIn !== Object.hasOwn(mutation.payload, 'catalogVersion'))
        throw new HttpError(400, 'invalid_catalog_identity');
    }
    if (!hasRequiredReferences(mutation.type, mutation.payload))
      throw new HttpError(400, 'missing_entity_reference');
    for (const reference of entityReferences(mutation.type, mutation.payload)) {
      const [type, id] = reference;
      if (
        (type === 'foods' && foods.has(id)) ||
        (type === 'exercises' && exercises.has(id))
      )
        continue;
      const key = JSON.stringify(reference);
      if (!incoming.has(key)) references.set(key, reference);
    }
  }
  if (!references.size) return;
  const missing = await db
    .prepare(
      `SELECT 1 AS missing FROM json_each(?) ref
    WHERE (json_extract(ref.value,'$[0]')='blobs' AND NOT EXISTS(
      SELECT 1 FROM attachments a WHERE a.account_id=? AND a.profile_id=? AND a.id=json_extract(ref.value,'$[1]') AND a.finalized=1
    )) OR (json_extract(ref.value,'$[0]')!='blobs' AND NOT EXISTS(
      SELECT 1 FROM sync_entities e WHERE e.account_id=? AND e.profile_id=?
      AND e.entity_type=json_extract(ref.value,'$[0]') AND e.entity_id=json_extract(ref.value,'$[1]')
    )) LIMIT 1`,
    )
    .bind(
      JSON.stringify([...references.values()]),
      account,
      profile,
      account,
      profile,
    )
    .first();
  if (missing) throw new HttpError(409, 'entity_reference_unavailable');
}
