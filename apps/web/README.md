# Daily Deck — browser app

A working React + TypeScript + Vite application in its own directory. The SwiftUI app, WidgetKit extension, Swift package, native project, and native tests remain separate. This audit adds a privacy baseline resource to both native targets without changing SwiftUI/core/widget behavior.

## Run on your Mac

Use Node.js 24 and npm:

```sh
cd apps/web
npm ci
npm run dev
```

Open the local address Vite prints. To use a different device, use the eventual HTTPS Vercel URL, or Vite's network address on the same LAN if your network/firewall permits it. Production output is static; there is no app server or API.

```sh
npm test             # 51 actual model tests
npm run build        # TypeScript check + optimized production assets
npm run preview      # serve the production build locally
```

## Features and data

- Today: real keyed, layered cards containing each next task’s own image and text; continuous pointer reveal, guarded exit/promotion transitions, and stable deck bounds; real pointer/touch swipes right for Done and left for Later; equivalent buttons; Skip today; undo; creation, editing, deletion, and accessible move-up/move-down reordering. The shared creation form explicitly selects **Today only** or **Recurring habit**; New habit preselects recurring. One-time tasks stay out of Habits and are managed from Today.
- Habits: daily and selected-weekday schedules, optional notes and minute estimates, and an editable starter routine.
- Progress: selectable past-day calendar, retained occurrences and action history, completion timestamps, task/habit filtering including archived habits, day/week/month summaries, and weekly completion bars.
- Responsive ivory/charcoal/lime/peach interface, locally drawn SVG artwork, touch scrolling, keyboard-operable controls, dialog focus, visible focus rings, live action announcements, and reduced-motion support.

**Task contents and photos are stored locally for this browser/origin. Different browsers, devices, deployment URLs, and the native app do not sync.** The host receives ordinary page/asset requests and connection metadata; provider logging/retention still needs owner review. Optional downloaded backups are separate files and may be saved into an OS-synced folder. No account, backend, payments, ads, analytics, or AI. Clearing site data removes the deck; private browsing and browser storage restrictions can affect retention. Storage failures display errors rather than silently resetting existing data. After the first successful online load and service-worker installation, a cached application shell supports offline reopening. Browser storage/OS eviction can still remove cached assets or local data; this is not cloud backup.

Every habit has a separately dated occurrence. Scheduled days are materialized through the current local date, including missed days while closed. Existing dated snapshots and event logs stay intact after habit edits or deletion. Schedule/title/notes edits to habits normally apply tomorrow, with the exact effective date shown in the editor and Habits. If a clock/timezone reversal revisits earlier dates, edits begin after the latest already-reconciled date; photo/icon edits update today’s pending occurrence while older dates retain their visual snapshots; deleting a habit removes unfinished occurrences from today onward, retains past history and completed/skipped records, and stops future generation. Unfinished past habits remain missed or explicitly postponed in history; unfinished one-time tasks carry forward until resolved. Later is never Done or Skip, and a later completion retains the earlier postponement event. Undo records its own event and expires at the next local date or when the card changes again (including reordering).

Dates and weekdays use the browser's local timezone, not UTC-day string slicing. Calendar addition handles daylight saving transitions. Weeks start Monday. Occurrences reconcile on launch, foreground/focus/pageshow, local midnight while open, and before actions, with a 30-second visible fallback for clock/timezone changes. Reopening catches up missed days without relying on a background timer. An occurrence is identified by its habit and local date, including completed/skipped records, so repeated reconciliation never resurrects it. Reconciliation and actions share the same storage transaction lock. Existing date keys stay on their recorded civil dates after travel. Actions retain ISO timestamps, displayed in the current local timezone. Week/month summaries count daily outcomes, so a carried task may contribute more than one task-day. Within a browser, tabs refresh via storage events and reconciliation/mutations use Web Locks where available; browsers without Web Locks have best-effort same-origin tab coordination.

## Task visuals and photos

The three starter habits have distinct walking, reading, and water illustrations. Custom tasks default to a neutral card; choose another icon if you prefer. Walking art is only used when that visual is selected (or for the original walking starter), never as a universal fallback.

Every task and habit can have an optional photo. The system file/photo picker opens **only** after Choose photo or Replace photo is tapped. The app receives just that selected file’s bytes and metadata, not a library listing or broad photo-library access. The browser/OS owns its picker and any permissions; the website cannot control “full library” versus “selected photos” access and does not simulate that iOS dialog. Launching the app and opening a form never opens the picker. Reading a previously saved local image for display does not request access to the system photo library.

The form states: **“Only the photo you select is added. It stays on this device.”** Selected files are processed locally, with no upload endpoint, analytics SDK, image POST, or beacon. JPEG, PNG, WebP and AVIF are accepted up to 20 MB and 48 megapixels. Unsupported/empty/oversized files, decode errors, and storage failures leave the form contents and previous image intact. Unconverted HEIC requires export to JPEG. Canceling the system picker or the crop editor does not clear the draft.

