import SwiftUI
import DailyDeckCore

struct ProgressScreen: View {
    @EnvironmentObject var model: DeckModel
    @State private var selected = Date()
    @State private var filter: UUID?
    @State private var period: SummaryPeriod = .day
    @State private var detail: Occurrence?
    var day: Day { Day(selected) }
    var rows: [Occurrence] { model.state.history(on: day, today: model.today, entryID: filter) }
    var summary: DeckSummary {
        model.state.summary(period: period, containing: day, today: model.today, entryID: filter)
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Small steps add up.").font(.title3).foregroundStyle(Color.muted)
                    WeeklyRhythm(selected: day, filter: filter)
                    DatePicker("Choose a day", selection: $selected, in: ...Date(), displayedComponents: .date).datePickerStyle(.graphical).padding(8).background(.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 24))
                    Picker("History filter", selection: $filter) {
                        Text("All tasks and habits").tag(nil as UUID?)
                        ForEach(model.state.entries) { entry in Text(entry.title + (entry.archived ? " (deleted)" : "")).tag(Optional(entry.id)) }
                    }.pickerStyle(.menu).accessibilityLabel("Filter history by task or habit")
                    Picker("Summary period", selection: $period) { ForEach(SummaryPeriod.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Your \(period.rawValue)").font(.headline)
                        Text(summary.total == 0 ? "No scheduled cards." : summary.description).font(.title3).fixedSize(horizontal: false, vertical: true)
                        if period != .day { Text("Counts are daily outcomes. A carried task can appear on more than one day.").font(.caption).foregroundStyle(Color.muted) }
                    }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(Color.lime.opacity(0.22), in: RoundedRectangle(cornerRadius: 22))
                    Text(selected.formatted(Date.FormatStyle(date: .long, time: .omitted).locale(Locale(identifier: "en_US")))).font(.headline)
                    if rows.isEmpty { Text("A quiet day. No cards were scheduled.").foregroundStyle(Color.muted).padding(.vertical, 20) }
                    ForEach(rows) { card in
                        Button { detail = card } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: symbol(card.outcome(on: day, today: model.today))).foregroundStyle(Color.ink).font(.title2).accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(card.title).font(.headline)
                                    if let deadline = card.deadline { Text(deadline.label + (card.isOverdue(now: Date()) ? " · Overdue" : "")).font(.caption).foregroundStyle(Color.muted) }
                                    Text(card.outcome(on: day, today: model.today).rawValue.capitalized).font(.subheadline).foregroundStyle(Color.muted)
                                    if let time = card.completedAt(on: day) { Text("Completed at \(time.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(Locale(identifier: "en_US"))))").font(.caption).foregroundStyle(Color.muted) }
                                }
                                Spacer(); Image(systemName: "chevron.right").foregroundStyle(Color.muted)
                            }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 20))
                        }.buttonStyle(.plain)
                    }
                }.padding(24)
            }.background(Color.ivory).navigationTitle("Your rhythm")
                .sheet(item: $detail) { card in
                    NavigationStack {
                        List {
                            Section { Text(card.title).font(.title2.bold()); Text("Scheduled \(card.day.date().formatted(Date.FormatStyle(date: .long, time: .omitted).locale(Locale(identifier: "en_US"))))"); if !card.notes.isEmpty { Text(card.notes) }; if let time = card.deadline { Text(time.label) } }
                            Section("Action history through selected day") {
                                let events = card.events.filter { $0.day <= day }
                                if events.isEmpty { Text(day < model.today ? "No action recorded. Missed." : "Waiting in your deck.") }
                                ForEach(events) { event in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(eventTitle(event, in: card))
                                        Text(event.at.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(Locale(identifier: "en_US")))).font(.caption).foregroundStyle(Color.muted)
                                    }
                                }
                            }
                        }.navigationTitle("Card history").toolbar { Button("Done") { detail = nil } }
                    }
                }
        }
    }
    private func symbol(_ outcome: Outcome) -> String {
        switch outcome {
        case .completed: return "checkmark.circle.fill"
        case .postponed: return "arrow.uturn.backward.circle"
        case .skipped: return "forward.end.circle"
        case .missed: return "clock.badge.exclamationmark"
        case .deleted: return "trash.circle"
        case .pending: return "circle"
        }
    }
    private func eventTitle(_ event: DeckEvent, in card: Occurrence) -> String {
        let title: String
        switch event.action {
        case .done: title = "Completed"
        case .later: title = "Postponed to end of deck"
        case .skip: title = "Explicitly skipped"
        case .delete: title = "Deleted"
        case .undo: title = "Previous action undone"
        case .reorder: title = "Deck reordered"
        }
        let undone = card.events.contains { $0.day <= day && $0.action == .undo && $0.target == event.id }
        return title + (undone ? " (undone)" : "")
    }

}


struct WeeklyRhythm: View {
    @EnvironmentObject var model: DeckModel
    let selected: Day
    let filter: UUID?
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Weekly completion").font(.headline)
            HStack(alignment: .bottom, spacing: 10) {
                ForEach(DeckState.days(in: .week, containing: selected)) { day in
                    let summary = model.state.summary(on: day, today: model.today, entryID: filter)
                    let future = day > model.today
                    VStack(spacing: 8) {
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 9).fill(Color.ink.opacity(0.05))
                            if !future && summary.completed > 0 {
                                RoundedRectangle(cornerRadius: 9).fill(Color.lime)
                                    .frame(height: CGFloat(max(8, 76 * summary.completionFraction)))
                            }
                        }.frame(height: 76)
                        Text(day.date().formatted(.dateTime.weekday(.abbreviated).locale(Locale(identifier: "en_US"))))
                            .font(.caption2).foregroundStyle(Color.muted)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(day.date().formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(Locale(identifier: "en_US"))))
                    .accessibilityValue(future ? "Upcoming" : "\(summary.completed) of \(summary.total) completed")
                }
            }
        }.padding(20).background(.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 22))
    }
}
