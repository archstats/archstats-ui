import { describe, expect, it } from "vitest"
import { ANDROID, EMPTY_FACTS, FLUTTER, IOS, REACT_NATIVE, TCA, UNCLASSIFIED, classify, detectFramework, profileById, type ClassFacts, type ClassSignals, type FrameworkProfile, type Language } from "./frameworkProfiles"
import { layersOf } from "~/features/reports/anatomy"

// The mobile mini-apps, as the engine reads them. Every unit here mirrors a
// unit the engine's own tests assert on (archstats: extensions/treesitter/
// swift/lanes_test.go, objc/lanes_test.go, dart/lanes_test.go and
// extensions/mobile/lanes_test.go): the same names, the same markers split
// the way loadUnits splits them -- `supertype` markers into supertypes, every
// other source (annotation, keyword, manifest) into annotations -- the same
// raw imports, and the same references between them.

interface Spec { file: string; annotations?: string[]; supertypes?: string[]; imports?: string[]; uses?: string[] }
type App = Record<string, Spec>

const factsOf = (name: string, s: Spec): ClassFacts => ({
  ...EMPTY_FACTS, name, file: s.file,
  annotations: new Set(s.annotations ?? []), supertypes: new Set(s.supertypes ?? []),
  imports: new Set(s.imports ?? []),
  // The snapshot records which imports a unit itself uses; a unit that uses
  // none of its file's imports has an empty set, not the file's.
  usedImports: new Set(s.uses ?? []),
  isInterface: (s.supertypes ?? []).includes("interface"),
})

/** The lane of every unit, with the graph signals the reading would give it. */
function lanesOf(profile: FrameworkProfile, app: App, edges: Array<[string, string]>): Record<string, string> {
  const signals = new Map<string, ClassSignals>()
  for (const name of Object.keys(app)) signals.set(name, { inDegree: 0, outDegree: 0 })
  for (const [a, z] of edges) { signals.get(a)!.outDegree++; signals.get(z)!.inDegree++ }
  return Object.fromEntries(Object.entries(app).map(([name, s]) => [name, classify(profile, factsOf(name, s), signals.get(name))]))
}

/** What the "layers" reading says of each edge: down, skip, back, or nothing when an end is beside the layers. */
function readEdges(profile: FrameworkProfile, lanes: Record<string, string>, edges: Array<[string, string]>) {
  const rank = new Map(layersOf(profile).map((id, i) => [id, i]))
  const out: Record<string, "down" | "skip" | "back" | "beside"> = {}
  for (const [a, z] of edges) {
    const f = rank.get(lanes[a]), t = rank.get(lanes[z])
    out[`${a} -> ${z}`] = f === undefined || t === undefined || f === t ? "beside" : t === f + 1 ? "down" : t > f + 1 ? "skip" : "back"
  }
  return out
}

const detected = (app: App, language: Language) => detectFramework(Object.entries(app).map(([n, s]) => factsOf(n, s)), language)

// ── iOS: SwiftUI with a UIKit corner ─────────────────────────────────────────

const ios: App = {
  Status: { file: "Sources/Models/Status.swift", annotations: ["struct"], supertypes: ["Codable", "Identifiable", "Sendable"], imports: ["Foundation"] },
  Visibility: { file: "Sources/Models/Status.swift", annotations: ["enum"], supertypes: ["Codable"], imports: ["Foundation"] },
  Account: { file: "Sources/Models/Account.swift", annotations: ["class"], supertypes: ["Codable"], imports: ["Foundation"] },
  Trip: { file: "Sources/Models/Storage/Trip.swift", annotations: ["class", "Model"], imports: ["SwiftData"], uses: ["SwiftData"] },
  StatusEntity: { file: "Sources/Models/Storage/StatusEntity.swift", annotations: ["class", "NSManaged"], supertypes: ["NSManagedObject"], imports: ["CoreData"], uses: ["CoreData"] },
  Client: { file: "Sources/Network/Client.swift", annotations: ["protocol"], supertypes: ["Sendable", "interface"], imports: ["Models"] },
  Endpoint: { file: "Sources/Network/MastodonClient.swift", annotations: ["enum"], imports: ["Foundation", "Models"] },
  MastodonClient: { file: "Sources/Network/MastodonClient.swift", annotations: ["class"], supertypes: ["Client"], imports: ["Foundation", "Models"], uses: ["Models"] },
  IceCubesApp: { file: "Sources/App/IceCubesApp.swift", annotations: ["struct", "main", "UIApplicationDelegateAdaptor"], supertypes: ["App"], imports: ["SwiftUI", "Models"] },
  AppDelegate: { file: "Sources/App/AppDelegate.swift", annotations: ["class"], supertypes: ["UIResponder", "UIApplicationDelegate"], imports: ["UIKit"] },
  TimelineScreen: { file: "Sources/App/Timeline/TimelineScreen.swift", annotations: ["struct", "StateObject"], supertypes: ["View"], imports: ["SwiftUI", "Models"] },
  TimelineViewModel: { file: "Sources/App/Timeline/TimelineViewModel.swift", annotations: ["class", "MainActor", "Published"], supertypes: ["ObservableObject"], imports: ["Foundation", "Models", "Network"], uses: ["Models"] },
  StatusRow: { file: "Sources/App/Timeline/StatusRow.swift", annotations: ["struct"], supertypes: ["View"], imports: ["Models", "SwiftUI"], uses: ["Models"] },
  StatusRepository: { file: "Sources/App/Data/StatusRepository.swift", annotations: ["protocol"], supertypes: ["Sendable", "interface"], imports: ["Models"] },
  DefaultStatusRepository: { file: "Sources/App/Data/DefaultStatusRepository.swift", annotations: ["class"], supertypes: ["StatusRepository"], imports: ["Models", "Network"], uses: ["Models", "Network"] },
  ProfileStore: { file: "Sources/App/Profile/ProfileStore.swift", annotations: ["class", "Observable"], imports: ["Observation", "Models"], uses: ["Models"] },
  SettingsViewController: { file: "Sources/App/Settings/SettingsViewController.swift", annotations: ["class"], supertypes: ["UIViewController", "UITableViewDataSource"], imports: ["UIKit"] },
  SettingsCell: { file: "Sources/App/Settings/SettingsCell.swift", annotations: ["class"], supertypes: ["UITableViewCell"], imports: ["UIKit"] },
}
// References, members rolled up to their owners, as the engine test asserts them.
const iosEdges: Array<[string, string]> = [
  ["IceCubesApp", "AppDelegate"], ["IceCubesApp", "TimelineScreen"],
  ["TimelineScreen", "TimelineViewModel"], ["TimelineScreen", "StatusRow"],
  ["TimelineViewModel", "StatusRepository"], ["TimelineViewModel", "DefaultStatusRepository"], ["TimelineViewModel", "Status"],
  ["StatusRow", "Status"],
  ["DefaultStatusRepository", "StatusRepository"], ["DefaultStatusRepository", "MastodonClient"], ["DefaultStatusRepository", "Status"],
  ["MastodonClient", "Client"], ["MastodonClient", "Endpoint"], ["MastodonClient", "Status"],
  ["SettingsViewController", "SettingsCell"],
  ["ProfileStore", "Account"],
  ["Status", "Visibility"],
  // Planted.
  ["DefaultStatusRepository", "TimelineScreen"],
  ["Status", "TimelineViewModel"],
]

