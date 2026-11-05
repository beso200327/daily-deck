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
