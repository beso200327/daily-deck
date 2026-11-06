# Validation — November 5, 2026

The original mobile-fix run below is retained as evidence. The launch-readiness checks and newer behavior are described in `../../docs/launch-readiness.md`.

## Verified implementation and privacy scope

The existing web photo flow was a system `<input type="file">`, invoked only by Choose/Replace. It receives selected file bytes/metadata, not photo-library enumeration or full-library permission. The website does not control iOS selected/full-library authorization and implements no imitation iOS permission dialog. Launch and form-open paths do not invoke a file picker. Previously selected images are read from the app's own local IndexedDB for display.

The exact UI copy is: “Only the photo you select is added. It stays on this device.” Source inspection found no upload/analytics/beacon/PhotoKit authorization code. A browser network test observed no POST/PUT or third-party HTTP request through selection, crop and save. The unchanged native app currently has no PhotosPicker/PhotoKit photo-access implementation or authorization requests; a future selected-photo feature should use PhotosPicker without unnecessary broad library authorization.

## Completed checks

- `npm test`: **38 model tests passed**, including four crop-geometry tests and the regression for rapid identical-timestamp actions selecting the correct undo token.
- `npm run build`: strict TypeScript and the Vite production build passed, generating the offline shell and install assets.
- `npm run test:e2e`: **67 passed, three intentional desktop-only touch skips (70 cases)** in the final complete run. Desktop and iPhone-sized touch projects ran against the production build. Earlier runs exposed nested-dialog assertion and temporary service-worker fixture races; assertions now wait for crop dismissal and the actual consented reload.
- Photo-save also passed five repeated desktop executions. The affected focus, photo-save and touch-toast cases passed three repeated executions per project (15 passed, three intentional desktop-only touch skips in that targeted repeated run).

## Browser behaviors exercised

- Explicit picker opening only from a user tap/click, picker cancellation preserving form contents, and local-only selected-photo processing.
- Dragging a crop, slider zoom, actual two-touch pinch without changing browser zoom, Reset, Cancel, Use photo, persisted crop display, and re-editing a saved image without opening the picker. Retained source bytes match across re-edits.
- Original EXIF orientation 6 decodes to the expected rotated dimensions. Rendered JPEG removes EXIF; newly selected source is normalized to oriented PNG and strips EXIF too. Older stored originals are not rewritten.
- IndexedDB version-one photo blob migration into the additive version-two database without changed photo IDs, legacy bytes, task IDs or history. Version two retains the `photos` store and adds immutable editing sources/crop metadata under `edits`.
- Form field bounds/scroll widths, 16 px text, locked background and reachable Save/Cancel at widths **320, 375, 390, 430 and 1024**, including 400 px high keyboard-sized viewports. Existing page layout tests also cover tablet/desktop. Focus returns to photo controls after crop editing instead of reopening the text keyboard. Narrow-view screenshots were inspected.
- Ordinary notifications expire after about 3 seconds; Undo notifications after about 6. Hover/focus pause the remainder, newer message timers replace older ones, manual close works, navigation clears obsolete notices, and touch-generated compatibility hover does not leave notifications stuck. Notification bounds avoid the primary task controls.
- Release cards remain opaque and connected during the approximately 320 ms exit. State is not changed before exit completion. Later preserves the same keyed DOM node through outward and bottom-return phases; transform completion events are observed for both phases. The next real card stays rendered. Slow/subthreshold drags, short quick flicks, buttons, repeated actions, correct undo, zero/one/two-card states, and reduced motion are covered.
- Existing recurrence, persistence, calendar/history, summaries, data migration, PWA offline reopening and consent-based update tests remain in the full suite.

## Unverified and limitations

- No real iPhone, Safari keyboard, or OS-installed standalone PWA window is available here. Chromium device emulation and visual-viewport resizing are not hardware verification.
- WebKit was not installed. An attempt to obtain the official Playwright Linux container failed during image retrieval with `download failed after attempts=6: Forbidden`. No WebKit or Safari pass is claimed.
- Actual iOS Photos permission/denial UI belongs to the browser/OS and cannot be manufactured or controlled by this website. Real phone photo-library/HEIC behavior remains a device check. Unsupported files and unavailable storage are exercised with clear non-destructive errors.
- The original high-resolution source cannot be recovered for photos saved before sources were retained; their existing rendered blob becomes the best available editing source. New selections now retain metadata-free source pixels; legacy originals may still contain metadata. Both consume local quota. Clearing/evicting browser storage removes local data; there is no cloud backup or synchronization.
- Native Swift behavior and WidgetKit are unchanged; an explicit privacy baseline resource is now included in both native targets. Native SDK compilation/signing, device/simulator execution and OS widgets still require Xcode and an iPhone or simulator.
- No manual Vercel deployment is performed. A push to `main` may trigger an existing automatic Vercel Git integration.


