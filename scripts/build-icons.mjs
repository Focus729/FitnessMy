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

const INK = [20, 23, 28];
const PAPER = [245, 246, 248];
const ACCENT = [43, 63, 240];

/** Точки на ленте: доля ширины и радиус в долях размера. */
const MARKS = [
  { x: 0.3, r: 0.055 },
  { x: 0.45, r: 0.085 },
  { x: 0.62, r: 0.07 },
  { x: 0.78, r: 0.045 },
];

function renderIcon(size, maskable) {
  // Маскируемая иконка держит содержимое в безопасной зоне 80%.
  const inset = maskable ? size * 0.1 : 0;
  const inner = size - inset * 2;
  const pixels = new Uint8Array(size * size * 3);

  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
  };

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, PAPER);

  // Ось суток
  const axisY = Math.round(size / 2);
  const axisFrom = Math.round(inset + inner * 0.12);
  const axisTo = Math.round(inset + inner * 0.88);
  const axisThickness = Math.max(1, Math.round(size * 0.012));
  for (let t = 0; t < axisThickness; t++) {
    for (let x = axisFrom; x <= axisTo; x++) put(x, axisY + t, INK);
  }

  // Заливка окна питания — акцентом
  const windowFrom = Math.round(inset + inner * 0.28);
  const windowTo = Math.round(inset + inner * 0.8);
  const windowH = Math.max(2, Math.round(size * 0.03));
  for (let y = axisY - windowH; y < axisY; y++) {
    for (let x = windowFrom; x <= windowTo; x++) put(x, y, ACCENT);
  }

  // Отметки приёмов пищи
  for (const mark of MARKS) {
    const cx = inset + inner * mark.x;
    const cy = axisY;
    const r = size * mark.r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, INK);
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

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#F5F6F8"/>
  <rect x="18" y="28" width="34" height="3" rx="1" fill="#2B3FF0" opacity="0.45"/>
  <rect x="8" y="32" width="48" height="1.5" fill="#14171C"/>
  <circle cx="20" cy="32" r="3" fill="#14171C"/>
  <circle cx="30" cy="32" r="5" fill="#14171C"/>
  <circle cx="42" cy="32" r="4" fill="#14171C"/>
  <circle cx="52" cy="32" r="2.5" fill="#14171C"/>
</svg>
`;

async function run() {
  await mkdir(outDir, { recursive: true });
  const variants = [
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
