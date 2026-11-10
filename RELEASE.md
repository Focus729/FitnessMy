# Release procedure

## Planned hosting transition (2026-11-02)

Pavel approved the complete [Cloudflare migration plan](docs/CLOUDFLARE_MIGRATION_PLAN.md) on 2026-11-02. The procedures below describe the currently deployed site, not the future target. Pages remains active until old-origin data is exported, imported and verified on the new origin. The new release procedure will use Workers Static Assets + D1 at root `/`, isolated staging/production resources and a fail-closed checked-artifact deploy command with Git auto-deploy disabled. Preserve the source repository and deployment history.

CF-M1 preflight: Wrangler 4.156.1 supports the existing Node 22 runtime. Existing OAuth grants Workers and D1 access, but not Access administration. Dashboard confirms Workers Free active and no payment method. Existing workers.dev subdomain is `hpavel729`. A new empty `fitnessmy-staging` D1 database was created; no production FitnessMy resource exists yet. `wrangler.jsonc` targets staging only. A remote `SELECT 1` succeeded. Local workerd fails with a Windows access violation; runtime integration tests must use isolated staging until that environment issue is resolved. Do not relax acceptance checks because of this issue.

Authentication amendment (approved 2026-11-02): use GitHub OAuth for Focus729 only, with no extra scopes, PKCE/state and first-party sessions. Do not enroll in Access/Zero Trust or provide a card. GitHub application 3985550 uses the exact staging callback; Client ID is public configuration, Client Secret is stored only in Worker secrets. On 2026-11-03 migration 0001_identity.sql was applied to staging successfully. Production remains unchanged. Staging was published on 2026-11-03 from 007d51654273e1953ec7a6cba42ec0da152477ee at https://fitnessmy-staging.hpavel729.workers.dev, version 7bbbff56-234f-4d1d-b8be-d285ee2bfae1. Live build-info matches; missing-secret API/auth denial is verified. Superseded by the verified auth fix below.

Staging prototype checks: `npm run test:backend`, `npm run check:backend`, targeted lint, existing unit baseline, root `npm run build`, `e2e/auth-cache.spec.ts`, and `node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .wrangler/dry-run`. These do not constitute the future production release gate. Commit checked task files on master, build with APP_BASE_PATH=/ and BUILD_REVISION equal to that SHA, then explicitly deploy the staging-only wrangler.jsonc. No automatic deploy trigger has been added. Until GITHUB_CLIENT_SECRET is configured, API routes fail closed. Verify deployed version/SHA, anonymous denial, real OAuth login/logout and D1 readiness before declaring CF-M1 complete. `.dev.vars` and Wrangler state are ignored; never publish provider tokens, private email or secrets.

Latest staging auth verification (2026-11-03): source 4f9e4ae3add2ad422b9e4c8b980941d5f50950ee, Worker e76cd4bb-2023-4b63-8af4-263b2830db41, matching live build-info. Encrypted secret provisioned. Real GitHub callback/session and protected D1 health passed; independent anonymous request returned 401. Workers rejects redirect:error before network I/O; manual redirects preserve the no-forwarding policy. Fourteen auth tests, backend type/lint and root PWA build passed. Pavel confirmed physical-phone login and database:ready on 2026-11-03. Live logout/expiry and phone installation/offline checks remain pending; this is not a completed migration.

### Staging account/profile increment

Build staging with `VITE_CLOUD_ENABLED=true`, `APP_BASE_PATH=/` and `BUILD_REVISION=<source SHA>`. The cloud account panel is opt-in at build time; existing Pages builds remain local-only. Migration `0002_profiles.sql` is additive and applied only to fitnessmy-staging. It adds owned profile metadata, not synchronized history. Check `npm run test:backend`, `npm run check:backend`, affected lint, existing unit suite, `e2e/cloud-account.spec.ts`, `e2e/auth-cache.spec.ts`, root PWA build and `scripts/test-d1-profiles.mjs`. The remote proof script is hard-bound to staging and cleans only its generated synthetic owner. Published source 295d65b59a026ce6081a1e2a25ce98e95edd78cf, Worker 05ed2951-e874-4094-a095-1a5aa65db6b9. Live marker matches and anonymous session/profile endpoints return 401. All 215 app tests, 21 backend tests, four affected browser scenarios, lint/type/build and real D1 concurrency proof passed. Live sign-out/session denial/relogin and authenticated empty profile list passed after browser access was restored on 2026-11-03. Do not link or upload local histories implicitly.

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

## Staging storage/progress increment — 2026-11-04

Source `a7327675e07b79c1c835fa1fc4daf7a5e82608ac`, Worker version `2ff116ed-1a14-42db-9008-2d896918ca88`; live build-info matches. The deployed frontend fixes transactional XP awards and monotonic achievement merging. Cloud storage/reference/attachment modules remain internal, with no automatic upload or sync HTTP routes enabled. Additive migrations 0004–0006 are applied to staging only. Original Pages production and personal data remain unchanged.

Gate: 222 app tests, 79 backend tests, backend/app types, affected lint, exact-source root PWA build, real staging D1 storage/reference/attachment/restart/cleanup proof, and five local browser scenarios passed. The same five scenarios passed against the deployed site using isolated disposable local browser profiles: workout completion/XP agreement/reload plus RU/EN account mocks and offline API/auth boundary. Independent anonymous session/profile requests returned 401. No paid service or new dependency was activated.

## Staging outbox foundation — 2026-11-04

Published source `6eb34d5b680d780bad6fe83000478efcbe5f1529`, Worker `5613143b-852e-4331-9fd1-fd54878bbbd9`. Exact-source root PWA build passed. Live build marker matches and anonymous protected endpoints return 401. Seven deployed workout/backup and RU/EN account/auth-cache scenarios passed in disposable contexts; account state tests use mocked API responses. Local evidence: 235 app tests, app types, affected lint and two native IndexedDB storage tests passed. No automatic profile linking or HTTP synchronization is enabled. Pages and personal histories remain unchanged.

Schema v3 is additive but older Dexie code declares version 2: do not roll frontend assets back blindly after a browser has upgraded. Prefer a forward fix retaining schema v3 and disabling capture. Database deletion is not a rollback procedure.

## Staging streak correction — 2026-11-05 verification record

Source d476b579ea06670f76708c982966526f79e3b901, Worker 752320d7-5011-4390-a627-dea89f3c1f83. Exact-source root PWA build, seven local and seven deployed workout/backup/RU-EN account/auth-cache scenarios passed. Live marker matches and anonymous protected requests return 401. Account-state scenarios use mocks; personal data was not linked. New catalog/acknowledgement/receive modules are subsequent local work, not part of this deployment.

## Staging catalog and guarded sync dispatch — 2026-11-10

Source 5e80ff97775a1e1b132a7cb07b25b005e7c473e2, Worker ad942a7a-c5e2-4db2-84c2-a2428449f76a. Verified the exact source marker, anonymous API denial and seven local plus seven deployed workout, backup and RU/EN account/auth-cache scenarios. Account-state tests use mocked responses. Migration 0008 is applied to staging and its XP rule passed the synthetic remote D1 checks. Keep CLOUD_SYNC_ENABLED absent until the authenticated sync gates in CLOUD_SYNC_PROTOCOL.md are met. The deployed account panel can sign in to staging. Personal migration and production activation are separate gates.
