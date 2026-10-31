# Release procedure

## Established target

- Repository: public `Focus729/FitnessMy`, source branch `master`.
- Hosting: existing GitHub Pages deployment from `gh-pages`; no new service or paid resource.
- Production: https://focus729.github.io/FitnessMy/ (HTTP 200, title Lenta, verified 2026-10-30).
- Existing manifest: `start_url` and `scope` are `/FitnessMy/`; preserve this installed-app identity.
- Last inspected deployment: GitHub Actions run 31310796231, gh-pages revision `abbcc35e2c19b7abc9840b8368760268a8b1edfd`. The redesign has not been deployed.

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

Local implementation only. No redesign commit, push or deployment. Local acceptance and production-path/offline/update checks passed. The clean-commit gate, publication and deployed verification remain outstanding. Physical device installation, camera and live Drive are unverified and must not be claimed as tested.