describe("iOS", () => {
  const profile = profileById(IOS.id)
  const lanes = lanesOf(profile, ios, iosEdges)

  it("is detected from SwiftUI and UIKit, with Foundation-only files supporting", () => {
    const r = detected(ios, "swift")
    expect(r.id).toBe(IOS.id)
    expect(r.confident).toBe(true)
  })

  it("sorts the units the way an iOS architect would", () => {
    expect(lanes).toEqual({
      IceCubesApp: "app", AppDelegate: "app",
      TimelineScreen: "screens", SettingsViewController: "screens",
      StatusRow: "views", SettingsCell: "views",
      TimelineViewModel: "state", ProfileStore: "state",
      MastodonClient: "data", StatusRepository: "data", DefaultStatusRepository: "data",
      // A name that is only the suffix -- `protocol Client`, `enum Endpoint` -- says nothing on its own.
      Client: UNCLASSIFIED, Endpoint: UNCLASSIFIED,
      // Value types that cross boundaries, a Codable class, and the persistent records.
      Status: "models", Visibility: "models", Account: "models", Trip: "models", StatusEntity: "models",
    })
  })

  it("reads the normal edges as down and the planted ones as back up", () => {
    const read = readEdges(profile, lanes, iosEdges)
    expect(layersOf(profile)).toEqual(["screens", "state", "data", "models"])
    expect(read["TimelineScreen -> TimelineViewModel"]).toBe("down")
    expect(read["TimelineViewModel -> StatusRepository"]).toBe("down")
    expect(read["DefaultStatusRepository -> Status"]).toBe("down")
    expect(read["MastodonClient -> Status"]).toBe("down")
    // A view model handing a model to the view is a step over the data layer.
    expect(read["TimelineViewModel -> Status"]).toBe("skip")
    // Views and the App sit beside the layers.
    expect(read["TimelineScreen -> StatusRow"]).toBe("beside")
    expect(read["IceCubesApp -> TimelineScreen"]).toBe("beside")
    expect(read["DefaultStatusRepository -> TimelineScreen"]).toBe("back")
    expect(read["Status -> TimelineViewModel"]).toBe("back")
    expect(Object.values(read).filter(d => d === "back")).toHaveLength(2)
  })

  it("tells a SwiftUI screen from a view by its name only, and an extension's conformance counts", () => {
    // TimelineView is what most apps call their screens; there is nothing in
    // the language to say otherwise, so it reads as a view.
    expect(classify(profile, factsOf("TimelineView", { file: "a.swift", annotations: ["struct"], supertypes: ["View"] }))).toBe("views")
    expect(classify(profile, factsOf("TimelineScreen", { file: "a.swift", annotations: ["struct"], supertypes: ["View"] }))).toBe("screens")
    expect(classify(profile, factsOf("SettingsTab", { file: "a.swift", annotations: ["struct"], supertypes: ["View"] }))).toBe("screens")
    // StatusRow gained View in `extension StatusRow: View`; the engine folds it in.
    expect(lanes.StatusRow).toBe("views")
    // A protocol-only file: known by its name, since a protocol has no body.
    expect(classify(profile, factsOf("StatusRepository", { file: "a.swift", annotations: ["protocol"], supertypes: ["interface"] }))).toBe("data")
    expect(classify(profile, factsOf("Themeable", { file: "a.swift", annotations: ["protocol"], supertypes: ["interface"] }))).toBe(UNCLASSIFIED)
  })

  it("reads the @Observable macro and SwiftData's @Model apart", () => {
    expect(lanes.ProfileStore).toBe("state")
    expect(lanes.Trip).toBe("models")
    // A struct with only Hashable is a model; a class with only Hashable is not known to be one.
    expect(classify(profile, factsOf("Point", { file: "a.swift", annotations: ["struct"], supertypes: ["Hashable"] }))).toBe("models")
    expect(classify(profile, factsOf("Session", { file: "a.swift", annotations: ["class"], supertypes: ["Hashable"] }))).toBe(UNCLASSIFIED)
    // A struct with too many outgoing references is doing work, not carrying data.
    expect(classify(profile, factsOf("Point", { file: "a.swift", annotations: ["struct"], supertypes: ["Hashable"] }), { inDegree: 0, outDegree: 6 })).toBe(UNCLASSIFIED)
  })
})

// ── iOS in Objective-C ───────────────────────────────────────────────────────