## Launch-readiness audit validation

- Final production-browser run: **79 passed, three intentional desktop-only touch skips (82 cases)**. Model/geometry/backup suite: **43 passed**. Production TypeScript/Vite build passed. Native core: **26 XCTest tests passed** in the pinned Linux Swift container; project/resource validator passed. Full dependency advisory audit reports **zero vulnerabilities** after removing the unused deployment CLI and updating Vite/Vitest within their existing major versions.
- New browser cases verify photo/history backup round-trip after confirmed deletion, idempotent re-import, conflict/invalid-schema rejection, added-photo rollback after localStorage failure, failed deletion restoring the prior deck, persisted timezone travel forward/back, configured production CSP in a browser harness, and processing without bitmap/offscreen APIs.
- New selected-photo sources strip EXIF/GPS through oriented pixel normalization. Older immutable photos/history are preserved. Normalized edit-source bytes remain stable across repeated crops. Crop processing can be asynchronous for several seconds; focused assertions wait up to 15 seconds for completion, rather than assuming a five-second budget. No real iPhone processing-performance claim is made.
- Existing offline, CRUD, recurrence, history, undo/reorder, actual touch/mouse/keyboard, reduced-motion, narrow-modal, toast and animation checks remain in the passing full suite.
- Current official legal/platform-source retrieval is blocked at the proxy with 403; no legal certification or launch approval is claimed. See [the full checklist](../../docs/launch-readiness.md) for owner decisions, public-notice/hosting gaps, and real-device/App Store blockers.


## Desktop queue, prototype limits and photo-flow update

- Final production build passed. `npm test`: **51 passed**. Final complete `npm run test:e2e`: **103 passed, 9 intentional skips (112 cases)**. The skips comprise three desktop-only touch cases (executed in the mobile project) and six desktop-sidebar cases omitted in the mobile project because that sidebar is intentionally hidden there.
- Verified exact queue geometry for **0, 1, 5, 6 and 12 pending items**: 60 px cards, 8 px gaps, 370 px five-and-a-half-card viewport, content-sized short lists, shorter-window reduction, no horizontal overflow, wheel and keyboard scrolling.
- Repeated Later/Done/Undo while the sidebar is scrolled preserves main/sidebar/scroll-port DOM identities, order and scroll position where the scroll range permits it. No main-frame navigation/reload occurred. Shared counts and widget-preview state remain consistent. Buttons explicitly have non-submit types.
- A slow left release continues outward from the drag position. Both phases keep the same opaque card mounted, with the next real card visible. Single-card, reduced-motion, duplicate-input and subthreshold/quick-drag regressions remain covered. Actual desktop screenshots, WebM screencast and frame samples are committed under `docs/evidence`; they contain only synthetic data.
- Free-policy model cases cover 9/10/11 active one-time tasks and 4/5/6 active habit definitions, starter inclusion, habit-occurrence exclusion, Later versus closed/completed/archived capacity, existing over-limit edits and growth/reactivation/Undo guards. Browser cases cover boundary saves, rejected next item, preserved text/type/photo drafts, gated import without persisted growth, test upgrade/reload/expiry/cancel/failure and isolated fixture storage.
- Production bundle scan found **no test tools, fixture bootstrap, preview entitlement storage key, or preview entitlement polling/listener**. Preview is an explicit separate build/output/port; there is no real billing provider or trusted paid entitlement. No live price/charge was added.
- Photo tests cover the app informational confirmation before the real picker, no picker on launch/form-open, confirmation cancellation, Choose another photo inside the crop editor, OS-picker cancellation retaining the existing source/crop, a valid replacement resetting its crop, persistence and a responsive Habits cover. Existing selected-file-only/local-only processing checks remain green.
- An earlier suite run exposed a new test setup race (capturing the scroll container before app readiness); the fixture now waits for the active card. A subsequent run found a real save-toast overlap with the mobile footer. Toast placement now protects footer/installation controls as well as primary actions; that storage-failure/footer-click scenario passed four repeated desktop/mobile checks, then the full suite passed.
- Native code/project/store/widget/test files are unchanged. The deterministic Xcode project/resource validator passed. No iOS build, actual iPhone/Safari/PWA install or real payment-provider sandbox verification is claimed.
- [Manual Free/preview-Pro guide and diagnosis](../../docs/desktop-sidebar-and-plan-testing.md). Vercel import settings remain unchanged. No manual deployment; GitHub push may trigger the owner's existing auto-deployment.


