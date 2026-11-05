# Desktop queue, photo and prototype-plan testing

Updated 2026-11-05. Web/PWA only; existing SwiftUI, WidgetKit, native store and tests are preserved. No live billing, charges, account system or deployment was added.

## Diagnosis

On the original production build, a desktop Later action produced **zero main-frame navigations**, preserved the actual `main`, `.today-sidebar` and `.up-next` DOM elements, and kept page scroll at zero before/after. The Later button was not inside a form. This was a visual update problem, not an actual refresh.

The previous sidebar rendered only `cards.slice(0,4)` as flat rows. Postponing an item outside that truncated slice removed its element immediately, another row popped in, and every row's displayed position changed without an animation. The stack's Later endpoint also went completely beyond the viewport before changing z-index and returning. Disabled controls dimmed during the transition, reinforcing a refresh-like appearance.

The new queue renders all pending occurrences with stable occurrence IDs. It keeps DOM order stable while CSS transforms animate logical positions, then updates reading/tab order after settling. Done items fade/slide out; Later goes to the actual bottom; Undo restores logical order. The same scroll container remains mounted with scroll anchoring disabled. Scroll position is preserved unless the list shrinks enough that the browser must clamp it to the new maximum.

Main actions explicitly use `type="button"`. App state updates after the card's exit phase; no reload, navigation, window scrolling or page remount is part of an action. Counts, progress, queue order and widget preview derive from the same persisted deck state. Routine Done/Later messages are announced nonvisually; the persistent Undo button remains. Important errors and other useful notifications are retained. Save-toast placement also protects footer and installation controls so a hover-paused message cannot block those actions.

## Compact queue sizing and access

Each compact card is **60 px** tall with an **8 px** gap. Actual untransformed row height and CSS gap are measured by `ResizeObserver`, so density changes keep the half-card calculation accurate. At normal desktop height, the scroll area is `3.5 × 60 + 3 × 8 = 234 px`: three complete cards and the upper half of the fourth (replacing the older five-and-a-half requirement). The heading and count sit outside it. Actual height is the minimum of content height, 234 px, and a reduced short-window budget (with a small usable minimum). Fewer than four items use only their content height, with no unnecessary scrolling.

All items show title, explicit task/habit label, current-item dot/“Up next” label where applicable, and an accessible Edit button. Mouse wheel/trackpad scroll normally. Focus the region to use Arrow Up/Down, Page Up/Down, Home/End; Tab reaches editing controls. The mobile sidebar remains hidden as before; uploaded Habits photos use a responsive 2:1 rounded cover instead of the icon badge.

## Explicit free policy

The latest request supersedes the older tentative six-habit/daily-task wording. The web prototype now uses:

- **10 active incomplete one-time task definitions**, not today's total cards or a per-day creation allowance.
- **5 active recurring habit definitions**, including starter habits. Habit occurrences do not use the one-time allowance.
- Completed, explicitly skipped/closed, deleted/archived one-time tasks free capacity. Later does not.
- The 10th task and fifth habit save; growing beyond either limit opens the allowance dialog **before deck persistence**. The form retains title, notes, type, schedule and photo draft. The file is local, not a charge or purchase.
- Existing over-limit data is not hidden, deleted or locked for editing. Actions that do not increase active usage remain possible. Reactivation/Undo/import that would increase usage beyond the allowance is gated rather than silently bypassing the limit. Existing Undo tokens/drafts remain available to retry.
- One shared before/after capacity check guards app commits; import checks capacity before adding photos or writing a deck. There is no Duplicate/Reactivate/Convert screen in this MVP; tests exercise equivalent proposed-state increases, and existing type conversion is still intentionally disabled to protect history. Any future write path must use this guard.

Usage labels distinguish **Tasks n/10** and **Habits n/5**; simulated Pro shows Unlimited. No real entitlements, payment SDK, checkout, receipt verification, subscription renewal or billing sandbox existed before this change, and none was added. Browser-local limits and test entitlements can be bypassed by modifying client code/storage; **they cannot securely enforce a paid service**. The earlier USD 3.99 proposal is not used as a live price or charge.

## Production versus isolated preview

Normal production build and owner-managed Vercel settings remain unchanged:

```sh
cd apps/web
npm ci
npm run build
npm run preview -- --port 4173
```

The production build has **no billing test controls, test plan setter, fixture bootstrap or preview entitlement key in its emitted JavaScript**. A URL query or forged preview-Pro localStorage entry cannot enable them. Do not point a public production deployment at the test output.

For local/isolated preview testing only:

```sh
cd apps/web
VITE_ENABLE_TEST_BILLING=true npm run build -- --mode preview --outDir dist-test
npm run preview -- --outDir dist-test --port 4174
```

Open About → **Test mode — no real payment**. `npm run dev` also enables these tools locally. Both the explicit preview build mode and flag are required for a preview production build; setting a runtime key or setting the flag on a normal `production` build does not enable it. `dist-test` is ignored by Git and is not the Vercel output directory.