After selection, **Adjust photo** opens before anything is saved. Drag to reposition; use touch pinch or the zoom slider (1–4×). Reset recenters the full available frame; Cancel preserves the earlier image; Use photo applies the crop to the form preview. The crop frame and actual task photo both use **2:1**, so the final crop is consistent. Adjust photo can reopen an existing image without selecting it again. Pinching is handled only inside the crop frame; browser zoom outside it remains available.

Immutable rendered crops remain in IndexedDB `daily-deck-images/photos`. Database version 2 adds an `edits` store containing the normalized source blob, its oriented dimensions, and crop metadata. New selections are normalized to full-resolution oriented PNG pixels with embedded metadata removed before saving. Every edit renders from that stable source rather than recompressing the preceding crop. Older retained sources are left unchanged and may still contain EXIF/location metadata. Exported JPEG crops strip metadata, cap their width at 1200 px, and stay at or below 1 MB. Native browser decoding honors EXIF orientation. Existing version-one photo blobs remain unchanged; they become the best available editing source when reopened, since higher-resolution originals from older versions cannot be recovered.

No image bytes are placed in localStorage (`daily-deck.web.v1`): only immutable photo IDs and small task metadata. Rendering object URLs are temporary views of stored blobs and are revoked after use, not the persisted source. Photo + source/crop writes are atomic, failed deck saves clean up the newly written image, and previous images stay available for history. Normalized sources, older originals and historical versions consume local quota. Clearing or OS-evicting site storage can remove them; there is no backup/sync service.

The existing native app has no Photos/PhotoKit selection or authorization code and remains unchanged. A future native user-selected-photo UI should use SwiftUI PhotosPicker; broad PhotoKit authorization (and limited/full/denied/restricted branches) is unnecessary for this web implementation.

## Mobile forms, messages and swipe releases

Dialogs constrain all fieldsets, fields, images, and weekday controls to the visual viewport, use at least 16 px form text, follow viewport/keyboard/orientation changes, and scroll vertically inside a locked background. Touch devices initially focus the dialog heading so opening the form does not summon the keyboard. Save/Cancel controls stay reachable in a sticky footer. Card pointer handlers reject input while any dialog is open. Browser zoom is not globally disabled.

Success/info toasts dismiss after approximately 3 seconds; action toasts with Undo last approximately 6 seconds. Hover and keyboard focus pause the remaining time. Each message gets a fresh ID/timer, manual dismissal stays available, and navigation/hidden-page changes clear obsolete notifications. Errors remain in their actionable error UI. Live announcements do not move focus; toast placement avoids task controls and the mobile navigation/safe areas.

Done and Later buttons share the same release path as swipes. The card stays fully opaque and mounted during its approximately 320 ms exit; task state changes only after the transform finishes (with a safety fallback). Later keeps the same DOM node, lowers it behind the next real cards, and animates it back into the bottom of the visible stack before releasing the action lock. Single-card Later returns the same pending card. Below-threshold drags spring back without changing data; short fast flicks have a velocity threshold. Reduced motion uses brief feedback instead of large movement. New events include an optional monotonic sequence so rapid actions with identical timestamps still undo the correct card; old history is not rewritten.

Existing version-one decks migrate additively and idempotently: IDs, occurrences, outcomes, timestamps and action logs stay intact. Only original starter title/notes pairs get starter illustrations; unrelated older tasks get neutral icons. No reset, reseeding, or duplicate occurrence generation is used.

## Home Screen installation and widget preview

Open the app over HTTPS (or localhost for development). Open **More actions → Help & settings** on mobile (or **About your local deck** on desktop) for installation controls and the **Installation guide**:

- **iPhone/iPad Safari:** Share → Add to Home Screen → Add. On supported iOS versions, enable Open as Web App.
- **Chrome/Edge:** use Install on Home Screen or the browser’s install icon/menu.
- **Mac Safari:** File → Add to Dock on supported macOS versions.

The manifest uses standalone display, themed 192/512 px icons, and an Apple touch icon. Installing launches the **web app**, not a native iOS Home Screen widget. Browser/OS profiles, separately isolated installs, and other devices do not sync their local decks.

The clearly labeled **Widget preview** in **Help & settings** shows the actual next task, image and remaining count. Its Done/Later buttons use the same guarded data operations and undo history as the deck. It is an interaction test inside the page, **not an OS widget**. The existing native WidgetKit extension remains separate and unchanged.

