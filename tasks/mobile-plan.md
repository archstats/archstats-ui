# Mobile: Android, iOS, Flutter, React Native, KMP

*Written 2026-09-28. Scope agreed the same day: native Android (Kotlin and Java), Swift, Objective-C, Kotlin Multiplatform, Flutter and React Native, each with language support, framework profiles, a stack, and reports. Engine on `feature/mobile` (off `feature/deployables`), UI on `feature/mobile-ui` (off `feature/deployables-ui`), both in session worktrees.*

## Status

*Built 2026-09-28, engine revision 6. Engine commits on `feature/mobile` (off `feature/deployables`), UI on `feature/mobile-ui`; neither is pushed.*

| Piece | State |
|---|---|
| Corpus + baseline | done (below) |
| E1 Kotlin annotations on their own declaration | built, tested |
| E2 Gradle project paths, type-safe accessors, module type, convention plugins | built, tested |
| E3 Android manifest, Info.plist, entitlements → `app_declarations` + manifest markers | built, tested |
| E4 Swift language pack, linked per target | built, tested |
| E5 SwiftPM and Xcode targets (pbxproj, synchronised folders, exception sets) | built, tested |
| E6 Objective-C language pack, linked with Swift | built, tested |
| E7 Dart language pack + pubspec modules | built, tested (grammar pinned to ABI 14) |
| E8 KMP `expect`/`actual` keywords; source sets read from paths | built, tested |
| E9 React Native bridge markers (Objective-C macros; Kotlin/Java/Swift via supertypes) | built, tested |
| E10 Mobile apps as deployables with platform and stack | built, tested |
| U1 Swift, Objective-C, Dart languages; profiles over several languages | built, tested |
| U2 Profiles: Android (Kotlin + Java, Compose), iOS (SwiftUI + UIKit), TCA, Flutter, React Native | built, tested |
| U3 Ecosystems: android, ios, flutter, react-native, kmp | built, tested |
| U4 Reports: Android, iOS, Flutter, React Native, KMP reviews + readings | built; every cell run on 18 real snapshots, 0 errors |
| U5 Stack: stack section in every mobile report; Deployables view shows mobile apps | built; checked in the running UI on IceCubesApp and nowinandroid (Units auto-reads iOS and Android; the Deployables inspector reads "A mobile app for iOS built by Xcode") |

### Results, revision 5 → 6

| Repository | Components | Edges | Modules (with a declared dependency) |
|---|---|---|---|
| IceCubesApp | 0 → 98 | 0 → 485 | 24 (23) |
| isowords | 0 → 145 | 0 → 470 | 135 (112) |
| Kickstarter ios-oss | 0 → 372 | 0 → 1,793 | 29 (22) |
| firefox-ios | 29 → 564 | 9 → 4,288 | 89 (68) |
| WordPress-iOS | 1 → 638 | 0 → 4,388 | 71 (52) |
| Signal-iOS | 5 → 381 | 0 → 5,591 | 10 (7) |
| SDWebImage | 0 → 15 | 0 → 10 | 16 (5) |
| Wonderous | 2 → 47 | 0 → 161 | 7 |
| immich | 187 → 379 | 351 → 1,649 | 18 |
| AppFlowy | 8 → 537 | 1 → 3,560 | 34 |
| nowinandroid | 83 | 306 | 36 (0 → 24) |
| Pocket Casts | 331 | 3,524 | 47 (0 → 36) |
| Thunderbird | 661 | 4,442 | 156 (1 → 124) |
| Tivi | 84 → 86 | 516 | 67 (0 → 62) |

Android component graphs do not change: Kotlin edges already came from imports. What Android gains is the module graph, annotations on functions (nowinandroid: 80 misplaced Composable markers → 149 on the right units), manifest facts, typed modules and apps.

What the readings say, from the smoke run: Kickstarter's UI is 25% SwiftUI, firefox-ios 22%, WordPress 55% with 8% of its lines still Objective-C; immich mixes Riverpod (222 classes) and Provider; AppFlowy Bloc (144) and Provider; Tivi shares 82% of its Kotlin through commonMain, Thunderbird 92%; Pocket Casts' manifests export 54 components.

