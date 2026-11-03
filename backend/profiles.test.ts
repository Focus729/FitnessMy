import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync as SQLite, SQLInputValue } from 'node:sqlite';
import type { Database, SqlStatement } from './db';
import { profilesApi } from './profiles';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
let sql: SQLite;
let db: Database;
const origin = 'https://fixture.example';
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0001_identity.sql', '0002_profiles.sql'])
    sql.exec(
      readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'),
    );
  sql.exec("INSERT INTO accounts VALUES ('a','1',0),('b','2',0)");
  const prepare = (query: string, values: unknown[] = []): SqlStatement => ({
    bind: (...next) => prepare(query, next),
    first: async <T>() =>
      (sql.prepare(query).get(...(values as SQLInputValue[])) ??
        null) as T | null,
    all: async <T>() => ({
      success: true,
      results: sql.prepare(query).all(...(values as SQLInputValue[])) as T[],
      meta: { changes: 0 },
    }),
    run: async () => ({
      success: true,
      results: [],
      meta: {
        changes: Number(
          sql.prepare(query).run(...(values as SQLInputValue[])).changes,
        ),
      },
    }),
  });
  db = {
    prepare,
    batch: async (statements) => Promise.all(statements.map((s) => s.run())),
  };
});
afterEach(() => sql.close());
const request = (
  id: string,
  name = 'My profile',
  revision = 0,
  from = origin,
) =>
  new Request(`${origin}/api/profiles/${id}`, {
    method: 'PUT',
    headers: { Origin: from, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tint: 'a', expectedRevision: revision }),
  });
const run = (req: Request, owner = 'a') => profilesApi(req, db, owner, origin);
describe('owned cloud profiles', () => {
  it('creates once across retries and never merges by name', async () => {
    await run(request('one'));
    await run(request('one'));
    await run(request('two'));
    const response = await run(new Request(`${origin}/api/profiles`));
    expect(
      ((await response.json()) as { profiles: unknown[] }).profiles,
    ).toHaveLength(2);
    expect(
      sql.prepare('SELECT revision FROM profiles WHERE id=?').get('one')
        ?.revision,
    ).toBe(1);
  });
  it('isolates identical profile IDs in separate accounts', async () => {
    await run(request('same', 'Private A'));
    await expect(
      run(new Request(`${origin}/api/profiles/same`), 'b'),
    ).rejects.toMatchObject({ status: 404 });
    await run(request('same', 'Private B'), 'b');
    expect(
      sql.prepare('SELECT name FROM profiles WHERE account_id=?').get('a')
        ?.name,
    ).toBe('Private A');
    expect(
      await (await run(new Request(`${origin}/api/profiles`), 'b')).text(),
    ).not.toContain('Private A');
  });
  it('retains current version on stale writes and accepts an identical retry', async () => {
    await run(request('one'));
    expect((await run(request('one', 'New', 1))).status).toBe(200);
    expect((await run(request('one', 'New', 1))).status).toBe(200);
    expect((await run(request('one', 'Stale', 1))).status).toBe(409);
    expect(
      sql.prepare('SELECT name,revision FROM profiles').get(),
    ).toMatchObject({ name: 'New', revision: 2 });
  });
  it('rejects cross-site writes before parsing or changing data', async () => {
    await expect(
      run(request('one', 'X', 0, 'https://foreign.example')),
    ).rejects.toMatchObject({ status: 403 });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM profiles').get()?.n).toBe(0);
  });
  it('rejects over-limit bodies without trusting Content-Length', async () => {
    await expect(run(request('one', 'x'.repeat(5000)))).rejects.toMatchObject({
      status: 413,
    });
  });
  it('rejects injected owner fields and malformed JSON', async () => {
    for (const body of [
      '{',
      JSON.stringify({
        name: 'X',
        tint: 'a',
        expectedRevision: 0,
        accountId: 'b',
      }),
    ]) {
      await expect(
        run(
          new Request(`${origin}/api/profiles/one`, {
            method: 'PUT',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            body,
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
  it('bounds profile count while allowing retries at the limit', async () => {
    for (let i = 0; i < 100; i++) await run(request(`p${i}`));
    await expect(run(request('extra'))).rejects.toMatchObject({
      code: 'profile_limit',
    });
    expect((await run(request('p0'))).status).toBe(200);
  });
});