## Later return and three-and-a-half-card refinement

- Production TypeScript/Vite build passed. `npm test`: **51 passed**. Final complete browser suite: **115 passed, 11 intentional skips (126 cases)**. Skips are the prior viewport-specific cases plus the new desktop-only scrolled-sidebar/density checks omitted from the mobile project.
- Main Later uses a shared 230 ms outward / 480 ms return clock. The outward endpoint leaves only a narrow edge overlapping the stack; first-return samples in the desktop recordings measured approximately 39 px of overlap before the original node travels behind the next real card. CSS keyframes provide a continuous lower arc with no opacity changes, while next-card promotion continues during return. Gestures and buttons use the same action transaction.
- Sidebar viewport now uses **3.5 measured card heights + 3 gaps**, replacing five-and-a-half cards. At 60 px / 8 px it is **234 px** and reveals 30 px of the fourth card. The test changing density to 64 px / 10 px verified **254 px** and a 32 px half-card. Short-window sizing, keyboard/wheel scrolling, no horizontal overflow and content-sized one/two-card lists pass.
- Compact Later phases are lift → raised travel → settle: original occurrence node at z-index 30, shadow above neighboring rows, downward motion as the other rows slide upward, then shadow removal. The reading order changes after motion. An offscreen destination is reached through the bottom clipping edge without scrolling or teleporting into view.
- Dedicated intermediate-frame cases passed for **1, 2, 4 and 10 pending items**, including a 100 px scrolled sidebar, duplicate input, a single Later event, correct Undo, retained node identity, opacity, separation at the layer change, native animation completion and reduced motion. Existing action/history/persistence/photo/limit regressions remain green. Done/Later toasts were not restored.
- [Five actual Chromium recordings and inspected frames](../../docs/evidence/later-refinement/README.md) use synthetic data only. Native browser events report 230 ms outward and 480 ms return in every recording; all busy frames keep the main node mounted and opaque, all three list phases occur, and scroll values remain constant. Outward/return/settling frames for four/ten items and the scrolled case were opened and inspected, as were extracts from one/two-item videos.
- Native source, storage schemas, history, image storage and entitlements are unchanged. Xcode project/resource validation passed. No real Safari/iPhone, installed PWA or native widget execution is verified by these Chromium recordings.
- No manual deployment. A normal GitHub push may trigger the existing owner-managed Vercel automatic deployment.

## Recurring scheduling reconciliation — 2026-11-05

- Final full Playwright run: **131 passed, 11 intentional viewport-specific skips (142 cases)** on Chromium desktop and iPhone-sized/touch projects.

- Production TypeScript/Vite build passed; **67 model/storage tests passed** across eight files. Added coverage includes selected/excluded weekday creation, inherited cursors, missing known occurrences, completed/skipped identity, dated revisions/backfill, legacy migration, backward-clock edits, malformed schedules, backup compatibility, shared-lock ordering, storage failure, midnight and both DST transitions.
- Browser scheduling cases cover immediate creation across Today/sidebar/counts/Progress/Widget preview, selected-day reopening, repeated reloads, completed/skipped preservation, exact local midnight, restored pages without timer execution, edit effective-date text and reconciliation waiting for the mutation lock. The existing Tokyo/New York/Tokyo travel regression verifies unchanged recorded cards and no duplicate habit/date pairs.
- The additive version-1 schedule ledger preserves existing cards/events/images and unknown legacy historical decisions. No local data reset or new dependencies. Normal edits remain effective tomorrow, with the exact date displayed; backward clock changes preserve already-reconciled dates.
- Native source/project/widget/tests remain unchanged. Xcode project/resource validator passed. Actual Safari, installed PWA, Xcode build and native widget execution remain unverified in this Linux/Chromium environment.
- No manual deployment. A normal GitHub push can trigger the owner's existing Vercel auto-deployment.

## Habit deletion and separate confirmation — 2026-11-05

- Full Chromium regression run: **141 passed, 11 intentional viewport-specific skips (152 cases)**. Final production rebuild and 69 model tests passed after the summary/styling refinement; **10 targeted deletion browser cases passed** against that build, including completion denominators and an inspected 320 px confirmation screenshot.

