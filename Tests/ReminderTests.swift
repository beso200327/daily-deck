import XCTest
@testable import DailyDeckCore
final class ReminderTests: XCTestCase {
    var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/New_York")!; return c }
    func at(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
    var now: Date { at("2026-11-05T17:00:00Z") } // 12:00 local
    func fixture() -> DeckState { var s = DeckState(); s.seeded = true; s.save(Entry(title: "Read", weekdays: Set(1...7), created: Day(now, calendar: calendar), deadline: LocalTime(hour: 14, minute: 0), remind: true), now: now, calendar: calendar); return s }
    func testFourteenDeadlinePlansThirteenThirtyAndStableLaterIdentity() {
        var s = fixture(); let first = s.reminderJobs(now: now, calendar: calendar)[0]
        XCTAssertEqual(first.fireAt, at("2026-11-05T18:30:00Z")); XCTAssertEqual(first.body, "30 minutes left to complete: Read")
        s.act(.later, id: s.occurrences[0].id, now: now, calendar: calendar)
        XCTAssertEqual(s.reminderJobs(now: now, calendar: calendar)[0], first)
        s.roll(now: now, calendar: calendar); XCTAssertEqual(s.reminderJobs(now: now, calendar: calendar).filter { $0.identifier == first.identifier }.count, 1)
    }
    func testDoneSkipDeletionAndDeadlineReplacement() {
        for action in [Action.done, .skip, .delete] { var s = fixture(); let id = s.entries[0].id
            if action == .delete { s.delete(id, now: now, calendar: calendar) } else { s.act(action, id: s.occurrences[0].id, now: now, calendar: calendar) }
            XCTAssertFalse(s.reminderJobs(now: now, calendar: calendar).contains { $0.day == Day(now, calendar: calendar) })
        }
        var s = fixture(); let before = s.reminderJobs(now: now, calendar: calendar)[0]; var e = s.entries[0]; e.deadline = LocalTime(hour: 15, minute: 0); s.save(e, now: now, calendar: calendar)
        let next = s.reminderJobs(now: now, calendar: calendar)[0]; XCTAssertEqual(next.identifier, before.identifier); XCTAssertNotEqual(next.fingerprint, before.fingerprint); XCTAssertEqual(next.fireAt, at("2026-11-05T19:30:00Z"))
    }
    func testTooLateDoesNotPlanAdvanceReminderOrChangeOutcome() {
        let s = fixture(), late = at("2026-11-05T18:45:00Z")
        XCTAssertFalse(s.reminderJobs(now: late, calendar: calendar).contains { $0.day == Day(now, calendar: calendar) })
        XCTAssertTrue(s.occurrences[0].isOverdue(now: at("2026-11-05T19:01:00Z"), calendar: calendar)); XCTAssertFalse(s.occurrences[0].terminal)
    }
    func testSnapshotAndLegacyMigration() throws {
        var s = fixture(); s.act(.done, id: s.occurrences[0].id, now: now, calendar: calendar); let card = s.occurrences[0]; var e = s.entries[0]; e.deadline = LocalTime(hour: 16, minute: 0); s.save(e, now: now, calendar: calendar); XCTAssertEqual(s.occurrences[0], card)
        var legacy = DeckState(); legacy.seeded = true; legacy.save(Entry(title: "Old", minutes: 20, created: Day(now, calendar: calendar)), now: now, calendar: calendar)
        let data = try JSONEncoder().encode(legacy), restored = try JSONDecoder().decode(DeckState.self, from: data)
        XCTAssertNil(restored.occurrences[0].deadline); XCTAssertEqual(restored.occurrences[0].minutes, 20); XCTAssertTrue(restored.reminderJobs(now: now, calendar: calendar).isEmpty)
    }
    func testReceiptPreventsRequeueAfterDeliveryReloadAndTravel() throws {
        let job = fixture().reminderJobs(now: now, calendar: calendar)[0]; var journal = ReminderJournal()
        journal.receipts[job.identifier] = ReminderReceipt(fingerprint: job.fingerprint, fireAt: job.fireAt, queued: true, consumed: false)
        journal.consumeElapsed(now: job.fireAt.addingTimeInterval(1), delivered: [])
        let reopened = try JSONDecoder().decode(ReminderJournal.self, from: JSONEncoder().encode(journal))
        var later = job; later.fireAt = job.fireAt.addingTimeInterval(7200)
        XCTAssertFalse(reopened.maySchedule(later, now: job.fireAt.addingTimeInterval(1)))
    }
    func testWeekdaysMidnightAndDSTUseLocalCalendar() {
        var s = fixture(); var e = s.entries[0]; e.weekdays = [6]; e.deadline = LocalTime(hour: 0, minute: 15); s.save(e, now: now, calendar: calendar)
        let future = s.reminderJobs(now: now, calendar: calendar).filter { $0.day > Day(now, calendar: calendar) }; XCTAssertTrue(future.allSatisfy { calendar.component(.weekday, from: $0.deadlineAt) == 6 }); XCTAssertEqual(future[0].fireAt, at("2026-11-06T04:45:00Z"))
        let gap = LocalTime(hour: 2, minute: 30)!.date(on: Day(at("2026-03-08T12:00:00Z"), calendar: calendar), calendar: calendar)!
        XCTAssertEqual(gap, at("2026-03-08T07:30:00Z"))
        let fold = LocalTime(hour: 1, minute: 30)!.date(on: Day(at("2026-11-01T12:00:00Z"), calendar: calendar), calendar: calendar)!
        XCTAssertEqual(fold, at("2026-11-01T05:30:00Z"))
        var tokyo = calendar; tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let day = Day(now, calendar: calendar); XCTAssertNotEqual(LocalTime(hour: 14, minute: 0)!.date(on: day, calendar: calendar), LocalTime(hour: 14, minute: 0)!.date(on: day, calendar: tokyo))
    }
}
extension ReminderTests {
    func testDeniedPermissionDoesNotPreventSavingButNeverSchedules() {
        let s = fixture()
        XCTAssertEqual(s.occurrences[0].deadline, LocalTime(hour: 14, minute: 0))
        XCTAssertTrue(s.schedulableReminderJobs(now: now, calendar: calendar, allowed: false, journal: ReminderJournal()).isEmpty)
        XCTAssertFalse(s.schedulableReminderJobs(now: now, calendar: calendar, allowed: true, journal: ReminderJournal()).isEmpty)
    }
    func testPendingSystemRequestIsNotAssumedDeliveredAfterClockTravel() {
        let job = fixture().reminderJobs(now: now, calendar: calendar)[0]; var journal = ReminderJournal()
        journal.receipts[job.identifier] = ReminderReceipt(fingerprint: job.fingerprint, fireAt: job.fireAt, queued: true, consumed: false)
        journal.consumeElapsed(now: job.fireAt.addingTimeInterval(1), delivered: [], pending: [job.identifier])
        XCTAssertFalse(journal.receipts[job.identifier]!.consumed)
    }
}
extension ReminderTests {
    func testExplicitDeadlineEditCanReplaceDeliveredReminderButTimezoneCannotRearmSameTime() {
        let job = fixture().reminderJobs(now: now, calendar: calendar)[0]; var journal = ReminderJournal()
        journal.receipts[job.identifier] = ReminderReceipt(fingerprint: job.fingerprint, fireAt: job.fireAt, queued: true, consumed: true, configuration: job.configuration)
        var travel = job; travel.fireAt = job.fireAt.addingTimeInterval(7200)
        XCTAssertFalse(journal.maySchedule(travel, now: job.fireAt.addingTimeInterval(1)))
        travel.configuration = "16:0"
        XCTAssertTrue(journal.maySchedule(travel, now: job.fireAt.addingTimeInterval(1)))
    }
}
extension ReminderTests {
    func testDeadlineAndPreferencePersistAcrossNativeRestarts() throws {
        let s = fixture(), data = try JSONEncoder().encode(s), reopened = try JSONDecoder().decode(DeckState.self, from: data)
        XCTAssertEqual(reopened, s)
        XCTAssertEqual(reopened.reminderJobs(now: now, calendar: calendar), s.reminderJobs(now: now, calendar: calendar))
        XCTAssertThrowsError(try JSONDecoder().decode(LocalTime.self, from: Data("{\"hour\":24,\"minute\":0}".utf8)))
    }
    func testMissingLegacyDeadlineFieldsRemainMissing() throws {
        var s = fixture(); s.entries[0].minutes = 20; s.occurrences[0].minutes = 20
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(s)) as! [String: Any]
        for key in ["entries", "occurrences"] {
            var rows = object[key] as! [[String: Any]]
            for i in rows.indices { rows[i].removeValue(forKey: "deadline"); rows[i].removeValue(forKey: "remind"); rows[i].removeValue(forKey: "deadlineVersions") }
            object[key] = rows
        }
        let old = try JSONDecoder().decode(DeckState.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(old.entries[0].deadline); XCTAssertNil(old.occurrences[0].deadline); XCTAssertEqual(old.occurrences[0].minutes, 20)
    }
    func testQueueIsBoundedWithoutMaterializingFutureHistory() {
        var s = fixture()
        for _ in 0..<2 { s.save(Entry(title: "More", weekdays: Set(1...7), created: Day(now, calendar: calendar), deadline: LocalTime(hour: 14, minute: 0), remind: true), now: now, calendar: calendar) }
        XCTAssertEqual(s.schedulableReminderJobs(now: now, calendar: calendar, allowed: true, journal: ReminderJournal()).count, 60)
        XCTAssertEqual(s.occurrences.count, 3)
    }
}
