import XCTest
@testable import DailyDeckCore

final class DeckTests: XCTestCase {
    var calendar: Calendar {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/New_York")!; return c
    }
    func date(_ text: String) -> Date { ISO8601DateFormatter().date(from: text)! }
    var now: Date { date("2026-11-05T15:00:00Z") }
    func day(_ date: Date) -> Day { Day(date, calendar: calendar) }
    func state(habit: Bool = true) -> DeckState {
        var s = DeckState(); s.seeded = true
        s.save(Entry(title: "Walk", weekdays: habit ? Set(1...7) : [], created: day(now)), now: now, calendar: calendar)
        return s
    }
    func testDailyOccurrencesAndMissedHistory() {
        var s = state()
        let tomorrow = date("2026-11-06T15:00:00Z")
        s.roll(now: tomorrow, calendar: calendar)
        XCTAssertEqual(s.occurrences.count, 2)
        XCTAssertEqual(s.pending(on: day(tomorrow)).count, 1)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(tomorrow)), .missed)
        XCTAssertNotEqual(s.occurrences[0].id, s.occurrences[1].id)
        s.roll(now: tomorrow, calendar: calendar)
        XCTAssertEqual(s.occurrences.count, 2)
    }
    func testSelectedWeekdaysAndOfflineBackfill() {
        var s = DeckState(); s.seeded = true
        s.save(Entry(title: "Thursday", weekdays: [5], created: day(now)), now: now, calendar: calendar)
        s.roll(now: date("2026-11-19T15:00:00Z"), calendar: calendar)
        XCTAssertEqual(s.occurrences.map(\.day.key), ["2026-11-05", "2026-11-12", "2026-11-19"])
    }
    func testLaterChangesOrderWithoutCompletionAndUndoRestoresIt() {
        var s = state()
        s.save(Entry(title: "Read", created: day(now)), now: now, calendar: calendar)
        let id = s.pending(on: day(now))[0].id
        let token = s.act(.later, id: id, now: now, calendar: calendar)!
        XCTAssertEqual(s.pending(on: day(now)).last?.id, id)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(now)), .postponed)
        XCTAssertTrue(s.undo(eventID: token, now: now, calendar: calendar))
        XCTAssertEqual(s.pending(on: day(now)).first?.id, id)
        XCTAssertEqual(s.occurrences[0].events.count, 2)
    }
    func testPostponedThenCompletedRetainsBothEventsAndTimestamp() {
        var s = state(); let id = s.occurrences[0].id
        s.act(.later, id: id, now: now, calendar: calendar)
        let later = now.addingTimeInterval(30)
        s.act(.done, id: id, now: later, calendar: calendar)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(now)), .completed)
        XCTAssertEqual(s.occurrences[0].events.map(\.action), [.later, .done])
        XCTAssertEqual(s.occurrences[0].completedAt(on: day(now)), later)
        XCTAssertTrue(s.pending(on: day(now)).isEmpty)
    }
    func testSkipAndUndo() {
        var s = state(); let id = s.occurrences[0].id
        let token = s.act(.skip, id: id, now: now, calendar: calendar)!
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(now)), .skipped)
        XCTAssertTrue(s.undo(eventID: token, now: now, calendar: calendar))
        XCTAssertEqual(s.pending(on: day(now)).count, 1)
        XCTAssertFalse(s.undo(eventID: token, now: now, calendar: calendar))
    }
    func testUndoCannotCrossMidnightOrOverwriteNewAction() {
        var s = state(); let id = s.occurrences[0].id
        let token = s.act(.later, id: id, now: now, calendar: calendar)!
        s.act(.done, id: id, now: now, calendar: calendar)
        XCTAssertFalse(s.undo(eventID: token, now: now, calendar: calendar))
        let last = s.occurrences[0].events.last!.id
        XCTAssertFalse(s.undo(eventID: last, now: now.addingTimeInterval(86400), calendar: calendar))
    }
    func testOneTimeCarriesUntilResolvedAndPastRemainsMissed() {
        var s = state(habit: false); let id = s.occurrences[0].id
        let tomorrow = date("2026-11-06T15:00:00Z")
        s.roll(now: tomorrow, calendar: calendar)
        XCTAssertEqual(s.pending(on: day(tomorrow)).map(\.id), [id])
        s.act(.done, id: id, now: tomorrow, calendar: calendar)
        XCTAssertEqual(s.history(on: day(now), today: day(tomorrow)).first?.outcome(on: day(now), today: day(tomorrow)), .missed)
        XCTAssertEqual(s.history(on: day(tomorrow), today: day(tomorrow)).count, 1)
        XCTAssertTrue(s.history(on: day(tomorrow).adding(1, calendar: calendar), today: day(tomorrow).adding(1, calendar: calendar)).isEmpty)
    }
    func testEditingHabitPreservesSnapshotsAndAppliesTomorrow() {
        var s = state(); let original = s.occurrences[0]
        var entry = s.entries[0]; entry.title = "New title"; entry.weekdays = [6]
        s.save(entry, now: now, calendar: calendar)
        XCTAssertEqual(s.occurrences[0], original)
        s.roll(now: date("2026-11-06T15:00:00Z"), calendar: calendar)
        XCTAssertEqual(s.occurrences.last?.title, "New title")
        XCTAssertEqual(s.occurrences.count, 2)
    }
    func testAddingWeekdayDoesNotRetroactivelyCreateToday() {
        var s = DeckState(); s.seeded = true
        s.save(Entry(title: "Friday", weekdays: [6], created: day(now)), now: now, calendar: calendar)
        XCTAssertTrue(s.occurrences.isEmpty)
        var entry = s.entries[0]; entry.weekdays = Set(1...7)
        s.save(entry, now: now, calendar: calendar)
        s.roll(now: now, calendar: calendar)
        XCTAssertTrue(s.occurrences.isEmpty)
        s.roll(now: now.addingTimeInterval(86400), calendar: calendar)
        XCTAssertEqual(s.occurrences.count, 1)
    }
    func testDeletingHabitRemovesPendingAndKeepsDeletionRecord() {
        var s = state()
        s.delete(s.entries[0].id, now: now, calendar: calendar)
        s.roll(now: now.addingTimeInterval(3 * 86400), calendar: calendar)
        XCTAssertTrue(s.pending(on: day(now)).isEmpty)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(now)), .deleted)
        XCTAssertEqual(s.history(on: day(now), today: day(now)).count, 1)
    }
    func testHabitDeletionPreservesTerminalAndPastButClosesFuture() {
        for action in [Action.later, .done, .skip] {
            var s = state()
            let id = s.entries[0].id
            s.act(action, id: s.occurrences[0].id, now: now, calendar: calendar)
            let original = s.occurrences[0]
            s.roll(now: now.addingTimeInterval(2 * 86400), calendar: calendar)
            s.delete(id, now: now, calendar: calendar)
            XCTAssertTrue(s.entries[0].archived)
            XCTAssertTrue(s.pending(on: day(now)).isEmpty)
            if action != .later {
                XCTAssertEqual(s.occurrences[0], original)
                XCTAssertFalse(s.undo(eventID: original.events.last!.id, now: now, calendar: calendar))
                XCTAssertNil(s.latestUndoableEvent(on: day(now)))
            }
            XCTAssertTrue(s.occurrences.dropFirst().allSatisfy { $0.terminal })
            let count = s.occurrences.count
            s.roll(now: now.addingTimeInterval(5 * 86400), calendar: calendar)
            XCTAssertEqual(s.occurrences.count, count)
        }
    }
    func testDeletionDoesNotReduceCompletionFraction() {
        var summary = DeckSummary()
        summary.completed = 1
        summary.deleted = 2
        XCTAssertEqual(summary.completionFraction, 1)
    }
    func testDeletingTaskRemovesPendingButPreservesRecord() {
        var s = state(habit: false)
        s.delete(s.entries[0].id, now: now, calendar: calendar)
        XCTAssertTrue(s.pending(on: day(now)).isEmpty)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(now)), .deleted)
    }
    func testReorderingAndFilter() {
        var s = state(); s.save(Entry(title: "Read", created: day(now)), now: now, calendar: calendar)
        let ids = Array(s.pending(on: day(now)).map(\.id).reversed())
        s.reorder(ids, now: now, calendar: calendar)
        XCTAssertEqual(s.pending(on: day(now)).map(\.id), ids)
        XCTAssertEqual(s.history(on: day(now), today: day(now), entryID: s.entries[0].id).count, 1)
    }
    func testDSTUsesCalendarDaysNot86400Seconds() {
        let start = date("2026-03-07T17:00:00Z")
        var s = DeckState(); s.seeded = true
        s.save(Entry(title: "Daily", weekdays: Set(1...7), created: day(start)), now: start, calendar: calendar)
        s.roll(now: date("2026-03-09T16:00:00Z"), calendar: calendar)
        XCTAssertEqual(s.occurrences.map(\.day.key), ["2026-03-07", "2026-03-08", "2026-03-09"])
        let before = date("2026-11-06T04:59:59Z"), after = date("2026-11-06T05:00:00Z")
        XCTAssertEqual(day(before).key, "2026-11-05")
        XCTAssertEqual(day(after).key, "2026-11-06")
    }
    func testWidgetActionsRejectStaleOrRepeatedTaps() {
        var s = state(); let card = s.occurrences[0]
        XCTAssertTrue(s.widgetAction(.later, occurrenceID: card.id.uuidString, revision: "initial", renderedDay: day(now).key, now: now, calendar: calendar))
        XCTAssertFalse(s.widgetAction(.done, occurrenceID: card.id.uuidString, revision: "initial", renderedDay: day(now).key, now: now, calendar: calendar))
        let revision = s.occurrences[0].events.last!.id.uuidString
        XCTAssertFalse(s.widgetAction(.done, occurrenceID: card.id.uuidString, revision: revision, renderedDay: day(now).key, now: now.addingTimeInterval(86400), calendar: calendar))
    }
    func testWidgetCompletionAndAppReadSharePersistentStore() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let app = DeckStore(directory: dir), widget = DeckStore(directory: dir)
        let state = try app.load(now: now, calendar: calendar)
        let card = state.pending(on: day(now))[0]
        try widget.transaction(now: now, calendar: calendar) { s in
            XCTAssertTrue(s.widgetAction(.done, occurrenceID: card.id.uuidString, revision: "initial", renderedDay: day(now).key, now: now, calendar: calendar))
        }
        let fresh = try DeckStore(directory: dir).load(now: now, calendar: calendar)
        XCTAssertEqual(fresh.occurrences.first { $0.id == card.id }?.outcome(on: day(now), today: day(now)), .completed)
        XCTAssertEqual(fresh.entries.count, 3)
    }
    func testConcurrentTransactionsDoNotLoseUpdates() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = DeckStore(directory: dir)
        _ = try store.load(now: now, calendar: calendar)
        let errors = NSLock(); var failures = 0
        DispatchQueue.concurrentPerform(iterations: 20) { i in
            do { try DeckStore(directory: dir).transaction(now: now, calendar: calendar) { $0.save(Entry(title: "Task \(i)", created: day(now)), now: now, calendar: calendar) } }
            catch { errors.lock(); failures += 1; errors.unlock() }
        }
        XCTAssertEqual(failures, 0)
        XCTAssertEqual(try store.load(now: now, calendar: calendar).entries.count, 23)
    }
    func testCorruptStoreIsNotOverwritten() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("deck-v1.json")
        let bytes = Data("invalid JSON".utf8); try bytes.write(to: url)
        XCTAssertThrowsError(try DeckStore(directory: dir).load())
        XCTAssertEqual(try Data(contentsOf: url), bytes)
    }
    func testSummariesSeparatePostponedSkippedMissedAndCompleted() {
        var s = state(habit: false)
        let task = s.entries[0].id
        s.save(Entry(title: "Habit", weekdays: Set(1...7), created: day(now)), now: now, calendar: calendar)
        s.act(.later, id: s.occurrences[0].id, now: now, calendar: calendar)
        s.act(.skip, id: s.occurrences[1].id, now: now, calendar: calendar)
        let tomorrow = now.addingTimeInterval(86400)
        s.act(.done, id: s.occurrences[0].id, now: tomorrow, calendar: calendar)
        let past = s.summary(on: day(now), today: day(tomorrow), calendar: calendar)
        XCTAssertEqual(past.postponed, 1)
        XCTAssertEqual(past.skipped, 1)
        XCTAssertEqual(past.completed, 0)
        XCTAssertEqual(past.description, "1 postponed, 1 skipped")
        let month = s.summary(period: .month, containing: day(now), today: day(tomorrow), calendar: calendar)
        XCTAssertEqual(month.total, 4)
        XCTAssertEqual(month.completed, 1)
        XCTAssertEqual(month.pending, 1)
        let filtered = s.summary(period: .week, containing: day(now), today: day(tomorrow), entryID: task, calendar: calendar)
        XCTAssertEqual(filtered.total, 2)
        XCTAssertEqual(filtered.postponed, 1)
        XCTAssertEqual(filtered.completed, 1)
        XCTAssertEqual(filtered.completionFraction, 0.5)
    }
    func testLocalWeekAndMonthBoundaries() {
        var local = calendar; local.firstWeekday = 2
        let week = DeckState.days(in: .week, containing: day(now), calendar: local)
        XCTAssertEqual(week.map(\.key), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"])
        let month = DeckState.days(in: .month, containing: day(now), calendar: local)
        XCTAssertEqual(month.count, 30)
        XCTAssertEqual(month.first?.key, "2026-11-01")
        XCTAssertEqual(month.last?.key, "2026-11-30")
    }
    func testSkippedHabitGetsIndependentPendingOccurrenceTomorrow() {
        var s = state()
        s.act(.skip, id: s.occurrences[0].id, now: now, calendar: calendar)
        let tomorrow = now.addingTimeInterval(86400)
        s.roll(now: tomorrow, calendar: calendar)
        XCTAssertEqual(s.pending(on: day(tomorrow)).count, 1)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(tomorrow)), .skipped)
        XCTAssertEqual(s.occurrences[1].outcome(on: day(tomorrow), today: day(tomorrow)), .pending)
    }
    func testUndoCompletionRestoresPostponementAndItsPriorPosition() {
        var s = state(habit: false)
        s.save(Entry(title: "Read", created: day(now)), now: now, calendar: calendar)
        let card = s.occurrences[0].id
        s.act(.later, id: card, now: now, calendar: calendar)
        let token = s.act(.done, id: card, now: now.addingTimeInterval(1), calendar: calendar)!
        XCTAssertTrue(s.undo(eventID: token, now: now.addingTimeInterval(2), calendar: calendar))
        XCTAssertEqual(s.pending(on: day(now)).last?.id, card)
        XCTAssertEqual(s.occurrences[0].outcome(on: day(now), today: day(now)), .postponed)
        XCTAssertNil(s.occurrences[0].completedAt(on: day(now)))
        XCTAssertEqual(s.occurrences[0].events.map(\.action), [.later, .done, .undo])
    }
    func testWidgetCannotActOnCardThatIsNoLongerFirst() {
        var s = state()
        s.save(Entry(title: "Read", created: day(now)), now: now, calendar: calendar)
        let original = s.occurrences[0]
        s.act(.later, id: original.id, now: now, calendar: calendar)
        let revision = s.occurrences[0].events.last!.id.uuidString
        XCTAssertFalse(s.widgetAction(.done, occurrenceID: original.id.uuidString, revision: revision, renderedDay: day(now).key, now: now, calendar: calendar))
        let next = s.pending(on: day(now)).first!
        XCTAssertTrue(s.widgetAction(.done, occurrenceID: next.id.uuidString, revision: "initial", renderedDay: day(now).key, now: now, calendar: calendar))
        XCTAssertFalse(s.widgetAction(.done, occurrenceID: next.id.uuidString, revision: "initial", renderedDay: day(now).key, now: now, calendar: calendar))
        XCTAssertEqual(s.pending(on: day(now)).map(\.id), [original.id])
    }
    func testWidgetUndoTokenSurvivesAppRestart() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let first = try DeckStore(directory: dir).load(now: now, calendar: calendar)
        let card = first.pending(on: day(now))[0]
        try DeckStore(directory: dir).transaction(now: now, calendar: calendar) {
            $0.widgetAction(.done, occurrenceID: card.id.uuidString, revision: "initial", renderedDay: day(now).key, now: now, calendar: calendar)
        }
        let restarted = try DeckStore(directory: dir).load(now: now, calendar: calendar)
        let token = try XCTUnwrap(restarted.latestUndoableEvent(on: day(now)))
        try DeckStore(directory: dir).transaction(now: now, calendar: calendar) {
            XCTAssertTrue($0.undo(eventID: token, now: now, calendar: calendar))
        }
        let restored = try DeckStore(directory: dir).load(now: now, calendar: calendar)
        XCTAssertEqual(restored.pending(on: day(now)).first?.id, card.id)
        XCTAssertEqual(restored.occurrences[0].events.map(\.action), [.done, .undo])
    }
    func testReadOnlyRefreshDoesNotReplaceDatabaseFile() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = DeckStore(directory: dir)
        let first = try store.load(now: now, calendar: calendar)
        let path = dir.appendingPathComponent("deck-v1.json").path
        let before = try FileManager.default.attributesOfItem(atPath: path)[.systemFileNumber] as? NSNumber
        XCTAssertNotNil(before)
        XCTAssertEqual(try store.load(now: now, calendar: calendar), first)
        let after = try FileManager.default.attributesOfItem(atPath: path)[.systemFileNumber] as? NSNumber
        XCTAssertEqual(before, after)
    }
    func testThrowingTransactionDoesNotSavePartialChanges() throws {
        enum Failure: Error { case expected }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = DeckStore(directory: dir)
        let first = try store.load(now: now, calendar: calendar)
        XCTAssertThrowsError(try store.transaction(now: now, calendar: calendar) { state in
            state.entries.removeAll()
            throw Failure.expected
        })
        XCTAssertEqual(try store.load(now: now, calendar: calendar), first)
    }
    func testBackwardTimezoneRolloverDoesNotDuplicateOccurrences() {
        var s = state()
        let initial = s.occurrences[0]
        let tomorrow = now.addingTimeInterval(86400)
        s.roll(now: tomorrow, calendar: calendar)
        s.roll(now: now, calendar: calendar)
        XCTAssertEqual(s.occurrences.count, 2)
        XCTAssertEqual(s.pending(on: day(now)).first?.id, initial.id)
        s.roll(now: tomorrow, calendar: calendar)
        XCTAssertEqual(s.occurrences.count, 2)
    }

}
