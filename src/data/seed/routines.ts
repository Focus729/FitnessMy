/**
 * Восемь встроенных шаблонов программ — раздел 7.3.
 * «Не более 8, иначе выбор парализует.»
 *
 * Шаблон копируется в программу пользователя и дальше редактируется свободно.
 * Исходный шаблон не меняется.
 */

export interface RoutineTemplateItem {
  /** id упражнения из free-exercise-db. */
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSec: number;
  supersetGroup?: string;
}

export interface RoutineTemplateDay {
  nameRu: string;
  nameEn: string;
  items: RoutineTemplateItem[];
}

export interface RoutineTemplate {
  key: string;
  nameRu: string;
  nameEn: string;
  daysPerWeek: string;
  audienceRu: string;
  audienceEn: string;
  days: RoutineTemplateDay[];
}

const s = (
  exerciseId: string,
  targetSets: number,
  targetRepsMin: number,
  targetRepsMax: number,
  restSec = 120,
  supersetGroup?: string,
): RoutineTemplateItem => ({
  exerciseId,
  targetSets,
  targetRepsMin,
  targetRepsMax,
  restSec,
  ...(supersetGroup ? { supersetGroup } : {}),
});

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    key: 'fullbody3',
    nameRu: 'Всё тело, 3 дня',
    nameEn: 'Full body, 3 days',
    daysPerWeek: '3',
    audienceRu: 'Новичок',
    audienceEn: 'Beginner',
    days: [
      {
        nameRu: 'День A',
        nameEn: 'Day A',
        items: [
          s('Barbell_Squat', 3, 5, 8, 180),
          s('Barbell_Bench_Press_-_Medium_Grip', 3, 5, 8, 180),
          s('Bent_Over_Barbell_Row', 3, 6, 10, 150),
          s('Plank', 3, 30, 60, 60),
        ],
      },
      {
        nameRu: 'День B',
        nameEn: 'Day B',
        items: [
          s('Barbell_Deadlift', 3, 4, 6, 180),
          s('Standing_Military_Press', 3, 6, 10, 150),
          s('Pullups', 3, 5, 10, 150),
          s('Hanging_Leg_Raise', 3, 8, 15, 60),
        ],
      },
      {
        nameRu: 'День C',
        nameEn: 'Day C',
        items: [
          s('Front_Barbell_Squat', 3, 6, 10, 180),
          s('Dips_-_Chest_Version', 3, 6, 12, 150),
          s('Seated_Cable_Rows', 3, 8, 12, 120),
          s('Barbell_Curl', 3, 8, 12, 90),
        ],
      },
    ],
  },
  {
    key: 'upperlower4',
    nameRu: 'Верх/низ, 4 дня',
    nameEn: 'Upper/lower, 4 days',
    daysPerWeek: '4',
    audienceRu: 'Средний',
    audienceEn: 'Intermediate',
    days: [
      {
        nameRu: 'Верх A',
        nameEn: 'Upper A',
        items: [
          s('Barbell_Bench_Press_-_Medium_Grip', 4, 5, 8, 180),
          s('Bent_Over_Barbell_Row', 4, 6, 10, 150),
          s('Standing_Military_Press', 3, 8, 12, 120),
          s('Wide-Grip_Lat_Pulldown', 3, 8, 12, 120),
          s('Barbell_Curl', 3, 8, 12, 90, 'arms'),
          s('Triceps_Pushdown', 3, 10, 15, 90, 'arms'),
        ],
      },
      {
        nameRu: 'Низ A',
        nameEn: 'Lower A',
        items: [
          s('Barbell_Squat', 4, 5, 8, 180),
          s('Romanian_Deadlift', 3, 8, 12, 150),
          s('Leg_Press', 3, 10, 15, 120),
          s('Standing_Calf_Raises', 4, 10, 15, 60),
        ],
      },
      {
        nameRu: 'Верх B',
        nameEn: 'Upper B',
        items: [
          s('Standing_Military_Press', 4, 5, 8, 180),
          s('Pullups', 4, 5, 10, 150),
          s('Incline_Dumbbell_Press', 3, 8, 12, 120),
          s('Seated_Cable_Rows', 3, 10, 15, 120),
          s('Side_Lateral_Raise', 3, 12, 15, 60),
        ],
      },
      {
        nameRu: 'Низ B',
        nameEn: 'Lower B',
        items: [
          s('Barbell_Deadlift', 3, 4, 6, 210),
          s('Front_Barbell_Squat', 3, 8, 12, 150),
          s('Lying_Leg_Curls', 3, 10, 15, 90),
          s('Hanging_Leg_Raise', 3, 10, 20, 60),
        ],
      },
    ],
  },
  {
    key: 'ppl6',
    nameRu: 'Жим / тяга / ноги, 6 дней',
    nameEn: 'Push / pull / legs, 6 days',
    daysPerWeek: '6',
    audienceRu: 'Средний и выше',
    audienceEn: 'Intermediate+',
    days: [
      {
        nameRu: 'Жим',
        nameEn: 'Push',
        items: [
          s('Barbell_Bench_Press_-_Medium_Grip', 4, 6, 10, 150),
          s('Standing_Military_Press', 3, 8, 12, 120),
          s('Incline_Dumbbell_Press', 3, 8, 12, 120),
          s('Side_Lateral_Raise', 3, 12, 20, 60),
          s('Triceps_Pushdown', 3, 10, 15, 60),
        ],
      },
      {
        nameRu: 'Тяга',
        nameEn: 'Pull',
        items: [
          s('Bent_Over_Barbell_Row', 4, 6, 10, 150),
          s('Pullups', 3, 6, 12, 150),
          s('Seated_Cable_Rows', 3, 10, 15, 120),
          s('Face_Pull', 3, 12, 20, 60),
          s('Barbell_Curl', 3, 8, 12, 60),
        ],
      },
      {
        nameRu: 'Ноги',
        nameEn: 'Legs',
        items: [
          s('Barbell_Squat', 4, 6, 10, 180),
          s('Romanian_Deadlift', 3, 8, 12, 150),
          s('Leg_Press', 3, 10, 15, 120),
          s('Lying_Leg_Curls', 3, 10, 15, 90),
          s('Standing_Calf_Raises', 4, 12, 20, 60),
        ],
      },
    ],
  },
  {
    key: 'strength5x5',
    nameRu: '5×5, базовая сила',
    nameEn: '5×5 strength',
    daysPerWeek: '3',
    audienceRu: 'Новичок, сила',
    audienceEn: 'Beginner, strength',
    days: [
      {
        nameRu: 'День A',
        nameEn: 'Day A',
        items: [
          s('Barbell_Squat', 5, 5, 5, 180),
          s('Barbell_Bench_Press_-_Medium_Grip', 5, 5, 5, 180),
          s('Bent_Over_Barbell_Row', 5, 5, 5, 180),
        ],
      },
      {
        nameRu: 'День B',
        nameEn: 'Day B',
        items: [
          s('Barbell_Squat', 5, 5, 5, 180),
          s('Standing_Military_Press', 5, 5, 5, 180),
          s('Barbell_Deadlift', 1, 5, 5, 240),
        ],
      },
    ],
  },
  {
    key: 'home_bodyweight',
    nameRu: 'Дома, без оборудования',
    nameEn: 'Home, bodyweight only',
    daysPerWeek: '3–4',
    audienceRu: 'Дом',
    audienceEn: 'Home',
    days: [
      {
        nameRu: 'День A',
        nameEn: 'Day A',
        items: [
          s('Pushups', 4, 8, 20, 90),
          s('Bodyweight_Squat', 4, 15, 25, 90),
          s('Plank', 3, 30, 90, 60),
          s('Bodyweight_Walking_Lunge', 3, 10, 16, 90),
        ],
      },
      {
        nameRu: 'День B',
        nameEn: 'Day B',
        items: [
          s('Pullups', 4, 3, 10, 120),
          s('Dips_-_Triceps_Version', 3, 6, 15, 90),
          s('Hanging_Leg_Raise', 3, 8, 15, 60),
          s('Bodyweight_Squat', 3, 20, 30, 60),
        ],
      },
    ],
  },
  {
    key: 'dumbbell_only',
    nameRu: 'Только гантели',
    nameEn: 'Dumbbell only',
    daysPerWeek: '3–4',
    audienceRu: 'Дом с гантелями',
    audienceEn: 'Home with dumbbells',
    days: [
      {
        nameRu: 'День A',
        nameEn: 'Day A',
        items: [
          s('Dumbbell_Bench_Press', 4, 8, 12, 120),
          s('One-Arm_Dumbbell_Row', 4, 8, 12, 90),
          s('Dumbbell_Squat', 4, 10, 15, 120),
          s('Dumbbell_Bicep_Curl', 3, 10, 15, 60),
        ],
      },
      {
        nameRu: 'День B',
        nameEn: 'Day B',
        items: [
          s('Dumbbell_Shoulder_Press', 4, 8, 12, 120),
          s('Stiff-Legged_Dumbbell_Deadlift', 4, 8, 12, 120),
          s('Dumbbell_Lunges', 3, 10, 14, 90),
          s('Side_Lateral_Raise', 3, 12, 20, 60),
        ],
      },
    ],
  },
  {
    key: 'push_pull4',
    nameRu: 'Жим / тяга, 4 дня',
    nameEn: 'Push / pull, 4 days',
    daysPerWeek: '4',
    audienceRu: 'Средний',
    audienceEn: 'Intermediate',
    days: [
      {
        nameRu: 'Жим',
        nameEn: 'Push',
        items: [
          s('Barbell_Bench_Press_-_Medium_Grip', 4, 5, 8, 180),
          s('Barbell_Squat', 4, 6, 10, 180),
          s('Standing_Military_Press', 3, 8, 12, 120),
          s('Triceps_Pushdown', 3, 10, 15, 60),
        ],
      },
      {
        nameRu: 'Тяга',
        nameEn: 'Pull',
        items: [
          s('Barbell_Deadlift', 3, 4, 6, 210),
          s('Pullups', 4, 5, 10, 150),
          s('Seated_Cable_Rows', 3, 10, 15, 120),
          s('Barbell_Curl', 3, 8, 12, 60),
        ],
      },
    ],
  },
  {
    key: 'minimalist2',
    nameRu: '2 дня, только база',
    nameEn: '2 days, basics only',
    daysPerWeek: '2',
    audienceRu: 'Мало времени',
    audienceEn: 'Short on time',
    days: [
      {
        nameRu: 'День A',
        nameEn: 'Day A',
        items: [
          s('Barbell_Squat', 4, 5, 8, 180),
          s('Barbell_Bench_Press_-_Medium_Grip', 4, 5, 8, 180),
          s('Bent_Over_Barbell_Row', 3, 6, 10, 150),
        ],
      },
      {
        nameRu: 'День B',
        nameEn: 'Day B',
        items: [
          s('Barbell_Deadlift', 3, 4, 6, 210),
          s('Standing_Military_Press', 4, 6, 10, 150),
          s('Pullups', 3, 5, 10, 150),
        ],
      },
    ],
  },
];
