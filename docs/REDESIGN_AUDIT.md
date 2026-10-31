# FitnessMy / Lenta: UX audit and redesign planning brief

Date: 2026-10-29. Status: discovery complete. Subsequent decision: Pavel selected direction B on 2026-10-29; the proposed full implementation plan is in [PLAN.md](../PLAN.md), awaiting approval. Recommendations below are the original audit record; DESIGN.md and PLAN.md contain the current decisions.

Repository: https://github.com/Focus729/FitnessMy (public), branch `master`, inspected commit `6ec0ff0a514ceabcc6e71250d6c4c403e0d415e7`, application version `0.7.0`.

## Recommendation

Keep the offline-first architecture and the calm visual identity. Prioritize reliable editing, correct data entry, safe restore, and direct navigation before expanding features. Then introduce a real desktop layout and simplify the mobile action hierarchy. A rewrite, backend, paid API, or new hosting service is not justified by this audit.

The product already has substantial capability. The largest gap is between available features and how easily users can discover, correct, and trust their daily records.

## Scope and evidence

This is an independent audit of the current code and local rendered application, not a production certification or a usability study with real participants. Existing `README.md`, `TZ.md`, and `AUDIT.md` were compared with current implementation. In particular, the early sections of `AUDIT.md` describe pre-0.7 gaps; workout editing, planning, quit habits, routine editing, and a reusable Sheet now exist and must be preserved.

Evidence labels used below:

- **C**: confirmed implementation behavior or limitation from inspected source.
- **V**: also observed in local screenshots or UI interactions.
- **H**: proposed improvement; its benefit requires user validation.

All source paths below are relative to the repository at the inspected commit. Screenshot evidence is in [audit/](audit/). The capture script uses disposable browser contexts with synthetic data; no personal production records were used.

### Verification completed

- Production build passed (`npm run build`); Vite reported a large chunk warning for exercise seed data. This is not proof of a user-visible performance problem.
- Unit/integration suite: **198 tests passed in 13 files**.
- Existing palette contrast script passed its tested light/dark pairs. It does not cover every rendered state or profile tint.
- Local UI capture: onboarding, Today, Food, Gym, Body, Progress, Settings, and a quick calorie entry in four combinations: Russian/light and English/dark at **390×844** and **1440×1000**. The successful capture run recorded no page errors. See [capture-results.json](audit/capture-results.json).
- Screenshots were reviewed for the main dashboard, populated food diary, gym navigation, body screen, settings, and progress. Capturing every screen is not equivalent to fully testing every control.
- Existing browser-suite results and remaining limitations are recorded in [VERIFICATION.md](audit/VERIFICATION.md).
- `npm ci --ignore-scripts` reported 20 dependency advisories (4 low, 7 moderate, 6 high, 3 critical). These are installation output, not a validated production exploit assessment. Triage dependency paths and runtime reachability before choosing upgrades; no dependencies were changed.

Not verified: real iOS/Android keyboards and installed-PWA behavior, production deployment revision, camera permission/recovery, external food services, paid AI requests, Google Drive authorization/restore, long-term offline updates, real-user task timing, and assistive-technology behavior. Loading/network-error designs below are requirements, not claims that those states passed.

## Product brief

The existing specification targets two adults with different goals, a shared laptop, and personal phones. Profiles have separate local databases. Frequent scenarios are meal logging, set logging, weight entry, habit tracking, and checking today's balance. Desktop scenarios are weekly menu planning and monthly progress review (`TZ.md`, section 3).

Keep: local-first data, Russian/English, light/dark themes, phone/desktop layouts, manual backup, optional integrations, a quiet optional game layer, and low operating cost. Keep existing records and versioned migrations. Google Drive currently provides backup, not continuous synchronization.

Sensitive data includes body measurements, food logs, routines, sleep, habits, and optional provider credentials. The existing PIN is described as protection from accidental opening, not encryption. Do not redesign it as an implied security guarantee.

Confirmed scope for this request: repository investigation, usability/interface findings, improvement proposals, and planning material. Full implementation, publication, new services, spending, and irreversible data changes are not approved.

## Prioritized improvement backlog

P0 = data integrity or credential exposure; P1 = frequent task/correctness; P2 = clarity and efficiency. Effort S/M/L is relative scope, not a time or budget commitment. Each REQ is a candidate for the implementation plan, not approved work.

### REQ-01 — Safe backup restore (P0, L; C)