- Web deletion now closes unfinished linked occurrences from today onward (including Later/future cards) with a distinct deletion event, archives the habit, releases its slot, and preserves past and completed/skipped snapshots and photo references. Native core uses the same policy and existing App Group transaction/widget timeline refresh. Deleted records do not reduce completion percentages; Undo cannot resurrect a deleted habit's closed occurrence.
- Confirmation is a separate top-layer modal; 320 px scrolled-form cases verify both buttons fit, Cancel/Escape preserve the draft and restore focus, and a failed write preserves storage with actionable retry. Native editor now uses a separate SwiftUI alert with the same message.
- Production build passed. **69 web model/storage tests passed; 28 Swift core tests passed** using Swift 6.0.3 in a network-disabled Linux container. Xcode project/resource validation and whitespace checks passed.
- Targeted deletion browser checks cover pending, Later, completed, skipped, shared queue/widget counts, reload/foreground rollover, and narrow dialog failure/cancel/retry. No image deletion or schema reset is introduced. Native SwiftUI compilation, actual Safari/PWA dialog behavior and WidgetKit runtime updates still require Xcode and an iPhone/simulator; Chromium emulation does not verify them.
- [Behavior and diagnosis](../../docs/habit-deletion.md). No manual deployment; a GitHub push may trigger existing Vercel automation.

## Creation feedback and top-of-deck ordering — 2026-11-06

- Final complete Chromium run (`npm run test:e2e -- --workers=2`): **151 passed, 11 intentional viewport-specific skips (162 cases)**.

- Production TypeScript/Vite build passed; **71 model/storage tests passed**. New creation prepends only the fresh occurrence using persisted order, preserves existing records and relative order, and leaves edits in place. Initial starter order is preserved; no migration/reset is needed.
- Creation closes only after a successful transaction, announces politely without focus transfer, reveals the card with a brief entrance/fading highlight, updates queue/counts/preview from the same snapshot, and creates no save toast. Other-day habits appear in Habits. Reduced motion suppresses entrance movement and uses instant scrolling.
- Browser regressions cover empty/existing decks, error/retry with preserved fields, held-lock Saving state, rapid clicks with one resulting task, desktop sidebar-only scrolling, mobile reveal after background scroll restoration, weekday habits, photo creation/reload and free-plan gates. Existing toast lifetime tests now use edits as their temporary notice source, since creation intentionally has no toast. PWA update/reload checks expect the newly saved card first.
- An initial mobile reveal aligned to an animated card and clipped its top by the entrance offset. The final implementation targets the stable deck section. Old assertions that moved a freshly created bottom card upward were updated to assert it already occupies the first position.
- Test maintenance: timezone travel now seeds on an explicit fixed date instead of mixing the real date with November 5 travel; preview over-limit editing now saves the newest one-time task rather than assuming a habit remains first.
- Native sources/storage/widget are unchanged; project/resource validation and whitespace checks passed. Browser checks use Chromium desktop and iPhone-sized touch emulation. Actual Safari, installed PWA scrolling and VoiceOver announcements remain device-verification items.
- [Implementation details](../../docs/creation-feedback.md). No manual deployment; a push may trigger existing owner-managed Vercel automation.

## Habit entry points, selected-type quota footer and Done exit — 2026-11-06

- Final complete Chromium run (`npm run test:e2e -- --workers=2`): **179 passed, 13 intentional viewport-specific skips (192 cases)**. An additional **10 repeated real-touch cases passed** after waiting for the final drag position to render before sampling.

- Production TypeScript/Vite build and **71 model/storage tests passed**. Habit scheduling/order models are unchanged; browser coverage now exercises all six creation entry points with today-only selected weekday versus excluded weekday, repeated Save, preserved original records/order, immediate counts/preview/creation highlight and reload identity. Editing at capacity remains available without promotion.
- The form shows one selected-type muted quota line near Save. Tests verify task creation remains allowed at a full habit allowance, selected-type Upgrade context, preserved draft text/notes/type, task boundary transitions, Pro suppression and continued free-plan enforcement. Existing photo-draft upgrade regressions remain included. The narrow keyboard-sized footer screenshot was opened and inspected; quota and both action buttons remain visible.
- Done now uses captured release transform keyframes, a bounded offscreen destination, 320 ms easing and a 90 ms stationary fade for reduced motion. Intermediate-frame cases check exact matrix start, mounted/opaque identity at 0/80/180/319 ms, monotonic rightward travel, offscreen endpoint, next real content, no premature persistence or empty state, duplicate blocking, one timestamped completion, no toast, Undo and reload. Button/mouse/touch and one/three-card cases run across desktop and iPhone-sized projects. Touch fixture sampling waits for its final rendering frame.
- Native files are unchanged; Xcode project/resource validation and whitespace checks passed. Real Safari/installed PWA compositor behavior, VoiceOver and native WidgetKit runtime remain unverified without an Apple device/Xcode.
- [Diagnosis and behavior](../../docs/habit-quota-and-done.md). No manual deployment; GitHub push may trigger existing Vercel automation.
