/** Настройки по умолчанию. Слоты приёмов пищи из 9.1, тумблеры из 2.5 и 2.7. */
import type { MealSlot, Settings } from '@/domain/model';
import { DEFAULT_BAR_KG, DEFAULT_PLATES } from '@/domain/training/plates';
import { nowIso } from '@/lib/date';

export const DEFAULT_MEAL_SLOTS: MealSlot[] = [
  { id: 'breakfast', name: 'breakfast', order: 1, defaultTime: '08:30', targetKcalShare: 0.25 },
  { id: 'lunch', name: 'lunch', order: 2, defaultTime: '13:30', targetKcalShare: 0.35 },
  { id: 'dinner', name: 'dinner', order: 3, defaultTime: '19:00', targetKcalShare: 0.3 },
  { id: 'snack', name: 'snack', order: 4, defaultTime: '16:00', targetKcalShare: 0.1 },
];

export function defaultSettings(): Settings {
  return {
    id: 'singleton',
    locale: detectLocale(),
    theme: 'system',
    units: 'metric',
    firstDayOfWeek: 1,
    mealSlots: DEFAULT_MEAL_SLOTS,
    targets: {
      mode: 'calculated',
      kcal: 2000,
      proteinG: 130,
      fatG: 65,
      carbG: 220,
      fiberG: 28,
      sugarMaxG: 50,
      sodiumMaxMg: 2000,
      waterMl: 2400,
    },
    // 2.5: игровая механика по умолчанию включена
    gamificationEnabled: true,
    showSteps: true,
    showSleep: true,
    fasting: { enabled: false, windowHours: 8, startHour: 12 },
    // 2.7: AI по умолчанию полностью выключен
    ai: {
      enabled: false,
      provider: null,
      apiKey: null,
      model: null,
      features: {
        photoFood: false,
        textFood: false,
        labelScan: false,
        coach: false,
        workoutGen: false,
        menuGen: false,
        weeklyReview: false,
      },
      monthlyCallLimit: 200,
      callsThisMonth: 0,
      callsMonthKey: new Date().toISOString().slice(0, 7),
    },
    sync: { provider: 'none' },
    waterPresetsMl: [200, 300, 500],
    addFoodTabs: ['frequent', 'search', 'barcode', 'quick', 'dishes', 'recipes', 'copyDay'],
    plates: { availableKg: DEFAULT_PLATES, barKg: DEFAULT_BAR_KG },
    restTimer: { sound: false, vibrate: true, defaultSec: 120 },
    onboardingDone: false,
    updatedAt: nowIso(),
  };
}

function detectLocale(): 'ru' | 'en' {
  if (typeof navigator === 'undefined') return 'ru';
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
