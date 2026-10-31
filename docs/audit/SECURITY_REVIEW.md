# Dependency exposure review — 2026-10-30

The initial machine-readable report is `dependency-audit.json`: 20 affected packages (3 critical, 6 high, 7 moderate, 4 low). Package counts include transitive propagation and are not counts of independently exploitable application defects. No clean-audit claim is made.

The release-time refresh on 2026-10-31 is `dependency-audit-final.json`: 39 affected packages (3 critical, 6 high, 27 moderate, 3 low). The newly listed paths are development tooling (ESLint, coverage and Workbox build dependencies), principally propagation of the newly reviewed [glob cancellation advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and [minimatch pattern amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). Those paths process trusted local build/lint patterns here and are absent from the browser application. They remain maintenance risks; this release does not claim to fix them or accept untrusted build patterns. The increase reflects the refreshed advisory database, not newly installed package families.

## Targeted correction

React Router DOM 6.30.4 was upgraded to **6.30.6**, together with its declared router dependencies. The npm registry metadata for 6.30.6 requires Node >=14 and React/React DOM >=16.8, compatible with this project's React 18.3.1. The lockfile also reconciled its stale root version 0.6.0 with package.json's existing 0.7.0. No other package family was upgraded.

The reviewed [open-redirect advisory](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2) lists 6.30.6 as the patched 6.x version. This correction does **not** resolve all router advisories: the [backslash navigation issue](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and [SSR hydration issue](https://github.com/advisories/GHSA-337j-9hxr-rhxg) list 7.18.0 as patched. The current app uses HashRouter without server-side rendering; inspected navigation destinations are fixed local paths or values appended after fixed local route prefixes. No raw external user-supplied redirect target or SSR hydration path was found. This is an exposure assessment, not a claim that the installed dependency is patched for those issues. Reassess before introducing redirects, SSR, arbitrary navigation destinations or a router major-version migration.

## Build/test-only advisories

| Dependency path/group | Exposure in this project | Current action |
|---|---|---|
| vitest → tinypool / mocker, coverage-v8 | Test runner and optional UI server; absent from production application dependency graph | Use one-shot tests; do not expose a test UI/API. Major runner migration remains separate compatibility work. |
| vite → esbuild / launch-editor | Development server; static Pages has no Vite server | Bind local previews to loopback, stop unused development servers, never expose them publicly. A supported toolchain migration remains required maintenance. |
| vite-plugin-pwa → workbox-build, node-resolve, deepmerge, serialize-javascript | Build-time PWA generation | Trusted local source/asset inputs only; do not accept untrusted build configuration. |
| brace-expansion, fast-uri, js-yaml, nanoid, postcss-selector-parser, source-map-js | Build/lint/transitive processing paths in the audit report | Retain exact lockfile, no blind major audit fix; assess compatible replacements before changing the toolchain. |

Remaining advisories are recorded rather than waived by passing tests. Static hosting avoids server execution of development tools, but does not make local development vulnerabilities disappear. Do not publish node_modules, source build servers, test traces or credentials. Re-run the audit before a release and review any new runtime path. Major upgrades are not part of this patch-level correction and must be supported by compatibility evidence under PLAN.md.

## Data boundaries

Ordinary and recovery exports redact API credentials and PIN hashes. Restore validates structure/references before atomic writes; failure to create recovery data blocks replacement. Test fixtures use synthetic keys and profiles. AI test requests are intercepted locally; no live paid provider calls or personal photos were used.

Release status and remaining functional gates are recorded in PLAN.md and RELEASE.md. This report is not a penetration test or a guarantee of security.
