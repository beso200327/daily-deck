import Foundation

public struct Day: Codable, Hashable, Comparable, Identifiable {
    public var key: String
    public var id: String { key }
    public init(_ date: Date, calendar: Calendar = .current) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        key = String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    public static func < (a: Day, b: Day) -> Bool { a.key < b.key }
    public func date(calendar: Calendar = .current) -> Date {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }
    public func adding(_ count: Int, calendar: Calendar = .current) -> Day {
        Day(calendar.date(byAdding: .day, value: count, to: date(calendar: calendar))!, calendar: calendar)
    }
}
public struct Entry: Codable, Identifiable, Equatable {
    public var id = UUID()
    public var title: String
    public var notes: String
    public var minutes: Int?
    /// Empty means one-time; Calendar weekday values 1=Sunday ... 7=Saturday.
    public var weekdays: Set<Int>
    public var created: Day
    public var archived = false
    public var generatedThrough: Day?
    public var isHabit: Bool { !weekdays.isEmpty }
    public init(title: String, notes: String = "", minutes: Int? = nil, weekdays: Set<Int> = [], created: Day) {
        self.title = title; self.notes = notes; self.minutes = minutes; self.weekdays = weekdays; self.created = created
    }
}
public enum Action: String, Codable { case done, later, skip, delete, undo, reorder }
public struct DeckEvent: Codable, Identifiable, Equatable {
    public var id = UUID()
    public var action: Action
    public var at: Date
    public var day: Day
    public var order: Int
    public var target: UUID?
}
public enum Outcome: String { case pending, completed, postponed, skipped, missed, deleted }
public struct Occurrence: Codable, Identifiable, Equatable {
    public var id = UUID()
    public var entryID: UUID
    public var day: Day
    public var title: String
    public var notes: String
    public var minutes: Int?
    public var habit: Bool
    public var initialOrder: Int
    public var events: [DeckEvent] = []
    public func activeEvents(through day: Day? = nil) -> [DeckEvent] {
        let eligible = events.filter { day == nil || $0.day <= day! }
        let undone = Set(eligible.filter { $0.action == .undo }.compactMap(\.target))
        return eligible.filter { $0.action != .undo && !undone.contains($0.id) }
    }
    public func outcome(on date: Day, today: Day) -> Outcome {
        switch activeEvents(through: date).last(where: { $0.action != .reorder })?.action {
        case .done: return .completed
        case .skip: return .skipped
        case .delete: return .deleted
        case .later: return .postponed
        default: return date < today ? .missed : .pending
        }
    }
    public var terminal: Bool {
        guard let action = activeEvents().last(where: { $0.action != .reorder })?.action else { return false }
        return [.done, .skip, .delete].contains(action)
    }
    public var order: Int { activeEvents().last?.order ?? initialOrder }
    public func completedAt(on day: Day) -> Date? { activeEvents(through: day).last(where: { $0.action == .done })?.at }
}
public struct DeckState: Codable, Equatable {
    public var version = 1
    public var entries: [Entry] = []
    public var occurrences: [Occurrence] = []
    public var lastDay: Day?
    public var seeded = false
    public init() {}
    public mutating func seed(now: Date, calendar: Calendar = .current) {
        guard !seeded else { return }; seeded = true
        let today = Day(now, calendar: calendar)
        entries = [Entry(title: "Walk for 20 minutes", notes: "A little movement. A better day.", minutes: 20, weekdays: Set(1...7), created: today), Entry(title: "Read 10 pages", notes: "Make a little room for a good story.", minutes: 15, weekdays: Set(1...7), created: today), Entry(title: "Drink water", notes: "Pause, sip, begin again.", weekdays: Set(1...7), created: today)]
    }
    public mutating func roll(now: Date, calendar: Calendar = .current) {
        let today = Day(now, calendar: calendar)
        for index in entries.indices where !entries[index].archived {
            let entry = entries[index]
            var day = max(entry.created, entry.generatedThrough?.adding(1, calendar: calendar) ?? entry.created)
            while day <= today {
                let scheduled = entry.isHabit ? entry.weekdays.contains(calendar.component(.weekday, from: day.date(calendar: calendar))) : day == entry.created
                if scheduled && !occurrences.contains(where: { $0.entryID == entry.id && $0.day == day }) {
                    occurrences.append(Occurrence(entryID: entry.id, day: day, title: entry.title, notes: entry.notes, minutes: entry.minutes, habit: entry.isHabit, initialOrder: (occurrences.map(\.order).max() ?? 0) + 1))
                }
                day = day.adding(1, calendar: calendar)
            }
            entries[index].generatedThrough = max(entry.generatedThrough ?? today, today)
        }
        // Never move the generation cursor backwards after a clock/timezone change.
        lastDay = max(lastDay ?? today, today)
    }
    public func pending(on today: Day) -> [Occurrence] {
        occurrences.filter { !$0.terminal && ($0.habit ? $0.day == today : $0.day <= today) }.sorted { $0.order == $1.order ? $0.id.uuidString < $1.id.uuidString : $0.order < $1.order }
    }
    public func history(on day: Day, today: Day, entryID: UUID? = nil, calendar: Calendar = .current) -> [Occurrence] {
        occurrences.filter { item in
            guard entryID == nil || item.entryID == entryID else { return false }
            if item.day == day || item.events.contains(where: { $0.day == day }) { return true }
            guard !item.habit && item.day < day else { return false }
            let before = item.outcome(on: day.adding(-1, calendar: calendar), today: today)
            return ![.completed, .skipped, .deleted].contains(before)
        }.sorted { $0.initialOrder < $1.initialOrder }
    }
    @discardableResult public mutating func act(_ action: Action, id: UUID, now: Date, calendar: Calendar = .current) -> UUID? {
        roll(now: now, calendar: calendar)
        let today = Day(now, calendar: calendar)
        guard let i = occurrences.firstIndex(where: { $0.id == id }), pending(on: today).contains(where: { $0.id == id }), [.done, .later, .skip].contains(action) else { return nil }
        let order = action == .later ? (occurrences.map(\.order).max() ?? 0) + 1 : occurrences[i].order
        let event = DeckEvent(action: action, at: now, day: today, order: order)
        occurrences[i].events.append(event)
        return event.id
    }
    public mutating func undo(eventID: UUID, now: Date, calendar: Calendar = .current) -> Bool {
        let today = Day(now, calendar: calendar)
        guard let i = occurrences.firstIndex(where: { $0.events.contains(where: { $0.id == eventID }) }), let event = occurrences[i].events.last, event.id == eventID, event.day == today, [.done, .later, .skip].contains(event.action) else { return false }
        if occurrences[i].habit && entries.contains(where: { $0.id == occurrences[i].entryID && $0.archived }) { return false }
        occurrences[i].events.append(DeckEvent(action: .undo, at: now, day: today, order: event.order, target: eventID))
        return true
    }
    public mutating func reorder(_ ids: [UUID], now: Date, calendar: Calendar = .current) {
        let today = Day(now, calendar: calendar)
        guard Set(ids) == Set(pending(on: today).map(\.id)), ids.count == Set(ids).count else { return }
        for (order, id) in ids.enumerated() {
            if let i = occurrences.firstIndex(where: { $0.id == id }) {
                occurrences[i].events.append(DeckEvent(action: .reorder, at: now, day: today, order: order))
            }
        }
    }
    public mutating func save(_ entry: Entry, now: Date, calendar: Calendar = .current) {
        roll(now: now, calendar: calendar)
        if let i = entries.firstIndex(where: { $0.id == entry.id }) {
            // Today's occurrence is a snapshot. Habit changes affect future days only.
            var updated = entry
            updated.generatedThrough = entries[i].generatedThrough
            entries[i] = updated
            if !entry.isHabit {
                for j in occurrences.indices where occurrences[j].entryID == entry.id && !occurrences[j].terminal {
                    occurrences[j].title = entry.title; occurrences[j].notes = entry.notes; occurrences[j].minutes = entry.minutes
                }
            }
        } else { entries.append(entry) }
        roll(now: now, calendar: calendar)
    }
    public mutating func delete(_ id: UUID, now: Date, calendar: Calendar = .current) {
        roll(now: now, calendar: calendar)
        guard let i = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[i].archived = true
        // Preserve past and terminal habit occurrences; deletion is its own outcome.
        let today = Day(now, calendar: calendar)
        if entries[i].isHabit {
            for j in occurrences.indices where occurrences[j].entryID == id && !occurrences[j].terminal && occurrences[j].day >= today {
                occurrences[j].events.append(DeckEvent(action: .delete, at: now, day: max(today, occurrences[j].day), order: occurrences[j].order))
            }
        } else {
            for j in occurrences.indices where occurrences[j].entryID == id && !occurrences[j].terminal {
                occurrences[j].events.append(DeckEvent(action: .delete, at: now, day: Day(now, calendar: calendar), order: occurrences[j].order))
            }
        }
    }
}
