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
npm test             # 22 actual model tests
npm run build        # TypeScript check + optimized production assets
npm run preview      # serve the production build locally
```

## Features and data

- Today: one layered card; real pointer/touch swipes right for Done and left for Later; equivalent buttons; Skip today; undo; creation, editing, deletion, and accessible move-up/move-down reordering.
- Habits: daily and selected-weekday schedules, optional notes and minute estimates, and an editable starter routine.
- Progress: selectable past-day calendar, retained occurrences and action history, completion timestamps, task/habit filtering including archived habits, day/week/month summaries, and weekly completion bars.
- Responsive ivory/charcoal/lime/peach interface, locally drawn SVG artwork, touch scrolling, keyboard-operable controls, dialog focus, visible focus rings, live action announcements, and reduced-motion support.

**Data lives only in this browser, for this origin. Different browsers, devices, deployment URLs, and the native app do not sync.** No account, backend, payments, ads, analytics, or AI. Clearing site data removes the deck; private browsing and browser storage restrictions can affect retention. Storage failures display errors rather than silently resetting existing data. No offline asset cache/service worker is provided; opening the app normally requires the hosting site to load.

Every habit has a separately dated occurrence. Scheduled days are materialized through the current local date, including missed days while closed. Existing dated snapshots and event logs stay intact after habit edits or deletion. Edits apply tomorrow; deleting a habit retains today's occurrence and stops future generation. Unfinished past habits remain missed or explicitly postponed in history; unfinished one-time tasks carry forward until resolved. Later is never Done or Skip, and a later completion retains the earlier postponement event. Undo records its own event and expires at the next local date or when the card changes again (including reordering).

Dates and weekdays use the browser's local timezone, not UTC-day string slicing. Calendar addition handles daylight saving transitions. Weeks start Monday. Rollover is checked on visibility changes, before actions, and every 30 seconds while visible. Existing date keys stay on their recorded civil dates after travel. Actions retain ISO timestamps, displayed in the current local timezone. Week/month summaries count daily outcomes, so a carried task may contribute more than one task-day. Within a browser, tabs refresh via storage events and mutations use Web Locks where available; browsers without Web Locks have best-effort same-origin tab coordination.

The iPhone Home Screen widget belongs to the **native SwiftUI app**. This web app has no interactive native iOS widget.

## Browser tests

Use the installed cloud Chromium with `npm run test:e2e`. On a Mac, install Playwright's Chromium and point the tests at its executable:

```sh
npx playwright install chromium
CHROMIUM_PATH="$(node -e "console.log(require('playwright').chromium.executablePath())")" npm run test:e2e
```

`CHROMIUM_PATH` must point to the executable, not a cache directory.

Playwright starts a production preview server automatically. It covers desktop (1440 px), Chromium with an iPhone-sized touch viewport, pointer and real touch gestures, CRUD, reordering, skip/undo, reload persistence, historical integrity and filters, simulated local-midnight rollover, corrupt-data preservation, focus/Escape/keyboard interaction, reduced motion, and overflow at 320, 768, and 1024 px. Screenshots are produced under ignored `test-results/`. Chromium device emulation does not verify real iPhone Safari or native widget behavior.

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
