import SwiftUI
import DailyDeckCore
import UserNotifications

struct EntryEditor: View {
    @EnvironmentObject var model: DeckModel
    @Environment(\.dismiss) var dismiss
    let entry: Entry?
    let habit: Bool
    @State private var title = ""
    @State private var notes = ""
    @State private var hasDeadline = false
    @State private var deadline = Date()
    @State private var remind = false
    @State private var permissionNotice = ""
    @State private var permissionPurpose = false
    @State private var days = Set(1...7)
    @State private var confirmDelete = false
    private var deadlineDay: Day {
        if !habit { return entry?.created ?? model.today }
        if let entry, model.pending.contains(where: { $0.entryID == entry.id }) { return model.today }
        return (0..<7).map { model.today.adding($0) }.first { days.contains(Calendar.current.component(.weekday, from: $0.date())) } ?? model.today
    }
    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (!habit || !days.isEmpty)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("One small thing") {
                    TextField("Title", text: $title).accessibilityLabel("Title")
                    TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(3...6)
                    Toggle("Complete by", isOn: $hasDeadline)
                    if hasDeadline {
                        DatePicker("Complete by", selection: $deadline, displayedComponents: .hourAndMinute).environment(\.locale, Locale.current)
                        Button("No deadline") { hasDeadline = false; remind = false }
                        Text("Reminders notify you 30 minutes before this local deadline. Permission is requested only if you enable them.").font(.caption)
                        Toggle("Remind me 30 minutes before", isOn: Binding(get: { remind }, set: { if $0 { permissionPurpose = true } else { remind = false } }))
                        Text(permissionNotice.isEmpty ? "Save to store this deadline. A reminder is scheduled only after OS acceptance." : permissionNotice).font(.caption).foregroundStyle(Color.muted)
                        let c = Calendar.current.dateComponents([.hour, .minute], from: deadline)
                        if let time = LocalTime(hour: c.hour ?? 0, minute: c.minute ?? 0), let at = time.date(on: deadlineDay), at.addingTimeInterval(-1800) <= Date() { Text("No advance reminder remains for this occurrence. The deadline can still be saved.").font(.caption) }
                    } else { Text("No deadline").foregroundStyle(Color.muted) }
                }
                if habit {
                    Section("Repeat on") {
                        Toggle("Every day", isOn: Binding(get: { days.count == 7 }, set: { days = $0 ? Set(1...7) : [] }))
                        ForEach([2, 3, 4, 5, 6, 7, 1], id: \.self) { day in
                            Toggle(Calendar.english.weekdaySymbols[day - 1], isOn: Binding(get: { days.contains(day) }, set: { if $0 { days.insert(day) } else { days.remove(day) } }))
                        }
                        if days.isEmpty { Text("Choose at least one weekday.").foregroundStyle(.red) }
                    }
                    if entry != nil { Section { Text("Schedule and text changes apply tomorrow. Deadline/reminder changes update unfinished cards from today onward; past and finished records keep their snapshots.").foregroundStyle(Color.muted) } }
                }
                if entry != nil {
                    Section { Button("Delete \(habit ? "habit" : "task")", role: .destructive) { confirmDelete = true } }
                }
                if let error = model.error {
                    Section("Could not save") { Text(error).foregroundStyle(.red); Text("Your edits are still here. Resolve the storage issue, then retry the action.") }
                }
            }.scrollContentBackground(.hidden).background(Color.ivory)
                .navigationTitle(entry == nil ? (habit ? "New habit" : "New task") : "Edit \(habit ? "habit" : "task")")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") {
                        var result = entry ?? Entry(title: "", created: model.today)
                        result.title = title.trimmingCharacters(in: .whitespacesAndNewlines); result.notes = notes; let c = Calendar.current.dateComponents([.hour, .minute], from: deadline)
                        result.deadline = hasDeadline ? LocalTime(hour: c.hour ?? 0, minute: c.minute ?? 0) : nil; result.remind = hasDeadline && remind; result.weekdays = habit ? days : []
                        model.update { $0.save(result, now: Date()) }
                        if model.error == nil { dismiss() }
                    }.disabled(!valid) }
                }
                .alert("Delete \(habit ? "habit" : "task")?", isPresented: $confirmDelete) {
                    Button("Delete \(habit ? "habit" : "task")", role: .destructive) {
                        if let entry { model.update { $0.delete(entry.id, now: Date()) }; if model.error == nil { dismiss() } }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: { Text(habit ? "This removes the habit and its unfinished tasks from today and future days. Your history stays." : "This task will leave the deck. Its history will remain, marked deleted.") }
                .confirmationDialog("Enable reminders?", isPresented: $permissionPurpose, titleVisibility: .visible) {
                    Button("Continue") { remind = true; Task { permissionNotice = await model.requestReminders() } }
                    Button("Cancel", role: .cancel) {}
                } message: { Text("Daily Deck can send a local notification 30 minutes before a deadline, even while closed. Saving is allowed if notifications are denied. iOS Focus and notification settings control delivery.") }
                .onAppear {
                    if let entry { title = entry.title; notes = entry.notes; days = entry.weekdays; hasDeadline = entry.deadline != nil; deadline = entry.deadline?.date(on: model.today) ?? Date(); remind = entry.remind ?? false }
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
                                Text(schedule(entry) + (entry.deadline.map { " · " + $0.label } ?? "")).font(.subheadline).foregroundStyle(Color.muted)
                            }.padding(.vertical, 10)
                        }
                    }
                }
                Section("One-time tasks") {
                    ForEach(model.state.entries.filter { !$0.isHabit && !$0.archived }) { entry in
                        Button { editor = entry } label: { HStack { VStack(alignment: .leading) { Text(entry.title); if let time = entry.deadline { Text(time.label).font(.caption) } }; Spacer(); Image(systemName: "pencil") }.padding(.vertical, 8) }
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
                ForEach(model.pending) { card in VStack(alignment: .leading) { Text(card.title); if let time = card.deadline { Text(time.label).font(.caption) } }.padding(.vertical, 10) }
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
                    NotificationSettings()
                    Text("One thing, at a glance.").font(.largeTitle.bold())
                    Text("1. Open Daily Deck once to prepare your deck.\n\n2. Touch and hold an empty area on your iPhone Home Screen.\n\n3. Tap Edit → Add Widget (or the + button), then search for Daily Deck.\n\n4. Choose the medium widget and tap Add Widget.")
                    Text("Tap Done to complete the visible card, or Later to move it to the end. These buttons require iOS 17 or later. Widgets support taps, not swipe gestures.")
                    Text("The app and widget share your local deck. iOS controls widget refresh timing; a briefly stale card cannot complete a different task. Open the app if the widget needs to catch up.").foregroundStyle(Color.muted)
                    Text("Deadlines are local times. Enable reminders in an editor to request notification permission. Up to 60 upcoming reminders across 30 days are queued; reopen Daily Deck to extend them. Pending reminders are recalculated after timezone/clock changes when the app is active. While closed, they use the last planned timezone. iOS Focus and notification settings control delivery.").foregroundStyle(Color.muted)
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

/// Kept in the existing Help sheet; this never prompts on launch or sheet open.
struct NotificationSettings: View {
    @EnvironmentObject private var model: DeckModel
    @Environment(\.scenePhase) private var phase
    @State private var permission = "Checking…"
    @State private var message = ""
    @State private var busy = false
    @State private var purpose = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Notifications").font(.headline)
            Text("Local notifications can remind you 30 minutes before a pending deadline, even while the app is closed. iOS controls banners and sounds.").font(.subheadline)
            Text("Permission status: " + permission).font(.subheadline)
            Button("Enable notifications") { purpose = true }.disabled(busy)
            Button(busy ? "Sending…" : "Send test notification") {
                guard !busy else { return }; busy = true
                Task {
                    do { try await NotificationScheduler.sendTest(); message = "Test scheduled with iOS for 8 seconds from now. Stay here for a foreground test, or lock your phone for a background test. Check Notification Center if Focus suppresses the banner. This tests delivery, not a deadline reminder." }
                    catch { message = error.localizedDescription }
                    permission = await NotificationScheduler.permissionStatus(); busy = false
                }
            }.disabled(busy)
            if !message.isEmpty { Text(message).font(.caption).foregroundStyle(Color.muted).accessibilityAddTraits(.updatesFrequently) }
            Text("To test an actual reminder separately: before 13:30, save a pending task with Complete by 14:00 and Remind me 30 minutes before enabled. Confirm it says scheduled for 13:30. Later keeps it; Done, Skip, deletion or No deadline cancels it.").font(.caption).foregroundStyle(Color.muted)
        }
        .task { permission = await NotificationScheduler.permissionStatus() }
        .onChange(of: phase) { _, next in if next == .active { Task { permission = await NotificationScheduler.permissionStatus() } } }
        .confirmationDialog("Enable notifications?", isPresented: $purpose, titleVisibility: .visible) {
            Button("Continue") {
                guard !busy else { return }; busy = true
                Task { message = await model.requestReminders(); permission = await NotificationScheduler.permissionStatus(); model.update(); busy = false }
            }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Daily Deck uses local notifications for pending deadlines and an optional system test. Permission is optional and does not block saving tasks.") }
    }
}
