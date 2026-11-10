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
3. Finish progress date selection and migration baseline initialization. Workout totals, progress wire adapters and catalog override transport are implemented.
4. Authenticated bounded Worker routes for sync, usage and attachments are wired behind `CLOUD_SYNC_ENABLED=true`. Keep the flag absent until the activation gates pass.
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

## Owned storage usage — 2026-11-04

Internal `profileStorageUsage` reads one SQL snapshot with ownership predicates on every aggregate: current records, retained changes, receipts, sync logical bytes, attachment count, unfinished uploads, original bytes and reserved bytes. Missing/foreign profiles return 404; database failures return a sanitized 503. It does not expose payloads or global other-owner totals. This remains internal until authenticated usage/API routes are wired; aggregate scans must be rate-limited and not polled on every edit.

Evidence: all 86 backend tests, backend types and affected lint passed. Staging D1 proved the profile logical total equals the change in the database budget counter, original attachment bytes match the fixture, finalized/unfinished totals agree and foreign access fails. Synthetic fixtures were cleaned and the prior budget restored.

Operator measurement via `npx wrangler d1 info fitnessmy-staging --json` on 2026-11-04 reported database_size=245760 bytes, rows_read_24h=1659 and rows_written_24h=909. This was sampled during synthetic integration activity; it is not a steady-state personal-use estimate. Physical size includes storage not represented by logical reservations, and may retain allocated pages after deletion. Provider-reported rolling activity is distinct from billing-day/account-wide quotas. Automatic operational reporting, warning thresholds and pre-migration sizing remain pending.

## Progress reconciliation foundation — 2026-11-04

`reconcileXpEvents` merges validated event histories by dedupeKey rather than adding device totals. Matching awards count once; conflicting amount/reason/date or reused IDs raise ProgressConflict. Event deletion does not revoke earned XP, consistent with the existing no-penalty rule. Total/level are recomputed, numeric overflow rejected, and returned events copied. `legacyXpGap` reports a stored total not explained by the event ledger; migration must retain the original snapshot and require explicit reconciliation instead of silently losing XP or inventing duplicate awards.

Existing achievements merge monotonically. Inspection confirmed freezes and current streaks are derived by `src/app/streaks.ts`; device balances must not be summed. Full-history recomputation still needs work: the existing function scans a 400-day window and uses device-local today. Migration must preserve historical bests and unknown streak keys, and define a common evaluation date before enabling cloud progress. The new XP helper is not wired to server writes or hydration yet. This does not complete the progress contract.

Evidence: 20 gamification tests passed (including four new reconciliation tests); app types and affected lint passed. No UI, user-history mutation or Worker deployment in this increment.

## Streak derivation correction — 2026-11-04

`recomputeStreaks(repos, asOf)` now accepts a shared evaluation date and scans available history instead of truncating at 400 days. Habit schedules do not precede habit creation. Food/workout entries after asOf are excluded. Workout weeks use Monday calendar dates, avoiding incorrect splitting across ISO week-year boundaries. Existing bests and unknown streak keys are retained; current streaks and freeze balances are recomputed, not summed across devices.

Three new regression tests cover a 450-day run, historical-best/unknown-key preservation, December/January week grouping, future workout exclusion and explicit-date evaluation. All 36 targeted habit/streak tests, app types and affected lint passed. Archive/schedule history is still limited by the existing data model, which stores current habit definitions rather than historical schedule revisions. Cloud progress wiring and atomic hydration/recomputation remain pending.

## Client receive/acknowledgement foundations — 2026-11-05

Internal acknowledgement logic verifies operation identity, account/profile and expected revision before removing its outbox entry. Later edits survive; predecessor acknowledgements provide the next expected revision. All acknowledgements in a call commit atomically. Unknown/mismatched responses fail closed. The future sender must persist exact batch requests before transmission; these helpers alone do not provide network retry durability.

Internal receive logic validates records and ordered sequences, checks the expected local cursor, and commits applied records/conflict snapshots and the new cursor in one suppressed-capture transaction. Divergent pending edits remain local with remote payload/revision retained in cloudVersions.conflict. Own echoes preserve later local writes. Device-local preferences/PIN are retained on existing settings/profile records. Initial hydration defaults, attachment dependencies, derived totals/progress, fixed-watermark session persistence and conflict resolution UI are still required before activation.

