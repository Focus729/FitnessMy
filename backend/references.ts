import type { Database } from './db';
import { HttpError } from './http';
import type { CloudMutation } from '../src/data/cloud/schema';
import catalog from './catalog-ids.json';

const foods = new Set(catalog.foods);
const exercises = new Set(catalog.exercises);
type Row = Record<string, unknown>;
type Reference = [type: string, id: string];
/** Call only after shared payload validation. Tombstoned parents remain valid for historical records. */
export function entityReferences(type: string, row: Row): Reference[] {
  const result: Reference[] = [];
  const add = (target: string, id: unknown) => {
    if (typeof id === 'string') result.push([target, id]);
  };
  const food = (entry: Row) => {
    if (entry.kind !== 'quick')
      add(
        entry.kind === 'food'
          ? 'foods'
          : entry.kind === 'dish'
            ? 'dishes'
            : 'recipes',
        entry.refId,
      );
  };
  const items = (value: unknown) => {
    for (const item of value as Row[]) add('exercises', item.exerciseId);
  };
  switch (type) {
    case 'diary':
      food(row);
      break;
    case 'dayTemplates':
      for (const entry of row.entries as Row[]) food(entry);
      break;
    case 'dishes':
    case 'recipes':
      for (const component of row.components as Row[])
        add('foods', component.foodId);
      add('blobs', row.photoBlobId);
      break;
    case 'mealPlans':
      for (const day of row.days as Row[])
        for (const slot of day.slots as Row[]) food(slot);
      break;
    case 'shoppingLists':
      add('mealPlans', row.mealPlanId);
      break;
    case 'routines':
      for (const day of row.days as Row[]) items(day.items);
      break;
    case 'workouts':
      add('routines', row.routineId);
      for (const id of row.exerciseOrder as string[]) add('exercises', id);
      break;
    case 'workoutSets':
      add('workouts', row.workoutId);
      add('exercises', row.exerciseId);
      break;
    case 'plannedWorkouts':
      add('routines', row.routineId);
      add('workouts', row.workoutId);
      items(row.items);
      break;
    case 'habitLogs':
      add('habits', row.habitId);
      break;
  }
  return result;
}

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
    // These relations are required by their discriminant, even though the local model uses an optional property.
    if (
      mutation.type === 'diary' &&
      mutation.payload.kind !== 'quick' &&
      !mutation.payload.refId
    )
      throw new HttpError(400, 'missing_entity_reference');
    if (
      mutation.type === 'dayTemplates' &&
      (mutation.payload.entries as Row[]).some(
        (entry) => entry.kind !== 'quick' && !entry.refId,
      )
    )
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
