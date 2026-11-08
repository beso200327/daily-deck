# Validation record

Validated in the Linux cloud environment on November 5, 2026.

## Passed

- **26 XCTest tests, 0 failures**, compiled and run using official Swift 6.0.3 in a network-disabled Docker container. Image verified by the registry pull and pinned as `swift@sha256:95f6ef898992dc840b35517e780f6f6db9661432775ab0b33cc0a531ea749bdb`.
- Real `DailyDeckCore` compiled, including local JSON persistence, file locking, recurrence generation, action history, and shared widget action validation.
- Tests exercised recurrence/backfill, weekdays, DST and midnight, carried tasks, independent occurrence IDs, postponement followed by completion, completion timestamps, skip, undo restoration/expiry, habit edit/delete integrity, reordering, filters, persisted widget completion visible to a fresh app store, concurrent writes, corrupt-store preservation, period/filter summary accuracy, local week/month boundaries, undo after widget actions and restart, transaction rollback, and unchanged-refresh file identity.
- Swift compiler **syntax parsing** passed for all app and widget sources. This does not type-check Apple framework APIs.
- `python3 scripts/validate_project.py`: actual OpenStep project parsing; app, extension, and hosted XCTest targets; shared-scheme test references; referenced source/resource files; embedded extension; local Swift package product; consistent App Group entitlements; valid Info plists and scheme XML; icon presence; deterministic project regeneration.
- Python helper compilation, shell syntax, and `git diff --check` passed.

The first toolchain run failed because the non-root container's default compiler cache was unwritable. The tested Linux helper now uses writable temporary compiler caches. SwiftPM prints user configuration/security cache warnings; the build and all 26 XCTest cases nevertheless executed successfully. The separate Swift Testing runner reports zero tests because this package uses XCTest; that is not the XCTest count.

## Unverified here

The host has no `swift` or `xcodebuild`; Linux Docker supplied only the Swift core toolchain. No Apple SDK, macOS host, simulator, signing identity, or iPhone is available.

Consequently, the following still require the Mac/iPhone workflow in README:

- The new DailyDeckTests native target and its app-hosted XCTest execution.
- Full iOS SDK compilation and linking of SwiftUI, WidgetKit, and App Intents.
- Xcode package/project resolution and simulator launch.
- Visual rendering against the supplied concept, touch/swipe behavior, VoiceOver, Dynamic Type, and Reduce Motion on device.
- App Group provisioning and signed-device persistence.
- Home Screen widget discovery, button execution by iOS, refresh timing, locked-device operation, and foreground sync.

These are real remaining verification steps. Passing core tests and source parsing do not establish that an iPhone build or native widget has been launched successfully. Nothing was published or deployed.

## Source implementation completed in this follow-up

The inspected repository already contained the SwiftUI app, WidgetKit extension, shared App Group store, Xcode project, and 17 tests. This follow-up added tested shared period summaries and undo-token recovery; a weekly completion chart; foreground and timezone/day-change refresh; Today-tab widget deep linking; non-writing gallery previews; inline form storage errors; no-op refresh preservation; readable project generation; and the hosted native XCTest target. Nine additional regression tests passed, bringing the executed suite to 26. Native compilation and visual/device behavior remain unverified as listed above.

## Local deadlines and reminder scheduling — 2026-11-08

- Production TypeScript/Vite build passed; **79 web model/storage tests passed**. Complete Chromium desktop and iPhone-sized regression suite: **209 passed, 13 intentional viewport-specific skips**. Following the final pre-save wording adjustment, all **8 deadline browser cases passed** again.
- **40 Swift core XCTest cases passed** using the Linux Swift toolchain. App/widget and notification-adapter syntax parsing, deterministic Xcode project/resource validation, and whitespace checks passed. Syntax parsing does not type-check Apple framework APIs.
- Coverage includes 14:00/13:30 calculation, Later without deadline changes, completion/skip/deletion cancellation policy, edits, terminal and historical snapshots, legacy duration migration without conversion, persistence/reload, weekday recurrence, midnight, DST gaps/folds, timezone travel, reminder receipt deduplication, denied-permission policy, elapsed reminder times, and bounded native scheduling. Browser tests verify no notification permission prompt and honest preference-only messaging. Existing gesture/order/photo/quota regressions remain green.
- Web reminders are **not scheduled**: no Web Push subscription/backend scheduler exists. Native notification scheduling is implemented, but Apple SDK compilation, actual permission prompts, closed-app delivery, signed App Group/widget actions, and real iPhone Safari/PWA behavior remain unverified. Native scheduling is bounded to 60 requests over 30 days; reopening extends it. Timezone changes while closed retain the last planned notification instants until reconciliation.
- See [deadline/reminder implementation and device checklist](docs/deadlines-reminders.md). No manual deployment; pushing GitHub may trigger existing owner-managed Vercel automation.

