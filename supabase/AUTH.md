# Preview authentication — owner setup and release boundaries

This branch adds web authentication only. The owner confirmed foundation migration **20261108000100** was already applied to the intended test project and the Preview public Auth check passed. Those owner checks do not prove authenticated isolation or Storage behavior. We did not apply hosted SQL, send email, register real users, configure providers, or change Production. The native app/widget are unchanged.

## 1. Apply only the new migration

Review **[20261108000200_auth_onboarding_preview.sql](migrations/20261108000200_auth_onboarding_preview.sql)**. Back up the intended **test** project, then use Supabase **SQL Editor → New query** to run that entire file, including BEGIN/COMMIT, once as administrator. Do **not** rerun the applied foundation, run fixture SQL, import local data, or drop objects on a collision. Run [verify-auth.sql](verify-auth.sql) for read-only metadata inspection. Expect one forced-RLS profile table, three narrowly granted functions, restrictive onboarding policies on all seven foundation tables and the private photo bucket, and configuration mode `blocked`.

Only after reviewing these boundaries, enable authorized Preview testing in that same test project:

```sql
update daily_deck_private.auth_configuration set mode = 'preview' where singleton;
```

Setting `mode = 'blocked'` closes the account-data gate again without deleting history or Auth users. Client roles cannot change this configuration. The helper functions have fixed empty search paths. The onboarding RPC binds its expected user to `auth.uid()`; it cannot choose another owner. Existing foundation ownership policies/grants remain in place, with an additional restrictive gate. Anonymous access is not expanded. Keep **Automatically expose new tables** disabled. The public schema/Data API and RPC discovery must be enabled; the migration requests a PostgREST schema reload.

Manual SQL Editor execution does not update the CLI migration ledger. Record this version and commit as applied. If later adopting CLI migrations, compare the actual schema first, then repair the already-applied versions; never blindly `db push` or rerun them. Existing CLI-managed projects should use their reviewed migration-history workflow instead.

The server records a **16+ self-declaration**, not verified age, plus a distinct Preview acknowledgement. OAuth users must do this too. User metadata cannot approve onboarding. Profile writes happen only through the authenticated RPC, with server timestamps; direct browser writes are denied. Marketing is separate, optional, initially unchecked, and sends nothing. Terms/privacy versions and acceptance timestamps are deliberately NULL and constrained to remain NULL. Approved documents have not been supplied. Preview acknowledgement is not legal acceptance.

Auth providers can create an Auth identity before this post-sign-in gate. The gate restricts account data access, not Auth account creation or proof of age. Offline/local mode has no server age verification. A public release needs reviewed age/legal requirements and a new approved-document migration/flow; this implementation has no public-release mode.

## 2. Set Preview URLs and email provider

Keep Vercel **Settings → Environment Variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` scoped to **Preview**. Use the HTTPS project URL and modern public `sb_publishable_…` key. Never place an SMTP password, OAuth secret, private key, Supabase secret or service-role key in Vite variables. Missing configuration leaves the local app working.

In Supabase **Authentication → URL Configuration**:

- **Site URL:** the exact owner-selected stable Preview origin, e.g. `https://YOUR-PREVIEW-HOST/` (placeholder, not a verified deployment).
- **Redirect URLs:** explicitly allow the exact intended Preview callback URL with each query variant: `/auth/callback?flow=oauth`, `/auth/callback?flow=confirmation`, `/auth/callback?flow=recovery`; allow bare `/auth/callback` if using the direct token-hash templates below. Use full origin + path for each entry. For local development repeat the relevant URLs under `http://localhost:5173`; if using another local host/port, explicitly add that exact origin too. Avoid broad `*.vercel.app` or user-controlled destinations. New ephemeral Preview hosts need explicit owner approval/allowlisting.

In **Authentication → Sign In / Providers → Email**, enable **Email**, enable **Confirm email**, and set **Minimum password length** to at least 8 (client new-password limit is 8–128). Configure desired backend rate limits. Templates and provider controls can be grouped under **Authentication → Emails** in newer dashboard versions.