const objc: App = {
  AppDelegate: { file: "App/AppDelegate.h", annotations: ["class"], supertypes: ["UIResponder", "UIApplicationDelegate"], imports: ["UIKit"] },
  TimelineViewController: { file: "App/Timeline/TimelineViewController.h", annotations: ["class"], supertypes: ["UIViewController", "UITableViewDataSource"], imports: ["UIKit"] },
  StatusCell: { file: "App/Timeline/StatusCell.h", annotations: ["class"], supertypes: ["UITableViewCell"], imports: ["UIKit"] },
  StatusStore: { file: "App/State/StatusStore.h", annotations: ["class"], supertypes: ["NSObject"], imports: ["Foundation"] },
  MastodonClientDelegate: { file: "App/Network/MastodonClient.h", annotations: ["protocol"], supertypes: ["NSObject", "interface"], imports: ["Foundation"] },
  MastodonClient: { file: "App/Network/MastodonClient.h", annotations: ["class"], supertypes: ["NSObject"], imports: ["Foundation"] },
  Status: { file: "App/Models/Status.h", annotations: ["class"], supertypes: ["NSObject", "NSCoding", "NSCopying"], imports: ["Foundation"] },
  StatusEntity: { file: "App/Models/StatusEntity.h", annotations: ["class"], supertypes: ["NSManagedObject"], imports: ["CoreData"], uses: ["CoreData"] },
}
const objcEdges: Array<[string, string]> = [
  ["AppDelegate", "TimelineViewController"],
  ["TimelineViewController", "StatusStore"], ["TimelineViewController", "StatusCell"], ["TimelineViewController", "Status"],
  ["StatusCell", "Status"],
  ["StatusStore", "MastodonClient"], ["StatusStore", "Status"],
  ["MastodonClient", "Status"], ["MastodonClient", "MastodonClientDelegate"],
  // Planted.
  ["MastodonClient", "TimelineViewController"],
  ["Status", "StatusStore"],
]

describe("iOS in Objective-C", () => {
  const profile = profileById(IOS.id)
  const lanes = lanesOf(profile, objc, objcEdges)

  it("is the same profile, detected from the frameworks the headers import", () => {
    expect(detected(objc, "objc").id).toBe(IOS.id)
  })

  it("sorts UIKit classes and NSCoding models", () => {
    expect(lanes).toEqual({
      AppDelegate: "app",
      TimelineViewController: "screens",
      StatusCell: "views",
      StatusStore: "state",
      MastodonClient: "data",
      // A delegate protocol has no lane of its own; it belongs to whatever it is the delegate of.
      MastodonClientDelegate: UNCLASSIFIED,
      Status: "models", StatusEntity: "models",
    })
  })

  it("reads the planted edges as back up", () => {
    const read = readEdges(profile, lanes, objcEdges)
    expect(read["TimelineViewController -> StatusStore"]).toBe("down")
    expect(read["StatusStore -> MastodonClient"]).toBe("down")
    expect(read["MastodonClient -> Status"]).toBe("down")
    expect(read["MastodonClient -> TimelineViewController"]).toBe("back")
    expect(read["Status -> StatusStore"]).toBe("back")
  })
})

// ── The Composable Architecture, with a plain SwiftUI corner ─────────────────

const tca: App = {
  CounterFeature: { file: "Sources/App/Features/CounterFeature.swift", annotations: ["struct", "Reducer", "Dependency"], imports: ["ComposableArchitecture", "Foundation"] },
  CounterView: { file: "Sources/App/Features/CounterView.swift", annotations: ["struct", "Bindable"], supertypes: ["View"], imports: ["ComposableArchitecture", "SwiftUI"] },
  FactRow: { file: "Sources/App/Features/CounterView.swift", annotations: ["struct"], supertypes: ["View"], imports: ["ComposableArchitecture", "SwiftUI"] },
  NumberFactClient: { file: "Sources/App/Dependencies/NumberFactClient.swift", annotations: ["struct", "DependencyClient"], supertypes: ["DependencyKey"], imports: ["ComposableArchitecture", "Foundation"] },
  Fact: { file: "Sources/App/Models/Fact.swift", annotations: ["struct"], supertypes: ["Equatable", "Codable"], imports: ["Foundation"] },
  CounterApp: { file: "Sources/App/CounterApp.swift", annotations: ["struct", "main"], supertypes: ["App"], imports: ["ComposableArchitecture", "SwiftUI"] },
  SettingsView: { file: "Sources/App/Settings/SettingsView.swift", annotations: ["struct", "StateObject"], supertypes: ["View"], imports: ["SwiftUI"] },
  SettingsModel: { file: "Sources/App/Settings/SettingsView.swift", annotations: ["class", "Published"], supertypes: ["ObservableObject"], imports: ["SwiftUI"] },
}
const tcaEdges: Array<[string, string]> = [
  // The nested State and Action are members: their references are the feature's.
  ["CounterFeature", "NumberFactClient"], ["CounterFeature", "Fact"],
  ["CounterView", "CounterFeature"], ["CounterView", "FactRow"], ["FactRow", "Fact"],
  ["NumberFactClient", "Fact"],
  ["CounterApp", "CounterFeature"], ["CounterApp", "CounterView"],
  ["SettingsView", "SettingsModel"],
]

