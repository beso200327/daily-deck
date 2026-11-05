# Recurring habit scheduling repair

## Cause

Generation trusted `Task.through` as proof of occurrence creation and scanned only later dates. A new ID carrying a cursor could miss its first card; a missing known occurrence was not repaired. Visibility checks and a 30-second poll omitted BFCache `pageshow`, focus and an exact local-midnight alarm. Refresh wrote outside the mutation lock and could race an action.

## Fix and history policy

New IDs start on the local save date without inherited cursors. Reconciliation checks known dated schedules against all `(habit ID, local date)` pairs, including terminal records. Launch, visible focus/visibility/pageshow, storage changes, local midnight and pre-action loading reconcile; a visible 30-second fallback detects clock/timezone changes. Reopening catches up missed dates without background execution while closed. Midnight uses a local constructor and handles DST. Civil date keys stay fixed during travel, the cursor never retreats, and completed/skipped records never respawn.

Reconciliation and actions use the same transaction lock and publish one sequenced deck/day snapshot for Today, sidebar, counts, Progress and Widget preview. A same-tab queue works without Web Locks; older browsers without Web Locks still have best-effort cross-tab coordination.

Schedule/title/notes edits normally begin tomorrow. The form displays the exact effective date; Habits shows pending changes. If a backward clock/timezone change revisits earlier dates, edits begin after the latest already-reconciled date, preserving existing decisions. Photo/icon updates retain the existing today-pending-only policy. Deletion and action logs are unchanged.

Optional `scheduleVersions` in the version-1 store records effective dates, weekdays and text snapshots. Known revisions prevent tomorrow's schedule from being applied retroactively today. Legacy data has no ledger: preserve cards/events/images/IDs and decisions through the old cursor, then establish a baseline for later dates. Unrecorded past schedules cannot reliably be reconstructed and are not invented. Backups include revisions; matching older backups without them retain local revisions on merge. Conflicting edits still fail safely.

## Validation

Pre-fix reproductions failed for inherited cursors, missing known occurrences, exact midnight and restored-page catch-up. Tests cover selected/excluded weekday creation, reopening, repeated reloads, completed/skipped preservation, dated backfill, edits/backward clocks, legacy migration, malformed revisions, backup roundtrip/merge, lock sequencing, failed persistence and DST. Browser cases check shared UI state and no navigation during creation. Existing timezone travel cases reopen across Tokyo/New York/Tokyo and assert original records and unique habit/date pairs.

See [final command results](../apps/web/VALIDATION.md). Chromium desktop and iPhone-sized/touch emulation do not verify actual Safari or installed iOS PWA execution. Native SwiftUI/WidgetKit sources are untouched; native build/widget runtime still require Xcode and an iPhone or simulator. No manual deployment; a main-branch push may trigger existing owner-managed Vercel automation.
