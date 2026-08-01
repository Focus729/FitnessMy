/**
 * Форматирование чисел и дат через Intl — раздел 17.
 * Разделитель разрядов в русском — неразрывный пробел (это делает сам Intl).
 */
import i18n from '@/i18n';
import type { LocalDate } from '@/domain/model';
import { parseLocalDate } from './date';

function locale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'ru-RU';
}

export function num(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Число с автоматическим числом знаков: целые — без дробной части. */
export function smart(value: number): string {
  return Number.isInteger(value) ? num(value) : num(value, 1);
}

export function signed(value: number, fractionDigits = 0): string {
  const formatted = num(Math.abs(value), fractionDigits);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function percent(value: number, fractionDigits = 0): string {
  return `${num(value * 100, fractionDigits)}%`;
}

export function dateLong(date: LocalDate): string {
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseLocalDate(date));
}

export function dateShort(date: LocalDate): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(
    parseLocalDate(date),
  );
}

export function weekdayShort(date: LocalDate): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(parseLocalDate(date));
}

export function monthLong(date: LocalDate): string {
  return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(
    parseLocalDate(date),
  );
}

export function isoDateTime(iso: string): string {
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Длительность в секундах → «1:23» или «1 ч 05 мин». */
export function durationShort(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function durationLong(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  const hUnit = i18n.t('units.h');
  const mUnit = i18n.t('units.min');
  return h > 0 ? `${h} ${hUnit} ${m} ${mUnit}` : `${m} ${mUnit}`;
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${num(value / 1024, 0)} KB`;
  return `${num(value / (1024 * 1024), 1)} MB`;
}

/* ───────────────── Имперские единицы — только на уровне отображения (5.5) ──── */

export function kgToDisplay(kg: number, units: 'metric' | 'imperial'): number {
  return units === 'imperial' ? Math.round(kg * 2.20462 * 10) / 10 : kg;
}

export function cmToDisplay(cm: number, units: 'metric' | 'imperial'): number {
  return units === 'imperial' ? Math.round((cm / 2.54) * 10) / 10 : cm;
}

export function displayToKg(value: number, units: 'metric' | 'imperial'): number {
  return units === 'imperial' ? Math.round((value / 2.20462) * 100) / 100 : value;
}

export function displayToCm(value: number, units: 'metric' | 'imperial'): number {
  return units === 'imperial' ? Math.round(value * 2.54 * 10) / 10 : value;
}

export function weightUnit(units: 'metric' | 'imperial'): string {
  return i18n.t(units === 'imperial' ? 'units.lb' : 'units.kg');
}

export function lengthUnit(units: 'metric' | 'imperial'): string {
  return i18n.t(units === 'imperial' ? 'units.in' : 'units.cm');
}
