import SwiftUI
import WidgetKit
import Combine
import UIKit
import UserNotifications
import DailyDeckCore

@MainActor final class DeckModel: ObservableObject {
    @Published var state = DeckState()
    @Published var error: String?
    @Published var undoID: UUID?
    @Published var reminderStatus = "Deadline saved. Reminder scheduling has not completed."
    private var reminderGeneration = 0
    @Published var reminderAllowed: Bool? = nil
    @Published var scheduledReminders = Set<String>()
    func requestReminders() async -> String {
        do { let allowed = try await NotificationScheduler.requestPermission(); reminderStatus = allowed ? "Permission granted. Save to schedule the reminder." : "Notifications denied. You can still save the deadline; enable notifications in iPhone Settings to receive reminders." }
        catch { reminderStatus = "Permission could not be requested. Your deadline can still be saved." }
        return reminderStatus
    }
    func reminderMessage(_ card: Occurrence) -> String {
        guard card.remind == true, let date = card.deadlineDate() else { return "" }
        if date.addingTimeInterval(-1800) <= Date() { return "No advance reminder remains for this occurrence." }
        let id = ReminderJob.identifier(entryID: card.entryID, day: card.day)
        if scheduledReminders.contains(id) { return "Reminder scheduled for " + date.addingTimeInterval(-1800).formatted(date: .omitted, time: .shortened) }
        if reminderAllowed == true { return "Deadline saved. This reminder is not queued: the upcoming queue may be full, or this deadline was already reminded." }
        return reminderStatus
    }
    func update(_ body: (inout DeckState) -> Void = { _ in }) {
        do {
            let previous = state
            state = try DeckStore.shared().transaction { state in body(&state) }.0
            NotificationScheduler.cancelChanges(before: previous, after: state)
            reminderGeneration += 1; let generation = reminderGeneration
            scheduledReminders = []; reminderAllowed = nil; reminderStatus = "Deadline saved. Checking reminder scheduling…"
            Task {
                do { let report = try await NotificationScheduler.shared.reconcile(store: DeckStore.shared()); guard generation == reminderGeneration else { return }; scheduledReminders = report.scheduled; reminderAllowed = report.allowed; reminderStatus = report.message }
                catch { guard generation == reminderGeneration else { return }; scheduledReminders = []; reminderStatus = "Deadline saved. Reminder scheduling failed; reopen Daily Deck to retry. " + error.localizedDescription }
            }
            error = nil
            undoID = state.latestUndoableEvent(on: today)
            if previous != state { WidgetCenter.shared.reloadAllTimelines() }
        } catch { self.error = "Your deck could not be saved. Your existing data has been kept. Check available storage and App Group configuration, then retry.\n\(error.localizedDescription)" }
    }
    func act(_ action: Action, _ id: UUID) {
        var result: UUID?
        update { result = $0.act(action, id: id, now: Date()) }
        if error == nil { undoID = result }
    }
    func undo() {
        guard let id = undoID else { return }
        var success = false
        update { success = $0.undo(eventID: id, now: Date()) }
        undoID = nil
        if error == nil && !success { error = "This action can no longer be undone. The card changed or a new day began." }
    }
    var today: Day { Day(Date()) }
    var pending: [Occurrence] { state.pending(on: today) }
    var completed: Int { state.history(on: today, today: today).filter { $0.outcome(on: today, today: today) == .completed }.count }
}
extension Color {
    static let ivory = Color(red: 0.985, green: 0.963, blue: 0.925)
    static let ink = Color(red: 0.16, green: 0.15, blue: 0.13)
    static let lime = Color(red: 0.80, green: 0.91, blue: 0.32)
    static let peach = Color(red: 1, green: 0.82, blue: 0.71)
    static let muted = Color(red: 0.38, green: 0.36, blue: 0.32)
}
@main struct DailyDeckApp: App {
    private let presenter = ReminderPresenter()
    @StateObject private var model = DeckModel()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model).tint(.ink).preferredColorScheme(.light).environment(\.locale, Locale(identifier: "en_US"))
                .onAppear { UNUserNotificationCenter.current().delegate = presenter; model.update() }
                .onChange(of: phase) { _, phase in if phase == .active { model.update() } }
        }
    }
}
struct RootView: View {
    @EnvironmentObject var model: DeckModel
    @Environment(\.scenePhase) private var phase
    @State private var tab = 0
    private let tick = Timer.publish(every: 30, on: .main, in: .common).autoconnect()
    var body: some View {
        TabView(selection: $tab) {
            TodayView().tag(0).tabItem { Label("Today", systemImage: "house.fill") }
            HabitsView().tag(1).tabItem { Label("Habits", systemImage: "square.3.layers.3d") }
            ProgressScreen().tag(2).tabItem { Label("Progress", systemImage: "chart.bar.fill") }
        }
        .onReceive(tick) { _ in if phase == .active { model.update() } }
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in model.update() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in model.update() }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in model.update() }
        .onOpenURL { url in if url.scheme == "dailydeck" && url.host == "today" { tab = 0; model.update() } }
        .alert("Deck needs attention", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("Retry") { model.update() }; Button("Close", role: .cancel) {}
        } message: { Text(model.error ?? "") }
    }
}
struct TodayView: View {
    @EnvironmentObject var model: DeckModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var editor: Entry?
    @State private var newTask = false
    @State private var reorder = false
    @State private var help = false
    @State private var drag: CGFloat = 0
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(Date().formatted(.dateTime.weekday(.wide).month(.wide).day().locale(Locale(identifier: "en_US")))).foregroundStyle(Color.muted)
                    HStack { Text("\(model.completed) completed").bold(); Spacer(); Text("\(model.pending.count) remaining").foregroundStyle(Color.muted) }
                    ProgressView(value: Double(model.completed), total: Double(max(1, model.completed + model.pending.count))).tint(Color(red: 0.57, green: 0.72, blue: 0.16)).accessibilityLabel("Today's completion")
                    if let card = model.pending.first {
                        ZStack {
                            if model.pending.count > 2 { RoundedRectangle(cornerRadius: 32).fill(Color.peach.opacity(0.3)).padding(.leading, 24).offset(y: 16) }
                            if model.pending.count > 1 { RoundedRectangle(cornerRadius: 32).fill(Color.ivory).overlay(RoundedRectangle(cornerRadius: 32).stroke(Color.ink.opacity(0.08))).padding(.leading, 12).offset(y: 8) }
                            VStack(alignment: .leading, spacing: 22) {
                                Text(card.habit ? "DAILY RHYTHM" : "ONE THING AT A TIME").font(.caption.bold()).tracking(1.4).padding(.horizontal, 14).padding(.vertical, 8).background(Color.lime.opacity(0.45), in: Capsule())
                                CalmArtwork().frame(height: 160).accessibilityHidden(true)
                                Text(card.title).font(.system(.largeTitle, design: .rounded).weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                                if !card.notes.isEmpty { Text(card.notes).foregroundStyle(Color.muted).font(.title3) }
                                if let deadline = card.deadline { Label(deadline.label + (card.isOverdue(now: Date()) ? " · Overdue" : ""), systemImage: "clock").font(.subheadline).padding(10).background(Color.ink.opacity(0.06), in: Capsule()) }
                                if card.remind == true { Text(model.reminderMessage(card)).font(.caption).foregroundStyle(Color.muted) }
                                HStack {
                                    Button("Edit", systemImage: "pencil") { editor = model.state.entries.first { $0.id == card.entryID } }
                                    Spacer()
                                    Button("Skip today") { model.act(.skip, card.id) }
                                }.font(.subheadline).buttonStyle(.bordered).controlSize(.large).padding(.top, 8)
                            }
                            .padding(26).frame(maxWidth: .infinity, alignment: .leading).background(Color.ivory, in: RoundedRectangle(cornerRadius: 32)).overlay(RoundedRectangle(cornerRadius: 32).stroke(Color.ink.opacity(0.10))).shadow(color: .ink.opacity(0.09), radius: 16, y: 8)
                            .offset(x: drag).rotationEffect(.degrees(reduceMotion ? 0 : Double(drag / 28)))
                            .gesture(DragGesture(minimumDistance: 25).onChanged { if abs($0.translation.width) > abs($0.translation.height) { drag = $0.translation.width } }.onEnded { value in
                                if abs(value.translation.width) > 95 && abs(value.translation.width) > abs(value.translation.height) { model.act(value.translation.width > 0 ? .done : .later, card.id) }
                                drag = 0
                            })
                            .accessibilityAction(named: "Done") { model.act(.done, card.id) }
                            .accessibilityAction(named: "Later") { model.act(.later, card.id) }
                        }.padding(.bottom, 12)
                        HStack(spacing: 24) {
                            actionButton("Later", symbol: "arrow.uturn.backward", color: .peach) { model.act(.later, card.id) }
                            actionButton("Done", symbol: "checkmark", color: .lime) { model.act(.done, card.id) }
                        }
                        Text("Swipe left for later · right for done").font(.footnote).foregroundStyle(Color.muted).frame(maxWidth: .infinity)
                        Button("Reorder today's deck", systemImage: "arrow.up.arrow.down") { reorder = true }.frame(minHeight: 44)
                    } else {
                        VStack(spacing: 20) {
                            Image(systemName: "sun.max").font(.system(size: 64, weight: .light)).foregroundStyle(Color.muted)
                            Text("Room to breathe.").font(.largeTitle.bold())
                            Text("Today's deck is finished. Enjoy the space, or add one small thing.").multilineTextAlignment(.center).foregroundStyle(Color.muted)
                            Button("Add a task", systemImage: "plus") { newTask = true }.buttonStyle(.borderedProminent)
                        }.padding(.vertical, 64).frame(maxWidth: .infinity)
                    }
                    if model.undoID != nil { Button("Undo last action", systemImage: "arrow.uturn.backward") { model.undo() }.frame(maxWidth: .infinity, minHeight: 44).background(Color.lime.opacity(0.25), in: Capsule()) }
                }.padding(24)
            }.background(Color.ivory).navigationTitle("Today")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { Button("Widget help", systemImage: "info.circle") { help = true } }
                    ToolbarItem(placement: .topBarTrailing) { Button("Add task", systemImage: "plus") { newTask = true } }
                }
                .sheet(isPresented: $newTask) { EntryEditor(entry: nil, habit: false) }
                .sheet(item: $editor) { EntryEditor(entry: $0, habit: $0.isHabit) }
                .sheet(isPresented: $reorder) { ReorderScreen() }
                .sheet(isPresented: $help) { WidgetHelp() }
        }
    }
    func actionButton(_ title: String, symbol: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) { VStack(spacing: 8) { Image(systemName: symbol).font(.system(size: 28)).frame(width: 78, height: 78).background(color, in: Circle()); Text(title).font(.headline) }.frame(maxWidth: .infinity) }.accessibilityLabel(title == "Later" ? "Later, move to end of today's deck" : "Done, complete task")
    }
}
struct CalmArtwork: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.lime.opacity(0.20)).frame(width: 150, height: 150).offset(x: 20)
            Image(systemName: "figure.walk").font(.system(size: 110, weight: .ultraLight)).foregroundStyle(Color.ink)
            Image(systemName: "leaf.fill").font(.system(size: 46)).rotationEffect(.degrees(-25)).foregroundStyle(Color(red: 0.55, green: 0.63, blue: 0.29)).offset(x: -95, y: 45)
            Image(systemName: "leaf").font(.system(size: 42)).foregroundStyle(Color(red: 0.55, green: 0.63, blue: 0.29)).offset(x: 95, y: 40)
        }.frame(maxWidth: .infinity)
    }
}

final class ReminderPresenter: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        do {
            let state = try DeckStore.shared().load()
            let valid = state.reminderJobs(now: Date(), includeElapsed: true).contains { abs($0.fireAt.timeIntervalSinceNow) < 60 && $0.identifier == notification.request.identifier && $0.fingerprint == notification.request.content.userInfo["fingerprint"] as? String }
            completionHandler(valid ? [.banner, .sound] : [])
        } catch { completionHandler([]) }
    }
}
