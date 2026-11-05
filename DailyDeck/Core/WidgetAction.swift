import Foundation

public extension DeckState {
    /// Compare the rendered occurrence and revision inside the same file transaction.
    /// Repeated/stale taps cannot act on a replacement card or apply an action twice.
    @discardableResult mutating func widgetAction(_ action: Action, occurrenceID: String, revision: String, renderedDay: String, now: Date, calendar: Calendar = .current) -> Bool {
        roll(now: now, calendar: calendar)
        let today = Day(now, calendar: calendar)
        guard [.done, .later].contains(action), renderedDay == today.key,
              let card = pending(on: today).first, card.id.uuidString == occurrenceID,
              (card.events.last?.id.uuidString ?? "initial") == revision else { return false }
        return act(action, id: card.id, now: now, calendar: calendar) != nil
    }
}