### Known limits

- SDK levels set in convention plugins' Kotlin (nowinandroid's `minSdk = 21` in build-logic) are not read; those in build files and the version catalog are.
- Swift properties are not units, so `static let shared` singletons are found through fan-in (types used from the most folders), not by name.
- A Swift file no SwiftPM or Xcode target claims is filed under its top-level folder (3% of IceCubesApp's files, 0.7% of Kickstarter's).
- Sample, demo and preview apps are real deployables; reports list them after the real apps (isowords' ten previews, Signal's fourteen demos).
- The Dart grammar is the last one generated for tree-sitter ABI 14 (October 2025) and misses Dart 3.10's dot shorthands; newer needs go-tree-sitter 0.25, which moves the Java, JavaScript and Python grammars too.
- archstats-ui `main` has another session's uncommitted edits in `frameworkProfiles.ts` and a refactor of the report templates (`templateKit.ts`, `ecosystemTemplates.ts`); this branch builds on the committed versions and will need merging with that work.

## What the engine does with mobile code today

Twenty public repositories, shallow clones (depth 300), scanned with the `feature/deployables` engine (revision 5). "files x/y" is files of that language, and how many of them the scan put in a component.

| Repository | What it is | Source files (all / in a component) | Components | Edges | Gradle modules / with a declared dependency |
|---|---|---|---|---|---|
| android/architecture-samples | Kotlin, Compose, Hilt, 2 modules | kt 55/54 | 10 | 24 | 2 / 2 |
| android/nowinandroid | Kotlin, Compose, Hilt, convention plugins, 36 modules | kt 310/309 | 83 | 306 | 36 / **0** |
| Automattic/pocket-casts-android | Kotlin, Views + Compose, 47 modules | kt 2,345/2,345 | 331 | 3,524 | 47 / **0** |
| thunderbird/thunderbird-android | Kotlin + Java, 156 modules | kt 3,319, java 289 | 661 | 4,442 | 156 / **1** |
| signalapp/Signal-Android | Kotlin + Java, 59 modules | kt 4,482, java 1,717 | 743 | 10,543 | 59 / 47 |
| chrisbanes/tivi | KMP, Compose Multiplatform | kt 629/623, swift 6/0 | 84 | 516 | 65 / **0** |
| touchlab/KaMPKit | KMP starter | kt 34/34, swift 5/0 | 9 | 17 | 2 / 0 |
| JetBrains/kotlinconf-app | KMP, Compose Multiplatform | kt 260/260 | 25 | 96 | 8 / 6 |
| Dimillian/IceCubesApp | SwiftUI, SwiftPM packages | swift 428/**0** | **0** | 0 | – |
| pointfreeco/isowords | SwiftUI, TCA, SwiftPM | swift 388/**0** | **0** | 0 | – |
| kickstarter/ios-oss | UIKit, MVVM | swift 2,080/**0** | **0** | 0 | – |
| mozilla-mobile/firefox-ios | UIKit, Xcode projects | swift 3,200/**0** | 29 (all JavaScript) | 9 | – |
| wordpress-mobile/WordPress-iOS | Swift + Objective-C | swift 3,317/0, m 154/0, h 147/0 | 1 | 0 | – |
| signalapp/Signal-iOS | Swift + Objective-C | swift 2,652/0, m 34/0 | 5 | 0 | – |
| SDWebImage/SDWebImage | Objective-C library | m 104/0, h 159/0 | **0** | 0 | – |
| gskinnerTeam/flutter-wonderous-app | Flutter | dart 192/**0** | 2 | 0 | – |
| immich-app/immich | Flutter app + TypeScript server | dart 816/0, ts 1,063/1,059 | 187 (server) | 351 | – |
| AppFlowy-IO/AppFlowy | Flutter + Rust | dart 1,976/**0** | 8 | 1 | – |
| bluesky-social/social-app | React Native, Expo | tsx 1,092/1,091 | 339 | 1,906 | – |
| mattermost/mattermost-mobile | React Native | tsx 1,395/1,394, ts 1,760/1,646 | 766 | 6,832 | – |

What it says:

- **Swift, Objective-C and Dart are invisible.** About 12,300 Swift files, 450 Objective-C files and 3,000 Dart files across the corpus, none in a component.
- **Gradle's module graph is empty on modern Android builds.** Type-safe accessors (`implementation(projects.core.data)`) were not read, so nowinandroid, Pocket Casts, Tivi and Thunderbird declared almost nothing. Modules were named by their last directory, so nowinandroid's feature modules were all `impl` and `api`.
- **Kotlin annotations landed on the wrong unit.** An annotation went to the next class in the file. nowinandroid has at least 168 `@Composable` functions; none carried the marker, and `NiaButtonDefaults` (an object) carried `Composable` five times. Keys kept their arguments: `InstallIn(SingletonComponent::class)`, `RunWith(AndroidJUnit4::class)`.
- **Android lanes never apply to Kotlin.** The Classes view's Android profile is `language: "java"`, and detection only votes among the codebase's own language, so a Kotlin Android app is Ktor or "By structure".
- **React Native is analysed as TypeScript and works.** What is missing is knowing it is React Native (screens, native modules, the `android/` and `ios/` projects beside it).

Grammar quality, parse errors per file on a sample (a file with an error still yields everything outside the broken node):

| Grammar | Sample | Files with any parse error |
|---|---|---|
| Swift (`alex-pinkus/tree-sitter-swift` 0.7.3) | 250 files, five apps | 24 (10%) |
| Objective-C (`tree-sitter-grammars/tree-sitter-objc` 3.0.2) | 106 `.m`, 54 `.h` | 20 (19%), 15 (28%) |
| Dart (`UserNobody14/tree-sitter-dart`) | 250 files, three apps | 0 |

Each pack has to be judged on what it recovers, not on the error rate: declarations and imports found by the parser against a plain text count, per repository, the way Kotlin's recover.go was.

## Principles

The engine records neutral facts: units, markers (annotations, supertypes, manifest entries), modules and their types, deployables and their dependencies. The UI's profiles and report templates interpret them. The engine does not know what an Activity is; it knows `MainActivity` extends `ComponentActivity` and the manifest declares it as a launcher activity.

## Engine

### E1 Kotlin annotations (built)

Annotations are captured from the modifiers of the declaration they are written on (class, object, function, primary constructor) and attached to the innermost declaration around them. Keys are the simple name: `@Preview(showBackground = true)` → `Preview`, `@androidx.compose.runtime.Composable` → `Composable`, `@get:JvmName("x")` → `JvmName`. Parameter annotations mark nothing. Test: `TestAnnotationsBelongToTheirOwnDeclaration`.

### E2 Gradle (built)

- A module is named by its project path under the nearest settings file: `feature:foryou:impl`. An included build (`build-logic/settings.gradle.kts`) names its modules within itself. A flat build (Exposed) is unchanged.
- `project(":core:data")` keeps every segment. `projects.core.dataTest` resolves against every Gradle module with case and separators removed, so camel-case accessors meet kebab-case directories.
- New `modules.type`: `android-application`, `android-library`, `android-dynamic-feature`, `android-test`, `kotlin-multiplatform`, `build-logic`, `jvm-application`, `jvm-library`. Read from the plugins block by words, because convention plugins carry the platform in their ids (`nowinandroid.android.feature.impl`, `app.tivi.android.application`).
- Deployables name a Gradle project the same way, so the two still join.

### E3 Android manifest

`AndroidManifest.xml` per module (main, debug, flavours). The package comes from `package=` or the module's `namespace`.

- Markers, source `manifest`, on the unit the manifest names: `activity`, `service`, `receiver`, `provider`, plus `launcher` (MAIN/LAUNCHER intent filter), `exported`, `deep_link`. `.ui.MainActivity` resolves against the namespace.
- A view `app_declarations` (one row per entry, for Android and iOS): `module`, `platform`, `kind` (`activity`, `service`, `receiver`, `provider`, `permission`, `feature`, `deep_link`, `url_scheme`, `background_mode`, `entitlement`, `usage_description`), `name`, `value`, `exported`, `file`, `line`. Reports read permissions and the exported surface from it.

### E4 Swift language pack

- **Units:** `class`, `struct`, `enum`, `protocol`, `actor`, `extension` (a member of the type it extends, like a Kotlin extension function), functions, and members by owner.
- **Markers:** the inheritance clause as `supertype` (superclass and protocol conformances look the same in Swift; the key is the name), attributes as `annotation` (`@main`, `@Observable`, `@Model`, `@Reducer`, `@MainActor`, `@objc`), and property wrappers used inside a type as `annotation` on the type (`@State`, `@Published`, `@Environment`, `@Dependency`) so a view or a store can be read by what it holds.
- **Components:** the directory, as for Go. Swift has no packages; a target is a module, and inside a target every file sees every other file without an import.
- **Edges, and the one design decision that matters:** `import X` names a module (a target or a framework), not a directory, so it gives module-to-module edges only. Directory-to-directory edges inside a target come from type references: every type name a file mentions, resolved to the directory declaring that type **within the same target**. This runs after all files are parsed (a results editor, like Go's go.mod resolution), because it needs the whole target's declarations. Without it Swift ends up where Go was before its fix: components with no edges.
- **Which target a file is in:** from E5. Without a build file, the nearest folder holding Swift files that no other target claims (the fallback for bare folders).

### E5 Swift build files

- **SwiftPM `Package.swift`:** targets (`.target`, `.executableTarget`, `.testTarget`, `.macro`), each target's `dependencies` (by name and `.product(name:package:)`), and the path (`Sources/<name>` by default). Module kind `swiftpm`, type `library`, `executable`, `test`, `macro`. Read with regular expressions over the manifest's Swift; IceCubesApp and isowords put their whole architecture in `Package.swift`.
- **Xcode `project.pbxproj`:** native targets with their product type (`com.apple.product-type.application`, `.framework`, `.app-extension`, `.bundle.unit-test`, `.watchkit2-extension`), each target's source files (build phase file refs through the group tree, or Xcode 16's synchronized folders), and target dependencies. Module kind `xcode`. The pbxproj is an old-style plist; the reader parses that format, not regular expressions.
- **CocoaPods `Podfile` / `Podfile.lock`:** pods per target, for the stack. XcodeGen `project.yml` and Tuist `Project.swift` only if the corpus shows they are needed.

### E6 Objective-C language pack

`.m`, `.mm`, `.h`. Units are `@interface`, `@implementation`, `@protocol` and categories (`@interface UIView (WebCache)`, a member of the class it extends). Markers: superclass and adopted protocols. Components are directories. Edges from `#import "X.h"`, resolved to the directory holding that header (header search is by file name across the target, which is how Xcode resolves quoted imports), and `@import Module;` and `#import <Module/X.h>` as module edges. In mixed apps, `X-Swift.h` imports are edges into the target's Swift, and Swift's use of Objective-C comes through the bridging header.

### E7 Dart language pack and pubspec

- **pubspec.yaml:** module kind `pub`, named by `name:`, depending on `path:` dependencies and on every package it lists (for the stack). Type `flutter-app` (has `flutter:` and a `lib/main.dart`), `flutter-package`, `dart-package`.
- **Units:** classes, mixins, extensions (members of what they extend), enums, top-level functions. Markers: `extends`, `with`, `implements` as supertypes; annotations (`@riverpod`, `@freezed`, `@JsonSerializable`, `@injectable`).
- **Components:** directories under `lib/`. **Edges:** `import 'package:<own-name>/x/y.dart'` resolves through the pubspec name to `lib/x`; relative imports resolve by path; `part`/`part of` join a generated file to its library.

### E8 Kotlin Multiplatform

Source sets are directories (`src/commonMain`, `src/androidMain`, `src/iosMain`). A file-level fact records the source set, so a report can show shared versus platform code per module. `expect` and `actual` declarations get markers of those names, and an `actual` is linked to its `expect` by qualified name.

### E9 React Native

React Native is TypeScript the engine already reads. What it adds: `react-native` and `expo` as frameworks in the node reader's stack, native-module bridges as markers (`ReactContextBaseJavaModule`, `ReactPackage` supertypes in Kotlin and Java; `RCT_EXPORT_MODULE` in Objective-C; `RCTBridgeModule` conformance in Swift), and the `android/` and `ios/` projects inside the app, which the packs above already read.

### E10 Mobile apps as deployables, and their stack

A deployable of kind `mobile_app` for each Android application module, iOS application target, Flutter app and React Native app. `platform` (`android`, `ios`), id (`applicationId`, bundle id), and in `deployable_dependencies`: runtime (`minSdk`/`targetSdk`/`compileSdk`, iOS deployment target, Swift tools version, Dart SDK), framework (Compose, SwiftUI, UIKit, Flutter, React Native, Expo), and libraries grouped into roles the UI can show as a stack: DI (Hilt, Dagger, Koin, swift-dependencies, get_it, riverpod), networking (Retrofit, OkHttp, Ktor client, Alamofire, dio), persistence (Room, SQLDelight, Realm, Core Data, SwiftData, GRDB, drift, Isar), async (Coroutines, RxJava, Combine, RxSwift), images (Coil, Glide, Kingfisher, SDWebImage). Gradle version catalogs (`libs.versions.toml`) are where Android builds keep their versions, so they are read for this.

Revision bump to 6 once E3–E10 land.

## UI

- **U1 Languages.** `Language` gains `swift`, `objc`, `dart`. A profile can name several languages (`["kotlin", "java"]`), because Android and JVM codebases mix both and the plurality is often close (Thunderbird).
- **U2 Profiles.** Android (Kotlin + Java): Screens (Activity, Fragment, and composables named `*Screen`/`*Route`), UI (other composables, Views), ViewModels, DI, Data, Background, Models. SwiftUI and UIKit: App lifecycle, Screens, Views, State (ObservableObject, `@Observable`, stores), Data, Models. TCA as its own profile (Reducers, Views, Dependencies, Clients). Flutter: Screens (widgets under `screens/`/`pages/` or named `*Screen`/`*Page`), Widgets, State (Bloc, Cubit, providers, controllers), Data, Models. React Native reuses React with Screens and native modules. KMP: a lane split by source set.
- **U3 Ecosystems.** `android`, `ios`, `flutter`, `react-native`, `kmp`, each with the evidence it was read from.
- **U4 Reports.**
  - *Android app review:* the app → feature → core module graph and features that depend on other features; screens per feature; ViewModels that skip the repository layer; the manifest surface (exported components, permissions); how far Views → Compose has got; SDK levels per module.
  - *iOS app review:* targets and packages and how they depend on each other; how far UIKit → SwiftUI has got; the biggest view controllers; singletons (`static let shared`) and how many types reach them; views and view models calling the network directly; Objective-C left in a Swift app.
  - *Flutter app review:* packages and features, widgets per screen, state management in use and where it is mixed, generated code share.
  - *React Native review:* screens, native modules on each side, JS ↔ native surface.
  - *KMP review:* shared vs platform code per module, `expect`s and their `actual`s per platform.
- **U5 Stack.** The deployables Technology view already lists dependencies by role; mobile apps join it with their platform and SDK levels, and each mobile report opens with the stack.

## Order

1. Android: E1, E2 (done), E3, U1–U3 for Android, the Android report. Check on nowinandroid, Pocket Casts, Thunderbird, Signal.
2. Swift: E4, E5, then the iOS profile and report. Check on IceCubesApp, isowords, ios-oss, firefox-ios.
3. Objective-C: E6. Check on SDWebImage, WordPress-iOS, Signal-iOS.
4. Flutter: E7 and its profile and report. Check on wonderous, immich, AppFlowy.
5. KMP and React Native: E8, E9. Check on tivi, KaMPKit, kotlinconf, social-app, mattermost-mobile.
6. E10 deployables and stack across all of it, revision 6, then every mobile report run against every corpus repository.
