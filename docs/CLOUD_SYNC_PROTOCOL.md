# Cloud synchronization protocol foundation

Status: internal implementation, 2026-11-04. No sync HTTP route or automatic upload is enabled. Existing staging UI remains the account/profile prototype. The full approved migration scope remains in CLOUDFLARE_MIGRATION_PLAN.md.

## Implemented contract

- Shared schema in `src/data/cloud/schema.ts`: 23 ordinary record types plus a strict cloud settings subset. Unknown fields fail at every modeled object boundary. Projection removes only explicitly classified local fields; it does not silently discard future fields. Each record is limited to 64 KiB of UTF-8 JSON.
- Device-local exclusions: profile PIN; entire settings AI/Drive blocks; locale, theme, rest timer preferences and onboarding. Projection returns an independent JSON copy so later UI edits cannot change queued content. Unsupported meta/blobs/gameState are rejected rather than uploaded generically.
- Batch version 1 has a stable batch ID, 1–20 mutations and a 256 KiB cap. Each mutation has its own stable operation ID, record type/ID, expected server revision and validated payload. Duplicate record/operation IDs inside a batch are rejected. Account identity is a trusted server argument, never a request field.
- Account/profile-scoped receipt records a canonical SHA-256 request digest. The same batch/content returns original change results even after subsequent edits. Reusing a batch ID with different content returns a conflict. An operation ID cannot appear in a second committed batch.
- The receipt, changes and latest entity states commit in one D1 batch. A SQL trigger checks each expected revision and updates the entity. Any failed guard rolls back the whole batch. A unique per-profile XP dedupe key prevents multiple records awarding the same event. Receipts and tombstones are retained; no compaction is enabled.
- Deletes preserve full typed records with deletedAt. A stale edit or old backup cannot replace a tombstone without its current revision. Explicit undo creates a new revision. UI conflict storage/resolution remains to be implemented.
- Pull pages are scoped to owner/profile and fixed to a server watermark. Snapshots select the latest historical version of each entity at that watermark, including tombstones. Changes committed during snapshot pagination remain available after the watermark. Page results are bounded by record count and approximately 256 KiB of serialized changes. Cursors are persisted by the future client only together with applied rows.

The change sequence is global in this staging database and strictly ordered, while all queries and ownership constraints are profile-scoped. Gaps caused by other profiles are expected and must not be interpreted as missing records.

## References, attachments and storage budgets

Added on 2026-11-04; internal storage functions remain disconnected from HTTP/UI.

- Entity references resolve only inside the same owner/profile, the incoming atomic batch, or the generated built-in food/exercise ID manifest. Tombstoned parents remain available for historical references. Missing/foreign parents and unfinished attachments reject the batch before its receipt is created. The reference preflight relies on retained identities: physical deletion/compaction must not be added without revisiting the transaction guards.
- `scripts/build-cloud-catalog.mjs` generates `backend/catalog-ids.json`. A regression test compares it with the full asset catalogs, so catalog changes require regenerating the manifest. Catalog record override projection remains pending.
- Attachments preserve their original IDs/MIME/creation instants/length/SHA-256. Maximum file size is 16 MiB, split into 64 KiB base64 chunks. Manifest/chunk retries are idempotent; altered content for an existing ID is a conflict. Status lists uploaded chunk indexes for resume. Finalization requires every chunk and a matching whole-file hash. Reads and recipe references require finalization and matching ownership. Originals must remain local on any failure. An explicit restart clears only an unfinished upload at the expected upload revision; stale restart/finalization attempts cannot erase or publish newer chunks. Finalized files cannot be reset. The created_at column stores the original file creation instant, not upload time; do not use it for future upload-expiry cleanup. Garbage collection/cancel is not enabled.
- Attachment reservations include encoded bytes and overhead, capped globally at 128 MiB. Incomplete uploads retain their reservations. Sync records/change history/receipts have a separate 96 MiB logical budget, updated transactionally by SQL triggers with UTF-8 byte lengths and metadata allowances. Quota rejection rolls back all writes, while existing retry receipts remain usable. These conservative application budgets are not an exact measurement of physical D1 storage; operational usage monitoring and rate limits remain required.
- Migrations 0004_attachments.sql, 0005_sync_budget.sql and 0006_attachment_restart.sql are applied to staging only. No personal data was uploaded and no new paid service was enabled.

## Verification