**Evidence:** `src/data/backup.ts:90` validates only format/version; `applyImport` clears and writes tables sequentially without a transaction spanning the entire import. Empty incoming blobs also do not clear existing blobs in replace mode. `Settings.tsx`, `ImportSheet`, applies replacement immediately when a file is chosen in that mode.

**Impact:** malformed data or a write failure can leave a partially replaced profile. The user cannot review a single complete replacement diff before committing.

**Proposal:** validate the complete payload, schema version, identifiers, dates, numeric ranges, and references before mutation; show profile name and additions/updates/deletions; provide one explicit Apply step; use an atomic transaction and recoverable pre-import snapshot.

**Acceptance:** malformed input and an injected failure midway through import leave every original record unchanged; successful replacement matches the backup including an empty blob collection; merge/replace outcomes are clearly distinguished; restoring one profile never alters another.

### REQ-02 — Exclude credentials from ordinary backups (P0, M; C)

**Evidence:** `src/data/db/schema.ts:137` includes `settings` in exportable tables; `exportBackup` serializes those rows without filtering. `Settings.ai.apiKey` is part of the settings model/defaults.

**Impact:** if AI is configured, a normal JSON backup can contain the API key. The same export object may be uploaded as a Drive backup. No actual user key was read during this audit.

**Proposal:** redact provider credentials by default; show a clear export contents summary; request reconnection after restore. Decide separately whether an encrypted, explicitly opted-in credentials export is useful.

**Acceptance:** a fixture containing a fake secret never exposes that string in the standard exported file; restored data remains usable without credentials; credential omission does not disable manual logging.

### REQ-03 — Correct decimal entry and numeric validation (P1, M; C)

**Evidence:** `src/design-system/primitives.tsx:134` converts every keystroke to `Number(raw)` and renders it back as a string. Intermediate input such as `80,` becomes `80`, removing the decimal separator before the next digit. PIN fields also reuse this numeric abstraction.

**Proposal:** retain a text draft until commit/blur; parse locale-aware decimal input; validate bounds and show inline errors. Use a separate masked string PIN input preserving leading zeroes.

**Acceptance:** typing and pasting `80,5` and `80.5` both save 80.5; trailing separators do not disappear during typing; invalid values cannot silently become a different number; PIN `012345` retains all six digits. Test real phone keyboards before release.

### REQ-04 — Edit an existing food record (P1, M; C/V)

**Evidence:** `src/screens/Food.tsx`, `Diary`, renders record text and a delete action with no editor. [Populated diary](audit/ru-390-food-populated.png) also shows a quick entry with no visible name when the optional name is blank.

**Proposal:** tap a diary row to edit amount, meal, date/time, and applicable nutrition values; add a safe fallback name such as “Quick entry”; offer duplicate/move actions in a secondary menu.

**Acceptance:** changing 100 g to 150 g updates diary and Today totals exactly once; moving dinner to lunch retains the record identity; cancel changes nothing; quick records never appear as an unnamed row.

### REQ-05 — Honor the selected meal and reset stale form state (P1, M; C)

**Evidence:** `AddFoodSheet.tsx:56` initializes `slotId` from a prop only once, while Food keeps the sheet mounted and changes `initialSlotId`. The initial sheet state can therefore retain breakfast after the user chooses a different meal. `GramsSheet` resets by product name rather than stable identity.

**Proposal:** initialize each new entry session from the invoked meal; keep date/meal visible throughout entry; reset amount using record identity and deliberate draft policy. For the global Add action, optionally suggest the current meal while allowing an obvious override.

**Acceptance:** first opening Lunch saves into Lunch; opening Dinner afterward does not retain Lunch; two products with the same name do not share unintended amount state; a reopened draft follows a documented resume/discard policy.

### REQ-06 — Restore saved sleep and check-in values into forms (P1, M; C)

**Evidence:** `Body.tsx:193` reads an existing sleep record but initializes inputs to 23:00/07:00/quality 3. `CheckinSection` initializes scales to 3 and steps/note to blank while updating an existing record on Save.

**Impact:** returning to the screen and pressing Save can overwrite real values with defaults.

**Proposal:** hydrate forms from the selected day's record; show saved state; allow date selection and history editing; protect a dirty draft from late query results.

**Acceptance:** save custom sleep and check-in values, navigate away, return, and see the exact saved values; saving an unchanged form is harmless; switching date never copies a previous date's values silently.

### REQ-07 — Make profile switching available (P1, M; C)