Catalog projection compares records against an exact seeded baseline and returns only changed fields/removals. Unchanged catalogs produce no override. Application rejects identity changes, invalid fields and version mismatches. Catalog baseline/version storage and wire-format integration remain pending.

Evidence: outbox (11), acknowledgements (3), receive (5 including injected checkpoint failure rollback) and catalog (3) tests passed. App types and affected lint passed before the final additional rollback test; final checks continue. These modules remain disconnected from user sync flows.

## Bounded sync cycle and HTTP handler — 2026-11-05

`prepareNextBatch` persists the exact ordinary-entity request before network I/O, retaining stable batch/operation IDs across restart and later edits. It preserves transaction grouping; transactions beyond 20 records/256 KiB are rejected without dropping entries and require import/transaction planning. Pending conflicts or unresolved predecessors block preparation. `completePreparedBatch` validates the complete response against the persisted request and atomically acknowledges entries/removes the request. `syncOnce` performs one push and bounded fixed-watermark pulls. Confirmed 409 responses still pull and retain divergent versions; network failures preserve the request unchanged.

`syncApi` implements bounded ordinary sync/usage request handling, same-origin writes, strict cursor parameters, ownership through trusted caller identity, request admission and Retry-After. It is deliberately not wired into Worker index yet. Attachments, progress/catalog adapters, initial-hydration defaults, conflict resolution and authenticated transport remain gates.

SQLite/native IndexedDB-emulation integration now proves convergence between two separate local databases, exact retry after a lost committed response, and retention of both versions after concurrent edits. This is not yet a real two-browser/Worker/phone proof. Three integration tests passed; 89 backend tests passed before adding these three. Client primitive tests: 27 passed across outbox, catalogue, prepare, acknowledge, complete and receive. App/backend types and affected lint passed during development; final integrated checks remain required before publication.

## Network, conflict choice and attachments — 2026-11-05

Added bounded same-origin JSON transport with timeout, no redirects/cache, actual-stream size cap, strict success payload validation and actionable auth/conflict/rate statuses. Only the explicit server revision-conflict marker allows abandoning a rejected persisted batch. Conflict resolution checks the exact remote revision/local head shown to the user, retains a device-local recovery snapshot and refuses to discard a request with an unknown server outcome. Local choice creates a fresh revision-guarded operation; remote choice retains excluded local preferences/PIN.

Attachment client resumes missing chunks, verifies original metadata and SHA-256, preserves originals on failure, and verifies downloaded chunk and whole-file hashes before returning bytes for persistence. The bounded attachment HTTP handler supports manifest/chunk/finalize/status/read/restart with ownership, same-origin writes and request admission. Neither HTTP handler is activated in Worker index yet.

Evidence: 97 backend tests passed, including SQL-backed conflict resolution/convergence/lost-response, attachment HTTP round trip with Unicode IDs, resume after lost chunk response and corruption rejection. 34 client primitive tests passed before the final transport refactor; focused transport/receive/attachment checks passed afterward. App/backend types and affected lint passed during implementation. Native Chrome proof passed with two isolated browser contexts, real IndexedDB and the SQL-backed HTTP handler via test route interception; this does not substitute for deployed Worker/D1 or physical-phone verification. Node ESM catalog loading now declares its JSON import type explicitly.

## Related files and larger atomic batches — 2026-11-05

The client uploads immutable files in the leading outbox transaction before publishing referring records. Acknowledging an upload removes only its matching local operation after rechecking workspace identity. Server-side orphan/finalized files remain retained; a local blob deletion never invokes physical server deletion. Remote recipe pages fetch and verify missing files before atomically applying files, records and cursor. SQL-backed two-device tests pass a recipe/photo round trip without echo entries.

The batch record bound is now 200, shared by client/server, while the existing 256 KiB request and 64 KiB entity bounds remain. This supersedes earlier 20-record descriptions. Related transactions are not split silently. Large import planning is still required above these limits. A 40-record linked transaction converged through paginated pulls. Actual staging D1 passed a 200-record commit, identical retry and complete rollback when mutation 200 conflicted; generated owner data was cleaned and the initial logical budget restored. Wrangler refreshed its existing session after an initial expired-token 401; no new credentials were requested or exposed.

Rechecked https://developers.cloudflare.com/d1/platform/limits/ on 2026-11-05: a D1 batch counts as one query toward the per-invocation query limit, while per-statement limits still apply. No paid resource was enabled. User-visible migration, full progress/catalog adapters and deployed sync routes are still unfinished.

