/**
 * Работа с «календарным днём» пользователя.
 *
 * Ключевое требование раздела 6: `date` — это ЛОКАЛЬНЫЙ день (YYYY-MM-DD).
 * Приём пищи в 23:50 обязан попасть в сегодняшний день, а не в завтрашний UTC,
 * поэтому нигде не используется toISOString().slice(0, 10).
 */
import type { LocalDate, LocalTime } from '@/domain/model';

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date = new Date()): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalTime(d: Date = new Date()): LocalTime {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function today(): LocalDate {
  return toLocalDate(new Date());
}

/** Разбирает YYYY-MM-DD в Date, стоящий в локальной полуночи. */
export function parseLocalDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  const ms = parseLocalDate(a).getTime() - parseLocalDate(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** ISO-номер дня недели: 1 — понедельник, 7 — воскресенье. */
export function isoWeekday(date: LocalDate): number {
  const wd = parseLocalDate(date).getDay();
  return wd === 0 ? 7 : wd;
}

export function startOfWeek(date: LocalDate, firstDay: 1 | 7 = 1): LocalDate {
  const wd = isoWeekday(date);
  const shift = firstDay === 1 ? wd - 1 : wd % 7;
  return addDays(date, -shift);
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

/** Диапазон дат включительно. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Последние n дней, включая указанный. */
export function lastNDays(n: number, end: LocalDate = today()): LocalDate[] {
  return dateRange(addDays(end, -(n - 1)), end);
}

/** Минуты от полуночи для HH:mm. */
export function timeToMinutes(time: LocalTime): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(minutes: number): LocalTime {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Длительность сна с корректным переходом через полночь (11.2).
 * Лёг 23:30, встал 07:10 → 460 минут.
 */
export function sleepDurationMin(bedAt: LocalTime, wakeAt: LocalTime): number {
  const bed = timeToMinutes(bedAt);
  const wake = timeToMinutes(wakeAt);
  return wake >= bed ? wake - bed : 1440 - bed + wake;
}

export function ageOn(birthDate: LocalDate, at: LocalDate = today()): number {
  const b = parseLocalDate(birthDate);
  const a = parseLocalDate(at);
  let age = a.getFullYear() - b.getFullYear();
  const beforeBirthday =
    a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function hoursBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / 3_600_000;
}

export function nowIso(): string {
  return new Date().toISOString();
}
