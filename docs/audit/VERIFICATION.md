# Audit verification record

Date: 2026-10-29. Baseline commit: `6ec0ff0a514ceabcc6e71250d6c4c403e0d415e7`.

Application source, lockfile, and existing tests were not modified. Added artifacts are discovery documents, static concepts, screenshots, and audit helper scripts. No changes were committed, pushed, or deployed.

## Results

| Check | Actual result | Interpretation |
|---|---|---|
| `npm ci --ignore-scripts` | Installed; 20 reported advisories | Triage required; no exploitability assessment or automatic updates |
| `npm run build` | Passed | TypeScript and production bundle succeeded; seed chunk size warning |
| `npm test` | 198/198 passed, 13 files | Existing domain/migration coverage passes |
| `npm run check:contrast` | Tested base light/dark pairs passed | Does not cover both profile tints or all rendered states |
| `node docs/audit/capture.mjs` | Final run completed, four contexts, no recorded page errors | 28 viewport screenshots; main pages and quick calorie entry |
| `npm run e2e` initial attempt | Server build failed with process out-of-memory | Environment failure; not a proven app defect |
| `npm run e2e` using prebuilt preview | 4 passed, 3 failed | Full browser suite is NOT green; details below |
| `node docs/audit/probe.mjs` | Browser target crashed before first page | Decimal/sleep/meal findings remain code-based, not runtime-reproduced by this probe |

## Browser suite failures

1. Backup round trip: `browserContext.newPage: Target crashed` before the scenario could run.
2. Search/grams/frequent-food scenario: 60-second timeout while Playwright waited for the Search tab button to become stable. Root cause not isolated; do not assign this conclusively to application behavior or resource pressure.
3. Workout resume/finish: worker process exited with `Fatal process out of memory: Zone`; scenario did not complete.

Passed: rejecting a foreign backup file, quick calorie entry, closing the exercise picker, and exercise search/clear behavior. Failure diagnostics remain in the ignored local `test-results/` directory; this record preserves their outcome without treating them as product defects.

## Visual evidence

Capture combinations: RU/light and EN/dark at 390×844 and 1440×1000. Locale/theme combinations are deliberately paired, so RU/dark and EN/light were not independently captured. Each context visited Today, Food, Gym, Body, Progress, Settings, then recorded a synthetic 321 kcal quick entry.

Representative reviewed screenshots:

- [Phone overview](ru-390-today.png)
- [Desktop overview and detached Add button](ru-1440-today.png)
- [Populated diary with unnamed quick entry](ru-390-food-populated.png)
- [English phone gym navigation](en-390-gym.png)
- [English desktop body screen](en-1440-body.png)
- [Sparse progress charts](ru-390-progress.png)
- [Long settings form, first viewport](ru-390-settings.png)

The final capture uses viewport screenshots, not full-page screenshots. Initial capture attempts hit a screenshot protocol error and a navigation wait timeout; the later capture run completed. Real-device and production-PWA behavior remain unverified.

## Reproduction helpers

The capture and probe scripts use local Chrome at the explicit installed Windows path and a local Vite server on 127.0.0.1:5174. Start that server with `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174`. They use new isolated browser contexts and synthetic data.

The static design preview is a separate proposal, not a functional acceptance artifact. No release readiness claim is made by this audit.