describe("The Composable Architecture", () => {
  const profile = profileById(TCA.id)
  const lanes = lanesOf(profile, tca, tcaEdges)

  it("demotes the SwiftUI it is written in", () => {
    // Every TCA file imports SwiftUI or Foundation too; a whole app of them
    // is TCA, not iOS, and the plain SwiftUI corner does not tip it back.
    const r = detected(tca, "swift")
    expect(r.id).toBe(TCA.id)
    expect(r.confident).toBe(true)
    // With too few reducers to be sure, the SwiftUI profile is not demoted and wins.
    const mostlySwiftUI: App = { CounterFeature: tca.CounterFeature, CounterView: tca.CounterView, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`View${i}`, { file: `V${i}.swift`, annotations: ["struct"], supertypes: ["View"], imports: ["SwiftUI"] } satisfies Spec])) }
    expect(detected(mostlySwiftUI, "swift").id).toBe(IOS.id)
  })

  it("sorts reducers, views, dependencies and models, with the nested State and Action folded into their reducer", () => {
    expect(lanes).toEqual({
      CounterFeature: "features",
      CounterView: "views", FactRow: "views", SettingsView: "views",
      NumberFactClient: "clients",
      Fact: "models",
      CounterApp: "app",
      SettingsModel: "state",
    })
  })

  it("orders views over reducers over dependencies over models", () => {
    expect(layersOf(profile)).toEqual(["views", "features", "clients", "models"])
    const read = readEdges(profile, lanes, tcaEdges)
    expect(read["CounterView -> CounterFeature"]).toBe("down")
    expect(read["CounterFeature -> NumberFactClient"]).toBe("down")
    expect(read["NumberFactClient -> Fact"]).toBe("down")
    expect(read["CounterFeature -> Fact"]).toBe("skip")
    expect(read["FactRow -> Fact"]).toBe("skip")
    expect(read["CounterApp -> CounterFeature"]).toBe("beside")
    // A reducer that renders, or a client that knows a reducer, runs back up.
    const planted = readEdges(profile, lanes, [["CounterFeature", "CounterView"], ["NumberFactClient", "CounterFeature"], ["Fact", "NumberFactClient"]])
    expect(Object.values(planted)).toEqual(["back", "back", "back"])
  })

  it("reads a reducer written as a protocol conformance too", () => {
    expect(classify(profile, factsOf("LegacyFeature", { file: "a.swift", annotations: ["struct"], supertypes: ["Reducer"] }))).toBe("features")
    expect(classify(profile, factsOf("ApiClient", { file: "a.swift", annotations: ["struct"], supertypes: ["TestDependencyKey"] }))).toBe("clients")
  })
})

// ── Flutter: Bloc, Riverpod (with and without codegen) and GetX in one app ───

const flutter: App = {
  main: { file: "lib/main.dart", imports: ["flutter/material.dart", "flutter_riverpod/flutter_riverpod.dart", "wonders/ui/screens/home_screen.dart"] },
  WondersApp: { file: "lib/main.dart", annotations: ["class"], supertypes: ["StatelessWidget"], imports: ["flutter/material.dart", "flutter_riverpod/flutter_riverpod.dart", "wonders/ui/screens/home_screen.dart"] },
  HomeScreen: { file: "lib/ui/screens/home_screen.dart", annotations: ["class"], supertypes: ["StatefulWidget"], imports: ["flutter/material.dart", "flutter_bloc/flutter_bloc.dart", "wonders/logic/wonders_bloc.dart", "wonders/ui/widgets/wonder_card.dart"] },
  _HomeScreenState: { file: "lib/ui/screens/home_screen.dart", annotations: ["class"], supertypes: ["State"], imports: ["flutter/material.dart", "flutter_bloc/flutter_bloc.dart", "wonders/logic/wonders_bloc.dart", "wonders/ui/widgets/wonder_card.dart"] },
  SettingsPage: { file: "lib/ui/screens/settings_page.dart", annotations: ["class"], supertypes: ["ConsumerWidget"], imports: ["flutter/material.dart", "flutter_riverpod/flutter_riverpod.dart", "wonders/logic/settings_provider.dart"] },
  HomeView: { file: "lib/ui/screens/home_view.dart", annotations: ["class"], supertypes: ["GetView"], imports: ["flutter/material.dart", "get/get.dart", "wonders/logic/home_controller.dart"] },
  WonderCard: { file: "lib/ui/widgets/wonder_card.dart", annotations: ["class"], supertypes: ["StatelessWidget"], imports: ["flutter/material.dart", "wonders/models/wonder.dart"] },
  WondersBloc: { file: "lib/logic/wonders_bloc.dart", annotations: ["class"], supertypes: ["Bloc"], imports: ["bloc/bloc.dart", "equatable/equatable.dart", "wonders/data/wonders_repository.dart", "wonders/models/wonder.dart"] },
  WondersEvent: { file: "lib/logic/wonders_event.dart", annotations: ["class", "sealed"], supertypes: ["Equatable"] },
  LoadWonders: { file: "lib/logic/wonders_event.dart", annotations: ["class", "final"], supertypes: ["WondersEvent"] },
  WondersState: { file: "lib/logic/wonders_state.dart", annotations: ["class"], supertypes: ["Equatable"] },
  Settings: { file: "lib/logic/settings_provider.dart", annotations: ["class", "riverpod"], supertypes: ["_$Settings"], imports: ["riverpod_annotation/riverpod_annotation.dart", "wonders/data/settings_store.dart"] },
  settingsStore: { file: "lib/logic/settings_provider.dart", annotations: ["Riverpod"], imports: ["riverpod_annotation/riverpod_annotation.dart", "wonders/data/settings_store.dart"] },
  counterProvider: { file: "lib/logic/counter_provider.dart", supertypes: ["StateNotifierProvider"], imports: ["flutter_riverpod/flutter_riverpod.dart", "wonders/data/api_client.dart", "wonders/data/wonders_repository.dart"] },
  wondersRepositoryProvider: { file: "lib/logic/counter_provider.dart", supertypes: ["Provider"], imports: ["flutter_riverpod/flutter_riverpod.dart", "wonders/data/api_client.dart", "wonders/data/wonders_repository.dart"] },
  CounterNotifier: { file: "lib/logic/counter_provider.dart", annotations: ["class"], supertypes: ["StateNotifier"], imports: ["flutter_riverpod/flutter_riverpod.dart", "wonders/data/api_client.dart", "wonders/data/wonders_repository.dart"] },
  HomeController: { file: "lib/logic/home_controller.dart", annotations: ["class"], supertypes: ["GetxController"], imports: ["get/get.dart"] },
  WondersRepository: { file: "lib/data/wonders_repository.dart", annotations: ["class"], imports: ["wonders/data/api_client.dart", "wonders/models/wonder.dart", "wonders/ui/screens/home_screen.dart"] },
  ApiClient: { file: "lib/data/api_client.dart", annotations: ["class"], imports: ["dio/dio.dart"], uses: ["dio/dio.dart"] },
  SettingsStore: { file: "lib/data/settings_store.dart", annotations: ["class"], imports: ["shared_preferences/shared_preferences.dart"], uses: ["shared_preferences/shared_preferences.dart"] },
  Wonder: { file: "lib/models/wonder.dart", annotations: ["class", "freezed"], supertypes: ["_$Wonder"], imports: ["freezed_annotation/freezed_annotation.dart"] },
  _Wonder: { file: "lib/models/wonder.freezed.dart", annotations: ["class"], supertypes: ["Wonder"] },
  WonderDraft: { file: "lib/models/wonder_draft.dart", annotations: ["class"], imports: ["wonders/logic/wonders_bloc.dart"] },
}
const flutterEdges: Array<[string, string]> = [
  ["main", "WondersApp"], ["WondersApp", "HomeScreen"],
  ["HomeScreen", "_HomeScreenState"], ["_HomeScreenState", "HomeScreen"],
  ["_HomeScreenState", "WondersBloc"], ["_HomeScreenState", "LoadWonders"], ["_HomeScreenState", "WondersState"], ["_HomeScreenState", "WonderCard"],
  ["HomeView", "HomeController"],
  ["WonderCard", "Wonder"],
  ["WondersBloc", "WondersRepository"], ["WondersBloc", "WondersEvent"], ["WondersBloc", "LoadWonders"], ["WondersBloc", "WondersState"],
  ["LoadWonders", "WondersEvent"], ["WondersState", "Wonder"],
  ["counterProvider", "CounterNotifier"], ["wondersRepositoryProvider", "WondersRepository"], ["wondersRepositoryProvider", "ApiClient"],
  ["settingsStore", "SettingsStore"],
  ["WondersRepository", "ApiClient"], ["WondersRepository", "Wonder"],
  ["_Wonder", "Wonder"],
  // Planted.
  ["WondersRepository", "HomeScreen"],
  ["WonderDraft", "WondersBloc"],
]