## Phone migration inventory — 2026-11-05

`previewCloudMigration` is a read-only backup inventory: format/reference validation, per-table/tombstone/built-in counts, strict cloud projection checks, decoded attachment sizes/SHA-256/reservations, missing-photo detection and explicit legacy XP-gap warnings. It returns only summary metadata and a stable sanitized-content fingerprint; credential/device-preference changes do not affect that fingerprint. It never writes storage or sends requests. A conservative sync reservation estimate assumes one receipt per projected record; a capacity-review warning is not a claim that optimally packed data cannot fit. Actual seed overrides/import batches and current account usage must be reconciled before upload.

Three tests passed for counts/hash/size, input preservation, credential exclusion/fingerprint stability and malformed file reporting. This is not yet the migration UI or an import executor. Pavel confirmed the only real history is on the phone; its backup and original installation must remain available through cutover.

## Legacy XP baseline and atomic derived progress — 2026-11-05

`createProgressBaseline` captures the unexplained portion of legacy XP once per source profile during reviewed migration. `reconcileCloudProgress` counts each source baseline once, rejects differing amounts for the same source, adds deduplicated event XP, derives level, unions achievements and preserves historical bests/unknown streak keys. Current freezes/series come from supplied history-derived values rather than adding device balances. Nested progress fields are allowlisted to avoid copying unknown values.

Streak calculation is now a pure shared function in domain/habits/history.ts, with the existing local refresh delegating to it. Optional receive-page evaluation runs progress derivation inside the same suppressed transaction as records/files/cursor, only when explicit migration baseline metadata exists; it never infers a new baseline from a device total. Tests prove legacy 100 + old event 30 + independent new awards 20/40 = 190, duplicate baseline idempotency, mismatched-source conflict, best preservation and full rollback on conflicting baseline metadata.

Wire progress envelopes, baseline distribution/approval during migration, automatic duplicate-XP wire identity reconciliation and common evaluation-date selection are not connected yet. This does not enable gameState uploads or claim full progress synchronization.

Post-refactor verification: all 273 app tests passed; app/backend types and affected lint passed. Deployment remains the previously verified d476b57 staging revision.

## Progress exchange and workout hydration — 2026-11-10

`gameState` now has a separate wire shape containing reviewed baselines, achievements and streak evidence. A linked outbox requires explicit progress metadata before preparing this mutation. Incoming progress evidence goes into cloud metadata, and an evaluation date supplied by the cycle caller enables atomic derivation of the local game state. Progress conflicts merge both evidence sets and keep recovery copies. Conflicting baseline amounts for the same source roll back the merge.

Migration 0008 replaces the unique XP award-key index with a lookup index and a transaction guard. Independent devices may record the same award under different record IDs if the key, amount, date and reason agree. The derived total and linked event history count the award once. Incompatible award meaning aborts the batch and returns a specific error. A deleted award retains its identity. Staging D1 accepted concurrent equivalent awards and rolled back a batch containing an incompatible award. The remote suite removed its synthetic fixture and confirmed the prior storage budget.

Hydration and remote conflict selection recalculate affected workout totals from local set rows in the same transaction, including set movement and deletion. The local regression covers a workout and its sets arriving on different pages.

Verification passed for app/backend types and changed-file lint, all 101 backend tests and 56 affected app tests. The preceding full app run passed 273 tests before the workout hydration change.

The authenticated Worker sync routes remain gated. A shared profile date, phone migration workflow and a user-facing repair path for mismatched XP awards still need integration.

## Catalog overrides and guarded Worker dispatch — 2026-11-10

Seeded foods and exercises share the exact versioned asset defaults used for first launch. The outbox sends only changed fields and explicit removals. An empty override restores defaults. The server validates the catalog version, change fields, removals and built-in ID membership before creating a receipt. Hydration reconstructs full local records without enqueueing them. First launch fills missing seed rows and preserves overrides already applied. Migration preview counts shipped records for review and excludes unchanged rows from the upload estimate and fingerprint.

The Worker dispatches profile sync, usage and attachment paths only after session validation and only when `CLOUD_SYNC_ENABLED` is explicitly `true`. The staging configuration leaves the flag absent. Staging proof with authenticated Worker bindings is still required before user activation.

All 104 backend tests, app/backend types and changed-file lint passed. Catalog exchange was checked across two test databases, including an empty override restoring defaults. Both seed tests, all four backup-preview tests and three native Chrome storage scenarios passed.
