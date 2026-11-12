/**
 * Проверка контраста пар «текст/фон» — задача 6 доработки 0.7 и раздел 19.3 ТЗ.
 *
 * Требование: не ниже 4.5:1 для основного текста и 3:1 для крупного.
 * Значения берутся прямо из src/design-system/tokens.css, чтобы проверка не
 * разошлась с реальной палитрой.
 *
 * Результат вставляется в AUDIT.md вместо метки CONTRAST_TABLE.
 * Запуск: node scripts/check-contrast.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Пары для проверки: текст, фон, минимальный коэффициент, что это. */
const PAIRS = [
  ['--ink', '--paper', 4.5, 'Основной текст на фоне экрана'],
  ['--ink', '--surface-1', 4.5, 'Основной текст на карточке'],
  ['--ink', '--surface-2', 4.5, 'Основной текст на вложенном элементе'],
  ['--muted', '--paper', 4.5, 'Второстепенный текст на фоне'],
  ['--muted', '--surface-1', 4.5, 'Второстепенный текст на карточке'],
  ['--muted', '--surface-2', 4.5, 'Второстепенный текст на вложенном элементе'],
  ['--accent', '--surface-1', 3, 'Акцент на карточке (крупный элемент)'],
  ['--accent', '--paper', 3, 'Акцент на фоне (крупный элемент)'],
  ['--paper', '--accent', 4.5, 'Текст на акцентной кнопке'],
  ['--over', '--surface-1', 4.5, 'Превышение нормы на карточке'],
  ['--good', '--surface-1', 4.5, 'Цель достигнута на карточке'],
  // Разделители декоративны: требований WCAG к ним нет, порог здесь
  // нужен лишь чтобы линия не сливалась с фоном полностью.
  ['--hairline', '--paper', 1.1, 'Разделитель на фоне (декоративный)'],
];

function parseThemes(css) {
  const themes = { light: {}, dark: {} };
  // Светлая — первый блок :root, тёмная — блок [data-theme='dark'].
  const light = /:root,\s*:root\[data-theme='light'\]\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
  const dark = /:root\[data-theme='dark'\]\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';

  for (const [block, key] of [
    [light, 'light'],
    [dark, 'dark'],
  ]) {
    for (const m of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      themes[key][m[1]] = m[2];
    }
  }
  // Тёмная тема наследует то, что в ней не переопределено.
  themes.dark = { ...themes.light, ...themes.dark };
  const tintLight = /:root\[data-profile-tint='b'\]\s*\{[\s\S]*?--accent:\s*(#[0-9a-fA-F]{6})/.exec(
    css,
  )?.[1];
  const tintDark =
    /:root\[data-theme='dark'\]\[data-profile-tint='b'\]\s*\{[\s\S]*?--accent:\s*(#[0-9a-fA-F]{6})/.exec(
      css,
    )?.[1];
  if (!tintLight || !tintDark) throw new Error('Missing profile B accent tokens');
  themes['light-profile-b'] = { ...themes.light, '--accent': tintLight };
  themes['dark-profile-b'] = { ...themes.dark, '--accent': tintDark };
  return themes;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function run() {
  const css = await readFile(resolve(root, 'src/design-system/tokens.css'), 'utf8');
  const themes = parseThemes(css);
  const hud = await readFile(resolve(root, 'src/design-system/cyberpunk.css'), 'utf8');
  const valueOf = (name) => hud.match(new RegExp(`${name}:\\s*([^;]*#)[^;]*;`))?.[0] ?? '';
  const hex = (value) => value.match(/#[\da-f]{6}/gi) ?? [];
  const alternatives = (name, theme) =>
    [...valueOf(name).matchAll(/light-dark\((#[\da-f]{6}),\s*(#[\da-f]{6})\)/gi)]
      .map((match) => match[theme === 'light' ? 1 : 2]);

  const rows = [];
  let failures = 0;
  const addRow = (theme, what, pair, foreground, background, min) => {
    if (!foreground || !background) throw new Error(`Missing contrast color: ${theme} ${pair}`);
    const value = ratio(foreground, background);
    const ok = value >= min;
    if (!ok) failures++;
    rows.push({ theme, what, pair, value: value.toFixed(2), min: min.toFixed(1), ok });
  };

  for (const theme of Object.keys(themes)) {
    for (const [fg, bg, min, what] of PAIRS) {
      const fgHex = themes[theme][fg];
      const bgHex = themes[theme][bg];
      if (!fgHex || !bgHex) throw new Error(`Missing contrast token: ${theme} ${fg} ${bg}`);
      addRow(theme, what, `${fg} на ${bg}`, fgHex, bgHex, min);
    }
  }
  for (const theme of ['light', 'dark']) {
    const backgrounds = ['--hud-shell', '--hud-panel', '--hud-deep']
      .flatMap((token) => alternatives(token, theme));
    if (backgrounds.length !== 7) throw new Error(`Missing HUD surfaces: ${theme}`);
    for (const token of ['--ink', '--muted', '--hud-signal', '--over', '--good']) {
      const foreground = alternatives(token, theme)[0] ?? themes[theme][token];
      for (const background of backgrounds) {
        addRow(theme, 'HUD surface', `${token} / ${background}`, foreground, background, 4.5);
      }
    }
  }
  const stops = hex(valueOf('--hud-yellow'));
  if (stops.length !== 2) throw new Error('Missing HUD button gradient');
  for (const background of stops) {
    addRow('HUD', 'Selected control', `--hud-yellow-ink / ${background}`,
      hex(valueOf('--hud-yellow-ink'))[0], background, 4.5);
  }

  const table = [
    '| Тема | Пара | Что это | Коэффициент | Минимум | Результат |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.theme} | \`${r.pair}\` | ${r.what} | ${r.value}:1 | ${r.min}:1 | ${r.ok ? 'проходит' : '**НЕ ПРОХОДИТ**'} |`,
    ),
  ].join('\n');

  process.stdout.write(`${table}\n\n`);
  process.stdout.write(
    failures === 0 ? 'Все пары проходят порог.\n' : `Пар ниже порога: ${failures}\n`,
  );

  // Вставляем таблицу в AUDIT.md
  const auditPath = resolve(root, 'AUDIT.md');
  const audit = await readFile(auditPath, 'utf8');
  const marker = '<!-- CONTRAST_TABLE -->';
  if (audit.includes(marker)) {
    const summary =
      failures === 0
        ? '\n\nВсе проверенные пары проходят порог.'
        : `\n\n**Пар ниже порога: ${failures}.** Требуется правка палитры.`;
    await writeFile(auditPath, audit.replace(marker, table + summary));
    process.stdout.write('Таблица записана в AUDIT.md\n');
  }

  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
