#if canImport(UserNotifications)
import Foundation
import UserNotifications
import Darwin

public struct ReminderReport: Sendable {
    public var scheduled: Set<String>
    public var allowed: Bool
    public var message: String
}
/// Serializes app/widget notification changes with a shared advisory lock, separately from deck writes.
public actor NotificationScheduler {
    public static let shared = NotificationScheduler()
    private var tail: Task<ReminderReport, Error>?
    public static func requestPermission() async throws -> Bool {
        try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
    }
    public static let testIdentifier = "dailydeck.system-test"
    public static func permissionStatus() async -> String {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined: return "Not requested"
        case .denied: return "Blocked — enable in iPhone Settings → Notifications → Daily Deck"
        case .authorized: return "Granted"
        case .provisional: return "Quiet delivery allowed"
        default: return "Unavailable"
        }
    }
    /// A real OS-scheduled test, deliberately independent of deadline scheduling.
    /// No permission request occurs here; only the explicit Enable action prompts.
    public static func sendTest() async throws {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard [.authorized, .provisional].contains(settings.authorizationStatus) else {
            throw NSError(domain: "DailyDeck.Notifications", code: 1, userInfo: [NSLocalizedDescriptionKey: "Enable notifications first. If blocked, allow Daily Deck in iPhone notification settings."])
        }
        let content = UNMutableNotificationContent()
        content.title = "Daily Deck — test notification"
        content.body = "This is a system notification test, separate from your deadline reminders."
        content.sound = .default
        content.userInfo = ["kind": "system-test"]
        try await center.add(UNNotificationRequest(identifier: testIdentifier, content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 8, repeats: false)))
    }
    public static func cancelChanges(before: DeckState, after: DeckState, now: Date = Date()) {
        let jobs = Dictionary(uniqueKeysWithValues: after.reminderJobs(now: now, includeElapsed: true).map { ($0.identifier, $0) })
        let ids = before.reminderJobs(now: now, includeElapsed: true).filter { jobs[$0.identifier]?.fingerprint != $0.fingerprint }.map(\.identifier)
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
    }
    public func reconcile(store: DeckStore) async throws -> ReminderReport {
        let previous = tail
        let task = Task { _ = try? await previous?.value; return try await Self.perform(store: store) }
        tail = task
        return try await task.value
    }
    private static func perform(store: DeckStore) async throws -> ReminderReport {
        let center = UNUserNotificationCenter.current()
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        let fd = open(store.directory.appendingPathComponent("reminders.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw DeckStore.StoreError.lockFailed }; defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw DeckStore.StoreError.lockFailed }; defer { flock(fd, LOCK_UN) }
        let now = Date(), calendar = Calendar.current
        let url = store.directory.appendingPathComponent("reminder-journal-v1.json")
        var journal = FileManager.default.fileExists(atPath: url.path) ? try JSONDecoder().decode(ReminderJournal.self, from: Data(contentsOf: url)) : ReminderJournal()
        func persist() throws {
            try JSONEncoder().encode(journal).write(to: url, options: .atomic)
            #if os(iOS)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
            #endif
        }
        let state = try store.load(now: now, calendar: calendar)
        let settings = await center.notificationSettings()
        let allowed = [.authorized, .provisional].contains(settings.authorizationStatus)
        let pending = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix("dailydeck.reminder.") }
        let delivered = await center.deliveredNotifications().filter { $0.request.identifier.hasPrefix("dailydeck.reminder.") }
        journal.consumeElapsed(now: now, delivered: Set(delivered.map { $0.request.identifier }), pending: Set(pending.map(\.identifier)))
        let desired = state.schedulableReminderJobs(now: now, calendar: calendar, allowed: allowed, journal: journal)
        let ids = Set(desired.map(\.identifier))
        let cancel = pending.filter { request in !desired.contains(where: { $0.identifier == request.identifier && request.content.userInfo["fingerprint"] as? String == $0.fingerprint }) }.map(\.identifier)
        center.removePendingNotificationRequests(withIdentifiers: cancel)
        for id in journal.receipts.keys where !ids.contains(id) && !journal.receipts[id]!.consumed { journal.receipts[id]!.queued = false }
        try persist()
        var scheduled = Set<String>(), failures = 0
        for job in desired {
            if pending.contains(where: { $0.identifier == job.identifier && $0.content.userInfo["fingerprint"] as? String == job.fingerprint }) { scheduled.insert(job.identifier); continue }
            let latest = try store.load()
            guard job.fireAt > Date(), latest.reminderJobs(now: Date(), includeElapsed: true).contains(where: { $0.identifier == job.identifier && $0.fingerprint == job.fingerprint }) else { continue }
            // Reserve before handing off to the OS. A consumed receipt never sends twice after reload/travel.
            journal.receipts[job.identifier] = ReminderReceipt(fingerprint: job.fingerprint, fireAt: job.fireAt, queued: true, consumed: false, configuration: job.configuration)
            try persist()
            let content = UNMutableNotificationContent(); content.title = "Daily Deck"; content.body = job.body; content.sound = .default
            content.userInfo = ["fingerprint": job.fingerprint, "entryID": job.entryID.uuidString, "day": job.day.key]
            var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(secondsFromGMT: 0)!
            var components = utc.dateComponents([.year, .month, .day, .hour, .minute, .second], from: job.fireAt)
            components.timeZone = utc.timeZone; components.calendar = utc
            do {
                try await center.add(UNNotificationRequest(identifier: job.identifier, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
                scheduled.insert(job.identifier)
            } catch { journal.receipts[job.identifier]?.queued = false; failures += 1 }
            try persist()
        }
        let message = !allowed ? "Deadline saved. Notifications are not allowed; enable them in iPhone Settings to schedule reminders." : failures > 0 ? "Deadline saved. Some reminders could not be scheduled. Reopen Daily Deck to retry." : "\(scheduled.count) reminders scheduled on this device. iOS controls delivery."
        return ReminderReport(scheduled: scheduled, allowed: allowed, message: message)
    }
}
#endif
