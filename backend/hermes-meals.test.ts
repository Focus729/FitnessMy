import { expect, test } from 'vitest';
import { hermesBridge, hermesMeals } from './hermes-meals';
import { testDatabase } from './test-database';

test('bridge claims only its own profile and publishes only the newest leased snapshot', async () => {
  const { db, sql } = testDatabase();
  const origin = 'https://fitnessmy.test';
  const path = '/api/profiles/p/hermes-meals';
  const owner = (account: string, suffix: string, method = 'GET', body?: unknown) =>
    hermesMeals(new Request(origin + path + suffix, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), db, account, 'p', origin);
  const bridge = (key: string, route: 'claim' | 'complete', body = {}) =>
    hermesBridge(new Request(`${origin}/api/hermes/${route}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), db);
  const current = 'a'.repeat(64);
  const newer = 'b'.repeat(64);
  const query = (snapshot: string) => `?purpose=plan&snapshot=${snapshot}`;
  try {
    const { token } = await (await owner('a', '/pair', 'POST')).json();
    const { token: other } = await (await owner('b', '/pair', 'POST')).json();
    await owner('a', query(current), 'POST', { prompt: 'Old snapshot' });
    expect(await (await bridge(other, 'claim')).json()).toEqual({ job: null });
    const { job } = await (await bridge(token, 'claim')).json();
    expect(job.payload).toBe('Old snapshot');
    expect(await (await bridge(token, 'claim')).json()).toEqual({ job: null });
    await owner('a', query(newer), 'POST', { prompt: 'New snapshot' });
    await expect(bridge(token, 'complete', { ...job, result: '[0]' })).rejects.toMatchObject({ status: 409 });
    const { job: newJob } = await (await bridge(token, 'claim')).json();
    expect(newJob.payload).toBe('New snapshot');
    await bridge(token, 'complete', { ...newJob, result: '[1]' });
    await expect(bridge(token, 'complete', { ...newJob, result: '[1]' })).rejects.toMatchObject({ status: 409 });
    expect(await (await owner('a', query(newer))).json()).toEqual({ status: 'ready', result: '[1]' });
    expect(await (await owner('b', query(newer))).json()).toEqual({ status: 'missing' });
    await owner('a', '/pair', 'DELETE');
    await expect(bridge(token, 'claim')).rejects.toMatchObject({ status: 401 });
    expect(await (await owner('a', query(newer))).json()).toEqual({ status: 'missing' });
  } finally {
    sql.close();
  }
});
