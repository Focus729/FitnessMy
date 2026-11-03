# Cross-device profile discovery

Date: 2026-11-02; continuation 2026-11-03. Status: Pavel approved the complete [implementation plan](CLOUDFLARE_MIGRATION_PLAN.md) and its amendment to GitHub login, with no card and free-only resources. CF-M1 is in progress. The completed redesign remains recorded in PLAN.md.

## Confirmed context

- Pavel wants to open the same personal profile from phone and PC.
- Existing profiles live in localStorage; each profile has a separate Dexie database. The local PIN is not server authentication or encryption.
- Google Drive currently stores backup snapshots, not synchronized records.
- Preserve existing history, direction B, Russian/English, phone/desktop layouts, and existing export/recovery behavior.
- No paid service is authorized.
- Cloudflare will host the frontend and backend; GitHub Pages will be retired only after verified data migration. Keep the GitHub source repository.
- Access is currently for Pavel alone. FitnessMy will use GitHub OAuth restricted to Focus729's immutable user ID. Cloudflare Zero Trust/Access is excluded because its onboarding requires payment details.

## Proposed requirements

| ID | Status | Requirement and observable acceptance |
| --- | --- | --- |
| SYNC-01 | Confirmed goal | The same signed-in identity opens the same profile on a fresh phone and PC browser. Verify with two independent browser contexts. |
| SYNC-02 | Proposed | Records created, edited or deleted on either device converge on the other without duplicates after synchronization. Cover workouts/sets, nutrition, body, habits, plans and settings. |
| SYNC-03 | Proposed | Preserve offline logging. Pending writes survive reload and retry; reconnecting synchronizes them without dropping records. First sign-in needs internet. |
| SYNC-04 | Proposed | Enforce ownership on the server; another account cannot read or mutate a profile even with a known profile ID. |
| SYNC-05 | Proposed | Link an existing local profile through a preview and recovery copy. Repeating migration does not duplicate records; existing cloud/local data is never silently replaced. |
| SYNC-06 | Proposed | Show pending, syncing, synchronized and failed states. Conflicting edits retain both versions until resolved; stale offline devices cannot resurrect deleted entries. |
| SYNC-07 | Proposed | Sign-out and account switching cannot expose another user's cached records. Define shared-device cache removal explicitly. |
| SYNC-08 | Proposed | Retain independent backups and recovery; synchronized deletions must not destroy the only recovery path. |

## Selected platform and proposed implementation

Keep Dexie for local use; add Workers Static Assets, a protected Worker API, D1 and GitHub OAuth for one allowlisted identity. Use PKCE/state, first-party opaque sessions and server-side ownership checks. Implement a durable outgoing queue, idempotent mutations, server revisions, deletion tombstones and conflict handling. Preserve transaction boundaries for related workout/set writes. Keep server secrets off the frontend. Do not synchronize local PIN hashes, provider tokens or API keys as ordinary profile data. Full requirements, free-tier constraints, source references and release gates are in CLOUDFLARE_MIGRATION_PLAN.md.

Alternatives: Firestore offers built-in offline persistence but requires a document-model adaptation and deliberate conflict policy; the existing Google Drive snapshots support manual transfer but do not satisfy automatic concurrent editing.

## Open decisions

1. The complete plan and later GitHub-login amendment were approved on 2026-11-02. Private one-person audience is confirmed; public signup and household sharing are deferred.
2. Complete CF-M1 real OAuth/PWA verification. Workers Free/account/CLI/subdomain are verified; only the allowlisted GitHub ID can create a session. No password or secret is requested in chat.
3. The approved plan includes hosted body/health history, trusted-device offline caching and no end-to-end encryption.
4. Inventory actual existing histories and attachments before migration. The plan includes conflict preservation and resumable imports within free capacity; no silent data omission.

Next action: complete CF-M1 authenticated-PWA checks and then the remaining ordered increments. Staging D1 exists; GitHub OAuth app was registered with separate action-time permission. Secret provisioning and live login remain pending. No production deployment or user-data migration has occurred.

## Official research

Checked 2026-11-02:

- https://supabase.com/pricing — Free: 500 MB database, 1 GB storage, 5 GB egress; projects may pause after a week of inactivity. Pro starts at USD 25/month. Capacity must be estimated from real data before selection.
- https://supabase.com/docs/guides/auth — available authentication methods.
- https://supabase.com/docs/guides/database/postgres/row-level-security — server-enforced ownership policies.
- https://firebase.google.com/docs/firestore/manage-data/enable-offline — offline caching/synchronization; document conflicts use last-write-wins and need application-level consideration.
