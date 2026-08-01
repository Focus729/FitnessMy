/**
 * Сборка встроенной базы упражнений — раздел 7.2.
 *
 * Источник: yuhonas/free-exercise-db (общественное достояние — данные и
 * изображения можно включать в бандл и распространять).
 *
 * Скрипт приводит записи к структуре Exercise из раздела 6.3, собирает русские
 * названия по словарю scripts/exercise-ru.mjs и кладёт результат в
 * src/data/seed/exercises.json — отдельный чанк, подгружаемый после рендера.
 *
 * Запуск: npm run seed:exercises
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { FULL_NAMES, PHRASES, MODIFIERS, WORDS } from './exercise-ru.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const CACHE = resolve(root, 'node_modules/.cache/free-exercise-db.json');
const OUT = resolve(root, 'src/data/seed/exercises.json');

const EQUIPMENT = {
  'body only': 'bodyweight',
  machine: 'machine',
  other: 'other',
  'foam roll': 'other',
  kettlebells: 'kettlebell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  barbell: 'barbell',
  bands: 'band',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'e-z curl bar': 'ezBar',
};

const MUSCLES = {
  abdominals: 'abs',
  hamstrings: 'hamstrings',
  adductors: 'quads',
  abductors: 'glutes',
  quadriceps: 'quads',
  biceps: 'biceps',
  shoulders: 'shoulders',
  chest: 'chest',
  'middle back': 'back',
  calves: 'calves',
  glutes: 'glutes',
  'lower back': 'lowerBack',
  lats: 'lats',
  triceps: 'triceps',
  traps: 'traps',
  forearms: 'forearms',
  neck: 'neck',
};

const CATEGORY = {
  strength: 'strength',
  stretching: 'stretching',
  plyometrics: 'plyometrics',
  strongman: 'strength',
  powerlifting: 'strength',
  cardio: 'cardio',
  'olympic weightlifting': 'strength',
};

const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves']);

/** Отдых по умолчанию: базовые движения требуют больше (10.1). */
function defaultRest(mechanic, category) {
  if (category !== 'strength') return 60;
  return mechanic === 'compound' ? 180 : 90;
}

function toRussian(name) {
  if (FULL_NAMES[name]) return FULL_NAMES[name];

  let rest = name;
  const parts = [];

  // Сначала устойчивые сочетания (движение), потом модификаторы.
  const phrase = [...PHRASES]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([en]) => new RegExp(`\\b${escape(en)}\\b`, 'i').test(rest));
  if (phrase) {
    parts.push(phrase[1]);
    rest = rest.replace(new RegExp(`\\b${escape(phrase[0])}\\b`, 'ig'), ' ');
  }

  for (const [en, ru] of [...MODIFIERS].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`\\b${escape(en)}\\b`, 'i');
    if (re.test(rest)) {
      parts.push(ru);
      rest = rest.replace(new RegExp(`\\b${escape(en)}\\b`, 'ig'), ' ');
    }
  }

  for (const token of rest.split(/[^A-Za-z-]+/).filter(Boolean)) {
    const ru = WORDS[token] ?? WORDS[capitalize(token)];
    if (ru && !parts.includes(ru)) parts.push(ru);
  }

  if (parts.length === 0) return name;
  return capitalize(parts.join(' ').replace(/\s+/g, ' ').trim());
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

async function loadSource() {
  if (existsSync(CACHE)) return JSON.parse(await readFile(CACHE, 'utf8'));
  process.stdout.write('Скачиваю free-exercise-db…\n');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Источник ответил ${res.status}`);
  const data = await res.json();
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(data));
  return data;
}

async function run() {
  const source = await loadSource();
  const seen = new Set();
  const out = [];

  for (const raw of source) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    const primary = (raw.primaryMuscles ?? []).map((m) => MUSCLES[m]).filter(Boolean);
    const secondary = (raw.secondaryMuscles ?? []).map((m) => MUSCLES[m]).filter(Boolean);
    const category = CATEGORY[raw.category] ?? 'strength';
    const equipment = EQUIPMENT[raw.equipment] ?? 'other';
    const nameRu = toRussian(raw.name);

    out.push({
      id: raw.id,
      name: raw.name,
      nameI18n: { en: raw.name, ru: nameRu },
      primaryMuscles: primary.length ? primary : ['fullBody'],
      secondaryMuscles: secondary,
      equipment,
      mechanic: raw.mechanic ?? undefined,
      category,
      instructions: raw.instructions ?? [],
      imageIds: raw.images ?? [],
      bodyPart: primary.some((m) => LOWER.has(m)) ? 'lower' : 'upper',
      defaultRestSec: defaultRest(raw.mechanic, category),
      barWeightKg: equipment === 'barbell' || equipment === 'smith' ? 20 : undefined,
      searchKey: normalize(`${raw.name} ${nameRu}`),
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(dirname(OUT), { recursive: true });
  const json = JSON.stringify(out);
  await writeFile(OUT, json);

  process.stdout.write(
    `Упражнений: ${out.length}\n` +
      `Файл: ${(json.length / 1024).toFixed(0)} КБ, gzip ${(gzipSync(json).length / 1024).toFixed(0)} КБ\n` +
      `Изображений в манифесте: ${out.reduce((s, e) => s + e.imageIds.length, 0)}\n`,
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
