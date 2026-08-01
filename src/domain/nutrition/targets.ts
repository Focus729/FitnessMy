/**
 * Расчёт норм — раздел 8.2 ТЗ. Все формулы живут здесь и только здесь.
 */
import type { ActivityLevel, NutritionTargets, Profile } from '@/domain/model';
import { ageOn } from '@/lib/date';

/** Общепринятая оценка энергии в килограмме жировой ткани. Не точная константа (8.2). */
export const KCAL_PER_KG = 7700;

export interface TargetInput {
  sex: 'male' | 'female';
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalRatePerWeekKg: number;
  bodyFatPct?: number;
  /** Настраиваемое количество белка, г/кг. Диапазон 1.2–2.5 (8.2). */
  proteinPerKg?: number;
  fatPerKg?: number;
}

/** Mifflin-St Jeor (8.2). */
export function bmrMifflin(input: {
  sex: 'male' | 'female';
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return input.sex === 'male' ? base + 5 : base - 161;
}

/** Katch-McArdle — применяется автоматически, если известен процент жира (8.2). */
export function bmrKatchMcArdle(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * lbm;
}

export function bmrFor(input: TargetInput): { bmr: number; formula: 'mifflin' | 'katch' } {
  if (input.bodyFatPct != null && input.bodyFatPct > 0 && input.bodyFatPct < 70) {
    return { bmr: bmrKatchMcArdle(input.weightKg, input.bodyFatPct), formula: 'katch' };
  }
  return { bmr: bmrMifflin(input), formula: 'mifflin' };
}

export function tdeeFor(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * activityLevel;
}

/** Целевые калории: TDEE + темп·7700/7 (8.2). */
export function goalKcal(tdee: number, goalRatePerWeekKg: number): number {
  return tdee + (goalRatePerWeekKg * KCAL_PER_KG) / 7;
}

export type SafetyWarning =
  | { kind: 'belowBmr'; kcal: number; bmr: number }
  | { kind: 'belowFloor'; kcal: number; floor: number }
  | { kind: 'fastRate'; ratePerWeekKg: number };

/**
 * Ограничитель безопасности (8.2, MUST).
 * Не блокирует расчёт, но обязан предупредить явно.
 */
export function safetyCheck(args: {
  kcal: number;
  bmr: number;
  sex: 'male' | 'female';
  goalRatePerWeekKg: number;
  weightKg: number;
}): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  const floor = args.sex === 'female' ? 1200 : 1500;
  if (args.kcal < args.bmr) warnings.push({ kind: 'belowBmr', kcal: args.kcal, bmr: args.bmr });
  if (args.kcal < floor) warnings.push({ kind: 'belowFloor', kcal: args.kcal, floor });
  // Более 1% массы тела в неделю — агрессивный темп.
  if (Math.abs(args.goalRatePerWeekKg) > args.weightKg * 0.01) {
    warnings.push({ kind: 'fastRate', ratePerWeekKg: args.goalRatePerWeekKg });
  }
  return warnings;
}

export interface CalculatedTargets {
  bmr: number;
  tdee: number;
  formula: 'mifflin' | 'katch';
  targets: NutritionTargets;
  warnings: SafetyWarning[];
}

/**
 * Полный расчёт нормы. Возвращает и промежуточные величины —
 * экран после онбординга обязан объяснить, откуда взялась цифра (8.1).
 */
export function calculateTargets(input: TargetInput, trainingDay = false): CalculatedTargets {
  const { bmr, formula } = bmrFor(input);
  const tdee = tdeeFor(bmr, input.activityLevel);
  const kcal = Math.round(goalKcal(tdee, input.goalRatePerWeekKg));

  const proteinPerKg = clamp(input.proteinPerKg ?? 1.8, 1.2, 2.5);
  const fatPerKgRaw = input.fatPerKg ?? 0.9;

  const proteinG = Math.round(proteinPerKg * input.weightKg);
  // Нижняя граница жира — не менее 20% калорий (8.2).
  const minFatG = (kcal * 0.2) / 9;
  const fatG = Math.round(Math.max(fatPerKgRaw * input.weightKg, minFatG));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  const targets: NutritionTargets = {
    mode: 'calculated',
    kcal,
    proteinG,
    fatG,
    carbG,
    fiberG: Math.round((14 * kcal) / 1000),
    sugarMaxG: Math.round((kcal * 0.1) / 4),
    sodiumMaxMg: 2000,
    waterMl: Math.round(30 * input.weightKg + (trainingDay ? 500 : 0)),
    calculated: { kcal, proteinG, fatG, carbG },
    basedOnWeightKg: input.weightKg,
  };

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    formula,
    targets,
    warnings: safetyCheck({
      kcal,
      bmr,
      sex: input.sex,
      goalRatePerWeekKg: input.goalRatePerWeekKg,
      weightKg: input.weightKg,
    }),
  };
}

export function targetInputFromProfile(
  profile: Profile,
  weightKg: number,
  onDate?: string,
): TargetInput {
  return {
    sex: profile.sex,
    age: ageOn(profile.birthDate, onDate),
    heightCm: profile.heightCm,
    weightKg,
    activityLevel: profile.activityLevel,
    goalRatePerWeekKg: profile.goal === 'maintain' ? 0 : profile.goalRatePerWeekKg,
    bodyFatPct: profile.bodyFatPct,
  };
}

/**
 * Правило пересчёта из 8.2: предлагать обновление, только если вес ушёл
 * более чем на 2 кг от значения, на котором норма считалась.
 * Молча цифру не меняем никогда — функция лишь отвечает «стоит ли спросить».
 */
export function shouldOfferRecalc(targets: NutritionTargets, currentWeightKg: number): boolean {
  if (targets.mode === 'manual') return false;
  if (targets.basedOnWeightKg == null) return false;
  return Math.abs(currentWeightKg - targets.basedOnWeightKg) > 2;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