describe("Flutter", () => {
  const profile = profileById(FLUTTER.id)
  const lanes = lanesOf(profile, flutter, flutterEdges)

  it("is detected from the flutter packages", () => {
    const r = detected(flutter, "dart")
    expect(r.id).toBe(FLUTTER.id)
    expect(r.confident).toBe(true)
  })

  it("sorts widgets, state managers, data and models the way a Flutter architect would", () => {
    expect(lanes).toEqual({
      main: UNCLASSIFIED,
      WondersApp: "widgets",
      // A StatefulWidget's code is in its State class; both are the screen.
      HomeScreen: "screens", _HomeScreenState: "screens",
      SettingsPage: "screens", HomeView: "screens",
      WonderCard: "widgets",
      // Bloc, Riverpod with codegen, Riverpod without, GetX.
      WondersBloc: "state", Settings: "state", settingsStore: "state", counterProvider: "state", wondersRepositoryProvider: "state", CounterNotifier: "state", HomeController: "state",
      // A Store that reads shared_preferences is data; one that only held state would be a MobX-style store.
      WondersRepository: "data", ApiClient: "data", SettingsStore: "data",
      // Bloc events and states by their part files, Freezed by its annotation.
      WondersEvent: "models", LoadWonders: "models", WondersState: "models", Wonder: "models",
      // The generated implementation and a plain class carry nothing that says what they are.
      _Wonder: UNCLASSIFIED, WonderDraft: UNCLASSIFIED,
    })
  })

  it("reads the normal edges as down and the planted ones as back up", () => {
    expect(layersOf(profile)).toEqual(["screens", "state", "data", "models"])
    const read = readEdges(profile, lanes, flutterEdges)
    expect(read["_HomeScreenState -> WondersBloc"]).toBe("down")
    expect(read["HomeView -> HomeController"]).toBe("down")
    expect(read["WondersBloc -> WondersRepository"]).toBe("down")
    expect(read["wondersRepositoryProvider -> WondersRepository"]).toBe("down")
    expect(read["WondersRepository -> Wonder"]).toBe("down")
    expect(read["_HomeScreenState -> WondersState"]).toBe("skip")
    expect(read["WondersBloc -> WondersState"]).toBe("skip")
    expect(read["_HomeScreenState -> WonderCard"]).toBe("beside")
    expect(read["WondersRepository -> HomeScreen"]).toBe("back")
    // A plain class with no evidence is left out of the reading rather than blamed.
    expect(read["WonderDraft -> WondersBloc"]).toBe("beside")
    expect(readEdges(profile, { ...lanes, WonderDraft: "models" }, [["WonderDraft", "WondersBloc"]])["WonderDraft -> WondersBloc"]).toBe("back")
  })

  it("keeps a widget's State class with its widget, and a plain State with the widgets", () => {
    expect(classify(profile, factsOf("_WonderCardState", { file: "a.dart", annotations: ["class"], supertypes: ["State"] }))).toBe("widgets")
    expect(classify(profile, factsOf("_SettingsPageState", { file: "a.dart", annotations: ["class"], supertypes: ["ConsumerState"] }))).toBe("screens")
    expect(classify(profile, factsOf("HomeRoute", { file: "a.dart", annotations: ["class", "RoutePage"], supertypes: ["StatelessWidget"] }))).toBe("screens")
  })
})

// ── React Native: Expo Router, Redux Toolkit, TurboModules ───────────────────

