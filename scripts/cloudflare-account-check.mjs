// Read-only preflight using Wrangler's existing OAuth session. Never print credentials.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId || !/^[a-f0-9]{32}$/.test(accountId)) throw new Error('Set CLOUDFLARE_ACCOUNT_ID');
const token = process.env.CLOUDFLARE_API_TOKEN ??
  (await readFile(join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'), 'utf8'))
    .match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error('Wrangler authorization is unavailable');

for (const path of ['subscriptions', 'workers/subdomain', 'access/apps']) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  let result;
  if (data.success && path === 'subscriptions') result = data.result.map((s) => ({
    product: s.rate_plan?.public_name ?? s.rate_plan?.id, price: s.price, currency: s.currency,
  }));
  if (data.success && path === 'workers/subdomain') result = { subdomain: data.result.subdomain };
  if (data.success && path === 'access/apps') result = data.result.map((a) => ({ name: a.name, domain: a.domain, type: a.type }));
  console.log(JSON.stringify({ resource: path, status: response.status, success: data.success,
    result, errorCodes: data.errors?.map((e) => e.code) }));
}
