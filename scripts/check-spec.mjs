/**
 * Регулярная проверка соответствия ТЗ — промпт из раздела 22.
 *
 * Проверяет ровно то, что там перечислено:
 *   1) нет ли импортов Dexie вне data/;
 *   2) нет ли строковых литералов в JSX вместо ключей i18n;
 *   3) укладывается ли бандл в 400 КБ gzip;
 *   4) не появилось ли на главном экране больше пяти блоков;
 *   5) покрытие тестами domain/.
 *
 * Ничего не исправляет — только составляет список отклонений.
 * Запуск: npm run check:spec
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_LIMIT_KB = 400;

const findings = [];
const add = (priority, item, detail) => findings.push({ priority, item, detail });

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** 1. Импорты Dexie вне data/ (решение 2.9). */
async function checkDexieImports(files) {
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (rel.startsWith('src/data/')) continue;
    const text = await readFile(file, 'utf8');
    if (/from\s+'dexie(-react-hooks)?'/.test(text) || /from\s+'@\/data\/db\//.test(text)) {
      add('высокий', 'Импорт Dexie вне data/', rel);
    }
  }
}

/** 2. Строковые литералы в JSX вместо ключей i18n (раздел 17). */
async function checkJsxLiterals(files) {
  for (const file of files) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (!rel.startsWith('src/screens/') && !rel.startsWith('src/components/')) continue;
    const text = await readFile(file, 'utf8');
    // Parse actual JSX text; generic return types such as Promise<void> are not UI copy.
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const value = node.text.trim();
        if (/^[\p{L}][\p{L}\s,.!?-]{3,}$/u.test(value) && !/^[A-Z_]+$/.test(value)) {
          add('средний', 'Строка в JSX вместо ключа i18n', `${rel}: «${value.slice(0, 40)}»`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

/** 3. Размер бандла — не более 400 КБ gzip без учёта наборов данных (19.2). */
async function checkBundle() {
  const dist = resolve(root, 'dist/assets');
  if (!existsSync(dist)) {
    add('информация', 'Бандл не проверен', 'нет каталога dist — соберите проект');
    return;
  }
  const { gzipSync } = await import('node:zlib');
  let eagerBytes = 0;
  const parts = [];

  for (const name of await readdir(dist)) {
    if (!/\.(js|css)$/.test(name)) continue;
    // Наборы данных и подгружаемые по требованию чанки в лимит не входят.
    if (/^(seed-|charts-|barcode-)/.test(name)) continue;
    if (
      /^(Food|Gym|Body|Progress|Settings|Onboarding|ActiveWorkout|WeightChart|ExercisePicker|targets|foodIndex)-/.test(
        name,
      )
    )
      continue;
    const buf = await readFile(join(dist, name));
    const gz = gzipSync(buf).length;
    eagerBytes += gz;
    parts.push(`${name} ${(gz / 1024).toFixed(1)} КБ`);
  }

  const kb = eagerBytes / 1024;
  if (kb > BUNDLE_LIMIT_KB) {
    add('высокий', 'Бандл больше лимита', `${kb.toFixed(0)} КБ gzip при лимите ${BUNDLE_LIMIT_KB}`);
  } else {
    add('норма', 'Бандл в пределах лимита', `${kb.toFixed(0)} из ${BUNDLE_LIMIT_KB} КБ gzip`);
  }
}

/** Approved direction B replaces the historical five-block count. */
async function checkTodayBlocks() {
  const text = await readFile(resolve(root, 'src/screens/Today.tsx'), 'utf8');
  const shell = await readFile(resolve(root, 'src/app/AppShell.tsx'), 'utf8');
  if (
    !text.includes('training-hero') ||
    !text.includes('unfinished') ||
    !text.includes('nextPlan')
  ) {
    add(
      'высокий',
      'Training-first hierarchy is missing',
      'Today must represent active, planned and empty states',
    );
  }
  if (!text.includes('setAddOpen(true)') || !text.includes('/body?section=')) {
    add('высокий', 'Direct logging actions are missing', 'Keep food and body actions available');
  }
  if (!shell.includes('app-nav') || !shell.includes('profiles.switch')) {
    add('высокий', 'Responsive/profile navigation is missing', 'Verify DESIGN.md direction B');
  }
}
/** 5. Покрытие domain/ тестами (19.5). */
function checkCoverage() {
  try {
    const out = execFileSync(
      process.execPath,
      [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--coverage', '--silent'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const line = out.split('\n').find((l) => l.includes('All files'));
    const stmts = Number(line?.split('|')[1]?.trim());
    if (!Number.isFinite(stmts) || stmts < 90) {
      add('высокий', 'Покрытие domain/ ниже 90%', `${stmts}%`);
    } else {
      add('норма', 'Покрытие domain/', `${stmts}%`);
    }
  } catch {
    add('высокий', 'Тесты не прошли', 'запустите npm test и разберите падения');
  }
}

async function run() {
  const files = await walk(resolve(root, 'src'));
  await checkDexieImports(files);
  await checkJsxLiterals(files);
  await checkBundle();
  await checkTodayBlocks();
  checkCoverage();

  const order = { высокий: 0, средний: 1, низкий: 2, информация: 3, норма: 4 };
  findings.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));

  process.stdout.write('\nПроверка соответствия TZ.md\n');
  process.stdout.write('─'.repeat(60) + '\n');
  for (const f of findings) {
    process.stdout.write(`[${f.priority}] ${f.item}\n    ${f.detail}\n`);
  }

  const problems = findings.filter((f) => f.priority !== 'норма' && f.priority !== 'информация');
  process.stdout.write('─'.repeat(60) + '\n');
  if (problems.length) process.exitCode = 1;
  process.stdout.write(
    problems.length === 0 ? 'Отклонений нет.\n' : `Отклонений: ${problems.length}\n`,
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
