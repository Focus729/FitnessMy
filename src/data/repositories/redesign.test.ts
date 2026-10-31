import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRepositories } from './dexie';
import { deleteDb, openDb } from '../db/schema';

const profileId = 'redesign-test';
let repos: ReturnType<typeof createRepositories>;
beforeEach(() => {
  repos = createRepositories(profileId);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await deleteDb(profileId);
});

it('does not leave an extra set if aggregate recalculation fails', async () => {
  const workout = await repos.workouts.startFree('Atomic edit');
  vi.spyOn(openDb(profileId).workouts, 'update').mockRejectedValueOnce(
    new Error('Synthetic failure'),
  );
  await expect(
    repos.workouts.addSetToWorkout(workout.id, {
      workoutId: workout.id,
      exerciseId: 'squat',
      order: 0,
      weightKg: 60,
      reps: 8,
      type: 'normal',
      isCompleted: true,
      estimated1RM: 0,
    }),
  ).rejects.toThrow();
  expect(await repos.workoutSets.byWorkout(workout.id)).toHaveLength(0);
  expect((await repos.workouts.get(workout.id))?.totalSets).toBe(0);
});

it('simultaneous free starts resume the same session', async () => {
  const [first, second] = await Promise.all([
    repos.workouts.startFree('Free'),
    repos.workouts.startFree('Free'),
  ]);
  expect(first.id).toBe(second.id);
  expect(await repos.workouts.count()).toBe(1);
});

it('routine start and cycle advancement commit together and advance only once', async () => {
  const routine = await repos.routines.create({
    name: 'Routine',
    source: 'user',
    days: [{ id: 'day', name: 'Day', order: 0, items: [] }],
    nextDayIndex: 0,
  });
  const update = vi
    .spyOn(openDb(profileId).routines, 'update')
    .mockRejectedValueOnce(new Error('Synthetic write failure'));
  await expect(repos.workouts.startRoutine(routine.id)).rejects.toThrow();
  expect(await repos.workouts.count()).toBe(0);
  expect((await repos.routines.get(routine.id))?.nextDayIndex).toBe(0);
  update.mockRestore();
  const [first, second] = await Promise.all([
    repos.workouts.startRoutine(routine.id),
    repos.workouts.startRoutine(routine.id),
  ]);
  expect(first.id).toBe(second.id);
  expect((await repos.routines.get(routine.id))?.nextDayIndex).toBe(1);
});

it('restores the status and link of a free-form plan when workout deletion is undone', async () => {
  const plan = await repos.plannedWorkouts.create({
    name: 'Free plan',
    plannedDate: '2026-10-29',
    status: 'planned',
    items: [],
  });
  const workout = await repos.workouts.startPlanned(plan.id);
  await repos.workouts.finishWorkout(workout.id);
  await repos.workouts.softDeleteWorkout(workout.id);
  expect((await repos.plannedWorkouts.get(plan.id))?.status).toBe('planned');
  await repos.workouts.restoreWorkout(workout.id);
  expect((await repos.plannedWorkouts.get(plan.id))?.status).toBe('completed');
  expect((await repos.plannedWorkouts.get(plan.id))?.workoutId).toBe(workout.id);
  expect((await repos.workouts.startPlanned(plan.id)).id).toBe(workout.id);
});

it('starts a planned workout exactly once under simultaneous requests', async () => {
  const plan = await repos.plannedWorkouts.create({
    name: 'Test',
    plannedDate: '2026-10-29',
    status: 'planned',
    items: [
      {
        id: 'item',
        exerciseId: 'squat',
        order: 0,
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetWeightKg: 60,
        restSec: 90,
      },
    ],
  });
  const [first, second] = await Promise.all([
    repos.workouts.startPlanned(plan.id),
    repos.workouts.startPlanned(plan.id),
  ]);
  expect(first.id).toBe(second.id);
  expect(await repos.workouts.count()).toBe(1);
  expect(await repos.workoutSets.byWorkout(first.id)).toHaveLength(3);
});

it('rolls back a plan start if set creation fails', async () => {
  const plan = await repos.plannedWorkouts.create({
    name: 'Test',
    plannedDate: '2026-10-29',
    status: 'planned',
    items: [
      {
        id: 'item',
        exerciseId: 'squat',
        order: 0,
        targetSets: 2,
        targetRepsMin: 8,
        targetRepsMax: 10,
        restSec: 90,
      },
    ],
  });
  vi.spyOn(openDb(profileId).workoutSets, 'put').mockRejectedValueOnce(new Error('storage full'));
  await expect(repos.workouts.startPlanned(plan.id)).rejects.toThrow('storage full');
  expect(await repos.workouts.count()).toBe(0);
  expect((await repos.plannedWorkouts.get(plan.id))?.status).toBe('planned');
});

it('creates only one initial set across simultaneous mounts', async () => {
  const set = {
    workoutId: 'workout',
    exerciseId: 'squat',
    order: 0,
    weightKg: 60,
    reps: 8,
    type: 'normal' as const,
    isCompleted: false,
    estimated1RM: 0,
  };
  await Promise.all([repos.workoutSets.ensureInitial(set), repos.workoutSets.ensureInitial(set)]);
  expect(await repos.workoutSets.byWorkout('workout')).toHaveLength(1);
});

it('logs a menu once even when submitted concurrently', async () => {
  const entries = [
    {
      id: 'menu-day-0',
      date: '2026-10-29',
      time: '12:00',
      mealSlotId: 'lunch',
      kind: 'quick' as const,
      inputMethod: 'plan' as const,
      nutrients: { kcal: 300, proteinG: 20, fatG: 10, carbG: 30 },
    },
  ];
  await Promise.all([repos.diary.addBatch(entries), repos.diary.addBatch(entries)]);
  expect(await repos.diary.count()).toBe(1);
});
