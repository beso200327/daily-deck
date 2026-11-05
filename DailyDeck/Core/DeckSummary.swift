import Foundation

public enum SummaryPeriod: String, CaseIterable, Identifiable {
    case day, week, month
    public var id: String { rawValue }
    public var title: String { rawValue.capitalized }
}

public struct DeckSummary: Equatable {
    public var completed = 0
    public var postponed = 0
    public var skipped = 0
    public var missed = 0
    public var pending = 0
    public var deleted = 0
    public var total: Int { completed + postponed + skipped + missed + pending + deleted }
    public var completionFraction: Double { total == deleted ? 0 : Double(completed) / Double(total - deleted) }
    public var description: String {
        [(completed, "completed"), (postponed, "postponed"), (skipped, "skipped"),
         (missed, "missed"), (pending, "pending"), (deleted, "deleted")]
            .filter { $0.0 > 0 }.map { "\($0.0) \($0.1)" }.joined(separator: ", ")
    }
    mutating func include(_ outcome: Outcome) {
        switch outcome {
        case .completed: completed += 1
        case .postponed: postponed += 1
        case .skipped: skipped += 1
        case .missed: missed += 1
        case .pending: pending += 1
        case .deleted: deleted += 1
        }
    }
}

public extension DeckState {
    func summary(on day: Day, today: Day, entryID: UUID? = nil, calendar: Calendar = .current) -> DeckSummary {
        var result = DeckSummary()
        for card in history(on: day, today: today, entryID: entryID, calendar: calendar) {
            result.include(card.outcome(on: day, today: today))
        }
        return result
    }
    /// Weekly and monthly totals count daily outcomes, including each carried task-day.
    func summary(period: SummaryPeriod, containing day: Day, today: Day, entryID: UUID? = nil, calendar: Calendar = .current) -> DeckSummary {
        var result = DeckSummary()
        for date in Self.days(in: period, containing: day, calendar: calendar) where date <= today {
            for card in history(on: date, today: today, entryID: entryID, calendar: calendar) {
                result.include(card.outcome(on: date, today: today))
            }
        }
        return result
    }
    static func days(in period: SummaryPeriod, containing day: Day, calendar: Calendar = .current) -> [Day] {
        if period == .day { return [day] }
        let component: Calendar.Component = period == .week ? .weekOfYear : .month
        guard let interval = calendar.dateInterval(of: component, for: day.date(calendar: calendar)) else { return [day] }
        var cursor = Day(interval.start, calendar: calendar)
        var result: [Day] = []
        while cursor.date(calendar: calendar) < interval.end {
            result.append(cursor)
            cursor = cursor.adding(1, calendar: calendar)
        }
        return result
    }
    /// Undo token can be recovered after a restart or a widget interaction.
    func latestUndoableEvent(on day: Day) -> UUID? {
        occurrences.filter { occurrence in
            !occurrence.habit || !entries.contains(where: { $0.id == occurrence.entryID && $0.archived })
        }.compactMap { $0.events.last }.filter {
            $0.day == day && [.done, .later, .skip].contains($0.action)
        }.max(by: { $0.at < $1.at })?.id
    }
}