const rn: App = {
  RootLayout: { file: "app/_layout.tsx", imports: ["expo-router", "react-redux", "../src/state/store"], uses: ["expo-router", "react-redux", "../src/state/store"] },
  FeedTab: { file: "app/(tabs)/index.tsx", imports: ["react-native", "../../src/components/FeedList", "../../src/hooks/useFeed"], uses: ["react-native", "../../src/components/FeedList", "../../src/hooks/useFeed"] },
  ProfileScreen: { file: "src/screens/ProfileScreen.tsx", imports: ["react-native", "react-redux", "../components/Avatar", "../state/profileSlice"], uses: ["react-native", "react-redux", "../components/Avatar", "../state/profileSlice"] },
  FeedList: { file: "src/components/FeedList.tsx", imports: ["react-native", "../types", "./PostCard"], uses: ["react-native", "../types", "./PostCard"] },
  PostCard: { file: "src/components/PostCard.tsx", imports: ["react-native", "../types"], uses: ["react-native", "../types"] },
  Avatar: { file: "src/components/Avatar.tsx", imports: ["react-native"], uses: ["react-native"] },
  useFeed: { file: "src/hooks/useFeed.ts", imports: ["react", "react-redux", "../state/feedSlice"], uses: ["react", "react-redux", "../state/feedSlice"] },
  feedSlice: { file: "src/state/feedSlice.ts", supertypes: ["createSlice"], imports: ["@reduxjs/toolkit", "../api/client", "../types", "./store"], uses: ["@reduxjs/toolkit"] },
  FeedState: { file: "src/state/feedSlice.ts", supertypes: ["interface"], imports: ["@reduxjs/toolkit", "../api/client", "../types", "./store"], uses: ["../types"] },
  selectPosts: { file: "src/state/feedSlice.ts", imports: ["@reduxjs/toolkit", "../api/client", "../types", "./store"], uses: ["./store"] },
  profileSlice: { file: "src/state/profileSlice.ts", supertypes: ["createSlice"], imports: ["@reduxjs/toolkit", "../types", "./store"], uses: ["@reduxjs/toolkit", "../types"] },
  selectProfile: { file: "src/state/profileSlice.ts", imports: ["@reduxjs/toolkit", "../types", "./store"], uses: ["./store"] },
  RootState: { file: "src/state/store.ts", imports: ["@reduxjs/toolkit", "./feedSlice", "./profileSlice"] },
  fetchFeed: { file: "src/api/client.ts", imports: ["axios", "../types", "../screens/ProfileScreen"], uses: ["axios", "../types"] },
  fetchProfile: { file: "src/api/client.ts", imports: ["axios", "../types", "../screens/ProfileScreen"], uses: ["axios", "../types"] },
  openProfile: { file: "src/api/client.ts", imports: ["axios", "../types", "../screens/ProfileScreen"], uses: ["../screens/ProfileScreen"] },
  Post: { file: "src/types.ts", supertypes: ["interface"] },
  Profile: { file: "src/types.ts", supertypes: ["interface"] },
  Draft: { file: "src/types/draft.ts", supertypes: ["interface"], imports: ["../hooks/useFeed"], uses: ["../hooks/useFeed"] },
  share: { file: "src/native/share.ts", imports: ["react-native"], uses: ["react-native"] },
  Spec: { file: "specs/NativeCalculator.ts", supertypes: ["interface"], imports: ["react-native"] },
}
const rnEdges: Array<[string, string]> = [
  ["FeedTab", "FeedList"], ["FeedTab", "useFeed"],
  ["ProfileScreen", "Avatar"], ["ProfileScreen", "selectProfile"],
  ["FeedList", "PostCard"], ["FeedList", "Post"], ["PostCard", "Post"],
  ["useFeed", "selectPosts"],
  ["FeedState", "Post"], ["selectPosts", "RootState"], ["profileSlice", "Profile"], ["selectProfile", "RootState"],
  ["fetchFeed", "Post"], ["fetchProfile", "Profile"],
  // Planted.
  ["openProfile", "ProfileScreen"],
  ["Draft", "useFeed"],
]

describe("React Native", () => {
  const profile = profileById(REACT_NATIVE.id)
  const lanes = lanesOf(profile, rn, rnEdges)

  it("is detected over React", () => {
    const r = detected(rn, "typescript")
    expect(r.id).toBe(REACT_NATIVE.id)
    expect(r.confident).toBe(true)
  })

  it("sorts route files, screens, components, hooks, slices, clients, specs and types", () => {
    expect(lanes).toEqual({
      // Expo Router names routes by path, so the layout and the tab are screens whatever they are called.
      RootLayout: "screens", FeedTab: "screens", ProfileScreen: "screens",
      FeedList: "components", PostCard: "components", Avatar: "components",
      useFeed: "hooks",
      feedSlice: "state", profileSlice: "state", selectPosts: "state", selectProfile: "state",
      fetchFeed: "data", fetchProfile: "data",
      // A helper in the client file that uses none of its imports is not data by association.
      openProfile: UNCLASSIFIED,
      Post: "models", Profile: "models", FeedState: "models", RootState: "models", Draft: "models",
      Spec: "native", share: UNCLASSIFIED,
    })
  })

  it("reads the normal edges as down and the planted ones as back up", () => {
    expect(layersOf(profile)).toEqual(["screens", "hooks", "state", "data", "models"])
    const read = readEdges(profile, lanes, rnEdges)
    expect(read["FeedTab -> useFeed"]).toBe("down")
    expect(read["useFeed -> selectPosts"]).toBe("down")
    expect(read["fetchFeed -> Post"]).toBe("down")
    expect(read["ProfileScreen -> selectProfile"]).toBe("skip")
    expect(read["selectPosts -> RootState"]).toBe("skip")
    expect(read["FeedTab -> FeedList"]).toBe("beside")
    expect(read["Draft -> useFeed"]).toBe("back")
    // The planted client -> screen edge is read once the helper is placed with its file's clients.
    expect(readEdges(profile, { ...lanes, openProfile: "data" }, [["openProfile", "ProfileScreen"]])["openProfile -> ProfileScreen"]).toBe("back")
  })

  it("tells a .tsx screen from a .ts hook and a component from a slice", () => {
    expect(classify(profile, factsOf("SettingsScreen", { file: "src/features/settings/SettingsScreen.tsx" }))).toBe("screens")
    expect(classify(profile, factsOf("SettingsRow", { file: "src/features/settings/SettingsRow.tsx" }))).toBe("components")
    expect(classify(profile, factsOf("useSettings", { file: "src/features/settings/useSettings.ts" }))).toBe("hooks")
    // A component under app/components is a component, not a route.
    expect(classify(profile, factsOf("Button", { file: "app/components/Button.tsx" }))).toBe("components")
    // A slice in a .tsx file is still a slice.
    expect(classify(profile, factsOf("settingsSlice", { file: "src/state/settings.tsx", supertypes: ["createSlice"], imports: ["@reduxjs/toolkit"], uses: ["@reduxjs/toolkit"] }))).toBe("state")
    expect(classify(profile, factsOf("api", { file: "src/api.ts", supertypes: ["createApi"], imports: ["@reduxjs/toolkit/query/react"], uses: ["@reduxjs/toolkit/query/react"] }))).toBe("data")
  })
})