## Four scoped mobile/notification fixes — 2026-11-08

- Final production TypeScript/Vite build passed; **80 web model/storage tests** and **41 Swift core XCTest cases** passed. Native app/widget and notification-adapter syntax parsing, deterministic Xcode project validation and whitespace checks passed; parsing does not type-check Apple frameworks.
- Complete Chromium desktop/iPhone-sized regression run: **227 passed, 17 intentional platform/viewport skips**. After the final hidden-file-control and common mobile-inset corrections, the relevant final suite passed **72 tests, 6 intentional skips (78 cases)**. Its header assertion measures the content edge, excluding browser-owned scrollbar gutter; the test also forces larger heading/subtitle text.
- Final checks cover create/edit/cancel at 320/375/390/430 px, long text, reduced keyboard-sized viewport, native browser time-picker invocation, hidden photo input, photo controls/crop drag/pinch/original persistence, body scroll lock, browser zoom, all three header action centers/insets, selected-time/No deadline persistence, overdue and history, reminder preference/denial behavior, animations and Undo. No data schema or image migration/reset was introduced.
- Desktop notification testing calls the real service-worker `showNotification` API and verifies the retained entry with `getNotifications`; a visible OS banner was not verified in headless Chromium. Mocked denial separately checks explicit-only permission requests. iPhone web controls truthfully report the missing Home Screen Web Push backend; no push delivery, backend or open-page notification timer was added.
- Native source provides permission status, explicit Enable/purpose confirmation, an OS-scheduled eight-second test and foreground presentation. The existing 14:00 → 13:30 planner/cancellation policy is core-test verified, including Later, terminal actions, edits, No deadline, deduplication and history. Apple SDK compilation, permission dialogs, real closed-app delivery/cancellation, native widget actions and real Safari/installed-PWA keyboard/picker behavior still require Xcode/a real iPhone. Existing 60-request/30-day and closed-timezone queue limitations remain.
- [Testing guide, diagnosis and mobile evidence](docs/four-fixes.md). Screenshots are explicitly Chromium emulation, not a real iPhone keyboard or platform-picker overlay. No manual deployment; a GitHub push may trigger owner-managed Vercel automation.

## Supabase foundation — 2026-11-08

- Clean lockfile install and production build passed; **99 unit/model tests** passed. A separate actual build rejects synthetic secret-shaped browser keys before asset emission and without logging their value. Runtime dependency audit: **0 advisories**.
- Isolated PostgreSQL 17: **83 authorization/integrity assertions passed** after applying the migration. Two synthetic users, explicit authenticated/anonymous roles, seven forced-RLS tables, owner spoofing, cross-owner mutations/references, immutable history, duplicate occurrences, private photo policies, hostile pre-existing permissive Storage policies, null/unrelated bucket noninterference and orphan cleanup are covered. The container has no network/ports, uses no hosted credentials and is removed with its volumes. Bootstrap and isolation SQL are fixtures, not hosted scripts.
- New configured/unconfigured connectivity suite: **6 browser cases passed** using synthetic public configuration and intercepted Auth settings. There is no request on launch/Help open, no deck body/cookies/session token, no persisted Auth session, no URL-session processing and no cross-project CSP connection. Connection success is limited to public Auth endpoint/key reachability, not database readiness.
- Existing complete desktop/iPhone-sized Chromium suite: **239 passed, 17 intentional skips**. Existing local persistence, photos, history, tasks/habits, forms, ordering, gestures and quotas remain intact. Native project/resource validation and whitespace checks passed; no native source was changed.
- No hosted SQL, real user registration, local-data upload, sync, payments or native integration was performed. Full Supabase Auth/JWT/PostgREST/Storage HTTP and byte/signed-URL behavior, actual Preview variables and live Vercel deployment/CSP still require owner verification. See [exact migration/application instructions](supabase/README.md).
