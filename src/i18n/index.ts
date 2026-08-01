/**
 * Локализация — раздел 17.
 *
 * Плюрализация русского (три формы) обеспечивается самим i18next по правилам
 * CLDR: ключи вида `sets_one` / `sets_few` / `sets_many`. Самописных функций нет.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './ru.json';
import en from './en.json';

export const SUPPORTED_LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'ru';
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: detectLocale(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

/** Мгновенное переключение языка, без перезагрузки (17). */
export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}
