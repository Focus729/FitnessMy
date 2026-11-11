/**
 * Иконки приложения — раздел 19.1 (установка на домашний экран).
 *
 * Рисуем их кодом, а не тащим бинарные ассеты: знак приложения — это лента дня
 * из раздела 18.4, сведённая к одному штриху. Отдельная зависимость для
 * генерации PNG не нужна — пишем файл вручную (PNG без сжатия).
 *
 * Запуск: node scripts/build-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');

const BACKGROUND = [43, 63, 240];
const WHITE = [255, 255, 255];

// Match the Today icon: a rounded horizontal line and one ring at its centre.
const HALF_LINE = 9;
const RING_RADIUS = 3;
const HALF_STROKE = 1.1;

function renderIcon(size, maskable) {
  // The adaptive mark fits in the central circle with a radius of 40%.
  const scale = (size / 24) * (maskable ? 0.8 : 1);
  const pixels = new Uint8Array(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - size / 2) / scale;
      const dy = (y + 0.5 - size / 2) / scale;
      const line = Math.hypot(Math.max(0, Math.abs(dx) - HALF_LINE), dy);
      const ring = Math.abs(Math.hypot(dx, dy) - RING_RADIUS);
      const distance = Math.min(line, ring) - HALF_STROKE;
      const coverage = Math.max(0, Math.min(1, 0.5 - distance * scale));
      const offset = (y * size + x) * 3;

      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(
          BACKGROUND[channel] * (1 - coverage) + WHITE[channel] * coverage,
        );
      }
    }
  }

  return pixels;
}

function png(size, pixels) {
  // Каждая строка предваряется байтом фильтра 0.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.subarray(y * size * 3, (y + 1) * size * 3)).copy(raw, rowStart + 1);
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // глубина
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="5" fill="#2B3FF0"/>
  <path d="M3 12h18M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
</svg>
`;

async function run() {
  await mkdir(outDir, { recursive: true });
  const variants = [
    { size: 180, maskable: false, file: 'apple-touch-icon.png' },
    { size: 192, maskable: false, file: 'icon-192.png' },
    { size: 512, maskable: false, file: 'icon-512.png' },
    { size: 512, maskable: true, file: 'icon-512-maskable.png' },
  ];
  for (const v of variants) {
    const buf = png(v.size, renderIcon(v.size, v.maskable));
    await writeFile(resolve(outDir, v.file), buf);
    process.stdout.write(`  ${v.file} — ${(buf.length / 1024).toFixed(1)} КБ\n`);
  }
  await writeFile(resolve(root, 'public/favicon.svg'), FAVICON);
  process.stdout.write('  favicon.svg\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
