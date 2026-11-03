# Cloud data inventory

Implementation contract for CF-M2, inspected 2026-11-03. This records required coverage, not completed synchronization.

Source: `src/data/db/schema.ts`, `src/domain/model.ts`, `src/data/repositories/dexie.ts`, `src/data/backup.ts`, `src/data/profiles.ts`.

| Existing store | Cloud treatment | Required preservation |
| --- | --- | --- |
| profile | Owned profile entity | Existing ID, personal targets and measurement inputs; registry name/tint must stay consistent |
| settings | Explicit field allowlist | Units, week start, meal slots, targets, enabled modules, fasting configuration, water presets, food tabs and plate configuration |
| foods, exercises | User records and catalog overrides | Keep stable built-in IDs; do not upload unchanged seed catalogs. Favorites/custom edits must survive |
| dishes, recipes | Versioned entities | Ingredient references, serving definitions, attachment references |
| diary, water, fasting, substances | Versioned entities | Canonical quantities, dates, meal slots and ongoing fasting state |
| mealPlans, shoppingLists, dayTemplates | Versioned entities | Plan references and checked shopping items |
| routines, plannedWorkouts | Versioned entities | Exercise order, progression and calendar status |
| workouts, workoutSets, cardio | Atomic related mutations | Active/completed/deleted state; derive aggregates from sets; retain canonical units |
| body, sleep, checkins | Versioned entities | Historical dates, measurements and attachment references |
| habits, habitLogs | Versioned entities | Habit polarity, archive status and outcomes |
| xpEvents | Deduplicated events | Enforce profile-scoped dedupeKey so retries cannot grant extra XP |
| gameState | Derived plus explicit progress decisions | Recompute XP/level from events; preserve achievements/freezes with an explicit merge contract before enabling sync |
| blobs | Owner-scoped resumable chunks | MIME, length and digest; finalize before referencing; preserve original local bytes on quota failure |
| meta | Local by default | Seed version and planner drafts must not enter generic entity synchronization |

## Device-local state

- Entire `settings.ai` and `settings.sync` integration blocks remain local: provider credentials, model/call counters, Google Drive configuration and backup timestamp.
- Locale/theme, rest-timer sound/vibration preferences, onboarding state and trusted-device choice remain local. Existing backups retain their current validated behavior; cloud projection is stricter than ordinary backup projection.
- Profile registry PIN hashes, active-profile selection, navigation/date drafts, backup-reminder snooze and recovery snapshots remain local.
- Rest deadlines currently live in localStorage in `ActiveWorkout.tsx`. Preserve a resumed local timer; do not synchronize ticking values or overwrite another device's active timer implicitly.
- `lenta_recovery` is outside profile transactions. Do not add it to cloud exports or clear it as a side effect of sync.

## Mutation and import boundaries

Inventory repository writes, backup replace/merge, seed loads, profile rename/delete and undo before adding outbox hooks. Every user mutation and its outbox operation must commit together. Remote hydration must suppress local enqueueing. Seed initialization must not enqueue the entire catalog.

The existing backup merge uses timestamps. It is not the cloud conflict algorithm: cloud writes require expected revisions, tombstones and explicit divergent-record resolution. Profile name matches never establish identity. Reject missing/foreign references before publishing imports; compare attachment hashes and per-table counts before cutover.

## Outstanding acceptance checks

Every table above needs synthetic create/edit/delete/undo coverage and an explicit projection validator. Settings tests must prove credentials never reach requests, D1, conflicts or receipts. Game-state merge semantics and catalog override representation must be implemented and tested before claiming complete coverage.
