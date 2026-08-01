/**
 * Изображения упражнений для полного офлайна — раздел 7.2.
 *
 * По умолчанию картинки в репозиторий не кладутся: их 1746 штук и это
 * примерно 20 МБ даже после сжатия. Приложение показывает их из сети и
 * кэширует стратегией cache-first, поэтому после первого открытия упражнение
 * работает офлайн.
 *
 * Если нужен полный офлайн с первого запуска — выполните этот скрипт.
 * Он скачает все изображения в public/exercise-images, откуда их подхватит
 * precache Service Worker.
 *
 * Запуск: npm run seed:images
 * Конвертация в WebP: если в системе есть cwebp, скрипт им воспользуется.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/exercise-images');
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const CONCURRENCY = 16;

async function hasCwebp() {
  try {
    await run('cwebp', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchOne(relPath, webp) {
  const target = join(outDir, webp ? relPath.replace(/\.jpg$/i, '.webp') : relPath);
  if (await exists(target)) return 'skip';

  const res = await fetch(`${BASE}/${relPath}`);
  if (!res.ok) return 'fail';
  const buf = Buffer.from(await res.arrayBuffer());

  await mkdir(dirname(target), { recursive: true });

  if (!webp) {
    await writeFile(target, buf);
    return 'ok';
  }

  const tmp = `${target}.jpg`;
  await writeFile(tmp, buf);
  // 640 px по ширине — этого достаточно для понимания техники (7.2).
  await run('cwebp', ['-quiet', '-q', '78', '-resize', '640', '0', tmp, '-o', target]);
  await run('rm', ['-f', tmp]);
  return 'ok';
}

async function main() {
  const { default: exercises } = await import('../src/data/seed/exercises.json', {
    with: { type: 'json' },
  });

  const webp = await hasCwebp();
  process.stdout.write(webp ? 'cwebp найден: конвертирую в WebP\n' : 'cwebp не найден: сохраняю JPG\n');

  const all = exercises.flatMap((e) => e.imageIds ?? []);
  process.stdout.write(`Изображений к загрузке: ${all.length}\n`);

  let done = 0;
  let failed = 0;
  const queue = [...all];

  const worker = async () => {
    for (;;) {
      const item = queue.pop();
      if (!item) return;
      try {
        const result = await fetchOne(item, webp);
        if (result === 'fail') failed++;
      } catch {
        failed++;
      }
      if (++done % 100 === 0) process.stdout.write(`  ${done}/${all.length}\n`);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write(`Готово. Загружено ${done - failed}, ошибок ${failed}\n`);
  process.stdout.write('Не забудьте пересобрать приложение: npm run build\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