The service worker is generated for production builds; use `npm run build` followed by `npm run preview` to test installation/offline behavior locally. Each production build generates a versioned service worker and precaches that build’s shell, hashed JS/CSS, manifest and icons. User data/photos are not stored in the shell cache. Navigation uses the active worker’s consistent cached shell; unknown/non-app requests are not cached. Updated workers wait. A Reload update button is offered and disabled while a form or action is in progress; the user must save/cancel first. Only the consenting tab reloads automatically after activation; other tabs can reload when ready. The previous cache version is retained for in-flight clients, and older Daily Deck shell caches are removed. Service-worker and manifest responses have no-cache headers. First-time installation does not offer a false update prompt.

Actual iPhone Home Screen installation, Safari photo-library behavior, OS storage eviction, and the native app’s WidgetKit execution remain device checks. Native build/signing/App Group provisioning and real widget actions still require Xcode and an iPhone or simulator.

## Browser tests

Use the installed cloud Chromium with `npm run test:e2e`. On a Mac, install Playwright's Chromium and point the tests at its executable:

```sh
npx playwright install chromium
CHROMIUM_PATH="$(node -e "console.log(require('playwright').chromium.executablePath())")" npm run test:e2e
```

`CHROMIUM_PATH` must point to the executable, not a cache directory.

Playwright starts a production preview server automatically. The suite contains 126 cases across both projects (three desktop-only touch/pinch cases run in the mobile project; desktop-sidebar geometry and scrolled-motion cases are intentionally skipped in the mobile project). It covers desktop (1440 px), Chromium with an iPhone-sized touch viewport, pointer and real touch gestures, CRUD, reordering, skip/undo, reload persistence, historical integrity and filters, simulated local-midnight rollover, corrupt-data preservation, additive legacy-data migration, IndexedDB photo compression/replace/remove/reload and failure handling, real next-card DOM retention, zero/one/two-card transitions and duplicate-action guards, PWA offline reopening and explicit update consent, focus/Escape/keyboard interaction, reduced motion, and overflow at 320, 375, 390, 430, 768, 1024 px and desktop. New checks cover crop metadata persistence/re-editing/cancel, EXIF orientation, legacy image-store migration, real touch pinch, keyboard-sized viewport changes, toast timing/pause/replacement, and transition-end ordering. Screenshots are produced under ignored `test-results/`. Chromium device emulation does not verify real iPhone Safari or native widget behavior.

## Manual Vercel import from GitHub

Import **beso200327/daily-deck** as a new project in your Vercel dashboard. Use these exact settings:

| Setting | Value |
| --- | --- |
| Branch to deploy / Production Branch | `main` |
| Root Directory | `apps/web` |
| Framework Preset | **Vite** |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | **24.x** |
| Required environment variables | **none** |

Commands and the output directory are relative to `apps/web`, not the repository root. The included `apps/web/vercel.json` supplies the same framework, install, build, and output settings. Do not prepend `apps/web/` to the commands or output directory: Vercel runs them inside the selected **Root Directory**.

1. In Vercel, choose **Add New → Project** and import `beso200327/daily-deck` through your GitHub connection. If the repository is not listed, grant the Vercel GitHub integration access to this repository.
2. Select **Root Directory → Edit → apps/web**. Select **Vite** and use the table above. No environment variables, database, API keys, or Vercel CLI login are required by the app.
3. Select `main` as the production branch. If Vercel derives it from GitHub automatically, confirm it in **Settings → Git → Production Branch** after import.
4. Deploy from your dashboard. This task only publishes source to GitHub; it does not invoke a Vercel deployment.
5. Open the actual HTTPS URL. Verify Today renders, Done/Later advances the card, a created task survives reload, and Habits and Progress open. Check it on Mac and iPhone Safari as well.

A new deployment origin has its own local browser data; it does not inherit your local preview deck. An accepted build or dashboard entry is not by itself a verified working app. No Vercel deployment URL is claimed by this repository preparation. Browser and native validation evidence is in `VALIDATION.md`.


## Local backup, deletion and launch review

Open **About your local deck** in the desktop sidebar or **No account. Just your own pace.** in the footer. **Local data & privacy** includes Export backup, Import backup and confirmed Delete local data. Exports include tasks, action history, rendered photos and editing sources/crop metadata in unencrypted JSON (64 MB images, 96 MB file limit). Keep files private and verify a copy before deleting data. Imports validate schema, relationships and image decoding, add missing records, keep identical records and compatible event prefixes, and reject conflicting edits without silently replacing them. Importing into a different browser adds records alongside its existing deck; it does not sync. Web backups are not a native iPhone import format.

Deletion clears this browser's task/history data and both image stores, leaving an empty deck. It does not delete backups/OS copies, other devices/browsers, the native app or provider logs. Close other tabs for backup/deletion, especially on browsers without Web Locks. Storage failures preserve existing records where tested; no automatic cloud recovery exists.