Choose task fixtures **9/10/11** and habit fixtures **4/5/6**, then **Open isolated fixture**. Every window gets a unique `sandbox` URL identifier, separate deck key, IndexedDB database and test entitlement key. Fixtures include the starter routine within their habit counts. They never reset the normal deck or overwrite one another. Record the URL to reload that same sandbox. Always use an isolated fixture/profile for destructive backup/erase tests; never seed fixtures into an owner's normal data.

### Manual matrix

1. Free fixture 9 tasks/4 habits: add a today-only task and daily/weekday habit. Confirm 10/10 and 5/5 and exactly one scheduled occurrence. An unscheduled habit counts as a definition but contributes no occurrence today.
2. Try an 11th task/6th habit. Set title/notes/duration, weekday selections and a photo; save. The allowance dialog appears; Back to draft preserves all fields and image. Canceled/failed test checkout does not change Free or write the new item.
3. Use **Simulate successful upgrade**. It states “no real payment.” Return to the unchanged draft and save. Reload the same sandbox: simulated Pro remains active, with an expiry timestamp (default 30 days), and Unlimited labels. No actual purchase occurred.
4. Use **Simulate expiry** or **Simulate Free**. Existing over-limit data remains visible/editable; further growth is gated. Canceling/failed simulation never downgrades an existing Pro state or claims a charge.
5. Complete/skip/delete an active one-time task and verify a new slot; Later must not free one. Archive a habit and verify its slot is freed while its occurrence/history remain. Undo that would exceed capacity is gated without overwriting history.
6. Import a valid backup that adds active records above either cap. Confirm it opens the gate before persistence/photo additions, preserving pending import and existing records. Matching/idempotent imports with no capacity growth still work.
7. Preview tools offer canceled/failed/success/expired **simulations only**. Real-provider sandbox, StoreKit purchase restoration, refunds/renewal states and trusted entitlements **cannot be verified because no billing integration exists**. They require a separate approved implementation.

## Photos and visual interactions

- Choose/Replace first opens an app-styled informational confirmation: “Choose a photo to add to this task. The app receives only the photo you select.” Continue opens the real system picker; Cancel leaves the form unchanged. It is not an OS permission grant or full-library authorization. No broad library/camera API access is requested.
- Inside Adjust photo, **Choose another photo** uses the same explanation/picker. Cancel either dialog/picker: keep the current image and crop. A valid replacement initializes the new image's centered crop at 1×. Unsupported files preserve the old crop with an actionable error.
- Verify saved crop on Today, the Habits cover and edit preview, plus reload/re-edit persistence. Source selection/crop/storage remain local; existing network/source audits find no photo uploads or analytics. Actual iPhone picker/HEIC/Safari still need real-device testing.
- Later buttons/drag use the same release path. A long left drag continues outward from its release position while retaining a visible edge where possible, then lowers behind the real next card and settles. Done exits to the right before removal. The outgoing card remains the same mounted opaque element through release/return; it can unmount after completion when it lies outside the top-three visible stack. Below-threshold drags spring back. Reduced motion uses brief feedback.

## Evidence and regression commands

[Desktop queue](evidence/later-refinement/10-items-queue.png) shows the three-and-a-half-card viewport with 10 pending items (3 habits + 7 tasks), distinct from billing usage. [Actual Later screencast](evidence/later-refinement/10-items.webm) and [sampled frame sequence](evidence/later-refinement/README.md) show outward, return and settling phases; recordings also cover 1, 2 and 4 items and a scrolled 10-item list. The synthetic fixture contains no user data.

```sh
cd apps/web
npm test
npm run build
npm run test:e2e
# With :4173 already serving the final build; requires Chromium and ffmpeg:
node tests/capture-later-refinement.mjs
```

The browser harness starts a separate explicit preview server on :4174 for the simulated-billing tests. It uses fresh contexts; owner browser data is never opened. The suite covers 0/1/2/4/10 queue sizes, with retained repeated-action/Undo coverage at 12, a shorter window, wheel/keyboard scrolling, stable DOM identities, no navigation, repeated actions/Undo while scrolled, both release directions, photos, Free boundaries, import/draft preservation, simulations and isolation. Chromium emulation is not real iPhone/Safari or native WidgetKit verification.

Final validation: production build and **51 model tests** passed; the current complete browser run had **115 passed and 11 intentional skips (126 cases)**. Native project/resource validation passed, with no native source changes. No manual deployment; a normal GitHub push may trigger the owner's existing automatic Vercel integration.


## Refined shared motion clock

Later uses **230 ms outward** and **480 ms return/settle**, configured centrally in `motion.ts`. At the outward endpoint, only a narrow edge overlaps the stack; only then does the moving card change stacking layer. A CSS keyframe path carries the same opaque node behind the deck with a gentle lower arc. The next real card finishes promotion during that return, rather than jumping forward before it. Button and gesture actions use this same sequence.

The compact card lifts before the one shared persisted reorder. During return it travels with a raised shadow at z-index 30, while other cards slide upward. It reaches its destination before its 90 ms visual settle removes the raised shadow. An offscreen destination is reached through the clipped bottom edge; the scroll port is never moved by the action. Reading order updates after the motion, and duplicate input/Undo remain blocked until the shared sequence completes. Reduced motion removes the curved travel and uses brief feedback.
