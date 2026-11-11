# FitnessMy implementation plan

## Current State

- Objective: move application hosting from GitHub Pages to Cloudflare and provide one private account with the same profile/history on phone and PC while preserving offline logging.
- Personal cutover decision (2026-11-10): Pavel chose a fresh cloud profile. The personal backup/export/import gate is superseded. No legacy records were imported.
- Approval scope: on 2026-11-02 Pavel approved the complete Cloudflare plan and subsequently approved replacing Access email OTP with GitHub OAuth for Focus729 only. Workers Static Assets + D1, offline sync, no payment card/no paid services, and staged Pages retirement remain approved. OAuth app/secret creation and transfer only to Cloudflare Worker secrets were explicitly authorized.
- Cutover (2026-11-11): Pavel confirmed that a new water entry created on his phone appeared on his PC at the production address. The GitHub Pages publishing branch was set to `None`, and both remote branches were retained. Physical-device PWA installation and offline relaunch remain unverified. Full tasks and acceptance matrix: [Cloudflare migration plan](docs/CLOUDFLARE_MIGRATION_PLAN.md).
- Offline profile selection (2026-11-11): the phone screenshot showed the profile picker in airplane mode, with an online-only sign-in error and no cloud profile. The picker now lists hydrated cloud profiles with offline access enabled on the current device. The existing ownership and device-access checks still gate opening a profile. Retest from the installed app on the phone after publishing.
- Request admission evidence (2026-11-04): internal account-scoped read/write/attachment limits implemented; 83 backend tests, backend types and affected lint passed. Migration 0007 applied to staging. Actual D1 concurrent admission accepted exactly one final slot, denied the next request and reset in the next window; full storage integration and synthetic-owner cleanup passed. HTTP wiring and physical/daily quota reporting remain pending. No frontend change or Worker redeploy in this increment.
- Storage usage evidence (2026-11-04): owned per-profile logical/attachment counters implemented internally; 86 backend tests, types, lint and actual staging D1 budget agreement/owner-denial checks passed. Provider physical-size and rolling-row metrics were read successfully (details in CLOUD_SYNC_PROTOCOL.md). Automated reporting, migration sizing and HTTP/UI wiring remain pending. No Worker/frontend deployment in this increment.
- Progress reconciliation foundation (2026-11-04): event-based XP deduplication/conflict detection and explicit legacy-total gap detection implemented; 20 gamification tests, app types and affected lint passed. Not connected to sync yet. Freeze/streak derivation still needs full-history/common-date handling and historical-best preservation; catalog overrides and complete HTTP sync remain outstanding.
- Streak correction (2026-11-04): removed the 400-day truncation, added explicit evaluation date, preserved historical bests/unknown keys, fixed ISO week-year grouping and excluded future entries. All 242 app tests, app types and affected lint passed. Exact-source root PWA build and all seven local and deployed workout/backup/RU-EN auth/account scenarios passed. Source d476b579ea06670f76708c982966526f79e3b901 is deployed; real marker matches and anonymous APIs deny access. Current habit definitions cannot reconstruct past schedule/archive changes; cloud progress hydration remains unfinished.
- Client engine progress (2026-11-05): catalog override projection, atomic outbox acknowledgements and atomic remote-page/conflict/cursor persistence implemented internally. Targeted tests passed including later-edit retention and injected checkpoint failure rollback. Network sender, durable batch preparation, attachment/progress hydration, conflict resolution, cloud UI and migration remain outstanding. No automatic sync enabled.
- Sync-cycle progress (2026-11-05): persisted retry batches, atomic completion, bounded push/pull and disconnected sync/usage HTTP handler implemented. Three two-local-database/SQLite integration tests pass: convergence, lost-response idempotency and concurrent-edit preservation. Phone/real-browser/Worker proof, conflict resolution, attachment/progress/catalog adapters and UI are still pending. Special entities and oversized related transactions fail closed rather than being omitted.
- Network/conflict/attachment evidence (2026-11-05): bounded HTTP transport, guarded explicit conflict choices with local recovery, resumable verified attachment client and disconnected attachment HTTP handler implemented. 97 backend tests passed; native Chrome two-profile exchange/reload/reverse-edit proof passed against SQL-backed test routes. Real Worker/D1/browser sync, related-entity adapters and product flows remain pending. Last automatic-review authorization failure cleared on retry after the user continued; no bypass was used.
- Related-record proof (2026-11-05): recipe/photo upload ordering and atomic remote file/record/cursor hydration passed SQL-backed two-device tests. Shared atomic batch limit increased to 200 records at the same 256 KiB cap; actual staging D1 passed commit, retry and rollback at record 200 with cleanup. Larger imports still need planned chunks. Full progress/catalog integration and user flows remain pending.
- Phone migration inventory (2026-11-05): read-only backup summary/fingerprint, strict record projection, file hashes/reservations, reference checks and legacy-XP/capacity warnings implemented; three focused tests passed. UI/import execution and personal-phone export are still pending. Latest full backend run passed 99 tests, including large related transactions; staging D1 200-record proof passed.
- Legacy progress handling (2026-11-05): immutable-per-source legacy XP baseline and event-based total composition implemented; shared pure streak calculation and optional atomic hydration derivation added. Focused progress/hydration tests passed, including baseline deduplication and whole-page rollback. Progress wire envelopes, migration baseline selection/distribution, duplicate-XP wire mapping and common evaluation date remain pending; gameState upload is still gated.
- Progress exchange (2026-11-10): the internal sync cycle transfers reviewed legacy baselines and achievement/streak evidence. The receiving device derives XP/level from the merged award ledger and preserves concurrent achievements through an explicit merge. Equivalent XP events retain their device record IDs but count once by award key. Migration 0008 is applied to staging. Actual D1 accepted equivalent concurrent awards, rolled back a mixed batch with an incompatible award and cleaned the synthetic data. Incoming workout totals are rebuilt from actual sets. Common profile date selection, migration baseline initialization, award-conflict UI and catalog adapters remain pending. The live Worker still serves the previously verified revision.
- Catalog exchange and Worker dispatch (2026-11-10): versioned overrides are validated, sent, hydrated and removed without uploading shipped catalogs. The backup estimate excludes unchanged built-ins. Sync, usage and attachment routes are wired behind an explicitly disabled-by-default Worker flag. Next integrate shared date selection, resumable phone import and cloud profile activation, then verify the authenticated Worker/D1 path before real data transfer.
- Phone import planning (2026-11-10): reviewed snapshots generate stable target IDs and bounded, reference-ordered requests with explicit XP baselines. The preview and server share reference checks. The sender checkpoints verified files and matching batch receipts, and the SQL-backed test resumed after a committed response was lost and the browser database reopened. Server-side import reservation and publication, profile linking and the import UI remain pending.
- Fresh cloud profile (2026-11-10): signed-in users can create a fresh profile or open an owned cloud profile in a separate IndexedDB workspace. Setup is atomic and other devices hydrate it before opening. Foreground sync preserves local offline writes and uses one writer per browser origin and workspace. Native Chrome at 320 px Russian/light and 1440 px English/dark verified the full create, water entry, open on PC, offline write, reconnect and revoked-session boundary against Worker dispatch with SQL-backed fixtures. All 105 backend tests and four native storage tests passed. D1 preflight reports migrations current and 159,744 bytes allocated. The staging build enables sync for Focus729. Physical-device use, long-lived trusted offline access and conflict resolution UI are pending.
- Physical pilot and production preparation (2026-11-10): Pavel confirmed that the phone's trial water entry appeared on PC in the same staging profile. Created the separate free D1 database `fitnessmy` in WEUR and applied migrations 0001–0008. Verified zero accounts, profiles and records. `wrangler.production.jsonc` targets the intended `fitnessmy.hpavel729.workers.dev` Worker and the separate database. Production OAuth configuration and Worker publication are pending.
- Conflict comparison (2026-11-10): the UI compares local and cloud versions of revision conflicts, supports an explicit choice, and offers a merge for progress. The sync lock and version guards prevent stale choices. In the SQL-backed native Chrome scenario, a disconnected PC and a phone edited the same water entry. The PC showed both amounts, kept its chosen version, and the phone received it. Award semantic conflicts without paired versions are still retained for recovery.
- Offline access and logout (2026-11-10): Settings can explicitly trust a hydrated cloud profile on this device. Verified an offline reload from the built service worker, an offline edit and sync after reconnection. Native two-browser checks also verified that logout waits for queued edits, clears local synced rows and trust after session revocation, and allows the data to be fetched again after signing back in. Physical offline installation verification is pending.
- Staging and production preparation (2026-11-11): offline access and safe logout are live on staging revision `9b38282` and Worker `aa1772fb-63c2-4c7e-a666-770c71373463`. The same checked artifact is installed on the production Worker with public and preview routing disabled. The exact production callback and its encrypted Worker secret are pending.
- Production activation (2026-11-11): added the exact production GitHub callback and encrypted Worker secret with Pavel's approval. Published revision `008be1b8b2d3942ff035ad5a7d029201c7f5108a` as Worker `ffd37b2b-0ab6-4608-9a8a-67b58b064aa1` at https://fitnessmy.hpavel729.workers.dev. Verified the live revision, manifest, anonymous API denial and an actual authorized GitHub login that loaded the empty cloud profile form. The full gate passed on `cdec794` with 105 backend tests, 278 app tests, four native storage scenarios and 30 built-app scenarios. The route-only activation commit passed a fresh build and production configuration dry run.
- Blockers/gaps: browser access is restored. Live logout invalidated the session (protected session endpoint returned sign_in_required), relogin succeeded, and the owned profile list returned an empty array. Local workerd crashes in Windows, so database integration uses staging D1. New sync storage primitives are deliberately not reachable through HTTP yet: rate/physical-usage reporting and complete progress semantics are still required. Expiry/trusted-offline/install and end-to-end synchronization remain unverified.
- Local progress repair (2026-11-04): reproduced four existing failures: duplicate concurrent XP awards, lost distinct awards, an orphaned XP event after total-write failure, and overwritten achievements. Event/total writes and game-state updates now use IndexedDB transactions; achievements merge monotonically. All 222 app tests and 5 affected browser scenarios passed, including native IndexedDB XP/event agreement after workout completion and reload, plus RU/EN auth/cache checks. App types, lint and root PWA build passed. Published on staging as a7327675e07b79c1c835fa1fc4daf7a5e82608ac; all five scenarios also passed against the deployed site.
- Latest storage evidence (2026-11-04): 79 backend tests, backend types and affected lint passed. Staging D1 passed owned references, attachment resume/hash verification/restart/finalized-file protection, original metadata preservation and quota-counter cleanup. Migrations 0004–0006 are applied only to staging. Read-only preflight found zero leftover synthetic owners and zero logical sync usage. No personal attachments were uploaded. New storage modules are internal until the remaining API gates pass; only the independently verified local progress repair is active in the deployed frontend.
- Protocol foundation evidence (2026-11-04): 61 backend tests passed; backend/app TypeScript and targeted lint passed. Strict shared validation covers 23 record types plus cloud settings, rejects unknown nested fields and strips only classified local credentials/preferences/PIN during projection. Migration 0003_sync.sql was applied to staging only. Actual D1 integration passed concurrent revision guards, whole-batch rollback, stable retry receipts, foreign-owner denial, watermark pagination and compact snapshots under concurrent edits; its generated synthetic owner and all fixture rows were removed. Local tests also cover delete/edit/undo conflicts, XP deduplication and bounded response pages. See [protocol contract](docs/CLOUD_SYNC_PROTOCOL.md). This is a backend foundation, not a completed sync feature.
- Checks/evidence: 21 backend tests passed (14 auth + 7 profile ownership/retry/conflict/validation/quota tests), all 215 existing unit tests passed, cloud account RU/EN browser scenarios and RU/EN offline boundary scenarios passed (4 total). Twelve account screen captures cover 320/390/1440 px and light/dark; no horizontal overflow. Real staging D1 concurrent compare-and-set accepted exactly one of two writes; stale writes and foreign ownership filters passed, and generated fixtures were cleaned. Additive migration 0002_profiles.sql is applied to staging. Historical auth evidence: 14 GitHub SQLite-backed tests passed, including redirect rejection at both provider endpoints; backend TypeScript/lint and exact-source root PWA build passed. Existing 215-test baseline and RU/EN offline API-boundary checks remain recorded. Live GitHub login created the allowed github:43194562 session, authenticated D1 health returned ready, and a separate anonymous request returned 401. Pavel confirmed on 2026-11-03 that physical-phone GitHub login followed by /api/health returned database:ready. This confirms phone reachability/authenticated D1, not history synchronization or installation/offline behavior. No provider credentials were printed or committed.
- Release state: staging https://fitnessmy-staging.hpavel729.workers.dev runs source 0d5e51f76e9358d727f0df6b27a1fed4bda4582c, Worker 168d50e0-1a4f-461c-8b19-a6d3603f0ede. The exact live marker and anonymous API denial passed. The prior staged pilot was confirmed on Pavel's physical phone and PC. The version comparison update passed the clean Cloudflare release gate with 278 app tests, 105 backend tests, 4 native storage scenarios and 29 built-app scenarios. Production has an initialized empty D1 database and a dry-run-verified configuration. Production OAuth, trusted offline access and live verification remain open. Pages is still active.
- Remaining scope: CF-01–CF-14 and retained SYNC-01–SYNC-08 are mapped in the new plan. Historical physical-device/live-service verification gaps remain; affected PWA/install checks become explicit migration gates.