// ── Android: Kotlin and Java in one module ───────────────────────────────────

const android: App = {
  NiaApplication: { file: "app/src/main/java/com/acme/nia/NiaApplication.kt", annotations: ["HiltAndroidApp", "application"], supertypes: ["Application"], imports: ["android.app.Application", "dagger.hilt.android.HiltAndroidApp"] },
  MainActivity: { file: "app/src/main/java/com/acme/nia/MainActivity.kt", annotations: ["AndroidEntryPoint", "activity", "exported", "launcher"], supertypes: ["ComponentActivity"], imports: ["android.os.Bundle", "androidx.activity.ComponentActivity", "androidx.activity.compose.setContent", "com.acme.nia.feature.foryou.ForYouScreen", "dagger.hilt.android.AndroidEntryPoint"] },
  ForYouScreen: { file: "app/src/main/java/com/acme/nia/feature/foryou/ForYouScreen.kt", annotations: ["Composable"], imports: ["androidx.compose.runtime.Composable", "com.acme.nia.model.Topic"] },
  TopicRow: { file: "app/src/main/java/com/acme/nia/feature/foryou/ForYouScreen.kt", annotations: ["Composable"], imports: ["androidx.compose.runtime.Composable", "com.acme.nia.model.Topic"] },
  TopicRowPreview: { file: "app/src/main/java/com/acme/nia/feature/foryou/ForYouScreen.kt", annotations: ["Composable", "Preview"], imports: ["androidx.compose.runtime.Composable", "com.acme.nia.model.Topic"] },
  ForYouViewModel: { file: "app/src/main/java/com/acme/nia/feature/foryou/ForYouViewModel.kt", annotations: ["HiltViewModel", "Inject"], supertypes: ["ViewModel"], imports: ["androidx.lifecycle.ViewModel", "com.acme.nia.data.TopicsRepository", "dagger.hilt.android.lifecycle.HiltViewModel"] },
  ForYouUiState: { file: "app/src/main/java/com/acme/nia/feature/foryou/ForYouViewModel.kt", annotations: ["data"], imports: ["androidx.lifecycle.ViewModel", "com.acme.nia.data.TopicsRepository", "dagger.hilt.android.lifecycle.HiltViewModel"] },
  TopicsRepository: { file: "app/src/main/java/com/acme/nia/data/TopicsRepository.kt", supertypes: ["interface"], imports: ["com.acme.nia.data.local.TopicDao", "retrofit2.http.GET"] },
  OfflineFirstTopicsRepository: { file: "app/src/main/java/com/acme/nia/data/TopicsRepository.kt", annotations: ["Inject"], supertypes: ["TopicsRepository"], imports: ["com.acme.nia.MainActivity", "com.acme.nia.data.local.TopicDao", "com.acme.nia.data.network.NiaNetworkApi"], uses: ["com.acme.nia.MainActivity", "com.acme.nia.data.local.TopicDao", "com.acme.nia.data.network.NiaNetworkApi"] },
  TopicDao: { file: "app/src/main/java/com/acme/nia/data/local/TopicDao.kt", annotations: ["Dao"], supertypes: ["interface"], imports: ["androidx.room.Dao", "androidx.room.Query"], uses: ["androidx.room.Dao", "androidx.room.Query"] },
  TopicEntity: { file: "app/src/main/java/com/acme/nia/data/local/TopicEntity.kt", annotations: ["Entity", "data"], imports: ["androidx.room.Entity", "androidx.room.PrimaryKey", "com.acme.nia.model.Topic"], uses: ["androidx.room.Entity", "androidx.room.PrimaryKey", "com.acme.nia.model.Topic"] },
  NiaDatabase: { file: "app/src/main/java/com/acme/nia/data/local/NiaDatabase.kt", annotations: ["Database"], supertypes: ["RoomDatabase"], imports: ["androidx.room.Database", "androidx.room.RoomDatabase"], uses: ["androidx.room.Database", "androidx.room.RoomDatabase"] },
  NiaNetworkApi: { file: "app/src/main/java/com/acme/nia/data/network/NiaNetworkApi.kt", supertypes: ["interface"], imports: ["kotlinx.serialization.Serializable", "retrofit2.http.GET"], uses: ["retrofit2.http.GET"] },
  NetworkTopic: { file: "app/src/main/java/com/acme/nia/data/network/NiaNetworkApi.kt", annotations: ["Serializable", "data"], imports: ["kotlinx.serialization.Serializable", "retrofit2.http.GET"], uses: ["kotlinx.serialization.Serializable"] },
  DataModule: { file: "app/src/main/java/com/acme/nia/di/DataModule.kt", annotations: ["Module", "InstallIn"], imports: ["androidx.room.Room", "dagger.Module", "retrofit2.Retrofit"], uses: ["androidx.room.Room", "dagger.Module", "retrofit2.Retrofit"] },
  RepositoryModule: { file: "app/src/main/java/com/acme/nia/di/DataModule.kt", annotations: ["Module", "InstallIn"], imports: ["androidx.room.Room", "dagger.Module", "retrofit2.Retrofit"], uses: ["dagger.Module"] },
  Topic: { file: "app/src/main/java/com/acme/nia/model/Topic.kt", annotations: ["data"] },
  TopicDraft: { file: "app/src/main/java/com/acme/nia/model/TopicDraft.kt", imports: ["com.acme.nia.feature.foryou.ForYouViewModel"], uses: ["com.acme.nia.feature.foryou.ForYouViewModel"] },
  SyncService: { file: "app/src/main/java/com/acme/nia/sync/SyncService.kt", annotations: ["service"], supertypes: ["Service"], imports: ["android.app.Service", "androidx.work.CoroutineWorker"] },
  SyncWorker: { file: "app/src/main/java/com/acme/nia/sync/SyncService.kt", annotations: ["HiltWorker", "AssistedInject"], supertypes: ["CoroutineWorker"], imports: ["android.app.Service", "androidx.work.CoroutineWorker"] },
  BootReceiver: { file: "app/src/main/java/com/acme/nia/BootReceiver.java", annotations: ["receiver"], supertypes: ["BroadcastReceiver"], imports: ["android.content.BroadcastReceiver", "com.acme.nia.sync.SyncService"] },
  SettingsFragment: { file: "app/src/main/java/com/acme/nia/feature/settings/SettingsFragment.java", supertypes: ["Fragment"], imports: ["androidx.fragment.app.Fragment", "androidx.recyclerview.widget.RecyclerView"] },
  SettingsViewModel: { file: "app/src/main/java/com/acme/nia/feature/settings/SettingsViewModel.java", supertypes: ["ViewModel"], imports: ["androidx.lifecycle.ViewModel", "com.acme.nia.data.local.NiaDatabase"] },
  // The Java pack records a qualified supertype as both of its parts.
  SettingsAdapter: { file: "app/src/main/java/com/acme/nia/feature/settings/SettingsAdapter.java", supertypes: ["RecyclerView", "Adapter"], imports: ["androidx.recyclerview.widget.RecyclerView"] },
}
const androidEdges: Array<[string, string]> = [
  ["MainActivity", "ForYouScreen"],
  ["ForYouScreen", "ForYouViewModel"], ["ForYouScreen", "TopicRow"], ["TopicRow", "Topic"],
  ["ForYouViewModel", "TopicsRepository"], ["ForYouViewModel", "ForYouUiState"], ["ForYouUiState", "Topic"],
  ["OfflineFirstTopicsRepository", "TopicsRepository"], ["OfflineFirstTopicsRepository", "TopicDao"], ["OfflineFirstTopicsRepository", "NiaNetworkApi"], ["OfflineFirstTopicsRepository", "Topic"],
  ["TopicDao", "TopicEntity"], ["TopicEntity", "Topic"], ["NiaDatabase", "TopicDao"], ["NiaDatabase", "TopicEntity"], ["NiaNetworkApi", "NetworkTopic"],
  ["DataModule", "NiaDatabase"], ["DataModule", "TopicDao"], ["DataModule", "NiaNetworkApi"],
  ["RepositoryModule", "OfflineFirstTopicsRepository"], ["RepositoryModule", "TopicsRepository"],
  ["BootReceiver", "SyncService"], ["SyncWorker", "OfflineFirstTopicsRepository"],
  ["SettingsFragment", "SettingsViewModel"], ["SettingsFragment", "SettingsAdapter"], ["SettingsViewModel", "NiaDatabase"],
  // Planted.
  ["OfflineFirstTopicsRepository", "MainActivity"],
  ["TopicDraft", "ForYouViewModel"],
]

