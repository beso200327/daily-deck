# Daily Deck — browser app

A working React + TypeScript + Vite application in its own directory. The SwiftUI app, WidgetKit extension, Swift package, native project, and native tests remain separate and unchanged.

## Run on your Mac

Use Node.js 24 and npm:

```sh
cd apps/web
npm ci
npm run dev
```

Open the local address Vite prints. To use a different device, use the eventual HTTPS Vercel URL, or Vite's network address on the same LAN if your network/firewall permits it. Production output is static; there is no app server or API.

```sh
npm test             # 33 actual model tests
npm run build        # TypeScript check + optimized production assets
npm run preview      # serve the production build locally
```

## Features and data

- Today: real keyed, layered cards containing each next task’s own image and text; continuous pointer reveal, guarded exit/promotion transitions, and stable deck bounds; real pointer/touch swipes right for Done and left for Later; equivalent buttons; Skip today; undo; creation, editing, deletion, and accessible move-up/move-down reordering. The shared creation form explicitly selects **Today only** or **Recurring habit**; New habit preselects recurring. One-time tasks stay out of Habits and are managed from Today.
- Habits: daily and selected-weekday schedules, optional notes and minute estimates, and an editable starter routine.
- Progress: selectable past-day calendar, retained occurrences and action history, completion timestamps, task/habit filtering including archived habits, day/week/month summaries, and weekly completion bars.
- Responsive ivory/charcoal/lime/peach interface, locally drawn SVG artwork, touch scrolling, keyboard-operable controls, dialog focus, visible focus rings, live action announcements, and reduced-motion support.

**Data lives only in this browser, for this origin. Different browsers, devices, deployment URLs, and the native app do not sync.** No account, backend, payments, ads, analytics, or AI. Clearing site data removes the deck; private browsing and browser storage restrictions can affect retention. Storage failures display errors rather than silently resetting existing data. After the first successful online load and service-worker installation, a cached application shell supports offline reopening. Browser storage/OS eviction can still remove cached assets or local data; this is not cloud backup.

Every habit has a separately dated occurrence. Scheduled days are materialized through the current local date, including missed days while closed. Existing dated snapshots and event logs stay intact after habit edits or deletion. Schedule/title/notes edits to habits apply tomorrow; photo/icon edits update today’s pending occurrence while older dates retain their visual snapshots; deleting a habit retains today's occurrence and stops future generation. Unfinished past habits remain missed or explicitly postponed in history; unfinished one-time tasks carry forward until resolved. Later is never Done or Skip, and a later completion retains the earlier postponement event. Undo records its own event and expires at the next local date or when the card changes again (including reordering).

Dates and weekdays use the browser's local timezone, not UTC-day string slicing. Calendar addition handles daylight saving transitions. Weeks start Monday. Rollover is checked on visibility changes, before actions, and every 30 seconds while visible. Existing date keys stay on their recorded civil dates after travel. Actions retain ISO timestamps, displayed in the current local timezone. Week/month summaries count daily outcomes, so a carried task may contribute more than one task-day. Within a browser, tabs refresh via storage events and mutations use Web Locks where available; browsers without Web Locks have best-effort same-origin tab coordination.

## Task visuals and photos

The three starter habits have distinct walking, reading, and water illustrations. Custom tasks default to a neutral card; choose another icon if you prefer. Walking art is only used when that visual is selected (or for the original walking starter), never as a universal fallback.

Every task and habit can have an optional photo. Use **Choose photo**, **Replace photo**, or **Remove photo** in the shared form. Phone photo libraries and desktop files are supported by the native browser file picker. JPEG, PNG, WebP and AVIF are accepted, up to 20 MB and 48 megapixels; HEIC must be exported as JPEG if the browser does not convert it. Decode failures and unavailable/full storage show errors without replacing the saved task.

Uploads are rasterized without EXIF metadata, resized to a maximum 1200-pixel long edge, and compressed to JPEG at no more than 1 MB. Immutable blobs are stored in IndexedDB (`daily-deck-images`, `photos`). The existing localStorage key (`daily-deck.web.v1`) contains only references and small metadata. Object URLs are created from stored blobs for rendering and revoked after use; they are not the persisted source. Selecting or cancelling a draft does not store a photo. Failed deck saves clean up their newly written image; older photos are retained for historical records, so storage usage can grow.

Existing version-one decks migrate additively and idempotently: IDs, occurrences, outcomes, timestamps and action logs stay intact. Only original starter title/notes pairs get starter illustrations; unrelated older tasks get neutral icons. No reset, reseeding, or duplicate occurrence generation is used.

## Home Screen installation and widget preview

Open the app over HTTPS (or localhost for development). Installation controls and an **Installation guide** are available in the app:

- **iPhone/iPad Safari:** Share → Add to Home Screen → Add. On supported iOS versions, enable Open as Web App.
- **Chrome/Edge:** use Install on Home Screen or the browser’s install icon/menu.
- **Mac Safari:** File → Add to Dock on supported macOS versions.

The manifest uses standalone display, themed 192/512 px icons, and an Apple touch icon. Installing launches the **web app**, not a native iOS Home Screen widget. Browser/OS profiles, separately isolated installs, and other devices do not sync their local decks.

The clearly labeled **Widget preview** in Today shows the actual next task, image and remaining count. Its Done/Later buttons use the same guarded data operations and undo history as the deck. It is an interaction test inside the page, **not an OS widget**. The existing native WidgetKit extension remains separate and unchanged.

The service worker is generated for production builds; use `npm run build` followed by `npm run preview` to test installation/offline behavior locally. Each production build generates a versioned service worker and precaches that build’s shell, hashed JS/CSS, manifest and icons. User data/photos are not stored in the shell cache. Navigation uses the active worker’s consistent cached shell; unknown/non-app requests are not cached. Updated workers wait. A Reload update button is offered and disabled while a form or action is in progress; the user must save/cancel first. Only the consenting tab reloads automatically after activation; other tabs can reload when ready. The previous cache version is retained for in-flight clients, and older Daily Deck shell caches are removed. Service-worker and manifest responses have no-cache headers. First-time installation does not offer a false update prompt.

Actual iPhone Home Screen installation, Safari photo-library behavior, OS storage eviction, and the native app’s WidgetKit execution remain device checks. Native build/signing/App Group provisioning and real widget actions still require Xcode and an iPhone or simulator.

## Browser tests

Use the installed cloud Chromium with `npm run test:e2e`. On a Mac, install Playwright's Chromium and point the tests at its executable:

```sh
npx playwright install chromium
CHROMIUM_PATH="$(node -e "console.log(require('playwright').chromium.executablePath())")" npm run test:e2e
```

`CHROMIUM_PATH` must point to the executable, not a cache directory.

Playwright starts a production preview server automatically. The suite contains 44 cases across both projects (43 passed, one intentional desktop-only touch skip). It covers desktop (1440 px), Chromium with an iPhone-sized touch viewport, pointer and real touch gestures, CRUD, reordering, skip/undo, reload persistence, historical integrity and filters, simulated local-midnight rollover, corrupt-data preservation, additive legacy-data migration, IndexedDB photo compression/replace/remove/reload and failure handling, real next-card DOM retention, zero/one/two-card transitions and duplicate-action guards, PWA offline reopening and explicit update consent, focus/Escape/keyboard interaction, reduced motion, and overflow at 320, 768, and 1024 px. Screenshots are produced under ignored `test-results/`. Chromium device emulation does not verify real iPhone Safari or native widget behavior.

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
