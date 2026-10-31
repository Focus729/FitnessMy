# Direction B verification — 2026-10-31

The implementation covers the approved REQ-01–24 scope in PLAN.md. This record distinguishes local verification from publication; the source revision and final deployed identity are recorded in PLAN.md and the release artifact's build-info.json.

## Local acceptance

- `npm run check:release`: passed lint, 215 unit/component/repository tests, 48 contrast pairs, specification checks, 96.69% domain coverage, 184/400 KB initial gzip budget, 25 browser scenarios and the /FitnessMy/ production build.
- `docs/audit/verify-production.mjs`: RU phone/light and EN desktop/dark passed offline reload, food correction, workout/timer reload, explicit application update retaining sets, canonical weight conversion, unchanged data on unit switch, backup replacement and two-profile isolation. No page errors or failed assets.
- `docs/audit/verify-editors.mjs`: RU/EN measurement entry stores 40 inches as 101.6 cm; stale-backup reminder and profile-specific snooze survive reload. Routine and measurement screenshots were inspected; visible routine field labels were added after inspection.
- 64 main-screen captures at 320/390/768/1440 plus 16 profile-B captures cover both languages/themes, empty/populated states and sparse body history. Additional editor/error captures are in redesign/. Historical audit images remain unchanged.
- Simulated storage failure tests retain product, recipe, habit and quick-food drafts, allow retry and prevent duplicate records. Repository tests cover atomic restore, simultaneous starts, routine-day advancement, set aggregation rollback and planned-workout Undo.
- Calendar edits, move/skip, profile-scoped tab/date return, menu/shopping persistence, repeat portion Undo and orphaned meal slots have browser regressions.

## Evidence limits and retained risks

Physical phone keyboard, installed-device camera behavior, live Google Drive and paid AI providers were not tested. No human task-speed result is claimed. Browser offline/update tests are not physical-device installation tests. Current habit statistics explicitly disclose unavailable historical schedule information.

The final dependency audit reports 39 affected packages, including build/test dependencies. Exposure and the compatible router patch are documented in SECURITY_REVIEW.md; this is not a clean-security-audit claim. No paid service or new runtime framework was added.

One full check was interrupted by system memory exhaustion; jsdom workers are bounded to one and subsequent full checks passed. Two new browser fixtures initially used incomplete/ambiguous selectors; corrected fixtures passed without relaxing assertions. The JSX copy checker now parses JSX syntax, avoiding a false report for Promise<void>.

## Published revision

- Source: c0b755a48e47e652d0780fa2b39ab5aaac016312 on master.
- Artifact: c42e5be7e7ad8806b98843b9b6927441191a87f0 on gh-pages.
- Workflow: https://github.com/Focus729/FitnessMy/actions/runs/41232853527 — success.
- URL: https://focus729.github.io/FitnessMy/.
- Live RU/EN fixtures confirmed the expected source marker, exactly one correctly scoped manifest link, offline food correction, workout resume, backup replacement, two-profile isolation and unchanged canonical units; zero page/asset errors. See redesign/live/production-path-results.json.

The full clean-commit gate ran on d29cc1f. The following c0b755a commit removes an obsolete duplicate manifest link; affected TypeScript/build/PWA/offline/update/backup/profile checks passed afterward. Its application JS/CSS assets are identical. The update-prompt test was local; live checks did not trigger another deployment. Final documentation commits do not change the published application artifact.