describe("Android", () => {
  const profile = profileById(ANDROID.id)
  const lanes = lanesOf(profile, android, androidEdges)

  it("is detected whichever of its two languages has the plurality", () => {
    expect(detected(android, "kotlin").id).toBe(ANDROID.id)
    expect(detected(android, "java").id).toBe(ANDROID.id)
  })

  it("sorts Kotlin and Java units alike", () => {
    expect(lanes).toEqual({
      NiaApplication: "di", DataModule: "di", RepositoryModule: "di",
      MainActivity: "screens", ForYouScreen: "screens", SettingsFragment: "screens",
      TopicRow: "ui", TopicRowPreview: "ui", SettingsAdapter: "ui",
      ForYouViewModel: "viewmodels", SettingsViewModel: "viewmodels",
      TopicsRepository: "data", OfflineFirstTopicsRepository: "data", TopicDao: "data", NiaDatabase: "data", NiaNetworkApi: "data",
      SyncService: "background", SyncWorker: "background", BootReceiver: "background",
      // Room's entity, a serializable network shape, and plain data classes.
      TopicEntity: "models", NetworkTopic: "models", Topic: "models", ForYouUiState: "models",
      TopicDraft: UNCLASSIFIED,
    })
  })

  it("reads the normal edges as down and the planted ones as back up", () => {
    expect(layersOf(profile)).toEqual(["screens", "viewmodels", "data", "models"])
    const read = readEdges(profile, lanes, androidEdges)
    expect(read["ForYouScreen -> ForYouViewModel"]).toBe("down")
    expect(read["SettingsFragment -> SettingsViewModel"]).toBe("down")
    expect(read["ForYouViewModel -> TopicsRepository"]).toBe("down")
    expect(read["TopicDao -> TopicEntity"]).toBe("down")
    expect(read["ForYouViewModel -> ForYouUiState"]).toBe("skip")
    expect(read["MainActivity -> ForYouScreen"]).toBe("beside")
    expect(read["DataModule -> NiaDatabase"]).toBe("beside")
    expect(read["OfflineFirstTopicsRepository -> MainActivity"]).toBe("back")
    expect(readEdges(profile, { ...lanes, TopicDraft: "models" }, [["TopicDraft", "ForYouViewModel"]])["TopicDraft -> ForYouViewModel"]).toBe("back")
  })

  it("keeps a Room entity and a JPA entity in the same lane, and a Koin module with the DI", () => {
    expect(classify(profile, factsOf("Order", { file: "a.kt", annotations: ["Entity", "data"], imports: ["jakarta.persistence.Entity"] }))).toBe("models")
    expect(classify(profile, factsOf("appModule", { file: "di/AppModule.kt", imports: ["org.koin.dsl.module"], uses: ["org.koin.dsl.module"] }))).toBe("di")
  })
})