**Evidence:** AppShell displays the profile name as a span. `profiles.switch` exists only in translation dictionaries; `leave()` is used for deleting a profile and backing out of PIN entry, not a normal in-app switch action.

**Proposal:** a persistent profile button with name/avatar, Switch profile, and Settings. Keep the active profile visible during logging and restore.

**Acceptance:** two existing profiles can be switched without reloading or deleting anything; protected profiles require PIN; entries and drafts never leak between profiles; switch controls are keyboard accessible.

### REQ-08 — Deliver a desktop layout (P1, L; C/V/H)

**Evidence:** `AppShell.tsx:70` and navigation use `max-w-lg`; [desktop Today](audit/ru-1440-today.png) leaves most width unused. Today’s fixed `right-4` Add button is detached from the centered content. Sheet panels use viewport width without a desktop content constraint.

**Proposal:** a desktop sidebar and 2-column overview, with a full-width workspace for weekly planning/progress; keep phone bottom navigation. Align primary actions to their content. Use bounded dialogs or side panels for desktop editors.

**Acceptance:** at 1440 px, planning uses a readable week grid and progress supports comparison side by side; at 390 px all daily tasks remain reachable with one hand; at 320 px there is no unintended page overflow; Add remains adjacent to the relevant workspace.

### REQ-09 — Simplify navigation and retain context (P1, M; C/V/H)

**Evidence:** settings appears only when `isToday` in AppShell. Food/Gym/Body/Progress use local section state, resetting to the first section on remount. [English Gym](audit/en-390-gym.png) clips the last tab behind horizontal scrolling.

**Proposal:** persistent Settings access; route/query state for subviews and selected date; fewer top-level segmented choices with an explicit More entry or clearly indicated scroll affordance.

**Acceptance:** browser Back returns to the previous subview/date; leaving Plan and returning restores Plan; settings is reachable from every main screen; all section names remain discoverable in RU/EN at 320–390 px.

### REQ-10 — Make Today actions direct (P1, M; C/H)

**Evidence:** Today routes sleep and steps to `/body`, whose default section is Weight; the upcoming workout action routes to `/gym`, whose default section is Workouts, without selecting the displayed plan.

**Proposal:** direct contextual links/sheets for sleep, steps, weight, and the specific planned workout. Retain the unfinished-workout resume path. Promote the next relevant action instead of exposing an unexplained plus as the only main shortcut.

**Acceptance:** tapping Sleep opens that day's sleep entry; tapping the displayed workout starts or previews that exact plan; no duplicate workout is created by repeated taps; selected profile/date are explicit.

### REQ-11 — Make repeated meal logging genuinely fast (P2, M; C/H)

**Evidence:** the Frequent tab opens GramsSheet before saving. Its comment claims one-tap insertion, while the existing browser test explicitly clicks Save. A new profile sees an empty Frequent tab.

**Proposal:** an explicit “Repeat last portion” action with Undo and a separate edit-portion action; show Search/Create shortcuts in the initial empty state; consider multi-item meal entry before closing the sheet.

**Acceptance:** returning users can repeat a known portion in two taps from Today; new users can reach Search directly; chosen amount and meal are visible; duplicate taps cannot create unintended duplicate records. Measure the existing 5-second goal with people, not only automated click timing.

### REQ-12 — Preserve and validate meal-slot changes (P1, M; C)

**Evidence:** Settings deletes a slot by filtering `mealSlots`, while Diary renders only configured slots; records with an old slot ID remain in totals but lack a rendered section. Default-slot labels always prefer translations, masking user renames.

**Proposal:** archive used slots or migrate records with a clear destination; show legacy/uncategorized entries; separate default label keys from custom names.

**Acceptance:** removing a used slot never hides its records; displayed rows reconcile with totals; custom names survive navigation, reload, and language switching.

### REQ-13 — Use readable habits and correct scheduled statistics (P1, M; C/H)

**Evidence:** Today shows only `habit.icon` plus completion state; the name is only an aria-label. Progress uses `activeHabits.length` as scheduled count for every historical day instead of each habit's schedule. Today also treats displayed habits through a generic toggle, while quit habits have separate semantics elsewhere.

**Proposal:** show a short visible name and target progress; distinguish build/quit actions; calculate statistics from the applicable schedule and historical state.

**Acceptance:** identical emoji habits are distinguishable; a Monday-only habit does not count as missed on Tuesday; quit-habit actions never silently behave like a daily build-habit checkbox; corrections update the correct day.

