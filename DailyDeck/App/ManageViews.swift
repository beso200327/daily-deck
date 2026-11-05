import SwiftUI
import DailyDeckCore

struct EntryEditor: View {
    @EnvironmentObject var model: DeckModel
    @Environment(\.dismiss) var dismiss
    let entry: Entry?
    let habit: Bool
    @State private var title = ""
    @State private var notes = ""
    @State private var minutes = ""
    @State private var days = Set(1...7)
    @State private var confirmDelete = false
    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (!habit || !days.isEmpty) && (minutes.isEmpty || (Int(minutes).map { $0 > 0 && $0 <= 1440 } ?? false))
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("One small thing") {
                    TextField("Title", text: $title).accessibilityLabel("Title")
                    TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(3...6)
                    TextField("Minutes (optional, 1–1440)", text: $minutes).keyboardType(.numberPad)
                }
                if habit {
                    Section("Repeat on") {
                        Toggle("Every day", isOn: Binding(get: { days.count == 7 }, set: { days = $0 ? Set(1...7) : [] }))
                        ForEach([2, 3, 4, 5, 6, 7, 1], id: \.self) { day in
                            Toggle(Calendar.english.weekdaySymbols[day - 1], isOn: Binding(get: { days.contains(day) }, set: { if $0 { days.insert(day) } else { days.remove(day) } }))
                        }
                        if days.isEmpty { Text("Choose at least one weekday.").foregroundStyle(.red) }
                    }
                    if entry != nil { Section { Text("Changes apply from tomorrow. Today's card and past records stay as they were.").foregroundStyle(Color.muted) } }
                }
                if entry != nil {
                    Section { Button("Delete \(habit ? "habit" : "task")", role: .destructive) { confirmDelete = true } }
                }
                if let error = model.error {
                    Section("Could not save") { Text(error).foregroundStyle(.red); Text("Your edits are still here. Try Save again after resolving the storage issue.") }
                }
            }.scrollContentBackground(.hidden).background(Color.ivory)
                .navigationTitle(entry == nil ? (habit ? "New habit" : "New task") : "Edit \(habit ? "habit" : "task")")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") {
                        var result = entry ?? Entry(title: "", created: model.today)
                        result.title = title.trimmingCharacters(in: .whitespacesAndNewlines); result.notes = notes; result.minutes = Int(minutes); result.weekdays = habit ? days : []
                        model.update { $0.save(result, now: Date()) }
                        if model.error == nil { dismiss() }
                    }.disabled(!valid) }
                }
                .confirmationDialog("Delete this \(habit ? "habit" : "task")?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        if let entry { model.update { $0.delete(entry.id, now: Date()) }; if model.error == nil { dismiss() } }
                    }
                } message: { Text(habit ? "Future cards will stop. Today's occurrence and all history will remain." : "This task will leave the deck. Its history will remain, marked deleted.") }
                .onAppear {
                    if let entry { title = entry.title; notes = entry.notes; minutes = entry.minutes.map(String.init) ?? ""; days = entry.weekdays }
                }
        }
    }
}
struct HabitsView: View {
    @EnvironmentObject var model: DeckModel
    @State private var add = false
    @State private var editor: Entry?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Small steps. Your own rhythm.").font(.title2).listRowBackground(Color.clear)
                }
                Section("Recurring habits") {
                    let habits = model.state.entries.filter { $0.isHabit && !$0.archived }
                    if habits.isEmpty { Text("Add a habit to start a rhythm that works for you.").foregroundStyle(Color.muted) }
                    ForEach(habits) { entry in
                        Button { editor = entry } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(entry.title).font(.headline)
                                Text(schedule(entry)).font(.subheadline).foregroundStyle(Color.muted)
                            }.padding(.vertical, 10)
                        }
                    }
                }
                Section("One-time tasks") {
                    ForEach(model.state.entries.filter { !$0.isHabit && !$0.archived }) { entry in
                        Button { editor = entry } label: { HStack { Text(entry.title); Spacer(); Image(systemName: "pencil") }.padding(.vertical, 8) }
                    }
                }
                Section { Text("Your starter routine is yours to edit or delete. There are no streak penalties; each day is a fresh deck.").foregroundStyle(Color.muted) }
            }.scrollContentBackground(.hidden).background(Color.ivory).navigationTitle("Habits")
                .toolbar { Button("Add habit", systemImage: "plus") { add = true } }
                .sheet(isPresented: $add) { EntryEditor(entry: nil, habit: true) }
                .sheet(item: $editor) { EntryEditor(entry: $0, habit: $0.isHabit) }
        }
    }
    func schedule(_ entry: Entry) -> String {
        if entry.weekdays.count == 7 { return "Every day" }
        return [2,3,4,5,6,7,1].filter { entry.weekdays.contains($0) }.map { Calendar.english.shortWeekdaySymbols[$0 - 1] }.joined(separator: ", ")
    }
}
struct ReorderScreen: View {
    @EnvironmentObject var model: DeckModel
    @Environment(\.dismiss) var dismiss
    var body: some View {
        NavigationStack {
            List {
                Text("Drag the handles to choose what comes next.").foregroundStyle(Color.muted)
                ForEach(model.pending) { card in Text(card.title).padding(.vertical, 10) }
                    .onMove { source, destination in
                        var ids = model.pending.map(\.id)
                        ids.move(fromOffsets: source, toOffset: destination)
                        model.update { $0.reorder(ids, now: Date()) }
                    }
            }.environment(\.editMode, .constant(.active)).scrollContentBackground(.hidden).background(Color.ivory)
                .navigationTitle("Today's order").toolbar { Button("Done") { dismiss() } }
        }
    }
}
struct WidgetHelp: View {
    @Environment(\.dismiss) var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("One thing, at a glance.").font(.largeTitle.bold())
                    Text("1. Open Daily Deck once to prepare your deck.\n\n2. Touch and hold an empty area on your iPhone Home Screen.\n\n3. Tap Edit → Add Widget (or the + button), then search for Daily Deck.\n\n4. Choose the medium widget and tap Add Widget.")
                    Text("Tap Done to complete the visible card, or Later to move it to the end. These buttons require iOS 17 or later. Widgets support taps, not swipe gestures.")
                    Text("The app and widget share your local deck. iOS controls widget refresh timing; a briefly stale card cannot complete a different task. Open the app if the widget needs to catch up.").foregroundStyle(Color.muted)
                    Text("At local midnight, scheduled habits get new cards. Past unfinished habits stay in history; unfinished one-time tasks stay in your deck. Dates use your device's local calendar and timezone. Existing dated records do not move when you travel.").foregroundStyle(Color.muted)
                }.padding(24)
            }.background(Color.ivory).navigationTitle("Home Screen widget").toolbar { Button("Done") { dismiss() } }
        }
    }
}

extension Calendar {
    static var english: Calendar {
        var calendar = Calendar.current
        calendar.locale = Locale(identifier: "en_US")
        return calendar
    }
}
