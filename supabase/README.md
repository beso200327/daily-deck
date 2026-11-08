# Daily Deck Supabase foundation

**Owner update:** foundation migration `20261108000100` was manually applied to the intended test project and Preview public Auth connectivity passed. We have not applied hosted SQL or uploaded local data. Web authentication is now added on this feature branch; follow [Preview authentication setup](AUTH.md) for the separate additive migration and current session settings. Synchronization, data import, payments and native iOS authentication remain outside scope. The existing browser localStorage/IndexedDB and SwiftUI/WidgetKit stores remain authoritative and unchanged.

## Files and model mapping

The original foundation is **`supabase/migrations/20261108000100_daily_deck_foundation.sql`**. It is already owner-applied: do not rerun it. The historical instructions below apply only to a fresh project. It is one atomic transaction. A collision with an existing table or bucket fails instead of silently reusing or reconfiguring it. Do not repeatedly run it or drop existing objects to make it succeed.

| Existing model | Database foundation |
| --- | --- |
| Shared Task definition (`kind: today / habit`) | `public.daily_deck_items` with immutable kind/creation/ownership anchors and an editable/archiveable definition |
| Selected weekday / text history | `public.daily_deck_schedule_versions`; weekday values 0=Sunday through 6=Saturday |
| Local deadline history | `public.daily_deck_deadline_versions`; date + wall time, no timezone conversion; legacy minutes remain separate archival data |
| Dated Card with title/notes/visual/deadline snapshots | `public.daily_deck_occurrences`; unique owner/item/civil date; one-time items also have at most one occurrence |
| Dated appearance history | `public.daily_deck_appearance_versions` |
| Done/Later/Skip/Delete/Undo/Reorder events and timestamps | `public.daily_deck_events`; append-only; Undo references an event from the same owner AND occurrence |
| IndexedDB source, rendered crop, dimensions and crop metadata | `public.daily_deck_photos` and the private `daily-deck-photos` Storage bucket |

Each table has enabled/forced RLS, `(owner_id,id)` primary keys, an Auth user foreign key, owner-only SELECT/INSERT policies and owner-scoped relationship keys. Knowing another user's UUID cannot attach their photo, occurrence, definition or Undo target to an owned record. Anonymous Data API access has no grants. This works with **Automatically expose new tables disabled**; the migration explicitly grants the required authenticated privileges and does not change project-wide default privileges or that dashboard toggle.

Definitions permit only specified column updates (including archive, not ownership/type/creation reassignment). Revisions, events and occurrence snapshots are directly SELECT/INSERT only; they have no browser UPDATE/DELETE permission. Photo metadata is immutable and can be deleted only if no definition, historical occurrence or appearance still references it. History is retained when definitions are archived. Revisions are appended; for a given effective date the latest `recorded_at,id` revision is authoritative. No table stores an independently mutable completion flag; outcomes remain derived from the action history.

This is deliberately **not a complete synchronization/write API**. Before connecting authenticated app writes, implement reviewed transactional operations for pending-only snapshot edits, archival/deletion events, revision effective dates, occurrence reconciliation, concurrent ordering, Undo validation and account/photo cleanup. Do not solve that later by broadly granting UPDATE/DELETE on historical rows. The existing client still implements its documented tomorrow-effective schedule policy, local date rollover and deadline rules; the database does not yet generate occurrences or schedule reminders. Future import code must preserve IDs, civil dates, action order/timestamps and original snapshots, and handle any legacy non-UUID IDs/absent event sequences explicitly. No import code runs in this foundation.

## Private photos

The migration creates bucket **`daily-deck-photos`**, private, maximum **20 MiB per object**, MIME allowlist JPEG/PNG/WebP/AVIF. Source paths are generated from immutable owner/photo IDs:

- `<auth-user-uuid>/<photo-uuid>/original.<source_extension>`
- `<auth-user-uuid>/<photo-uuid>/card.jpg`

Future uploads must first insert owned photo metadata, then upload only those exact paths with **upsert disabled**. Normalized local originals can exceed 20 MiB even if the selected file was smaller; a future upload flow must compress/reject those sources explicitly. Current local photos are unaffected. Rendered crops retain the current 2:1, up-to-1200px, up-to-1MiB limits.

