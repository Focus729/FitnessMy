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

## Verification

`npm run test:backend`: 61 tests, including 29 shared-schema and 11 transactional storage tests, passed on 2026-11-04. Backend/app type checks and affected lint passed. Existing application behavior is not yet connected to these new modules.

`npx vitest run --config vitest.d1.config.ts`: explicit remote test, excluded from normal unit runs. Uses the existing local Wrangler session without printing credentials, targets only the fixed fitnessmy-staging database, creates a random synthetic owner and removes only that owner's rows in finally. Passed real concurrent compare-and-set, batch rollback, stable retry receipt, owner denial, change pagination and snapshot/edit interleaving. Migration 0003 is additive and applied to staging; no personal records were inserted.

Rechecked official [D1 batch transaction semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [REST batch query input](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) on 2026-11-04. The integration test exercises the real D1 database through its administrative REST batch transport using the same SQL/storage functions. Worker-binding transport and authenticated HTTP integration still need verification after endpoint wiring.

## Required before HTTP activation

1. Validate same-profile references and attachment finalization, including references within a related batch and built-in catalog IDs. Generic shape validation alone does not establish referential integrity.
2. Add resumable owned attachment chunks, length/digest checks and conservative storage/rate quotas. The current row and request bounds are not a complete free-storage budget.
3. Implement derived workout totals, complete XP/achievement/freeze merge behavior and catalog override projection. Strict rejection of gameState is temporary, not removal from the approved scope.
4. Wire authenticated bounded API routes with same-origin checks, consistent errors and no sensitive logging. Keep the storage primitives internal until the preceding gates pass.
5. Add atomic Dexie outbox/cursor/conflict persistence across repository mutations, undo, imports and reset; explicitly suppress seed/remote hydration enqueueing.
6. Implement profile linking, trusted-device and logout/pending-write flows, migration preview, both-device tests and personal cutover before retiring Pages.
