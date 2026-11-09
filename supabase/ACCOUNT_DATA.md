# Account data: Preview deployment and verification

This change is source/configuration only. No hosted SQL, Edge deployment, real-account deletion, Production change or manual Vercel deployment was performed. Use a separate **Preview/test Supabase project** and synthetic test accounts for verification. Existing browser/native local data is never imported by export/deletion. The native SwiftUI app/widget remain independent local-only stores; web-account erasure does not erase that native store.

## Apply in this exact order

1. Confirm the project reference is the Preview project. Confirm migrations **001–004 are already present**; do not rerun them. Read-only preflight in SQL Editor:

   ```sql
   select to_regprocedure('public.daily_deck_sync(uuid,text,uuid,bigint,jsonb,text)'),
          to_regprocedure('public.daily_deck_sync_status(uuid,uuid)'),
          to_regclass('public.daily_deck_profiles'),to_regclass('auth.sessions');
   ```

   Stop if any prerequisite is missing and review the existing CLOUD.md setup; do not blindly reapply migrations. Do not use `supabase db push` or `db reset` for this manually applied migration history.

2. Review and apply **only** [20261109000500_account_data_lifecycle.sql](migrations/20261109000500_account_data_lifecycle.sql) once in SQL Editor. It is transactional. It adds a private deletion-job table, service-only administrative RPCs, authenticated own-lifecycle status, and serialized lifecycle guards. It grants no browser administrative/table privileges. Do **not** apply anything in `supabase/tests/` to a hosted database. If the migration fails, inspect the error and transaction state; do not continue deployment with partial/unverified setup.

3. Set the Edge Function environment in the Preview project. Copy [functions/.env.example](functions/.env.example) to an ignored local file and populate:

   - `DAILY_DECK_ALLOWED_ORIGINS`: comma-separated **exact HTTPS Preview origins**, no paths or wildcard. Include each origin used for OAuth callbacks. Add `http://localhost:PORT` only for intentional development testing.
   - `DAILY_DECK_WORKER_SECRET`: generate at least 32 random bytes locally, e.g. `openssl rand -hex 32`. Never paste it into chat or commit the populated file.
   - Hosted Edge automatically supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The privileged key stays exclusively in the trusted function. **Do not** add it to Vercel or any `VITE_` variable.

   Run locally with the Supabase CLI, substituting the Preview project reference and ignored file path:

   ```sh
   supabase secrets set --project-ref PREVIEW_PROJECT_REF --env-file /absolute/path/account-data.local.env
   supabase functions deploy account-data --project-ref PREVIEW_PROJECT_REF --no-verify-jwt
   ```

   `supabase/config.toml` deliberately disables gateway JWT verification for this function. The handler itself verifies ordinary JWTs through Auth **and checks the live Auth session**, or verifies a narrow deletion-recovery capability / server worker secret. An API/publishable key alone cannot authorize export or initiate deletion. The worker does not need a user session. Do not expose or grant its service-only SQL functions to `authenticated`/`anon`.

4. In Preview Dashboard, enable **pg_cron** and **pg_net**. In **Vault**, create:

   - `daily_deck_account_function_url`: `https://PREVIEW_PROJECT_REF.supabase.co/functions/v1/account-data`.
   - `daily_deck_account_worker_secret`: the same generated worker secret from step 3.

   Use Vault UI so no literal secret is written into SQL query history. Review/apply [setup-account-worker.sql](setup-account-worker.sql). It schedules only `daily-deck-account-erasure-preview`, once per minute. Repeating this named schedule updates this app's job, not other jobs. The worker is required for closed-app completion and completed-job retention cleanup. The first successful worker call records a heartbeat; new deletion jobs are rejected unless a heartbeat was seen within five minutes. Wait for/verify a successful scheduled run before testing Delete account. **Do not enable public account deletion until this worker has been verified.** No paid service is required by this implementation; check the project's available Edge/Cron quotas.

5. Add the exact Preview `/auth/callback` URL to Supabase Auth's redirect allowlist if not already present. Existing email/Google configuration otherwise stays the same. Google verification uses an explicit new OAuth flow (`prompt=select_account`, `max_age=0`). Returning from OAuth never authorizes deletion by itself: the user must explicitly confirm again. Password verification uses an ephemeral, nonpersistent SDK client. Server authorization requires a verified same-subject session with a password/OAuth `amr.timestamp` within five minutes; refreshed `iat` alone is rejected. An account/session switch is checked both client-side and server-side. The intended owner is pinned in a noncredential, ten-minute session-storage marker across Google redirects. A different returned account cannot authorize deletion; return to the intended account or Cancel to clear that intent. The confirmation identifies the signed-in email explicitly.

