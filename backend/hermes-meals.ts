import type { Database } from "./db";
import { hashToken } from "./github-auth";
import { HttpError, json, sameOrigin } from "./http";
import { readJson } from "./profiles";

const owner = "account_id=? AND profile_id=?";
const ttl = 300;
const tokenPattern = /^[a-zA-Z0-9-]{36,80}$/;
const snapshotPattern = /^[0-9a-f]{64}$/;

export async function hermesMeals(
  request: Request,
  db: Database,
  accountId: string,
  profileId: string,
  origin: string,
) {
  const profile = await db
    .prepare(`SELECT 1 FROM profiles WHERE account_id=? AND id=?`)
    .bind(accountId, profileId)
    .first();
  if (!profile) throw new HttpError(404, "not_found");
  const url = new URL(request.url);
  const key = [accountId, profileId];
  if (url.pathname.endsWith("/pair")) {
    if (request.method === "GET") {
      const bridge = await db
        .prepare(`SELECT 1 FROM hermes_meal_bridges WHERE ${owner}`)
        .bind(...key)
        .first();
      return json({ paired: !!bridge });
    }
    sameOrigin(request, origin);
    if (request.method === "DELETE") {
      await db
        .prepare(`DELETE FROM hermes_meal_bridges WHERE ${owner}`)
        .bind(...key)
        .run();
      return json({ paired: false });
    }
    if (request.method !== "POST")
      throw new HttpError(405, "method_not_allowed");
    const token = crypto.randomUUID() + crypto.randomUUID();
    await db.batch([
      db.prepare(`DELETE FROM hermes_meal_bridges WHERE ${owner}`).bind(...key),
      db
        .prepare("INSERT INTO hermes_meal_bridges VALUES (?,?,?)")
        .bind(...key, await hashToken(token)),
    ]);
    return json({ paired: true, token });
  }

  const purpose = url.searchParams.get("purpose");
  const snapshot = url.searchParams.get("snapshot") ?? "";
  if (
    (purpose !== "plan" && purpose !== "review") ||
    !snapshotPattern.test(snapshot)
  )
    throw new HttpError(400, "invalid_job");
  const now = Math.floor(Date.now() / 1000);
  if (request.method === "POST") {
    sameOrigin(request, origin);
    const payload = await readJson(request, 10_240);
    if (
      typeof payload.prompt !== "string" ||
      payload.prompt.length > 7000 ||
      !payload.prompt.trim()
    )
      throw new HttpError(400, "invalid_job");
    const match = await db
      .prepare(
        `INSERT INTO hermes_meal_jobs
      (account_id,profile_id,purpose,snapshot,payload,expires_at)
      SELECT account_id,profile_id,?,?,?,? FROM hermes_meal_bridges WHERE ${owner}
      ON CONFLICT(account_id,profile_id,purpose) DO UPDATE SET snapshot=excluded.snapshot,
        payload=excluded.payload,result=NULL,lease=NULL,lease_until=0,attempts=0,expires_at=excluded.expires_at
      WHERE hermes_meal_jobs.snapshot<>excluded.snapshot OR hermes_meal_jobs.expires_at<=?
      RETURNING snapshot`,
      )
      .bind(purpose, snapshot, payload.prompt, now + ttl, ...key, now)
      .first();
    if (match) return json({ status: "pending" }, 202);
  } else if (request.method !== "GET") {
    throw new HttpError(405, "method_not_allowed");
  }
  const job = await db
    .prepare(
      `SELECT result FROM hermes_meal_jobs WHERE ${owner}
    AND purpose=? AND snapshot=? AND expires_at>?`,
    )
    .bind(...key, purpose, snapshot, now)
    .first<{ result: string | null }>();
  return json(
    job
      ? {
          status: job.result === null ? "pending" : "ready",
          result: job.result,
        }
      : { status: "missing" },
  );
}

export async function hermesBridge(request: Request, db: Database) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const token =
    request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!tokenPattern.test(token)) throw new HttpError(401, "unauthorized");
  const hash = await hashToken(token);
  const bridge = await db
    .prepare("SELECT 1 FROM hermes_meal_bridges WHERE token_hash=?")
    .bind(hash)
    .first();
  if (!bridge) throw new HttpError(401, "unauthorized");
  const now = Math.floor(Date.now() / 1000);
  const path = new URL(request.url).pathname;
  const owned = `(account_id,profile_id) IN (SELECT account_id,profile_id FROM hermes_meal_bridges WHERE token_hash=?)`;
  if (path.endsWith("/claim")) {
    const lease = crypto.randomUUID();
    const job = await db
      .prepare(
        `UPDATE hermes_meal_jobs SET lease=?,lease_until=?,attempts=attempts+1
      WHERE ${owned} AND purpose=(SELECT purpose FROM hermes_meal_jobs WHERE ${owned}
        AND payload IS NOT NULL AND expires_at>? AND lease_until<=? AND attempts<2
        ORDER BY expires_at DESC,purpose LIMIT 1)
      AND payload IS NOT NULL AND expires_at>? AND lease_until<=? AND attempts<2
      AND NOT EXISTS (SELECT 1 FROM hermes_meal_jobs WHERE ${owned} AND lease_until>? AND lease IS NOT NULL)
      RETURNING purpose,snapshot,payload,lease`,
      )
      .bind(lease, now + 90, hash, hash, now, now, now, now, hash, now)
      .first();
    return json({ job });
  }
  const { purpose, snapshot, lease, result } = await readJson(request, 8192);
  if (
    (purpose !== "plan" && purpose !== "review") ||
    typeof snapshot !== "string" ||
    !snapshotPattern.test(snapshot) ||
    typeof lease !== "string" ||
    !tokenPattern.test(lease) ||
    typeof result !== "string" ||
    result.length > 2400 ||
    !result.trim()
  )
    throw new HttpError(400, "invalid_result");
  const updated = await db
    .prepare(
      `UPDATE hermes_meal_jobs SET result=?,payload=NULL,lease=NULL
    WHERE ${owned} AND purpose=? AND snapshot=? AND lease=? AND lease_until>? AND expires_at>?
    RETURNING snapshot`,
    )
    .bind(result, hash, purpose, snapshot, lease, now, now)
    .first();
  if (!updated) throw new HttpError(409, "stale_job");
  return json({ accepted: true });
}
