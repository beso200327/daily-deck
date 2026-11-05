// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "DailyDeckCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "DailyDeckCore", targets: ["DailyDeckCore"])], targets: [.target(name: "DailyDeckCore", path: "DailyDeck/Core"), .testTarget(name: "DailyDeckCoreTests", dependencies: ["DailyDeckCore"], path: "Tests")])
