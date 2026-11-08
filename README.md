# Daily Deck

Browser version: see [apps/web/README.md](apps/web/README.md#manual-vercel-import-from-github) for the separate React app, browser tests, and exact manual Vercel import settings (`main`, root `apps/web`, Vite, `npm ci`, `npm run build`, output `dist`, no environment variables). The native iPhone app instructions follow below.

**One thing at a time.** A local-first iPhone app for tasks and recurring habits, built with SwiftUI and a real WidgetKit extension. The native iOS 17+ app has no account, backend, analytics, subscriptions or ads. The separate web app has optional Preview authentication and opt-in account cloud storage; native data does not sync.

The interface follows the supplied concept: warm ivory, charcoal, lime completion, soft peach postponement, layered rounded cards, generous spacing, and quiet native walking/leaf artwork. UI copy is English. It uses Dynamic Type, VoiceOver actions and labels, visible status text, and large controls. Swipe rotation respects Reduce Motion; there are no automatic animations.

## Open and run on a Mac

Requires Xcode 15+ (Xcode 16 recommended) and its iOS SDK. No third-party packages or project generator are required.

1. Open `DailyDeck.xcodeproj`.
2. Select **DailyDeck**, an iPhone simulator, then Run (⌘R). The app target embeds and builds **DailyDeckWidget** automatically. The core is the local `DailyDeckCore` Swift package. The **DailyDeckTests** target is included in the shared scheme; press ⌘U to run the same behavioral tests in an iOS test host.
3. For a real iPhone, select your development team under Signing & Capabilities for **both targets**. Use unique bundle IDs with the widget ID prefixed by the app ID (defaults: `com.dailydeck.app` and `com.dailydeck.app.widget`).
4. Enable **App Groups** on both targets and register the same group. The default is `group.com.dailydeck.shared`; if you change it, update both `.entitlements` files and `DeckStore.group` in `DailyDeck/Core/DeckStore.swift`. Ensure both provisioning profiles include the group.
5. Launch the app once. Three editable starter habits appear: walking, reading, and drinking water. Delete or edit them in Habits.

App Group access is mandatory for a consistent app/widget store. If provisioning is wrong, the app shows a storage error rather than silently using a separate database. Simulator App Group behavior and actual device signing must be verified on a Mac.

Optional command-line simulator build (choose an installed simulator):

```sh
xcodebuild -list -project DailyDeck.xcodeproj
xcodebuild -project DailyDeck.xcodeproj -scheme DailyDeck \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO build

xcodebuild -project DailyDeck.xcodeproj -scheme DailyDeck \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO test
```

The included project can be regenerated deterministically with `python3 scripts/generate_project.py` (standard library only). Customize signing in Xcode after regeneration, or update the generator if retaining custom project settings. `scripts/make_icon.py` is an optional Pillow helper; the generated app icon is already included.

## Use the app

- **Today:** add tasks with +. Swipe right or tap Done to complete; swipe left or tap Later to put the card at the end of today's deck. Later never completes or skips a task. Skip today explicitly resolves that occurrence. The next pending card appears after an action. Undo restores the last action, including its previous order. Tap Reorder today's deck and drag the handles.
- **Habits:** add daily or selected-weekday habits, edit notes and optional local Complete by deadlines, and manage one-time tasks. Deleting a habit removes unfinished occurrences from today and future days, stops regeneration, and preserves past history and completed/skipped records. Habit edits apply tomorrow. One-time task edits update its still-pending card; deletion removes it from the deck and records a deleted outcome.
- **Progress:** select a past date in the calendar; review scheduled cards, carried one-time tasks, and their outcomes. Tap a card for its action log and exact completion times. The weekly completion chart follows the selected week and filter. Filter by a task/habit, including archived ones. Day/week/month summaries count daily outcomes; a carried task can appear on multiple days, so period summaries are task-days, not unique task counts.

Undo is available until the occurrence changes again or the local day ends. Widget actions also become undoable when you reopen the app. Undo events remain in the log. Reordering deliberately invalidates undo on a reordered card; it does not erase its actions.

## Dates, history, and rollover

Day boundaries and weekday schedules use `Calendar.current` and the device timezone, using calendar-day addition rather than 24-hour arithmetic (including daylight saving transitions). On app foreground, app midnight polling, widget load, and every action, the store generates each scheduled habit occurrence up through today, including days the app was closed. Every occurrence has an independent ID, saved title/notes/deadline, and timestamped actions.

Unfinished past habit occurrences stay in history as **missed**, or **postponed** if explicitly postponed. They do not clutter today's deck. Unfinished one-time tasks carry forward until completed, explicitly skipped, or deleted. History shows each day's outcome as of that day; completing a carried task today does not turn a previously missed day into a completion. Later followed by Done has a final outcome of completed and retains both actions. Explicit Skip is always distinguishable from Missed and Later.

Existing day keys stay attached to their original local dates when traveling. Future scheduling and action timestamps use the current device timezone. Moving the clock backwards never regenerates an existing occurrence. Changing the device's calendar system after creating data is not a supported data migration in this MVP.

There is no guaranteed background process at exactly midnight: the app checks on foreground, calendar-day/timezone notifications, and every 30 seconds while active. Foreground refresh also picks up actions from the widget. Unchanged refreshes do not rewrite the data file. Widgets request a refresh at midnight or in 15 minutes, whichever is earlier; iOS decides actual delivery. A stale widget action from a previous date is ignored and requests a new timeline.

## Add the Home Screen widget

1. Launch Daily Deck once.
2. Touch and hold an empty part of the iPhone Home Screen.
3. Tap **Edit → Add Widget** (or **+** on some iOS versions).
4. Search **Daily Deck**, choose the medium widget, and tap **Add Widget**.

The widget shows the next pending title and remaining count. **Done** and **Later** use native iOS 17 `Button(intent:)` interactions. Widgets do **not** support swipe gestures. Tapping the widget background opens the Today tab, even if you previously viewed Progress. Widget gallery previews use sample data without writing to the shared store. Add-widget instructions also appear under the app's Today info button.

The app and extension share `deck-v1.json` inside the App Group. Each operation reloads the latest file while holding a cross-process `flock`, then writes atomically. The widget validates the rendered occurrence ID, revision, and local date inside that transaction. Repeated or stale taps cannot complete the replacement card or overwrite an app action. Both sides request WidgetKit reloads. iOS may briefly show stale widget content, especially while locked or before first unlock. Protected data is available after the first unlock. The native app has no cloud sync, export, or cross-device backup feature; OS-managed device backups may still include its files. The separate web app now supports user-controlled JSON backups; do not delete the app if you need its local history.

## Tests

Run the real Swift package tests on a Mac with Xcode's command-line tools, or on Linux with Swift 6.0.3:

```sh
swift test --jobs 4
```

The 26-test XCTest suite covers independent daily occurrences, weekday schedules, backfill, local midnight/DST, carryover, Later/Done semantics, Skip, undo ordering and expiry, habit edit/delete historical integrity, filtering/reordering, persistence across store instances, corrupt-file protection, concurrent transactions, and stale/repeated widget actions. It also covers filtered summaries, local week/month boundaries, undo after app restart, transaction rollback, and unchanged refreshes.

For a reproducible Linux check with Docker (no network needed after the image is pulled):

```sh
./scripts/test-linux.sh
```

Check project wiring, plist/entitlement consistency, assets, and generator repeatability:

```sh
python3 scripts/validate_project.py
```

These checks do not replace compiling SwiftUI/WidgetKit with the iOS SDK. Before release, run on a simulator and signed iPhone: add/edit/delete a habit and task; swipe both directions; skip and undo; reorder; relaunch; inspect previous-day history; add a widget; tap Done/Later repeatedly; verify foreground refresh and undo; test local midnight, large Dynamic Type, VoiceOver, Reduce Motion, and locked-device widget behavior. This repository is an MVP, not an App Store submission. Nothing is published or deployed.

## Structure

- `DailyDeck/Core`: dependency-free models, dated occurrences, action history, transaction store, shared widget action validation.
- `DailyDeck/App`: SwiftUI Today, management forms, calendar/history, and widget help.
- `DailyDeck/Widget`: native WidgetKit timeline and App Intent buttons.
- `Tests`: core XCTest behavior tests, including actual shared-store operations.
- `scripts`: deterministic Xcode project generation and validation helpers.

See `VALIDATION.md` for checks actually performed in the implementation environment and remaining native validation.


Launch-readiness audit: [docs/launch-readiness.md](docs/launch-readiness.md) records bounded code/test evidence, owner decisions and unresolved release/legal checks. [Operations](docs/operations.md) includes real-device, privacy-report, recovery and reviewer steps. The native targets now package an explicit privacy baseline; Xcode archive/API/SDK verification remains required. Development legal drafts are not published policies. The current core source is free and device-local, with optional Preview web authentication; the owner's proposed subscription is not implemented.

## Completion deadlines and native reminders

Task/habit forms now use optional **Complete by** times and **No deadline**, rather than estimates. Legacy durations are retained as old metadata and never converted. The native notification planner schedules 30-minute advance local reminders only with explicit user authorization, reconciles lifecycle/edit/widget actions, and cancels closed occurrences. Native scheduling status is separate from successful deadline persistence. The bounded queue (60 requests over 30 days) requires reopening to extend; while closed after travel, queued instants use the last planned timezone. See [deadline/reminder implementation and mandatory real-device checklist](docs/deadlines-reminders.md). Web/PWA background reminders remain unavailable without the documented Web Push/backend setup. No paid service or backend was added.

Notification diagnostics, platform limitations, exact foreground/background testing steps and mobile evidence: [four scoped fixes](docs/four-fixes.md).

## Supabase foundation

The owner has applied the original foundation to the intended test project. Optional Preview web authentication now supports email/password, configured Google/Apple, recovery and a trusted 16+ self-declaration gate. The original local deck is never uploaded at login. Optional web cloud storage now uses explicit opt-in/import confirmation, account-scoped caches, trusted transactional writes and private photos. Payments and native authentication/sync remain unimplemented. The owner has applied the foundation and onboarding migrations; do not rerun them. See [the authentication setup and release boundaries](supabase/AUTH.md) and [foundation model guide](supabase/README.md). Approved legal documents, live provider/email checks and account lifecycle work remain required before release.

## Optional web cloud deck (Preview only)

Use Account to keep the original local deck, explicitly import it with a recoverable backup, or open existing cloud data without importing. New cloud changes wait for server confirmation; stale revisions are rejected and unknown outcomes use idempotent retry. Offline cloud copies are read-only. Native iPhone/widget storage remains separate. See [the two new migrations, owner setup, isolation checks and recovery boundaries](supabase/CLOUD.md). No hosted migration or manual deployment was performed by this change.