### REQ-14 — Make progress understandable with sparse data (P2, M; C/V/H)

**Evidence:** [empty Progress](audit/ru-390-progress.png) shows a mostly empty calorie chart and heatmap. KcalChart tests array length, although the supplied 60 date rows can all have null kcal. Y-axis labels are visually clipped in the captured phone view.

**Proposal:** count valid observations, distinguish zero from missing, explain how many records are needed, add a period selector and a short factual summary with a relevant logging action. Reserve chart margins for full labels.

**Acceptance:** no-data, one-point, partial-week, and normal histories are readable in both languages/themes; zeros remain actual zeros; axes are fully visible; every summary shows its period and data coverage.

### REQ-15 — Fix partial-week nutrition scoring (P1, M; C)

**Evidence:** Food’s `NutritionIndexSheet` requests dates from startOfWeek to the selected day, but multiplies targets by seven for any weekly view.

**Proposal:** explicitly choose either a complete calendar week or week-to-date; scale targets to the selected period and disclose incomplete logging.

**Acceptance:** Monday's week-to-date score uses one day's denominator; a complete week uses seven; Sunday/Monday week settings and missing days have deterministic tested behavior.

### REQ-16 — Consistent unsaved-change and failure handling (P1, M; C)

**Evidence:** Sheet supports `dirty`, but current callers passing it are limited to workout detail, plan, and routine editing. Food, recipe, and habit workflows do not uniformly opt in. Some asynchronous save callbacks close their UI before the parent save completes.

**Proposal:** a shared draft/save contract, pending indicator, prevention of double submission, inline retry, and consistent close protection; preserve draft on write failure.

**Acceptance:** edit a recipe, food form, and habit then close via button/backdrop/Esc; each retains or explicitly discards changes; simulated quota/write errors keep the draft; success is shown only after persistence.

### REQ-17 — Accessible stacked dialogs and predictable deletion (P1, M; C/H)

**Evidence:** Sheet declares `aria-modal` but has no focus trap, focus restoration, or explicit dialog title binding. Each open sheet installs its own document Esc listener. SwipeToDelete has a keyboard-only fallback, but no always-visible mouse action; dishes/recipes delete immediately.

**Proposal:** manage a modal stack, constrain focus to the top dialog, restore focus to the trigger, label dialogs, and provide a visible overflow menu. Apply one recoverable deletion pattern consistently.

**Acceptance:** Tab never reaches background controls; Esc closes only the top dialog; focus returns to its trigger; pointer, touch, and keyboard users can discover deletion and Undo; cancelled touch gestures do not delete.

### REQ-18 — Make unit settings truthful (P1, M; C)

**Evidence:** Settings offers imperial units, but searches for `settings.units` find the setting control only; conversion helpers in `lib/format.ts` are not wired into the inspected logging screens, which label values kg/cm.

**Proposal:** either implement conversion end to end or temporarily remove the unsupported option with an explicit product decision. Keep canonical storage units stable.

**Acceptance:** changing units updates displayed weight, measurements, and applicable inputs consistently; round trips do not alter stored measurements; imported metric data is displayed correctly in either mode.

### REQ-19 — Improve search and external-service recovery (P2, M; C/H)

**Evidence:** SearchTab caches online results into local foods and also renders `onlineResults` beneath local results; it does not associate displayed external results with a query revision. Barcode lookup catches network failures and falls through to “not found”.

**Proposal:** deduplicate by stable source ID; discard stale responses; separate offline/error/no-match states; retain manual creation and explicit network requests.

**Acceptance:** the same product appears once; results from an old query never replace a newer search; denied camera/network failure/no match each have clear recovery; local search works offline.

### REQ-20 — Make AI results editable before insertion (P1, M; C)

**Evidence:** `AddFoodSheet.tsx`, `PhotoTab`, renders inferred names, grams, and calories as spans with one Add button despite a comment promising an editable draft.

**Proposal:** editable candidate rows with amount/name/nutrition correction, removal, confidence/source explanation, and an explicit save step. Keep AI off by default and optional.

**Acceptance:** users can correct or remove every proposed item before any diary write; cancel writes nothing; failed recognition preserves the manual path; no API spending is introduced by this redesign without a separate decision.

### REQ-21 — Make meal planning a persistent workspace (P2, L; C/H)

**Evidence:** PlannerPanel initializes selection, generated plan, and shopping check state in component-local state. Its initial candidate pool depends on user dishes/recipes, adding setup cost before a first plan.

