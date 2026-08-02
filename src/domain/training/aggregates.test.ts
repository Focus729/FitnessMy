import { describe, expect, it } from 'vitest';
import { recalcWorkoutTotals, volumeByExercise, workoutDurationSec } from './aggregates';
import type { WorkoutSet } from '@/domain/model';

const set = (
  weightKg: number,
  reps: number,
  patch: Partial<WorkoutSet> = {},
): WorkoutSet => ({
  id: `${weightKg}-${reps}-${patch.type ?? 'normal'}-${patch.order ?? 0}`,
  workoutId: 'w1',
  exerciseId: patch.exerciseId ?? 'squat',
  order: patch.order ?? 0,
  weightKg,
  reps,
  type: patch.type ?? 'normal',
  isCompleted: patch.isCompleted ?? true,
  estimated1RM: 0,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...patch,
});

describe('пересчёт агрегатов тренировки', () => {
  const base = [set(60, 10, { order: 0 }), set(60, 10, { order: 1 }), set(60, 8, { order: 2 })];

  it('считает тоннаж и число рабочих подходов', () => {
    expect(recalcWorkoutTotals(base)).toEqual({ totalVolumeKg: 1680, totalSets: 3 });
  });

  it('удаление подхода уменьшает тоннаж', () => {
    const after = base.slice(0, 2);
    expect(recalcWorkoutTotals(after).totalVolumeKg).toBe(1200);
    expect(recalcWorkoutTotals(after).totalSets).toBe(2);
  });

  it('удаление разминочного подхода тоннаж не меняет', () => {
    const withWarmup = [...base, set(40, 12, { type: 'warmup', order: 3 })];
    expect(recalcWorkoutTotals(withWarmup)).toEqual(recalcWorkoutTotals(base));
  });

  it('добавление подхода увеличивает тоннаж', () => {
    const after = [...base, set(60, 6, { order: 3 })];
    expect(recalcWorkoutTotals(after).totalVolumeKg).toBe(2040);
    expect(recalcWorkoutTotals(after).totalSets).toBe(4);
  });

  it('правка веса пересчитывает тоннаж', () => {
    const edited = [set(70, 10, { order: 0 }), base[1] as WorkoutSet, base[2] as WorkoutSet];
    expect(recalcWorkoutTotals(edited).totalVolumeKg).toBe(1780);
  });

  it('пустая тренировка даёт нули', () => {
    expect(recalcWorkoutTotals([])).toEqual({ totalVolumeKg: 0, totalSets: 0 });
  });

  it('смешанные типы подходов: считаются рабочие, дроп и отказные', () => {
    const mixed = [
      set(40, 12, { type: 'warmup', order: 0 }),
      set(80, 5, { type: 'normal', order: 1 }),
      set(60, 8, { type: 'drop', order: 2 }),
      set(80, 3, { type: 'failure', order: 3 }),
      set(80, 5, { type: 'normal', order: 4, isCompleted: false }),
    ];
    // 80×5 + 60×8 + 80×3 = 400 + 480 + 240
    expect(recalcWorkoutTotals(mixed)).toEqual({ totalVolumeKg: 1120, totalSets: 3 });
  });

  it('невыполненные подходы в агрегаты не входят', () => {
    const planned = base.map((s) => ({ ...s, isCompleted: false }));
    expect(recalcWorkoutTotals(planned)).toEqual({ totalVolumeKg: 0, totalSets: 0 });
  });
});

describe('тоннаж по упражнениям', () => {
  it('группирует и сохраняет порядок появления', () => {
    const sets = [
      set(60, 10, { exerciseId: 'squat', order: 0 }),
      set(40, 10, { exerciseId: 'bench', order: 1 }),
      set(60, 8, { exerciseId: 'squat', order: 2 }),
    ];
    expect(volumeByExercise(sets)).toEqual([
      { exerciseId: 'squat', volumeKg: 1080, sets: 2 },
      { exerciseId: 'bench', volumeKg: 400, sets: 1 },
    ]);
  });

  it('разминочные и невыполненные пропускаются', () => {
    const sets = [
      set(40, 10, { exerciseId: 'squat', type: 'warmup' }),
      set(60, 10, { exerciseId: 'squat', isCompleted: false, order: 1 }),
    ];
    expect(volumeByExercise(sets)).toEqual([]);
  });
});

describe('длительность тренировки', () => {
  it('завершённая считается по finishedAt', () => {
    expect(
      workoutDurationSec({
        startedAt: '2026-08-01T10:00:00.000Z',
        finishedAt: '2026-08-01T11:05:00.000Z',
      }),
    ).toBe(3900);
  });

  it('незавершённая считается до текущего момента', () => {
    expect(
      workoutDurationSec({ startedAt: '2026-08-01T10:00:00.000Z' }, new Date('2026-08-01T10:30:00.000Z')),
    ).toBe(1800);
  });
});