## Historical discovery — superseded by the Cloudflare plan

The discovery brief is [docs/BRIEF.md](docs/BRIEF.md). Cloudflare has replaced the earlier Supabase recommendation; the current audience is Pavel alone. The completed redesign's synchronization exclusion remains historical and is superseded only when this new implementation plan is approved.

## Previous release state — completed direction B redesign

- Objective: implement the Training companion direction B across Lenta, improve daily logging, and resolve all 24 audit requirements without losing existing data or features.
- Baseline: local `master`, commit `6ec0ff0a514ceabcc6e71250d6c4c403e0d415e7`, version 0.7.0; origin `https://github.com/Focus729/FitnessMy.git`.
- Personal migration source (confirmed 2026-11-05): all real history is on the phone only. Export and verify that phone history before cutover; PC will hydrate the resulting cloud profile. Keep old phone installation/origin available until migration is verified.
- Approval scope: on 2026-10-29 Pavel selected **direction B** and requested this plan. On 2026-10-29 Pavel explicitly approved the full plan (REQ-01–24, M0–M7), direction B, technical approach, and no-new-service-cost boundary.
- Active milestone: M0–M7 completed within the approved implementation scope. Published and verified on 2026-10-31. Physical-device/live-service evidence limits remain explicit below.
- Next action: no remaining implementation or publication action in the approved scope. Physical-device camera/keyboard and optional live-service checks remain unverified; human task-speed goals remain unmeasured.
- Blockers: none for this release. Repository and deployment history were preserved; no paid resource or new service was activated. Remaining dependency exposure is documented in docs/audit/SECURITY_REVIEW.md.
- Evidence: a full local gate passed on 2026-10-31 with 215/215 tests, 22/22 browser scenarios, lint, 48 contrast pairs, 96.69% domain coverage and a 184/400 KB initial gzip bundle. Three additional product/recipe/habit write-failure and retry scenarios subsequently passed. The final all-scenario gate passed with 215/215 tests and 25/25 browser scenarios after these fixes and tab/date memory. RU/EN imperial measurements and stale-backup reminder/snooze passed (editor-results.json). 64 baseline redesign captures plus 16 profile B captures had no page errors/overflow. Browser production-path offline/update evidence is in docs/audit/redesign/production-path-results.json.
- Release state: source `c0b755a48e47e652d0780fa2b39ab5aaac016312` is on master; deployed artifact `c42e5be7e7ad8806b98843b9b6927441191a87f0` is on gh-pages. GitHub Pages run [41232853527](https://github.com/Focus729/FitnessMy/actions/runs/41232853527) succeeded. Live https://focus729.github.io/FitnessMy/ returned the expected source revision and passed RU/EN offline food correction, workout resume, backup replacement, profile isolation and unit preservation with zero page/asset errors. Evidence: docs/audit/redesign/live/production-path-results.json.
- Exact revision checks: the complete clean-commit gate passed on `d29cc1f27becda54c86b7c2baeab897134a05511`. The subsequent `c0b755a` change only removes a duplicate root manifest link and adds its browser assertion; TypeScript/production build and both-language production-path/offline/update/backup/profile checks passed after it. Application JS/CSS assets are unchanged by that focused fix. Live verification checks the final `c0b755a` marker.

## Implementation checkpoint — 2026-10-30

Implemented foundations: sanitized atomic restore with recovery snapshots, explicit restore preview, credential exclusion, decimal/PIN inputs, diary editing and portion reset, profile switching, responsive B shell, direct Today actions, resumable workouts/timer, week-scoped planning, sleep/check-in hydration and date-scoped drafts, canonical unit conversion, sparse-chart states, scheduled-habit summaries, onboarding confirmation and device-local backup guidance.

Verified evidence is narrower than implementation. Backup fixtures cover malformed references, recovery-store failure, replace rollback, redaction and merge behavior; repository tests cover concurrent starts/initial sets and atomic batch writes. Browser tests cover backup replacement, separate profiles with PIN 012345, food entry, workout reload/finish, sleep reopen and date drafts, stale/no-match search and dialog behavior. Human speed targets and live external services remain unmeasured.

Verified since the preceding checkpoint (2026-10-31):

- Imperial cardio entry validates bounds, stores canonical metres, survives reload and supports deletion Undo.
- Same-name product portions remain separate; meal selection resets correctly; repeat Undo and legacy meal-slot visibility pass. Week-to-date coverage passes with Monday and Sunday week starts (1/5 and 1/6 days).
- Injected diary-write failure preserves the draft across tabs and retries without duplicates; storage-status denial leaves backup settings usable.
- A selected plan starts from Today; completed workout editing recomputes volume and survives reload; deletion/Undo restores it. Repository transactions protect concurrent free/routine starts, routine-day advancement and workout/set aggregates.
- Routine changes validate set/repetition/rest bounds, survive reload and return after template reset/Undo. Calendar move/edit/skip checks passed; tab/date restoration was added to the final regression.
- Profile B has 16 additional phone/desktop RU/EN captures, including sparse body-history fixtures, with no page errors or overflow.

Release completion:

1. Clean-source gate: 215 tests, 25 browser scenarios, lint, contrast, coverage, bundle and production build passed.
2. Final manifest correction: exactly one manifest link resolves under /FitnessMy/; focused local checks passed. Source and deployment commits were pushed without force.
3. Pages workflow and final build identity verified; live RU/EN scenarios passed with disposable synthetic profiles. Local explicit-update testing passed; a second live deployment was not triggered merely to repeat that check.
4. Physical-device installation/keyboard/camera, live Drive and human task-speed measurements remain unverified. These evidence limits and retained dependency risks are documented in REDESIGN_VERIFICATION.md.

The final audit reconciliation found two remaining implementation omissions and corrected them: recipe/product/habit draft protection (REQ-16) and profile-scoped tab/date return state (REQ-09). No approved requirement was dropped. jsdom checks now use one worker after observed system-memory failures; the JSX copy check parses actual syntax rather than mistaking generic return types for UI text.

React Router DOM was patched from 6.30.4 to compatible 6.30.6 with its declared router dependencies; no new package family or service was added. Remaining advisories are documented. No paid calls or writes to existing user data were introduced. The verified artifact was published to the established Pages target; live test records existed only in disposable browser contexts.

## Scope and working assumptions

The [audit](docs/REDESIGN_AUDIT.md) is the evidence and detailed acceptance reference. Its REQ-01–24 identifiers remain stable. This plan includes all 24 as approved implementation scope. No requirement is silently dropped.

Retain the current two-adult audience, separate local profiles, offline-first PWA, Russian/English, desktop/phone, and manual backup with optional Google Drive. Retain all existing workout history/editing, plans, programs, exercise library, cardio, nutrition, recipes, menu planning, body measurements, habits including quit habits, progress, and optional game features. Preserve existing imports/exports through versioned compatibility handling.

Implement the existing imperial setting correctly rather than removing an offered capability. Keep AI disabled by default; fix its editable draft workflow using deterministic fixtures and existing adapters without making paid calls. Live service validation is separate from local correctness.

Out of scope: accounts/public multi-user product, server migration, live cross-device synchronization, wearables/automatic step collection, social features, new AI features, paid services, wholesale framework rewrite, and major dependency upgrades without evidence. Existing optional integrations remain available; external-service limitations must be disclosed, not disguised as verified functionality.

## Selected design application

Direction B is selected for the **whole application**, not only the active-workout screen. See [DESIGN.md](DESIGN.md). Direction A remains a historical alternative.

- Today: active workout first when present, otherwise next planned workout, otherwise a clear start/create-program action. Follow with a concise nutrition balance and labelled food/water/body/habit actions. Never invent a workout recommendation when no plan exists.
- Active workout: current exercise, last-session context, large weight/repetition controls, a distinct Complete set action, progress through the session, and a persistent rest timer. Completing a set saves before showing success; repeated taps cannot duplicate it. Finish remains distinct from completing a set.
- Gym: calendar/program/history workspace, explicit exercise and cardio entry points, direct opening of the selected plan, and visible recovery of unfinished sessions.
- Food/Body/Progress: apply the same surfaces, spacing, type, teal accents, and action hierarchy while preserving their domain-specific tasks. Nutrition logging remains directly accessible rather than buried under workout screens.
- Phone: five primary bottom tabs with clear labels; contextual primary actions stay within reach. Desktop: navigation rail and bounded content workspace; calendar/planning and comparison views use available width; no detached floating action button.
- Themes: support dark, light, and system selection. Existing user preferences survive migration. B's dark mockup does not authorize forcing dark mode on everyone.
- Layout changes supersede the old rigid five-block Today rule and universal bottom-sheet geometry once this plan is approved. Keep the useful behavior of the old conventions: readable hierarchy, local-first operation, and reliable close/save handling.

## Architecture and cost decision

Preserve React, TypeScript, Dexie, repository interfaces, centralized i18n, and existing router/deployment compatibility. Extend shared primitives and feature components rather than replacing the application. Use canonical metric storage with explicit display/input conversion. Keep locale-aware text drafts until validated numeric commit.

Use route/query state for selected subview/date/record, profile-scoped persistence for resumable plans, and versioned database migrations when needed. Sensitive imports use validation before mutation and an atomic database transaction; prepare blob conversions and pre-restore recovery data before destructive work. Snapshot failure must prevent replacement. Do not place credentials into standard backups or recovery exports.

Prefer existing dependencies. Before adopting/upgrading a significant dependency, verify current official support and compatibility and record the source/date. Triage audit advisories by dependency path and runtime exposure; do not run an indiscriminate major-version audit fix. No new subscription, backend, hosting account, or API budget is proposed. Existing hosting costs are not asserted to be zero until its configuration is inspected.

## Milestones and tasks

The task definitions below are preserved as the approved scope; actual completion evidence is recorded above and in the requirement table. During implementation, track `Implemented`, `Verified`, and `Released` separately and attach evidence rather than treating code completion as release completion.

### M0 — Reproducible baseline and regression fixtures

Dependencies: plan approval.

- **T0.1 (REQ-24):** reproduce the three failed browser scenarios one at a time in a stable environment; separate resource failures from application failures. Expected result: actionable causes or explicitly documented environmental blocks, not waived failures. Verify with logs/traces and repeat only when corrective action justifies it.
- **T0.2 (REQ-01–07, 12–18, 24):** establish synthetic two-profile fixtures, previous-version backup/migration fixtures, populated histories, and failure injection for storage writes. Capture regression cases for observed risks before changing behavior. Expected result: tests that detect wrong outcomes, not mirror implementation.
- **T0.3 (REQ-24):** record dependency advisory paths and release configuration facts. Decide which targeted security fixes are necessary; check official compatibility before proposing versions. Expected result: risk classification and a bounded dependency change list.

Gate: runnable baseline; no unexplained failing checks used as acceptance evidence. Existing flaky tests are repaired or their blockers documented before their affected flows are declared verified.

### M1 — Data integrity and dependable editing foundations

Dependencies: M0.

- **T1.1 (REQ-01, 02):** validate full backup structure/references before writes, redact credentials, preview changes including deletion, require explicit Apply, atomically replace/merge data, handle empty blobs, and retain a sanitized recovery snapshot. Verify failed validation and injected mid-restore failure leave all original data intact; round-trip previous-version fixtures; ensure fake secrets are absent from exports.
- **T1.2 (REQ-03, 18):** replace eager numeric coercion with locale-aware draft/commit parsing, inline bounds validation, and canonical unit conversion. Separate PIN as masked digit-string input preserving zeroes. Verify typed/pasted decimals, partial input, metric/imperial round trips, and unchanged stored values when display units switch.
- **T1.3 (REQ-06, 16):** unify loading/draft/dirty/validating/saving/saved/error state; hydrate existing sleep/check-in values without overwriting user edits; retain drafts on failed writes. Verify reopen, date switch, retry, cancel, quota/write failure, and no double submission.
- **T1.4 (REQ-12):** separate custom meal names from translation keys; archive or remap used slots; show uncategorized legacy entries. Verify all records remain visible and visible sums equal totals after a slot change.

Gate: no silent overwrite, hidden food records, partial import, or credential-bearing ordinary export in the tested fixtures.

### M2 — Direction B design system and navigation

Dependencies: M1; T0.3 for any dependency change.

- **T2.1 (REQ-08, 09, 24):** apply B tokens and hierarchy to shared surfaces, headings, metrics, buttons, and navigation. Use existing local fonts. Implement responsive shell, phone bottom navigation, desktop rail, bounded editors, and settings groups. Verify representative layouts at 320/390/768/1440 px, RU/EN, both themes, and both profile accents.
- **T2.2 (REQ-07, 09, 10):** add profile/settings controls on each main screen; persist appropriate route/date context; implement direct action links to selected sleep/day/workout. Verify profile isolation, PIN challenge, Back behavior, and no stale cross-profile query or draft state.
- **T2.3 (REQ-16, 17):** implement labelled topmost-dialog focus/close management and consistent recoverable deletion; visible pointer/keyboard alternatives to swipe. Verify Tab/Esc/focus return, nested sheets, dirty drafts, interrupted gestures, and undo.

Gate: B is visible throughout the shell; all main modules remain reachable; keyboard and two-profile paths work. Update conflicting `TZ.md`/contributor rules and spec checks to reflect approved design changes rather than disabling checks wholesale.

### M3 — Training-first daily workflow

Dependencies: M2.

- **T3.1 (REQ-08, 10, 23):** redesign Today around active/next/no-plan states with direct nutrition/body actions and concise useful summaries. Verify all three workout states and that each action opens the intended profile/date/record.
- **T3.2 (REQ-08, 10, 16, 17, 24):** implement B's focused active-session layout with previous values, set entry, completion, next exercise, timer, notes, and finish review. Preserve warm-up/working-set distinctions, RPE, supersets, plate calculator, and progression capabilities. Verify set persistence, rapid repeated taps, offline reload/resume, background/foreground timer behavior, and correct aggregates after edits.
- **T3.3 (REQ-09, 10, 24):** align plan/program/history navigation and visible actions; open the exact upcoming plan and prevent duplicate starts. Verify create/edit/move/skip a plan, start/resume/finish, edit/delete/undo a finished workout, routine template editing/reset, exercise search, and cardio logging.

Gate: a full planned or free workout can be completed offline and resumed after reload with no missing/duplicated sets. Automated timings are not represented as human usability measurements.

### M4 — Food logging, search, and weekly planning

Dependencies: M1 and M2; M3 establishes shared action conventions.

- **T4.1 (REQ-04, 05, 11):** add diary editing/moving/duplication with correct recomputation; initialize meal/date and amount by entry session and stable identity; add quick-entry fallback names; provide repeat-last-portion with Undo and separate portion editing. Verify slot switching, same-name products, cancel, multi-tap prevention, and the complete repeated meal path.
- **T4.2 (REQ-19, 20):** deduplicate search results, cancel/discard stale responses, distinguish offline/error/no-match, and make AI candidates editable/removable before insertion. Verify with controlled adapters and fixture responses; no real AI calls required. Preserve manual food and barcode entry fallback.
- **T4.3 (REQ-21):** persist profile-scoped week drafts and shopping checks; add week selection, first-use setup guidance, and a desktop week/list workspace. Verify reload/navigation persistence and deliberate idempotent logging from a plan.

Gate: food correction, repetition, and planning work without network; failures preserve drafts; accepting an AI draft is the only path that writes its reviewed candidates.

### M5 — Body, habits, and trustworthy progress

Dependencies: M1, M2, M4 data contracts.

- **T5.1 (REQ-06, 13, 18):** complete date-aware body/sleep/check-in editing, readable habit names/targets, and separate build/quit actions. Verify same-emoji habits, retroactive rules, custom schedules, quit relapse/milestones, and both unit settings.
- **T5.2 (REQ-13, 15):** compute habit completion against applicable schedules/history; define nutrition weekly view as week-to-date and scale denominators by calendar days in the selected period, explicitly showing logging coverage. Missing logs must not shrink the time-period denominator silently. Verify week boundaries, both first-day settings, partial weeks, archived/created habits, and retroactive corrections. Flag unavailable historical schedule information instead of inventing it.
- **T5.3 (REQ-14):** add period/coverage summaries, honest no-data and one-point states, readable axes, and desktop comparisons. Verify missing versus zero, sparse and populated histories, long labels, and neutral descriptive language.

Gate: visible reports reconcile with their source fixtures; current settings do not silently fabricate historical facts.

### M6 — First use, storage guidance, and complete regression

Dependencies: M3–M5.

- **T6.1 (REQ-22, 23):** reuse profile name, explicitly confirm required personal inputs, defer optional integrations, and finish onboarding with a meaningful first action in B. Add device-local data status, backup age, transfer guidance, and profile-specific reminder snoozing. Verify first profile, second profile, no network, denied persistent storage, and disconnected Drive states.
- **T6.2 (REQ-24 and all BASE requirements):** run targeted regressions plus full project checks; inspect representative populated/loading/empty/error screens in RU/EN and light/dark; test installed-PWA/offline update behavior and mobile keyboard if a device environment is available. Verify migrations and restoration using populated histories. Document unavailable real-device/service checks as unresolved gates for any claims depending on them.
- **T6.3 (REQ-24):** update README, TZ changes, DESIGN, PLAN, and a release evidence record with actual commands, commit, screenshots, outcomes, and outstanding risks. Do not overwrite the historical audit as if it described the new version.

Gate: all accepted requirements have evidence; no critical data-integrity regression or unexplained affected-flow failure. Real-user targets from TZ (meal ≤5s, set ≤4s, weight ≤3s) are measured where possible; otherwise marked unmeasured.

### M7 — Controlled release and deployed verification

Dependencies: M6 plus resolved release facts below.

- **T7.1 (REQ-24, BASE-06):** identify the actual production URL/provider, current deployed revision, auto-deploy source/branch, base path, and PWA scope. Confirm a release path in which failed checks cannot publish; test the gate with a harmless failing check on a nonproduction path before relying on it.
- **T7.2 (REQ-24, BASE-04–06):** commit coherent checked increments and publish to the established target only under the user's standing release policy and verified repository/branch/target facts. Use app-release. A temporary nonproduction branch/PR is justified only if production auto-deploy would otherwise expose unfinished work; do not create extra process without that benefit.
- **T7.3 (REQ-24):** verify deployed SHA/build identifier, both languages, app launch, profile isolation, one food edit and workout resume, offline reload, upgrade behavior, and backup round trip using synthetic data. Record rollback procedure; never assume an old application build can safely read a newly migrated database.

Gate: verified deployed revision and main journeys, known recovery path, accurate final release state. If hosting/branch authority is unresolved, deliver the verified local increment and state that release remains blocked; do not invent a target or mark the whole plan complete.

## Requirement → task → expected evidence

| Requirement | Tasks | Observable evidence | State |
|---|---|---|---|
| REQ-01 Safe restore | T1.1 | Invalid/mid-failure imports preserve originals; valid replace/merge match fixtures | Implemented; backup rollback/reference/recovery tests and browser round trip pass |
| REQ-02 Credential-safe export | T1.1 | Fake key absent from ordinary and recovery exports | Verified locally: ordinary/recovery export redaction tests pass |
| REQ-03 Numeric/PIN input | T1.2 | RU/EN typing/paste tests and leading-zero PIN | Verified locally: decimal, leading-zero PIN and numeric bounds tests pass |
| REQ-04 Food editing | T4.1 | Correct totals/identity after edit and move; named quick entries | Verified locally: diary edit/move/decimal browser scenarios pass |
| REQ-05 Meal/draft initialization | T4.1 | Lunch then Dinner and same-name product regression cases | Verified locally: same-name portions, cancel and Lunch/Dinner scenario passes |
| REQ-06 Sleep/check-in hydration | T1.3, T5.1 | Reopen/date-switch/unchanged-save preserve values | Verified locally: sleep reopen/date drafts and edit persistence pass |
| REQ-07 Profile switching | T2.2 | Two-profile isolation and protected-profile switching | Verified locally: separate profiles and PIN 012345 pass |
| REQ-08 Responsive B layout | T2.1, T3.1–2 | Phone/desktop screenshots and reachable actions | Implemented; 80 responsive captures checked, final RU/EN editor captures inspected |
| REQ-09 Discoverable navigation | T2.1–2, T3.3 | Back retains context; every section/settings discoverable | Implemented; primary navigation and calendar tab/date restoration verified |
| REQ-10 Direct Today actions | T2.2, T3.1–3 | Correct date/plan opens; duplicate start prevented | Verified locally: exact plan/Today journey and atomic starts pass |
| REQ-11 Fast repeat meal | T4.1 | Repeat-last portion + Undo; first-use search path | Verified locally: repeat-last portion and Undo pass; human timing unmeasured |
| REQ-12 Safe meal-slot changes | T1.4 | Renames persist and all historical rows reconcile | Verified locally: historical slot deletion keeps diary rows visible |
| REQ-13 Habit clarity/statistics | T5.1–2 | Names, schedules, quit actions, historical limits verified | Implemented; schedule/quit domain tests pass, historical limitations disclosed |
| REQ-14 Sparse-data progress | T5.3 | Zero/missing/one-point fixtures and complete axes | Verified locally: empty/sparse/populated capture fixtures and domain tests |
| REQ-15 Partial-week scoring | T5.2 | 1-day/7-day/week-boundary denominator tests | Verified locally: both week starts and partial-week coverage browser fixture |
| REQ-16 Draft/save consistency | T1.3, T2.3, T3.2 | Dirty close, failed save, retry, repeated-click behavior | Verified locally: product/recipe/habit/diary failure-retry and dirty-close scenarios pass |
| REQ-17 Accessible dialogs/delete | T2.3, T3.2 | Keyboard/focus/topmost Esc/Undo/gesture checks | Verified locally: focus/Esc, interrupted drag and recovery scenarios pass |
| REQ-18 Unit settings | T1.2, T5.1 | Correct display/input round trips, stable canonical data | Implemented; weight/cardio/measurement canonical conversion verified in browser fixtures |
| REQ-19 Search recovery | T4.2 | Stale/duplicate/offline/error/no-match controlled cases | Verified locally: stale/no-match/network failure and barcode-zero scenarios pass |
| REQ-20 Editable AI draft | T4.2 | Fixture review/edit/remove/cancel before persistence | Verified locally with controlled AI draft edit/remove/save fixture; live calls out of scope |
| REQ-21 Persistent planning | T4.3 | Week drafts/checks survive reload, no duplicate logging | Verified locally: week draft/shopping persistence and idempotent apply pass |
| REQ-22 Device/backup guidance | T6.1 | Transfer, storage denial, stale backup, per-profile snooze | Implemented; storage denial and backup-age/snooze verified in RU/EN fixtures |
| REQ-23 First use | T3.1, T6.1 | Confirmed inputs, consistent name, useful first action | Verified locally: confirmed onboarding used in all browser scenarios |
| REQ-24 Quality/release evidence | T0.1–3, T6.2–3, T7.1–3 | Stable checks, compatibility rationale, tested/deployed SHA | Released and verified: source c0b755a, Pages c42e5be; evidence limits documented |

Detailed acceptance criteria in the audit remain binding unless this plan explicitly refines them. No audit requirement is rejected. Deferred sub-scope: paid/live AI testing, new integrations, and live sync. Real camera/Drive/device verification remains a release evidence dependency when those capabilities are claimed as verified, not a reason to silently remove existing functionality.

## Baseline acceptance and execution rules

- BASE-01: RU/EN end to end, persisted locale, locale-aware inputs and dates; no raw keys or mixed system copy.
- BASE-02: 320/390/768/1440 layouts; no unintended overflow, detached actions, hidden required controls, or keyboard-obscured save actions.
- BASE-03: contrast including profile accents, labelled controls, focus management, keyboard paths, and loading/empty/error/populated states.
- BASE-04: retain previous-version data, profile separation, complete existing feature set, and offline core flows.
- BASE-05: no new recurring service/API costs or secret collection in chat.
- BASE-06: distinguish implemented/verified/released; verify deployed revision and main scenarios before declaring release complete.

Use repository commands as applicable: `npm test`, `npm run build`, `npm run lint`, `npm run check:spec`, `npm run check:contrast`, `npm run e2e`; use coverage when domain changes require it. Inspect scripts before running because some update reports. A passing command alone does not certify visual or functional quality. Run tests proportionate to each change, then the final complete gate; avoid repetitive broad checks without a reason.

Once approved, work through the whole scope autonomously and keep this Current State and task evidence current. Ask only for material scope/design changes, new spending, or consequential actions outside authorization. The selected direction does not require another design-choice question. Ask for release facts only if they cannot be established from repository/hosting evidence.