6. Run [verify-account-data.sql](verify-account-data.sql) read-only in Preview. Check the labeled privilege/trigger results and a fresh worker heartbeat. No account rows are exported or erased by this check.

7. Allow the existing GitHub/Vercel integration to build Preview. The existing **Preview-only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` remain the only browser variables needed. No main merge or manual Production deployment is part of these steps.

## Archive contract

Account → **Export my data** downloads `daily-deck-account-v1.tar` only after the response checksum is verified in the browser. Unpack it using macOS Archive Utility/`tar -xf`, or a TAR-capable file app:

- `account.json`: version 1, a whitelisted Auth profile (ID, email, creation/confirmation dates, provider names, name), onboarding/preferences, every owned task/habit, all schedule/deadline/appearance revisions, occurrences/events, photo/crop metadata and owned sync/import receipts. Raw event timestamps and local dates are retained.
- `photos/PHOTO_UUID/original.EXT` and `card.jpg`: actual stored bytes, including historical and registered/unregistered owned uploads. The stored original is Daily Deck's normalized source; original camera EXIF/GPS was already stripped on upload.
- `manifest.json`: `format`, `version`, `complete`, owner, export time, file sizes/SHA-256 hashes, and `restorable:false`.
- `README.txt`: format/scope instructions.

No Auth tokens/password hashes/provider secrets, SDK sessions, deletion capabilities, guest/local deck, another account's records, or device pre-import backup is included. This is **not** the old local pre-import backup. There is **no supported account archive import/restore path**, and restoring this archive has not been claimed or implemented.

The database snapshot is serialized with normal writes; every file must download at its registered size. A second full metadata/profile check detects concurrent changes (including unreferenced file cleanup or deletion). Any missing file/change/checksum/network failure aborts the export without a success label. Export is a consistent snapshot, not a promise that later edits are included. Automatic exports are bounded to **64 MiB of structured records + photo bytes** to protect Edge/mobile memory; oversized exports fail explicitly, never truncate. For larger accounts, an authorized operator must arrange a complete offline export (see below).

## Erasure state machine and retention

`storage → app → auth → complete`, guarded by a durable private job, same-user advisory lock, expiring worker lease and an unguessable SHA-256-hashed recovery capability. A recently healthy worker is required before a new deletion begins. A confirmed begin blocks new app/profile/photo/Storage writes, including requests that passed an earlier permission check. Storage is deleted through the supported API, including orphaned uploads under that owner's exact prefix. Remaining files block advancement. Events (newest first, including Undo references), appearance/occurrence/history rows, schedule/deadline definitions, items, photo metadata, profile/preferences and private sync/import receipts are then erased in FK-safe order. Large event histories are removed in bounded batches. The Auth identity is **hard-deleted last**, removing its managed identities/sessions/refresh tokens. Completion requires confirmed identity absence and an empty Storage manifest.

Retries resume the existing phase/request, never create another identity or overwrite another job. A lease prevents concurrent workers from advancing the same job. A lost response is recovered by the already-authorized capability even after user sessions are revoked/deleted. A recovery-only retry cannot initiate a new deletion. The browser retains only the request ID, owner ID and deletion-only recovery capability until confirmed completion; these are excluded from export. A confirmed authorization/worker-readiness failure does not start erasure. A submitted request is not called started unless the server verifies its durable job; partial failures carry owner-bound pending metadata to the recovery UI. Once a job exists, Close does **not** cancel it.

On this device, completion clears that owner's localStorage cloud cache/journals/diagnostics, image IndexedDB and account-bound import/backup copies, then signs out the local SDK. The original guest/local deck and its image DB remain. Other devices hide cloud data when foreground/reload/API verification detects deletion or invalid authentication; verified deletion also clears account caches. Revoked/expired sessions hide caches but retain durable pending transaction journals for legitimate reauthentication. Offline devices cannot receive instantaneous revocation; no claim of remotely wiping another device's offline disk is made. User-downloaded exports and explicit guest copies remain under the user's control.

The only intentionally retained application record after erasure is a minimal completed job (owner UUID, request UUID, capability hash, phase/lease timestamps), eligible for deletion **24 hours after completion**, purged by the next successful worker run. No task content, email, original token or photos are retained there. Incomplete jobs persist until erasure finishes; do not discard them to make an error disappear. A worker outage extends pending work/retention until recovery; monitor it. Supabase-managed Auth/Edge audit logs, infrastructure backups and external/provider logs are outside this app transaction. **The operator must verify and document the actual project log/backup retention periods before public use; these hosted settings were unavailable here.** Do not claim physical removal from platform backups, delete a Google account, or restore an old project backup without separately honoring completed erasures.

## Verify on synthetic accounts only

- Sign in as A on desktop and iPhone, create tasks/habits, deadlines, complete/skip/Later/Undo history and photos. Create unrelated data as B and a distinct local guest deck. Export A; inspect every archive file and its hashes, timestamps and preferences. Check B/guest data and credentials are absent. Change data during export; it must fail/retry rather than download an incomplete archive. Test a missing photo and an oversized export explicitly.
- Keep the same task draft open on both devices. Save desktop, then stale phone. A received SQL `40001` is a conflict. A lost response triggers a receipt read with the **same transaction ID**: applied receipt → confirmed success; no receipt + advanced revision → confirmed stale rejection; unavailable receipt/unchanged revision → remains unknown and retries the original ID. A pre-send connection failure is not labeled a conflict. Drafts remain until explicit cancellation/success; repeated saves never silently rebase them. Inspect the last 20 owner-scoped `outcomes.v1` diagnostics (IDs/codes/status only) when troubleshooting; do not send tokens or private drafts.
- Cancel Delete account: nothing changes. Try wrong password, an old AMR with newly refreshed token, a revoked session and a proof from another account: each must be rejected. Verify fresh password and fresh Google flows, including explicit confirmation after callback. Confirm both destructive footer buttons remain visible at 320/375/390 px and keyboard-sized heights.
- On A only, exercise the worker in a disposable/test environment with injected Storage/Auth failures. Verify the job remains pending at the correct phase, new writes/exports are blocked and B is unaffected. Close the app: the scheduled worker must finish; reopening/status retry must confirm without another write. A lost final response must not create a new job. Do not delete real hosted accounts for this test.
- Verify A's Storage prefix, records/events/profile, private receipt rows and Auth identity/sessions are absent. Verify B and the guest/local deck/photos remain. Reload/foreground another A device and revoke a synthetic session; no cached A cards should remain visible. Verify device cache cleanup (including account transfer copies) and the status UI.

Read-only operator checks (SQL Editor, never browser/service keys in chat):

```sql
select request_id,stage,created_at,completed_at,lease_until from daily_deck_private.account_deletions;
select jobname,schedule,active from cron.job where jobname='daily-deck-account-erasure-preview';
select status,return_message,start_time,end_time from cron.job_run_details
 where jobid=(select jobid from cron.job where jobname='daily-deck-account-erasure-preview')
 order by start_time desc limit 10;