`npm run test:backend`: 79 tests, including 29 shared-schema, 13 transactional storage, 9 attachment and 7 reference tests, passed on 2026-11-04. Backend types and affected lint passed; the earlier app type check remains recorded for the unchanged frontend. Existing application behavior is not yet connected to these new modules.

`npx vitest run --config vitest.d1.config.ts`: explicit remote test, excluded from normal unit runs. Uses the existing local Wrangler session without printing credentials, targets only the fixed fitnessmy-staging database, creates a random synthetic owner and removes only that owner's rows in finally. Passed real concurrent compare-and-set, batch rollback, stable retry receipt, owner denial, change pagination and snapshot/edit interleaving. Extended proof also passed out-of-order attachment resume, hash finalization, retry/readback, unfinished/foreign attachment denial, guarded restart/completed-file protection and recipe publication after finalization. Cleanup returned the logical storage counter to its initial value. Migrations 0003–0006 are additive and applied to staging; no personal records were inserted.

Rechecked official [D1 batch transaction semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [REST batch query input](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) on 2026-11-04. The integration test exercises the real D1 database through its administrative REST batch transport using the same SQL/storage functions. Worker-binding transport and authenticated HTTP integration still need verification after endpoint wiring.

## Required before HTTP activation

1. Connect guarded upload resume/restart to the client and inventory actual attachment sizes; keep any over-limit originals available for a reviewed migration decision. Finalized attachment cancellation/deletion remains disabled.
2. Add rate limits and physical storage/usage reporting. Logical application budgets do not constitute full operational quota monitoring.
3. Implement derived workout totals, complete XP/achievement/freeze merge behavior and catalog override projection. Strict rejection of gameState is temporary, not removal from the approved scope.
4. Wire authenticated bounded API routes with same-origin checks, consistent errors and no sensitive logging. Keep the storage primitives internal until the preceding gates pass.
5. Add atomic Dexie outbox/cursor/conflict persistence across repository mutations, undo, imports and reset; explicitly suppress seed/remote hydration enqueueing.
6. Implement profile linking, trusted-device and logout/pending-write flows, migration preview, both-device tests and personal cutover before retiring Pages.

## Local outbox foundation — 2026-11-04

IndexedDB schema v3 adds cloudState, cloudOutbox and cloudVersions, excluded from ordinary exports. Existing profiles remain unlinked. A DBCore middleware captures linked runtime mutations in the same native transaction as their records. Stable operation IDs, transaction grouping, per-record predecessor chains and original base revisions survive reopening. Repeated mutations within one transaction coalesce; physical deletion retains the previous payload (including Blob bytes). Queue-write failure aborts local changes.

Credential/preference projection runs before capture. Explicit hydration/seed suppression belongs to one native transaction only. Seed loading now commits both catalogs and its version marker atomically and rechecks initialization under the write lock. The transaction callback must remain async for Dexie to retain its promise scope; a non-async wrapper caused PrematureCommitError in both unit tests and native Chrome and was corrected.

This is local persistence only. No sender, acknowledgement, cursor/conflict application or profile-linking UI is enabled. Captured gameState is an internal snapshot, not an accepted wire payload. Native Chrome checks cover atomic record/Blob persistence across reload and concurrent catalog initialization without seed enqueueing. Run `npx playwright test --config playwright.storage.config.ts`; the isolated dev-server tests do not add fixture hooks to production assets.

## Sync request admission — 2026-11-04

Migration 0007 adds one bounded rate-counter row per authenticated account and operation class. Internal `consumeSyncRequest` uses one guarded UPSERT: 120 reads, 60 writes or 120 attachment operations per server-time minute. Different profiles share their account budget. Saturated requests do not increment the counter; the next window reuses the row. Time regression cannot reset a newer window. Admission is separate from mutation transactions so rejected/failed attempts still consume their admitted budget. Storage failure denies admission with a sanitized 503; exhausted budgets produce 429 plus a retryAfter value for future HTTP Retry-After wiring.

These limits are burst control, not proof of daily free-quota compliance: physical usage reporting and operational limits remain required. This module is not yet wired into HTTP. Four additional SQLite-backed tests cover concurrent admission, account/operation isolation, rollover, clock regression and fail-closed behavior; all 83 backend tests passed, as did backend types and affected lint. Migration 0007 is applied only to staging.

Staging D1 integration passed the concurrent final-slot admission, denial and next-window reset alongside the existing sync/reference/attachment suite. The random synthetic owner and its rate rows were removed; logical sync usage returned to the initial value.
