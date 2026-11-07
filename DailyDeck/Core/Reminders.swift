import Foundation

public struct LocalTime: Codable, Equatable {
    public let hour: Int
    public let minute: Int
    public init?(hour: Int, minute: Int) { guard (0...23).contains(hour), (0...59).contains(minute) else { return nil }; self.hour = hour; self.minute = minute }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let h = try c.decode(Int.self, forKey: .hour), m = try c.decode(Int.self, forKey: .minute)
        guard let time = LocalTime(hour: h, minute: m) else { throw DecodingError.dataCorruptedError(forKey: .hour, in: c, debugDescription: "Invalid local deadline") }; self = time
    }
    public func date(on day: Day, calendar: Calendar = .current) -> Date? {
        let start = calendar.startOfDay(for: day.date(calendar: calendar))
        var c = calendar.dateComponents([.year, .month, .day], from: start); c.hour = hour; c.minute = minute; c.second = 0
        guard var date = calendar.date(from: c) else { return nil }
        // Calendar construction rolls gap times by the gap, matching the web's local Date constructor.
        if calendar.component(.hour, from: date) == hour && calendar.component(.minute, from: date) == minute,
           let first = calendar.nextDate(after: start.addingTimeInterval(-1), matching: DateComponents(hour: hour, minute: minute, second: 0), matchingPolicy: .strict, repeatedTimePolicy: .first) { date = first }
        return Day(date, calendar: calendar) == day ? date : nil
    }
    public var label: String {
        let f = DateFormatter(); f.locale = .autoupdatingCurrent; f.timeStyle = .short; f.dateStyle = .none
        var reference = Calendar(identifier: .gregorian); reference.timeZone = .current
        let base = reference.date(from: DateComponents(year: 2026, month: 1, day: 15, hour: hour, minute: minute))!
        return "By " + f.string(from: base)
    }
}
public struct DeadlineRevision: Codable, Equatable {
    public var effectiveFrom: Day
    public var time: LocalTime?
    public var remind: Bool
}
public extension Entry {
    func deadline(on day: Day) -> LocalTime? { guard let versions = deadlineVersions else { return deadline }; return versions.last(where: { $0.effectiveFrom <= day })?.time }
    func reminderEnabled(on day: Day) -> Bool { guard let versions = deadlineVersions else { return deadline != nil && (remind ?? false) }; return versions.last(where: { $0.effectiveFrom <= day })?.remind ?? false }
}
public extension Occurrence {
    func deadlineDate(calendar: Calendar = .current) -> Date? { deadline?.date(on: day, calendar: calendar) }
    func isOverdue(now: Date, calendar: Calendar = .current) -> Bool { !terminal && (deadlineDate(calendar: calendar).map { $0 < now } ?? false) }
}
public struct ReminderJob: Codable, Equatable {
    public var identifier: String
    public var title: String
    public var fireAt: Date
    public var deadlineAt: Date
    public var day: Day
    public var entryID: UUID
    public var configuration: String = ""
    public var body: String { "30 minutes left to complete: \(title)" }
    public var fingerprint: String { "\(fireAt.timeIntervalSince1970)|\(deadlineAt.timeIntervalSince1970)|\(title)" }
    public static func identifier(entryID: UUID, day: Day) -> String { "dailydeck.reminder.\(entryID.uuidString).\(day.key)" }
}
public extension DeckState {
    /// Plan one-off occurrences without materializing future history. iOS permits only a bounded queue.
    func reminderJobs(now: Date, calendar: Calendar = .current, horizon: Int = 30, includeElapsed: Bool = false) -> [ReminderJob] {
        let today = Day(now, calendar: calendar)
        var jobs: [String: ReminderJob] = [:]
        for entry in entries where !entry.archived {
            let days = entry.isHabit ? (0..<horizon).map { today.adding($0, calendar: calendar) } : [entry.created]
            for day in days {
                let card = occurrences.first { $0.entryID == entry.id && $0.day == day }
                if card?.terminal == true { continue }
                if card == nil {
                    if day < entry.created || (entry.generatedThrough.map { day <= $0 } ?? false) { continue }
                    if entry.isHabit && !entry.weekdays.contains(calendar.component(.weekday, from: day.date(calendar: calendar))) { continue }
                }
                let time = card != nil ? card!.deadline : entry.deadline(on: day)
                let enabled = card != nil ? (card!.remind ?? false) : entry.reminderEnabled(on: day)
                guard enabled, let deadlineAt = time?.date(on: day, calendar: calendar) else { continue }
                let fireAt = deadlineAt.addingTimeInterval(-1800)
                guard includeElapsed || fireAt > now else { continue }
                let id = ReminderJob.identifier(entryID: entry.id, day: day)
                jobs[id] = ReminderJob(identifier: id, title: card?.title ?? entry.title, fireAt: fireAt, deadlineAt: deadlineAt, day: day, entryID: entry.id, configuration: "\(time!.hour):\(time!.minute)")
            }
        }
        return jobs.values.sorted { $0.fireAt == $1.fireAt ? $0.identifier < $1.identifier : $0.fireAt < $1.fireAt }
    }
}
public struct ReminderReceipt: Codable, Equatable {
    public var fingerprint: String
    public var fireAt: Date
    public var queued: Bool
    public var consumed: Bool
    public var configuration: String? = nil
}
public struct ReminderJournal: Codable {
    public var receipts: [String: ReminderReceipt] = [:]
    public init() {}
    public mutating func consumeElapsed(now: Date, delivered: Set<String>, pending: Set<String> = []) {
        for id in receipts.keys where delivered.contains(id) || (receipts[id]!.queued && receipts[id]!.fireAt <= now && !pending.contains(id)) { receipts[id]!.consumed = true }
    }
    public func maySchedule(_ job: ReminderJob, now: Date) -> Bool { job.fireAt > now && (receipts[job.identifier]?.consumed != true || (receipts[job.identifier]?.configuration != nil && receipts[job.identifier]?.configuration != job.configuration)) }
}

public extension DeckState {
    func schedulableReminderJobs(now: Date, calendar: Calendar = .current, allowed: Bool, journal: ReminderJournal) -> [ReminderJob] {
        guard allowed else { return [] }
        return Array(reminderJobs(now: now, calendar: calendar).filter { journal.maySchedule($0, now: now) }.prefix(60))
    }
}