**Proposal:** save draft plans and shopping checks, add a week picker, a guided first recipe/dish path, and a side-by-side desktop menu/shopping view. Review current repository persistence methods before adding schema changes.

**Acceptance:** navigating away/reloading preserves a saved plan and checks; users can recover a draft; logging a planned meal is explicit and cannot happen twice accidentally; a new user sees the next setup step.

### REQ-22 — Explain storage status and device transfer (P2, M; C/H)

**Evidence:** backups/Drive controls are deep in the long Settings page; profile databases are local. Two personal phones in the product audience can easily be mistaken for automatically synchronized devices.

**Proposal:** a compact “Data on this device” card with last backup date, restore/transfer path, and accurate persistence status. Keep the distinction between backup and live sync explicit. Consider profile-specific reminder snoozing instead of the current shared localStorage key.

**Acceptance:** a user can identify where data lives and transfer a synthetic profile through export/import; offline, stale-backup, storage-denied, and Drive-disconnected states have clear actions; no unsupported durability promise is displayed.

### REQ-23 — Shorten and clarify first use (P2, M; C/H)

**Evidence:** profile creation is followed by six onboarding steps and a calculation screen. Demographic defaults are prefilled; the name is asked through separate profile/onboarding state. Frequent foods and workout templates are not immediately actionable from empty overview states.

**Proposal:** retain essential calculation inputs with explicit confirmation, explain why they are needed, reuse the chosen name, defer optional setup, and end with “Log a meal / Start a workout / Record weight”. Offer first-use help locally, without an account.

**Acceptance:** no silently accepted demographic default is presented as verified personal data; name remains consistent; first meaningful record can be created without configuring AI/Drive; all existing goal choices remain available.

### REQ-24 — Strengthen release evidence and maintainability (P1, M; C/H)

**Evidence:** the 198 tests mainly cover domain behavior; seven existing browser cases use Russian Pixel 7 settings. Screens such as Food, Body, and Settings contain multiple large workflows. Dependency install reports advisories; the old audit is historical evidence, not today's release report.

**Proposal:** focused regression cases for REQ-01–07, 12, 15, 18; a RU/EN × phone/desktop × light/dark visual matrix; offline persistence and migration fixtures; triage current dependencies against official support information before any update. Split feature components during related changes, not as an isolated rewrite.

**Acceptance:** a release report names the tested commit, exact results, known gaps, and deployed revision; realistic backup/migration fixtures pass; unresolved critical data issues block release; package upgrades have compatibility evidence and do not automatically change major versions.

## Proposed sequence

| Phase | Candidate scope | Exit gate |
|---|---|---|
| 1. Trust and correction | REQ-01–07, 12, 15, 18 | Atomic recovery, safe export, correct numeric input, editable daily records, isolated profiles |
| 2. Navigation and layout | REQ-08–10, 13, 16–17 | Approved visual direction; phone and desktop journeys work in RU/EN |
| 3. Daily efficiency | REQ-11, 14, 19, 21–23 | Empty/populated/error/offline states verified; repeated daily tasks measured |
| 4. Optional AI repair | REQ-20 | Editable preview with no writes before confirmation; provider testing only if enabled/authorized |
| Continuous | REQ-24 | Regression evidence accompanies each coherent increment |

Do not implement phases as a broad rewrite. Establish behavior tests first for data-sensitive changes; preserve suitable React/TypeScript/Dexie conventions and supported working versions. All 24 items remain candidates until the plan records accepted/deferred status explicitly.

## Decisions to resolve when preparing the implementation plan

1. Is the product still for two adults, or becoming a public multi-user app? Recommendation: retain the current audience for this iteration.
2. Is real-time cross-device sync required, or is reliable manual/Drive transfer enough? Recommendation: repair backup/restore first; sync needs a separate conflict/privacy/cost design.
3. Choose visual direction A or B in [DESIGN.md](../DESIGN.md). Recommendation: A with B's focused active-workout screen.
4. Is imperial entry genuinely required? Recommendation: implement only if it is part of actual use, otherwise remove the misleading setting until supported.
5. Confirm whether optional AI belongs in the next release. Recommendation: keep it off and defer paid-provider validation unless it is used.

Next step: use [PLAN.md](../PLAN.md) to select a coherent scope, confirm the visual direction, and obtain one plan approval before implementation. The audit does not imply approval of all suggested features.
