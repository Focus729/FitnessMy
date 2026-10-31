# Release procedure

## Established target

- Repository: public `Focus729/FitnessMy`, source branch `master`.
- Hosting: existing GitHub Pages deployment from `gh-pages`; no new service or paid resource.
- Production: https://focus729.github.io/FitnessMy/ (HTTP 200, title Lenta, verified 2026-10-30).
- Existing manifest: `start_url` and `scope` are `/FitnessMy/`; preserve this installed-app identity.
- Previous deployment retained for recovery: GitHub Actions run 31310796231, gh-pages revision `abbcc35e2c19b7abc9840b8368760268a8b1edfd`. The current verified redesign is recorded below.

## Local and production builds

`npm run build` builds for `/` by default. Set `APP_BASE_PATH=/FitnessMy/` for the established Pages target. `BUILD_REVISION` identifies the source commit in `build-info.json`; omitted values produce `local-unreleased`, which must never be represented as a verified production revision. No secret is required to build the core app. Optional integration settings retain their existing configuration.

Use `npm run check:release` for the sequential local gate: lint, tests, contrast, specification/coverage/bundle checks, browser scenarios, then a production-path build. Set `PLAYWRIGHT_CHROMIUM_PATH` to the installed Chrome executable when Playwright's bundled browser is unavailable. Any failing command stops the gate before the final production build. The gate itself never pushes or deploys.

## Publication gates

1. Complete PLAN.md acceptance gaps. Review dependency exposure in `docs/audit/SECURITY_REVIEW.md` and any unresolved test failures.
2. Review the complete diff and exclude private data, generated traces, real backups, credentials and unrelated files. Keep synthetic fixtures only.
3. Commit the checked source to master with an English message; do not force push. Run the release gate for that clean commit, with `BUILD_REVISION` equal to its full SHA.
4. Verify `/FitnessMy/` launch, manifest/scope, asset paths, offline reload and update prompt on the built artifact before publishing.
5. Publish only that artifact to the established gh-pages history using the established repository credentials; preserve `.nojekyll` and the fallback page. Do not replace hosting configuration or rewrite branch history. A push to gh-pages may deploy immediately, so no unverified intermediate artifacts belong there.
6. Observe the Pages workflow, then fetch `build-info.json` and verify the source SHA. Check RU/EN launch, profile isolation, food correction, workout resume, offline reload and backup round trip using disposable synthetic profiles.

## Recovery

Keep the previous deployed artifact revision and a sanitized downloadable data backup before replacing it. Reverting the deployment must be a new commit restoring known assets, never a forced branch reset. Confirm that the previous app can read the current database schema before rollback; otherwise retain the current app and restore through its validated backup flow. An asset rollback does not undo IndexedDB writes. Never delete user databases or production records as a recovery shortcut.

## Current state

Published and live-verified on 2026-10-31. Source c0b755a48e47e652d0780fa2b39ab5aaac016312; gh-pages c42e5be7e7ad8806b98843b9b6927441191a87f0; successful Pages run 41232853527. The full clean-source gate passed on d29cc1f; the subsequent single-manifest-link correction passed the affected build/PWA checks. Live RU/EN launch, manifest identity, offline food correction, workout resume, unit preservation, backup replacement and profile isolation passed with no page or asset errors. Explicit update preservation was verified locally, without causing a redundant second production deployment.

The previous deployed artifact abbcc35e2c19b7abc9840b8368760268a8b1edfd remains in branch history. Physical-device installation/keyboard/camera, live Drive and human task-speed measurements remain unverified. See PLAN.md and docs/audit/REDESIGN_VERIFICATION.md for evidence and retained risks.