The app always supplies its own same-origin `/auth/callback` destination. No `next`, `returnTo`, arbitrary redirect or implicit session-token fragment is accepted. Preview SDK sessions use PKCE, persistence and auto-refresh; callback URL detection is disabled in the SDK and the app explicitly exchanges the code or verifies the supported token hash. The address is scrubbed before async work. Callback responses have no-store/no-referrer headers and bypass service-worker caching. Configure the intended Preview URL accurately; do not use the project Site URL as an open redirect workaround.

Later native integration needs its own reviewed app/universal-link callback, allowlist and SDK flow. No native callback scheme is implemented or should be enabled by this task.

## 3. Configure Google (optional)

In **Google Cloud Console → Google Auth Platform / APIs & Services → Credentials**, configure consent/audience and authorized **Test users** for the test project. Create **OAuth client ID → Web application**. Set **Authorized redirect URIs** to `https://PROJECT_REF.supabase.co/auth/v1/callback` (use the project's actual Auth callback if it has a custom domain). This is the Supabase callback, not the Daily Deck page.

In Supabase **Authentication → Sign In / Providers → Google**, set **Enable Sign in with Google**, **Client ID** and **Client Secret** from that web client. Keep the secret in the Supabase dashboard only. Do not enable unrelated One Tap or custom account linking. The UI displays a provider only when public Auth settings report it enabled; this does not prove its credentials work. Test with an authorized account after configuration.

## 4. Configure Apple (optional)

An Apple Developer membership and appropriately configured primary App ID with **Sign in with Apple** are required. In **Apple Developer → Certificates, Identifiers & Profiles**, create/configure a web **Services ID**, associate its primary App ID, and configure **Sign in with Apple → Web Authentication Configuration**. Set **Domains and Subdomains** to the actual Supabase Auth host and **Return URLs** to `https://PROJECT_REF.supabase.co/auth/v1/callback` (or the project's actual custom Auth callback). Follow Apple's domain verification requirements.

Create a **Sign in with Apple key**, record **Team ID**, **Key ID**, **Services ID**, and retain the `.p8` private key securely outside this repository. Generate the client-secret JWT using Apple's documented server-side procedure. In Supabase **Authentication → Sign In / Providers → Apple**, enable the provider and populate **Client IDs** with the web Services ID and **Secret Key (for OAuth)** with that generated JWT. Apple's OAuth client secret expires after at most **six months**; schedule rotation before expiry and retest sign-in. None of these private credentials belongs in browser variables.

Register/verify sending domains/addresses with Apple's **Private Email Relay** and the required DNS for messages to relay addresses. Hide My Email may differ from Google/email addresses; use the usual login method. Supabase's supported identity behavior applies. Daily Deck adds no manual account merge/link flow and does not equate accounts by a matching display name or browser deck.

## 5. Configure confirmation/recovery delivery

In Supabase **Authentication → Emails → SMTP Settings** (sometimes **Project Settings → Authentication → SMTP Settings**), enable **Custom SMTP** and set **Sender email**, **Sender name**, **Host**, **Port**, **Username**, **Password**. Use an authorized verified sender. Built-in SMTP restrictions/rate limits do not constitute production email delivery.

If the owner chooses Resend, first verify a sending domain in **Resend → Domains**, install its required SPF/DKIM DNS records and an appropriate DMARC policy. SMTP host is `smtp.resend.com`, username `resend`, port **465 (TLS)** or **587 (STARTTLS)** as supported by the provider, and SMTP password is the Resend API key **only in Supabase's SMTP dashboard**. No Resend service, paid plan or key has been created here. Never paste credentials into chat.

Under **Authentication → Emails → Templates**, configure **Confirm signup** and **Reset password** using Supabase's supported `{{ .ConfirmationURL }}` link. RedirectTo is supplied by this app. PKCE confirmation/recovery should be opened in the same browser that requested it; another browser lacks the verifier and gets a safe retry message. Check that email scanners/link rewriting do not consume single-use links. Customize only owner-approved branding/content; no invented legal links or business details.

If a reviewed cross-browser email flow is required, supported direct token-hash templates can instead use:

```html
<!-- Confirm signup; .RedirectTo must be the fixed confirmation callback including ?flow=confirmation -->
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirm email</a>
<!-- Reset password; .RedirectTo must be the fixed recovery callback including ?flow=recovery -->
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
```

These are single-use bearer links: do not log/forward them; retain expiry/rate limits. Do not use the query-append examples if RedirectTo lacks its expected `?flow=…`. Prefer the default supported confirmation URL unless this alternate flow is deliberately tested. Never put access/refresh tokens in a custom template. The app supports `verifyOtp` for these token hashes, scrubs the URL immediately and renders no raw provider error text.

## 6. Test in the intended Preview

Open **Help & settings → Account** (mobile: **More → Account**). Use only authorized test addresses/accounts. Test email signup, confirmation/resend after cooldown, wrong/unconfirmed sign-in, reload restoration, sign-out, forgot/reset in the requesting browser, expired/used links and canceled OAuth. Confirm server onboarding is mandatory for email and provider accounts, including a newly signed-in second user. Marketing must start unchecked. Check local tasks, photo crops and history before/after all flows: they must remain unchanged and never appear in network requests to data/storage APIs.

Use two authorized real sessions to check actual PostgREST owner isolation and private Storage upload/download/signed URLs before any release. SQL Editor administrator SELECT is not an isolation test. The browser app in this task never writes cloud task/photo records. Account deletion/export and synchronization must be implemented separately, with reviewed server authorization and historical cleanup semantics.

## Security and lifecycle limits

Preview/local development authentication is build-gated (`VERCEL_ENV=preview` or Vite development); default Production builds keep authentication disabled even if public variables are present. `auth-test` mode is only a synthetic QA build. No URL/localStorage flag can enable release authentication. The Supabase SDK manages tokens in its own browser storage; the React state exposes only verified user ID/email and onboarding state, not tokens. Passwords are sent only to Auth via the SDK and are not stored by Daily Deck. Persistent browser sessions remain sensitive to XSS and shared-device access; CSP and callback controls do not make tokens HttpOnly cookies. Sign-out is explicitly this browser's SDK session, not a global device logout.

A short-lived sessionStorage marker contains only recovery UI user ID/expiry, no credential; it keeps the reset form through reload and is not an authorization grant. If browser storage is unavailable, the current recovery can work but reload may need a new link. Session changes clear/reverify identity and bind onboarding to the current server subject.

The device-local deck is deliberately shared by people using that browser, not partitioned or uploaded at login. Account switching does not create independent account copies. Local JSON backup is not cloud account export. Do not market this as account privacy isolation for a shared browser.

Before public release: approved operator/support/privacy/terms documents and versioned acceptance, reviewed age requirements, authorized live SMTP/OAuth and real-user RLS/Storage checks, self-service account deletion, account-data export, secure sync/write APIs if planned, and separately implemented/tested native authentication. No launch-readiness or legal-compliance claim is made.

## Reproduce bounded local checks

```sh
npm --prefix apps/web run build
npm --prefix apps/web test
npm --prefix apps/web run test:auth
npm --prefix apps/web run test:supabase
npm --prefix apps/web run test:supabase-build
python3 scripts/test-supabase-foundation.py
```

Auth browser tests run the actual installed SDK against intercepted synthetic Auth/RPC responses, including verifier/challenge matching; they do **not** prove hosted credentials, JWT validation, email delivery or real Google/Apple success. PostgreSQL tests use synthetic managed-role/Auth/Storage fixtures in a disposable network-isolated database, not hosted Supabase. Phone tests use Chromium emulation and shortened viewports, not a real iPhone keyboard/Safari/Home Screen installation. See the repository validation record for final results.
