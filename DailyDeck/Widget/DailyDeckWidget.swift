import SwiftUI
import WidgetKit
import AppIntents
import DailyDeckCore

struct DeckSnapshot: TimelineEntry {
    let date: Date
    let card: Occurrence?
    let count: Int
    let error: Bool
    var day: String { Day(date).key }
}
struct DeckProvider: TimelineProvider {
    func placeholder(in context: Context) -> DeckSnapshot { preview() }
    func getSnapshot(in context: Context, completion: @escaping (DeckSnapshot) -> Void) { completion(context.isPreview ? preview() : snapshot()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DeckSnapshot>) -> Void) {
        let now = Date()
        let midnight = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: now)!)
        // Request refresh at midnight (or in 15 minutes). iOS schedules actual delivery.
        completion(Timeline(entries: [snapshot()], policy: .after(min(midnight, now.addingTimeInterval(900)))))
    }
    private func preview() -> DeckSnapshot {
        let now = Date()
        var state = DeckState()
        state.seed(now: now)
        state.roll(now: now)
        let cards = state.pending(on: Day(now))
        return DeckSnapshot(date: now, card: cards.first, count: cards.count, error: false)
    }
    private func snapshot() -> DeckSnapshot {
        do {
            let now = Date()
            let state = try DeckStore.shared().load(now: now)
            let cards = state.pending(on: Day(now))
            return DeckSnapshot(date: now, card: cards.first, count: cards.count, error: false)
        } catch { return DeckSnapshot(date: Date(), card: nil, count: 0, error: true) }
    }
}
struct ActOnCard: AppIntent {
    static var title: LocalizedStringResource = "Act on Daily Deck card"
    static var description = IntentDescription("Complete or postpone the task shown in your Daily Deck widget.")
    @Parameter(title: "Occurrence") var occurrenceID: String
    @Parameter(title: "Revision") var revision: String
    @Parameter(title: "Rendered day") var day: String
    @Parameter(title: "Complete") var complete: Bool
    init() {}
    init(card: Occurrence, day: String, complete: Bool) {
        self.occurrenceID = card.id.uuidString; self.revision = card.events.last?.id.uuidString ?? "initial"; self.day = day; self.complete = complete
    }
    func perform() async throws -> some IntentResult {
        var before = DeckState()
        let updated = try DeckStore.shared().transaction { state in
            before = state
            return state.widgetAction(complete ? .done : .later, occurrenceID: occurrenceID, revision: revision, renderedDay: day, now: Date())
        }
        NotificationScheduler.cancelChanges(before: before, after: updated.0)
        _ = try? await NotificationScheduler.shared.reconcile(store: DeckStore.shared())
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
struct DeckWidgetView: View {
    let entry: DeckSnapshot
    private let ink = Color(red: 0.16, green: 0.15, blue: 0.13)
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("UP NEXT").font(.caption2.bold()).tracking(1.2)
            Text(entry.card?.title ?? (entry.error ? "Open Daily Deck" : "Room to breathe.")).font(.headline).lineLimit(2)
            Text(entry.error ? "Your deck needs attention." : "\(entry.count) remaining").font(.caption).foregroundStyle(ink.opacity(0.8))
            if let card = entry.card {
                if let time = card.deadline { Text(time.label + (card.isOverdue(now: Date()) ? " · Overdue" : "")).font(.caption) }
                HStack(spacing: 10) {
                    Button(intent: ActOnCard(card: card, day: entry.day, complete: false)) { Label("Later", systemImage: "arrow.uturn.backward").font(.subheadline.weight(.medium)).frame(maxWidth: .infinity, minHeight: 44).background(Color(red: 1, green: 0.82, blue: 0.71), in: RoundedRectangle(cornerRadius: 14)) }.accessibilityLabel("Later, move this task to the end of the deck")
                    Button(intent: ActOnCard(card: card, day: entry.day, complete: true)) { Label("Done", systemImage: "checkmark").font(.subheadline.weight(.medium)).frame(maxWidth: .infinity, minHeight: 44).background(Color(red: 0.80, green: 0.91, blue: 0.32), in: RoundedRectangle(cornerRadius: 14)) }.accessibilityLabel("Done, complete this task")
                }.buttonStyle(.plain).foregroundStyle(ink)
            }
        }.foregroundStyle(ink).frame(maxWidth: .infinity, alignment: .leading)
            .containerBackground(Color(red: 0.985, green: 0.963, blue: 0.925), for: .widget)
            .widgetURL(URL(string: "dailydeck://today"))
    }
}
@main struct DailyDeckWidget: Widget {
    let kind = "DailyDeckWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DeckProvider()) { DeckWidgetView(entry: $0) }
            .configurationDisplayName("Daily Deck").description("One thing at a time. Complete it, or save it for later.").supportedFamilies([.systemMedium])
    }
}