Storage SELECT/INSERT/DELETE grants are explicit. Bucket-scoped **restrictive** guards preserve ownership even if another existing Storage policy is broadly permissive. Unrelated buckets are logically unaffected; shared managed-table grants/policies are not revoked. Browser roles also cannot update/rename/delete the Daily Deck bucket or flip it public, even if an existing bucket-management policy is permissive. Daily Deck object UPDATE/rename/move/overwrite is denied. Replacement photos/crops need a new photo ID, preserving history. Object deletion is blocked while its photo metadata exists. Delete unreferenced metadata first (historical foreign keys block this if still in use), then delete the owner's orphan objects. Own orphan objects remain readable/listable for cleanup. Other users and anonymous callers cannot read or modify this bucket.

Never make the bucket public or use public object URLs. Future reads should use the authenticated Storage API (download Blob) or short-lived owner-authorized signed URLs. Existing image CSP permits local Blob rendering; direct remote `<img>` URLs are not enabled by this task. Administrators and service roles are trusted and can bypass RLS; no such credentials belong in browser code.

## Optional browser configuration

From `apps/web`, copy `.env.example` to **`.env.local`** only if you want connectivity locally. The checked-in example contains blank placeholders. `.env*` files are ignored by Git and excluded from Vercel uploads. The exact optional variables are:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Use the project's HTTPS origin and its **`sb_publishable_...`** public key. Leave both unset/blank for the existing local app. Partial/invalid build configuration fails with a sanitized message. Secret-shaped keys, service_role keys and legacy JWT keys are rejected before browser assets are emitted. If a legacy anon JWT was placed under the new variable name, replace it with the project's modern publishable key in Vercel; do not paste any key into chat.

Vercel variables configured for Preview are not present automatically in this coding environment. Keep them scoped to **Preview**; no Production variables are required for local-only behavior. Vite substitutes public configuration at build time, so changed Preview variables require a new Preview build. Do not merge to main or deploy Production as part of this task.

`getSupabaseClient()` in `apps/web/src/supabase.ts` returns null when unconfigured and initializes the SDK lazily. In configured Preview/development builds the SDK now uses persistent PKCE sessions and automatic token refresh. URL-session detection remains disabled in favor of reviewed explicit callbacks. Default Production keeps session persistence/refresh disabled. See [AUTH.md](AUTH.md). No task-table request, file upload or sync is implemented.

**Help & settings → Supabase foundation → Test Supabase connection** makes one explicit public `GET /auth/v1/settings` using only the publishable API key, without cookies, a session token, request body or local-deck data. It verifies endpoint/key reachability only; it cannot prove that migrations, authenticated policies or Storage services work. An accepted connectivity check is not a claim that an account or database sync exists. No connection check is made on launch, reload or opening Help.

### CSP

The Vercel response policy permits HTTPS connections to standard `*.supabase.co` hosts as a ceiling. A build-generated **additional meta CSP** restricts the actual document to `'self'` plus the **exact configured project origin**, or just `'self'` when unconfigured. Both policies apply; other Supabase projects remain blocked. No websocket access is enabled. A custom Supabase domain would also need its exact HTTPS origin explicitly added to the HTTP CSP in `apps/web/vercel.json`; do not replace the policy with a global wildcard. The offline service worker still caches only its explicit same-origin shell assets, never Supabase API responses or user data.

## Foundation-only validation before authentication

Final checks: clean npm install and production build; **99 unit/model tests**, **83 SQL authorization/integrity assertions**, **6 synthetic connectivity/CSP browser cases**, and **239 existing browser regression cases (17 intentional skips)** passed. Runtime dependency audit reported zero advisories. Native project/resource validation passed; native sources are unchanged.

Run from repository root:

```sh
python3 scripts/test-supabase-foundation.py
npm --prefix apps/web ci
npm --prefix apps/web run build
npm --prefix apps/web test
npm --prefix apps/web run test:supabase-build
npm --prefix apps/web run test:supabase
```

The database runner creates **only a new disposable Docker container**, uses a pinned PostgreSQL 17 image, `--network none`, no published ports and no hosted credentials, applies the migration, then tests role/JWT-based authorization. The test container uses local trust authentication solely within that isolated container. It is removed with its volumes even on failure. The runner never reads DATABASE_URL, Vercel variables or Supabase credentials.