```

For a chosen **synthetic** owner UUID, inspect `storage.objects` by exact `OWNER_UUID/` prefix, each app table by `owner_id`, `daily_deck_private.sync_receipts`, and `auth.users`/`auth.sessions`. Never infer success only from the UI or deleted task rows.

## Recovery and large exports

- Storage/Auth outage: restore service/configuration, then invoke the worker by the scheduled job or retry status in the browser. Do not delete the job, bypass FK protections, edit its owner, re-enable writes for a half-erased account, or create a replacement account with the same UUID. Expired leases are reclaimed automatically. A stuck job older than 15 minutes warrants operator investigation; the UI must continue to say pending.
- Lost response: retain browser data/capability and reuse **Check deletion status**. Never start another deletion request to guess the outcome. If no authorized job exists, sign in and explicitly confirm again. If a completed job was already purged after its retention window, status is no longer provable by that capability; the operator must verify the owner is absent from Auth/app/Storage before assisting with owner-only device cleanup. Do not reset all browser data: that would remove the separate guest deck.
- Rotating the worker secret: update Edge and Vault together, verify a scheduled run and then retire the old value. A secret mismatch pauses the worker, not the ownership/write guard.
- Larger-than-limit exports: use the read-only service-only `daily_deck_account_export(OWNER_UUID)` RPC from a trusted operator environment, download **each** manifest path through the private Storage API, and write the same versioned JSON/files/manifest on an encrypted local filesystem. Repeat the full RPC/profile comparison and file hashes before labeling the package complete. Do not broaden browser grants or dump `auth.users`, identities, sessions, other owners, or arbitrary provider metadata. Do not send admin credentials into chat. This assisted path is operational guidance, not a tested browser restore feature or a guarantee that Edge can export arbitrarily large accounts.

Local validation commands:

```sh
npm --prefix apps/web run build
npm --prefix apps/web test
python scripts/test-supabase-foundation.py
npm --prefix apps/web run test:cloud
npm --prefix apps/web run test:auth
# Deno 2.x, actual trusted Edge source; no deployment:
deno check supabase/functions/account-data/index.ts
```

The SQL runner uses a fresh `--network none` PostgreSQL container with fixture Auth/Storage tables. Browser tests run the actual service core against those SQL functions; Auth/Storage HTTP are synthetic. Managed Auth deletion, Storage physical-byte deletion, cron delivery, real Google AMR/session behavior, Safari downloads/reauth and exact hosted retention still require Preview verification.
