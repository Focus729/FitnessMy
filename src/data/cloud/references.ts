type Row = Record<string, unknown>;
export type Reference = [type: string, id: string];

/** Some local fields are optional in the model but required by the record kind. */
export function hasRequiredReferences(type: string, row: Row): boolean {
  const validEntry = (entry: Row) =>
    entry.kind === 'quick' || typeof entry.refId === 'string';
  if (type === 'diary') return validEntry(row);
  if (type === 'dayTemplates') return (row.entries as Row[]).every(validEntry);
  return true;
}
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
