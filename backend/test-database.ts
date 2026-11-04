import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { SQLInputValue } from 'node:sqlite';
import type { Database, SqlStatement } from './db';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
/** SQLite fixture adapter with real rollback; never imported by Worker runtime. */
export function testDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of [
    '0001_identity.sql',
    '0002_profiles.sql',
    '0003_sync.sql',
    '0004_attachments.sql',
    '0005_sync_budget.sql',
    '0006_attachment_restart.sql',
    '0007_sync_rate_limits.sql',
  ])
    sql.exec(
      readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'),
    );
  sql.exec("INSERT INTO accounts VALUES ('a','1',0),('b','2',0)");
  sql.exec(
    "INSERT INTO profiles VALUES ('a','p','Fixture','a',1,0,0),('b','p','Other','a',1,0,0)",
  );
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
  const db: Database = {
    prepare,
    batch: async (statements) => {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sql, db };
}