`supabase/tests/bootstrap.sql` is an **isolated fixture only**, reproducing the managed auth/Storage columns and roles needed by these policies. **Never run bootstrap.sql or isolation.sql on your project.** The tests switch to `authenticated` and `anon` (not just an admin query) with two synthetic users. They exercise all seven tables, spoofed owner inserts, bidirectional isolation, ownership/type reassignment, cross-owner foreign keys and Undo, duplicate occurrences, reminder/deadline constraints, append-only history, preserved photo references, private bucket settings, Storage upload/read/delete/overwrite/move restrictions, orphan cleanup, hostile pre-existing permissive policies and unrelated-bucket noninterference. They also verify Auth-user deletion cascades for synthetic records.

Browser connectivity tests use a separate synthetic-config build with intercepted responses. No real project is contacted. They cover the unconfigured app, no request before an explicit click, preserved local data, denied connection status, no cookie/token/body transmission, ignored URL-session tokens, no persisted Auth session and exact-origin CSP blocking. The build test rejects a synthetic secret-shaped key before emitting assets or logging its value.

The SQL fixture is **not a full local Supabase stack**. Hosted Auth JWT validation, PostgREST schema discovery, managed Storage uploads/downloads/signed URLs, your actual Preview key/URL and live Vercel CSP headers still require project/Preview verification. No actual Storage bytes or local data were uploaded, and no native integration was attempted.

## Historical foundation steps — fresh projects only

**The owner already applied this foundation to the intended test project. Skip these steps there; apply only the new migration described in [AUTH.md](AUTH.md).**

1. Review this PR and the entire **`supabase/migrations/20261108000100_daily_deck_foundation.sql`** file. Select the intended non-production Supabase project; confirm its Auth/Storage services exist. Future Data API use also requires the public schema to be exposed/enabled; keep automatic new-table grants disabled. The Auth-only connectivity check does not verify this setting. Take a schema backup if the project already has data. Keep Automatically expose new tables disabled.
2. In that project's **SQL Editor**, check for collisions without changing anything:
   ```sql
   select tablename from pg_tables where schemaname='public' and tablename like 'daily_deck_%';
   select id, public from storage.buckets where id='daily-deck-photos';
   ```
   Both should be empty for a new foundation. If not, stop and reconcile the existing objects; do not delete them or bypass the transaction.
3. Create a new SQL Editor query and paste the complete contents of **`supabase/migrations/20261108000100_daily_deck_foundation.sql`** from the reviewed commit, including BEGIN/COMMIT. Run it once with the project administrator role. Any error rolls back the transaction; report the exact error before retrying. Do not run the test fixture SQL and do not upload a browser backup.
4. Run **`supabase/verify-foundation.sql`** in SQL Editor. Expect seven tables with RLS enabled/forced, authenticated SELECT/INSERT grants, limited definition-column UPDATE grants, photo-only DELETE, no anon/PUBLIC grants on these app tables, owner policies, restrictive Storage guards and one private 20MiB MIME-limited bucket. This is read-only metadata inspection; SQL Editor admin access does not test user isolation.
5. Record migration version **`20261108000100`** and this commit as applied. Manual SQL Editor execution does not update the CLI migration ledger. If you later adopt Supabase CLI, link the correct project and use `supabase migration repair 20261108000100 --status applied` **only after comparing the applied schema to this file**; do not run `db push` over this already-applied file. If a CLI-managed migration history already exists, use its reviewed dry-run/push workflow instead of manual SQL Editor application.
6. Open the branch's owner-managed **Vercel Preview**, confirm the two variables are still Preview-only, and run the manual connection check in Help. It should say the public Auth service is reachable. If not, inspect that Preview's URL/key configuration, build logs and CSP—not a secret key or service_role workaround. Do not add Production variables or merge/deploy main.
7. With authentication now implemented on this branch, verify two authorized real test-user sessions through the actual Data/Storage APIs, including cross-user rejection and signed URL behavior. Local-data import, synchronization, payment entitlements, account cleanup and native integration remain separate work.
