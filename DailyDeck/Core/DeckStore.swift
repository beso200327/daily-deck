import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

/// Both processes transact under the same advisory lock; reads never overwrite a newer widget action.
public final class DeckStore: Sendable {
    public static let group = "group.com.dailydeck.shared"
    public let directory: URL
    public init(directory: URL) { self.directory = directory }
    public static func shared() throws -> DeckStore {
        #if os(iOS)
        guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw StoreError.appGroupUnavailable
        }
        return DeckStore(directory: directory)
        #else
        return DeckStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("DailyDeck"))
        #endif
    }
    public enum StoreError: Error { case appGroupUnavailable, lockFailed, unsupportedVersion }
    @discardableResult public func transaction<T>(now: Date = Date(), calendar: Calendar = .current, _ body: (inout DeckState) throws -> T) throws -> (DeckState, T) {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let lock = directory.appendingPathComponent("deck.lock").path
        let fd = open(lock, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw StoreError.lockFailed }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw StoreError.lockFailed }
        defer { flock(fd, LOCK_UN) }
        let url = directory.appendingPathComponent("deck-v1.json")
        var state: DeckState
        if FileManager.default.fileExists(atPath: url.path) {
            state = try JSONDecoder().decode(DeckState.self, from: Data(contentsOf: url))
            guard state.version == 1 else { throw StoreError.unsupportedVersion }
        } else { state = DeckState() }
        let previous = state
        let existed = FileManager.default.fileExists(atPath: url.path)
        state.seed(now: now, calendar: calendar)
        state.roll(now: now, calendar: calendar)
        let result = try body(&state)
        guard !existed || previous != state else { return (state, result) }
        let data = try JSONEncoder().encode(state)
        try data.write(to: url, options: .atomic)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        #endif
        return (state, result)
    }
    public func load(now: Date = Date(), calendar: Calendar = .current) throws -> DeckState {
        try transaction(now: now, calendar: calendar) { _ in () }.0
    }
}
