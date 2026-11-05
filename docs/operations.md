# Release, recovery and support runbook

Engineering procedure, checked 2026-11-05. No launch/legal certification. See `launch-readiness.md` for blockers and pending official verification.

## Ownership required before release

Assign release approver, support/privacy contact and incident responder; the owner deferred legal identity/contact. Choose hosting regions/log retention/optional analytics/DPA and exact markets. Do not send example task text, photos or user backup files to GitHub issues or support logs. Ask for reproduction steps/browser/OS and redacted screenshots only; any necessary diagnostic-file transfer needs explicit consent, a secure channel, purpose and retention/deletion plan.

## Web release validation

1. On a clean checkout, Node 24, `cd apps/web`, `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`. Linux Playwright uses `/usr/bin/chromium` or `CHROMIUM_PATH`; install supported browser prerequisites outside source.
2. `npm audit` (all dependencies) and `npm audit --omit=dev`. Review actual advisories and update narrowly, then rerun tests. No automatic force-fix/major replacement.
3. Review diff for secrets and generated artifacts. Keep node_modules, dist, .vercel, test-results, backups and credentials out of Git. Preserve lockfile. Enable GitHub secret scanning/access restrictions where available; local pattern scans do not establish full-history assurance.
4. Use the exact owner-managed Vercel settings in `apps/web/README.md`: `main`, Root `apps/web`, Vite, `npm ci`, `npm run build`, `dist`, environment variables **none**. Do not manually deploy as part of this task.
5. Owner checks deployed HTTPS/headers (CSP, permissions, SW no-cache), domain/DNS, dashboard analytics/toolbar/logging/retention/regions/DPA and security access. Verify no unexpected SDK injection or private content in request URLs/logs. Repository config alone is not live evidence.
6. Before destructive testing, export and verify a backup **in an isolated browser profile**, including photo crops/history and repeat import. Imports add records alongside existing data and reject conflicting edits; they are not a synchronization/overwrite tool. File limits: 64 MB images, 96 MB JSON. Keep backups private; legacy sources may contain metadata. Never run automated erasure tests against an owner's real browser profile.

## Real-device checklist (not completed here)

- iPhone Safari at narrow width, actual software keyboard, zoom, orientation/viewport changes and safe areas: all fields/footer reachable, no sideways modal pan, backdrop locked. Desktop Safari, keyboard-only and VoiceOver: meaningful labels/focus/readout, no focus theft; reduced motion enabled.
- Slow/subthreshold drags spring back; fast/right exits remain visible; left moves the same card behind the real next one; Done/Later use the same transitions; 0/1/2 cards, repeat taps, undo/order, midnight and travel across timezones.
- System photo-picker cancel/denial/unreadable format, HEIC conversion behavior, large/unsupported images, local drag/pinch/slider crop, reset/cancel/reopen existing photo, replace/remove and reload. No launch/form-open picker or simulated permission prompts. Newly normalized sources have no EXIF; old data is untouched.
- Install from Safari Share → Add to Home Screen. Open standalone; actual keyboard/safe areas, offline reload/history, storage unavailable/full/eviction/private mode, backup download/import and deliberate confirmed deletion in an isolated profile. App installation is not an iOS widget.
- Online update with a text draft/data modal open: reload disabled. Save/close then consent; draft/history survives. Also test two installed windows/tabs; active worker changes must not lose persisted data. Older browsers without Web Locks need special multi-tab testing; keep other tabs closed for backup/delete. No automatic backup or cross-browser conflict resolution is promised.

## Native release / App Store reviewer scenario (requires Xcode)

1. Verify current Apple submission toolchain requirements from official sources. Open `DailyDeck.xcodeproj`, choose real Team/bundle IDs and registered matching App Group for app/widget. Build app, embedded extension and XCTest in a supported Xcode; run native XCTest and simulator plus real device. Linux Foundation tests are not an iOS build.
2. Inspect archive privacy report against `PrivacyInfo.xcprivacy` (both targets), SDK contents/required-reason API use and actual network/device backups. Validate file protection/App Group, corruption handling and no surprise permissions. Source uses no tracking/remote SDKs; no blanket App Store privacy approval follows.
3. Capture truthful native screenshots and complete actual current age questionnaire, privacy labels, stable final privacy/support URLs and review metadata. Do not submit the web Widget preview as an OS widget.
4. Reviewer currently needs **no login**: create today-only task, habit daily/weekday, action/undo/reorder, choose a past date in Progress and inspect outcomes. Native does not yet implement the web photo editor or web backup UI; describe only actual native functionality.
5. Add actual WidgetKit widget with Home Screen Edit/Add Widget, confirm next title/remaining count; Done/Later AppIntents update shared App Group and timelines, app foreground sees actions, stale/duplicate taps do not double-act, reduced-motion/accessibility and empty widget work. Swift core tests exercise actions but OS refresh/runtime are still unverified.
6. Future paid version: do not submit until StoreKit/approved checkout entitlement handling, prices/renewal/cancellation/restoration and all purchase states have working review steps. No such billing is currently implemented.

## Rollback and recovery

- Roll back code by a normal reviewed Git revert/new commit or owner-managed Vercel previous deployment. Do not force-push or reset user storage. Record commit and production result. A cached PWA may keep its previous shell until a new worker is accepted; test update delivery.
- Storage changes are additive: web deck stays v1; photo DB v2 retains `photos` and adds `edits`. Never delete old photo/history stores as a code rollback step. Old sources cannot recover original detail not saved previously.
- Recover local data by importing a validated web backup in an isolated profile first. Matching records are idempotent; conflicting newer edits reject instead of overwrite. Preserve current backup before any manual repair. There is no server copy or native backup importer.
- Local erasure affects deck/photos/history only after explicit confirmation. It leaves an empty marker to avoid accidental starter reseeding. App shell cache, downloaded files, hosting records, other browsers and native/OS backups are separate. Recovery of deleted local content requires a usable prior backup.

## Incident procedure

1. Triage affected versions/platforms and contain exposed credentials or unneeded hosting/SDK integrations without publishing private samples. Preserve minimum access-controlled evidence and original data; do not silently wipe stores.
2. Determine data categories, recipients, time window, countries, minors and provider logs actually affected. Assign an incident lead and qualified privacy/legal reviewer; no public contact has been assigned yet.
3. Assess applicable statutory/provider/user notification duties and deadlines using current law and counsel (do not assume one universal deadline). Notify through verified channels; never expose task text/photos in public tickets.
4. Patch, run regression/security/device checks, restore only verified backups where needed, document affected hashes and outcome, then delete unnecessary diagnostic data under the approved retention plan.
