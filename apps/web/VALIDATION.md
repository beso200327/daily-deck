# Web validation — November 5, 2026

This update adds task-specific visuals, persistent photos, actual stacked task cards, explicit task types, PWA installation/offline caching, and a labeled browser-only Widget preview. No manual deployment is part of this task.

## Model and build checks

- `npm test`: 33 model tests passed. These include the existing recurrence/action/history suite and new tests for in-place version-one migration, unrelated neutral visuals, today-only versus recurring creation, exact-once occurrence generation, selected weekdays, validation, dated photo/icon snapshots, JSON reference persistence, immutable task type on editing, and drafts saved across midnight.
- `npm run build`: TypeScript and the optimized Vite build passed, including generated versioned `sw.js`, manifest, and installation icons.
- Existing native iOS/WidgetKit code is preserved. Native SDK builds, signing, simulator runs, OS widget behavior and App Group provisioning were not verified by this web environment.

## Browser regression evidence

Desktop Chromium and an iPhone-sized Chromium touch viewport are used against the **production build**, with additional layout checks at 320, 768, and 1024 CSS pixels. The full suite passed with **43 browser tests passed and one intentional desktop-only touch skip**. The real-touch case passed on the mobile project.

The suite exercises task actions, keyboard controls, recurrence and midnight rollover; one-time and recurring entry points; immediate Habits rendering; duplicate-save prevention; real behind-card images/text and keyed DOM promotion without changing deck bounds; actual mouse/touch gestures; zero/one/two-card states and reduced motion; duplicate animation-action prevention; undo; legacy ID/event preservation; completion timestamps and summaries; and responsive layouts.

Photo checks use actual browser canvas compression and IndexedDB: a generated 1800×900 PNG becomes a 1200×600 JPEG under 1 MB. The blob survives reloads, stays with the right task across Later/undo, and never appears as base64 or a blob URL in localStorage. Replace and remove are exercised, including retaining old immutable blobs for history. Unsupported input and injected storage-denial failures show errors without saving invalid references.

PWA checks verify manifest metadata and Apple icon links, register the actual built service worker, reopen offline after a completed action, and verify persisted state. An actual replacement worker (registered through a changed script URL for the test) waits while an unsaved form is open; Reload update is disabled until the form is saved, and activation only occurs after explicit consent, preserving the saved task.

Browser testing exposed and corrected first-install update notices, desktop grid auto-margin shifts after queue changes, compact-screen horizontal overflow, and action-label spacing above the fixed mobile navigation. Tests wait for real saves and transition locks rather than reading storage before an asynchronous commit finishes.

## Remaining limitations

- Chromium device emulation is not physical iPhone Safari. Actual Home Screen installation, Safari photo-library/HEIC conversion, and Safari accessibility/gesture behavior remain unverified on hardware.
- Data, images and caches are local to the browser/origin. No cross-device, native-app, or cross-profile sync. Clearing/evicting site storage can remove them. Photos are not exported/backed up; retained historical blobs can consume local quota.
- Unsupported image types (including unconverted HEIC) require conversion to JPEG/PNG/WebP/AVIF.
- Web installation and Widget preview are not a native iOS widget. The native WidgetKit extension still needs Xcode and a signed iPhone or simulator for verification.
- Pushing the GitHub branch may trigger an existing automatic Vercel Git deployment. No manual Vercel deployment is performed or claimed here.
