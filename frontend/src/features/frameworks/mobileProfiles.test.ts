import { describe, expect, it } from "vitest"
import { ANDROID, EMPTY_FACTS, FLUTTER, IOS, REACT_NATIVE, TCA, classify, detectFramework, languageOf, profileById, profilesFor, type ClassFacts } from "./frameworkProfiles"

const facts = (name: string, o: Partial<{ annotations: string[]; supertypes: string[]; imports: string[]; file: string }> = {}): ClassFacts => ({
  ...EMPTY_FACTS, name, file: o.file,
  annotations: new Set(o.annotations ?? []), supertypes: new Set(o.supertypes ?? []), imports: new Set(o.imports ?? []),
})
const many = (n: number, o: Parameters<typeof facts>[1]) => Array.from({ length: n }, (_, i) => facts("C" + i, o))
const lane = (profileId: string, f: ClassFacts) => classify(profileById(profileId), f)

describe("mobile languages", () => {
  it("reads Swift, Objective-C and Dart files", () => {
    expect(languageOf(["a.swift", "b.swift", "c.m"])).toBe("swift")
    expect(languageOf(["a.m", "b.mm", "c.swift"])).toBe("objc")
    expect(languageOf(["lib/main.dart"])).toBe("dart")
  })
  it("offers Android to Kotlin and Java, and iOS to Swift and Objective-C", () => {
    expect(profilesFor("kotlin").map(p => p.id)).toContain(ANDROID.id)
    expect(profilesFor("java").map(p => p.id)).toContain(ANDROID.id)
    expect(profilesFor("objc").map(p => p.id)).toContain(IOS.id)
    expect(profilesFor("swift").map(p => p.id)).toEqual(expect.arrayContaining([IOS.id, TCA.id]))
    expect(profilesFor("dart").map(p => p.id)).toContain(FLUTTER.id)
  })
})

describe("mobile detection", () => {
  it("reads a Kotlin Android app as Android, which it never used to be offered", () => {
    const r = detectFramework([...many(40, { imports: ["androidx.compose.runtime.Composable"] }), ...many(40, {})], "kotlin")
    expect(r.id).toBe("android")
    expect(r.confident).toBe(true)
  })
  it("prefers TCA over the SwiftUI it is written in", () => {
    const r = detectFramework([...many(30, { imports: ["SwiftUI", "ComposableArchitecture"] }), ...many(40, { imports: ["SwiftUI"] }), ...many(10, {})], "swift")
    expect(r.id).toBe("tca")
    expect(r.confident).toBe(true)
  })
  it("prefers React Native over React", () => {
    const r = detectFramework([...many(30, { imports: ["react", "react-native"] }), ...many(30, { imports: ["react"] })], "typescript")
    expect(r.id).toBe(REACT_NATIVE.id)
  })
  it("reads Flutter from its imports", () => {
    expect(detectFramework([...many(20, { imports: ["flutter/material.dart"] }), ...many(10, {})], "dart").id).toBe("flutter")
  })
})

describe("mobile lanes", () => {
  it("puts composables named for a screen in Screens and the rest in UI", () => {
    expect(lane("android", facts("ForYouScreen", { annotations: ["Composable"] }))).toBe("screens")
    expect(lane("android", facts("NiaButton", { annotations: ["Composable"] }))).toBe("ui")
    expect(lane("android", facts("MainActivity", { annotations: ["activity", "launcher", "AndroidEntryPoint"], supertypes: ["ComponentActivity"] }))).toBe("screens")
    expect(lane("android", facts("ForYouViewModel", { annotations: ["HiltViewModel"], supertypes: ["ViewModel"] }))).toBe("viewmodels")
    expect(lane("android", facts("SyncWorker", { supertypes: ["CoroutineWorker"] }))).toBe("background")
    expect(lane("android", facts("DataModule", { annotations: ["Module", "InstallIn"] }))).toBe("di")
    expect(lane("android", facts("TopicDao", { annotations: ["Dao"] }))).toBe("data")
  })
  it("sorts SwiftUI and UIKit types", () => {
    expect(lane("ios", facts("IceCubesApp", { annotations: ["main"], supertypes: ["App"] }))).toBe("app")
    expect(lane("ios", facts("TimelineScreen", { supertypes: ["View"] }))).toBe("screens")
    expect(lane("ios", facts("SettingsViewController", { supertypes: ["UIViewController"] }))).toBe("screens")
    expect(lane("ios", facts("StatusRowView", { supertypes: ["View"] }))).toBe("views")
    expect(lane("ios", facts("TimelineViewModel", { annotations: ["Observable", "MainActor"] }))).toBe("state")
    expect(lane("ios", facts("MastodonClient", {}))).toBe("data")
    expect(lane("ios", facts("Status", { annotations: ["struct"], supertypes: ["Codable", "Identifiable"] }))).toBe("models")
  })
  it("sorts Flutter widgets and state", () => {
    expect(lane("flutter", facts("HomeScreen", { supertypes: ["StatefulWidget"] }))).toBe("screens")
    expect(lane("flutter", facts("WonderCard", { supertypes: ["StatelessWidget"] }))).toBe("widgets")
    expect(lane("flutter", facts("DocumentBloc", { supertypes: ["Bloc"] }))).toBe("state")
    expect(lane("flutter", facts("counter", { annotations: ["riverpod"] }))).toBe("state")
    expect(lane("flutter", facts("AssetRepository", {}))).toBe("data")
    expect(lane("flutter", facts("Asset", { annotations: ["freezed"] }))).toBe("models")
  })
  it("sorts TCA features", () => {
    expect(lane("tca", facts("Game", { annotations: ["Reducer"] }))).toBe("features")
    expect(lane("tca", facts("ApiClient", { annotations: ["DependencyClient"] }))).toBe("clients")
    expect(lane("tca", facts("GameView", { supertypes: ["View"] }))).toBe("views")
  })
  it("sorts React Native screens", () => {
    expect(lane("react-native", facts("ProfileScreen", { file: "src/screens/Profile.tsx" }))).toBe("screens")
    expect(lane("react-native", facts("Avatar", { file: "src/view/Avatar.tsx" }))).toBe("components")
    expect(lane("react-native", facts("useSession", { file: "src/state/session.ts" }))).toBe("hooks")
  })
})
