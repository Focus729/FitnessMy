/**
 * Раздел 18.3: обе гарнитуры подключаются локально (woff2 в бандле),
 * а не с внешнего CDN — это требование офлайна и приватности (19.4).
 *
 * Скрипт разовый: скачивает нужные начертания с fonts.gstatic.com
 * (кириллица + латиница) и кладёт их в public/fonts.
 *
 * Запуск: npm run fonts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/fonts');

// Только те начертания, что реально используются (18.3).
const FAMILIES = [
  { css: 'Manrope:wght@400;600;700', prefix: 'manrope' },
  { css: 'IBM+Plex+Mono:wght@400;500', prefix: 'plex-mono' },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function run() {
  await mkdir(outDir, { recursive: true });
  const faces = [];

  for (const family of FAMILIES) {
    const url = `https://fonts.googleapis.com/css2?family=${family.css}&display=swap`;
    const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

    // Google Fonts ставит имя подмножества комментарием ПЕРЕД блоком @font-face.
    const pairs = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)];
    let i = 0;
    for (const [, subset, block] of pairs) {
      if (!['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'].includes(subset)) continue;

      const src = /src:\s*url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
      const weight = /font-weight:\s*(\d+)/.exec(block)?.[1] ?? '400';
      const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
      if (!src) continue;

      const file = `${family.prefix}-${weight}-${subset}-${i++}.woff2`;
      const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
      await writeFile(resolve(outDir, file), buf);
      faces.push({
        family: family.prefix === 'manrope' ? 'Manrope' : 'IBM Plex Mono',
        weight,
        file,
        range,
      });
      process.stdout.write(`  ${file} — ${(buf.length / 1024).toFixed(1)} КБ\n`);
    }
  }

  const css = faces
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${f.file}') format('woff2');
  unicode-range: ${f.range};
}`,
    )
    .join('\n\n');

  await writeFile(
    resolve(root, 'src/design-system/fonts.css'),
    `/* Сгенерировано scripts/fetch-fonts.mjs. Не редактировать вручную. */\n\n${css}\n`,
  );
  process.stdout.write(`\nГотово: ${faces.length} начертаний\n`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