Runtime open-source notices are reachable from About and cached for offline reading. Production Vercel configuration adds a restrictive CSP; live hosting headers/features/logs still require the owner's dashboard/response check. The unused Vercel CLI is removed; import settings above are unchanged.

See [launch-readiness audit](../../docs/launch-readiness.md) and [operations/device checklist](../../docs/operations.md). Legal drafts are outside `apps/web` and are **not final published policies**. Operator identity/contact, minor/market review, actual hosted privacy settings, native/device checks and current official-source verification remain release blockers. No live subscription or payment is implemented. The latest prototype policy is 10 active incomplete one-time tasks plus five active habits; an allowance gate preserves drafts. Isolated preview builds offer explicitly simulated Free/Pro testing only. See the guide below.


## Compact desktop queue and prototype plans

See [the testing guide](../../docs/desktop-sidebar-and-plan-testing.md) for the desktop diagnosis/evidence, compact queue sizing, exact 10-task/5-habit counting, isolated 9/10/11-task and 4/5/6-habit fixtures, preview-only simulated upgrades and expiry, photo confirmation/replacement, and remaining real-device/billing-provider checks. Routine Done/Later toasts are replaced by continuous animation, live counts and nonvisual announcements; persistent Undo remains.

Production remains `npm run build` → `dist`. Test tools require a local dev server or an explicit `VITE_ENABLE_TEST_BILLING=true npm run build -- --mode preview --outDir dist-test`; they are absent from a normal production build. Do not deploy `dist-test`. There is no live checkout, price or trusted paid entitlement; browser-local gating is prototype behavior and can be bypassed by modifying client storage/code.


The current sidebar viewport is **three-and-a-half** compact cards, replacing the older five-and-a-half layout. Main Later motion now uses 230 ms outward plus a 480 ms curved return. The corresponding sidebar occurrence lifts, travels above the other rows, and settles its shadow without forced scrolling. See [phase recordings and inspected frames](../../docs/evidence/later-refinement/README.md) for 1/2/4/10 items and a scrolled list. Routine Done/Later toasts remain absent.

## Recurring schedule reconciliation

New habits scheduled today appear immediately in the same state used by Today, the desktop queue, counts, Progress and Widget preview. Other weekdays wait until their date arrives. Dated schedule/text revisions preserve the effective-date policy during backfill and timezone travel. Existing occurrences, action logs, images and IDs remain unchanged. Legacy stores gain revisions only after their saved generation cursor: earlier excluded days cannot be reconstructed reliably and are left intact. Existing backup files remain importable; exports include the additive revisions. See [diagnosis and validation](../../docs/recurring-scheduling.md).

Newly created tasks and today's new habit occurrences go first, with their position saved across reloads. Existing cards retain their relative order; editing does not move a card. The new card's brief entrance/highlight and accessible announcement replace creation toasts. The sidebar reveals its first item internally, and mobile reveals the active card after closing the editor. Other-day habits appear in Habits. See [creation feedback details](../../docs/creation-feedback.md).

The creation footer shows only the selected type's free allowance, with contextual Upgrade guidance at capacity; Pro hides this messaging. Habit creation uses the same immediate top-card feedback through every entry point. Done retains the outgoing card through a 320 ms release animation (90 ms stationary fade with reduced motion), then saves completion and advances. See [habit/quota/Done validation details](../../docs/habit-quota-and-done.md).

## Focused mobile Today

Mobile Today fits the available viewport: compact date/header and +, real stacked cards with edit, labeled Later/Done, and bottom navigation. Open **More actions** for Skip today, Reorder deck, Manage one-time tasks, Undo, task details, and Help & settings. Long content has a full task-details view; creation/editing forms scroll inside their dialogs.

Today totals and the completion bar live in the existing Progress summary. Widget preview, installation instructions, plan usage and local-data controls are in Help & settings. Desktop keeps its compact sidebar and overview. Mobile height adapts to visual viewport/browser chrome and safe areas; unusually short screens, page zoom or enlarged text allow natural scrolling so controls stay reachable. Zoom remains enabled. See [layout validation and evidence](../../docs/mobile-today.md).

## Deadlines and reminder availability

Use **Complete by** or **No deadline** in task/habit forms. Old estimates do not become times. Cards and lists show the deadline in your local time format; overdue stays pending. Deadline/reminder edits apply to unfinished occurrences from today onward, preserving past/finished snapshots and order. One-time deadlines remain on their original scheduled date.

**Web/PWA reminders are not scheduled.** The 30-minute checkbox saves a preference only; there is no configured Web Push backend. No notification permission is requested, and a browser timer is not used to pretend closed-app delivery works. The native app includes local-notification scheduling source, but web/native data do not sync. See [platform setup, policies and verification limits](../../docs/deadlines-reminders.md).
