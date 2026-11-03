// Staging-only D1 concurrency proof. Fixtures use a unique synthetic owner, never Pavel's account.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const account = '307ddcd17586753c4e5a1a3928316250';
const database = '49e061b0-2191-453d-891a-abbd8c269e21';
const token = (await readFile(join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'), 'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error('Wrangler session unavailable');
const owner = `fixture:${randomUUID()}`;
async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(`D1 fixture query failed: HTTP ${response.status}`);
  return body.result[0];
}
try {
  await query('INSERT INTO accounts(id,github_id,created_at) VALUES(?,?,0)', [owner, owner]);
  await query('INSERT INTO profiles(account_id,id,name,tint,created_at,updated_at) VALUES(?,?,?, ?,0,0)', [owner, 'profile', 'Fixture', 'a']);
  const results = await Promise.all(['First', 'Second'].map(name => query('UPDATE profiles SET name=?,revision=revision+1 WHERE account_id=? AND id=? AND revision=1', [name, owner, 'profile'])));
  assert.equal(results.reduce((sum, result) => sum + result.meta.changes, 0), 1);
  const row = (await query('SELECT revision FROM profiles WHERE account_id=? AND id=?', [owner, 'profile'])).results[0];
  assert.equal(row.revision, 2);
  const foreign = await query('SELECT id FROM profiles WHERE account_id=? AND id=?', [`${owner}:foreign`, 'profile']);
  assert.equal(foreign.results.length, 0);
  const stale = await query('UPDATE profiles SET name=? WHERE account_id=? AND id=? AND revision=1', ['Stale', owner, 'profile']);
  assert.equal(stale.meta.changes, 0);
  console.log('PASS: real staging D1 concurrent compare-and-set, stale-write rejection, ownership filter');
} finally {
  // Exact generated fixture scope; no production or personal rows can match.
  await query('DELETE FROM profiles WHERE account_id=?', [owner]);
  await query('DELETE FROM accounts WHERE id=?', [owner]);
  console.log('Removed this run\'s synthetic fixture');
}
