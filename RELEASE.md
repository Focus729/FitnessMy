# Release procedure

## Planned hosting transition (2026-11-02)

Pavel approved the complete [Cloudflare migration plan](docs/CLOUDFLARE_MIGRATION_PLAN.md) on 2026-11-02. The procedures below describe the currently deployed site, not the future target. Pages remains active until old-origin data is exported, imported and verified on the new origin. The new release procedure will use Workers Static Assets + D1 at root `/`, isolated staging/production resources and a fail-closed checked-artifact deploy command with Git auto-deploy disabled. Preserve the source repository and deployment history.

CF-M1 preflight: Wrangler 4.156.1 supports the existing Node 22 runtime. Existing OAuth grants Workers and D1 access, but not Access administration. Dashboard confirms Workers Free active and no payment method. Existing workers.dev subdomain is `hpavel729`. A new empty `fitnessmy-staging` D1 database was created; no production FitnessMy resource exists yet. `wrangler.jsonc` targets staging only. A remote `SELECT 1` succeeded. Local workerd fails with a Windows access violation; runtime integration tests must use isolated staging until that environment issue is resolved. Do not relax acceptance checks because of this issue.

Authentication amendment (approved 2026-11-02): use GitHub OAuth for Focus729 only, with no extra scopes, PKCE/state and first-party sessions. Do not enroll in Access/Zero Trust or provide a card. GitHub application 3985550 uses the exact staging callback; Client ID is public configuration, Client Secret is stored only in Worker secrets. On 2026-11-03 migration 0001_identity.sql was applied to staging successfully. Production remains unchanged. Staging was published on 2026-11-03 from 007d51654273e1953ec7a6cba42ec0da152477ee at https://fitnessmy-staging.hpavel729.workers.dev, version 7bbbff56-234f-4d1d-b8be-d285ee2bfae1. Live build-info matches; missing-secret API/auth denial is verified. Real login is pending GitHub sudo confirmation and secret transfer after browser runtime recovery.

Staging prototype checks: `npm run test:backend`, `npm run check:backend`, targeted lint, existing unit baseline, root `npm run build`, `e2e/auth-cache.spec.ts`, and `node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .wrangler/dry-run`. These do not constitute the future production release gate. Commit checked task files on master, build with APP_BASE_PATH=/ and BUILD_REVISION equal to that SHA, then explicitly deploy the staging-only wrangler.jsonc. No automatic deploy trigger has been added. Until GITHUB_CLIENT_SECRET is configured, API routes fail closed. Verify deployed version/SHA, anonymous denial, real OAuth login/logout and D1 readiness before declaring CF-M1 complete. `.dev.vars` and Wrangler state are ignored; never publish provider tokens, private email or secrets.

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
