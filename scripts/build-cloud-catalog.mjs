// Keep server reference IDs small; the full built-in catalogs remain application assets.
import { readFile, writeFile } from 'node:fs/promises';
const read = async (name) => JSON.parse(await readFile(new URL(`../src/data/seed/${name}.json`, import.meta.url), 'utf8'));
const catalog = {};
for (const name of ['foods', 'exercises']) catalog[name] = (await read(name)).map((row) => row.id).sort();
await writeFile(new URL('../backend/catalog-ids.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
