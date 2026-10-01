// Templates for mobile apps: Android, iOS, Flutter, React Native and Kotlin
// Multiplatform. They read what analysis revision 7 records -- the apps the
// scan found and their stack, the classes and functions of Swift,
// Objective-C, Dart and Kotlin with their markers, the manifests' declarations
// -- and leave out, and name, what an older snapshot cannot fill.

import { prodFile, type SnapshotFacts } from "./readings"
import { hotspots, lit, needs, SQL, structure, type ReportTemplate, type Writer } from "./templateKit"
import { t } from "~/shared/i18n"


const inList = (xs: string[]) => xs.map(lit).join(", ")
const likeAny = (col: string, patterns: string[]) => "(" + patterns.map(p => `${col} LIKE ${lit(p)}`).join(" OR ") + ")"
const markedWith = (source: string, keys: string[]) => `(SELECT unit FROM unit_markers WHERE source = ${lit(source)} AND key IN (${inList(keys)}))`

// What a library is for, from its name: enough to read a stack at a glance.
const STACK_ROLES: Array<[string, string[]]> = [
    ["Testing", ["%junit%", "%mockk%", "%mockito%", "%espresso%", "%robolectric%", "%xctest%", "%snapshot%", "%jest%", "%test%", "%turbine%", "%mocktail%"]],
    [t("reports.mobileTemplates.uiToolkit"), ["%compose%", "%material%", "%appcompat%", "androidx.activity:%", "androidx.fragment:%", "%constraintlayout%", "%recyclerview%", "%swiftui%", "%snapkit%", "%flutter_svg%", "%flutter_animate%", "%react-native-reanimated%", "%react-native-gesture-handler%", "%react-native-screens%", "%react-native-svg%"]],
    [t("reports.mobileTemplates.dependencyInjection"), ["%hilt%", "%dagger%", "%koin%", "%kodein%", "%swift-dependencies%", "%swinject%", "%resolver%", "%factory%", "get_it", "injectable", "%inversify%"]],
    [t("reports.mobileTemplates.stateManagement"), ["%bloc%", "%riverpod%", "provider", "%redux%", "%zustand%", "%mobx%", "%jotai%", "%composable-architecture%", "%lifecycle-viewmodel%", "get", "%molecule%", "%orbit%", "%mvikotlin%"]],
    ["Networking", ["%retrofit%", "%okhttp%", "%ktor%", "%alamofire%", "%moya%", "%apollo%", "dio", "http", "%axios%", "%graphql%", "%grpc%", "%atproto%"]],
    ["Persistence", ["%room%", "%sqldelight%", "%realm%", "%grdb%", "%drift%", "%sqflite%", "%isar%", "%hive%", "%datastore%", "%firestore%", "%mmkv%", "%shared_preferences%", "%async-storage%", "%keychain%", "%sqlite%"]],
    ["Concurrency", ["%coroutines%", "%rxjava%", "%rxkotlin%", "%rxswift%", "%reactiveswift%", "%reactiveextensions%"]],
    [t("reports.mobileTemplates.imagesMedia"), ["%coil%", "%glide%", "%picasso%", "%kingfisher%", "%sdwebimage%", "%nuke%", "%cached_network_image%", "%fast-image%", "expo-image", "%exoplayer%", "%media3%", "%lottie%"]],
    ["Navigation", ["%navigation%", "%auto_route%", "%go_router%", "%voyager%", "%decompose%", "%react-navigation%", "expo-router"]],
    [t("reports.mobileTemplates.analyticsCrashes"), ["%firebase%", "%crashlytics%", "%sentry%", "%analytics%", "%bugsnag%", "%datadog%", "%segment%", "%amplitude%"]],
    [t("reports.mobileTemplates.jetpackOther"), ["androidx.%"]],
]
const stackRole = (col: string) => `CASE WHEN dd.role = 'framework' THEN 'UI framework' ${STACK_ROLES.map(([label, ps]) => `WHEN ${likeAny(`lower(${col})`, ps)} THEN ${lit(label)}`).join(" ")} ELSE 'Other' END`
const MOBILE_SQL = {
    stackSummary: `SELECT d.name AS app, ${stackRole("dd.name")} AS "used for", count(*) AS libraries, group_concat(dd.name, ', ') AS names FROM deployable_dependencies dd JOIN deployables d ON d.id = dd.deployable WHERE d.kind = 'mobile_app' AND dd.role IN ('framework', 'library') GROUP BY 1, 2 ORDER BY 1, CASE "used for" WHEN 'UI framework' THEN 0 WHEN 'Other' THEN 2 ELSE 1 END, 3 DESC`,
    stack: `SELECT d.name AS app, ${stackRole("dd.name")} AS "used for", dd.name AS library, dd.version, dd.source FROM deployable_dependencies dd JOIN deployables d ON d.id = dd.deployable WHERE d.kind = 'mobile_app' AND dd.role IN ('framework', 'library') ORDER BY 1, 2, 3`,
    runtime: `SELECT d.name AS app, d.platform, dd.name AS setting, dd.version AS value, dd.file FROM deployable_dependencies dd JOIN deployables d ON d.id = dd.deployable WHERE d.kind = 'mobile_app' AND dd.role = 'runtime' ORDER BY 1, 3`,
    // Android
    gradleModules: `SELECT name AS module, type, files, internal_dependencies AS "depends on (internal)", depends_on AS "internal dependencies" FROM modules WHERE kind = 'gradle' AND coalesce(type, '') <> 'build-logic' ORDER BY CASE type WHEN 'android-application' THEN 0 WHEN 'kotlin-multiplatform' THEN 1 ELSE 2 END, files DESC`,
    // A feature depending on another feature, its api/impl halves counted as one feature.
    crossFeature: `WITH RECURSIVE split(m, dep, rest) AS (SELECT name, '', replace(coalesce(depends_on, ''), ', ', ',') || ',' FROM modules WHERE kind = 'gradle' UNION ALL SELECT m, substr(rest, 1, instr(rest, ',') - 1), substr(rest, instr(rest, ',') + 1) FROM split WHERE rest <> ''), feat(x, key) AS (SELECT DISTINCT m, replace(replace(replace(m, ':impl', ''), ':api', ''), ':ui', '') FROM split) SELECT s.m AS "feature module", s.dep AS "depends on feature module", CASE WHEN s.dep LIKE '%:api' THEN 'its API' ELSE 'its implementation' END AS "on" FROM split s JOIN feat a ON a.x = s.m JOIN feat b ON b.x = s.dep WHERE s.dep <> '' AND s.m LIKE '%feature%' AND s.dep LIKE '%feature%' AND a.key <> b.key ORDER BY 3 DESC, 1, 2`,
    androidScreens: (f: SnapshotFacts) => `SELECT coalesce(nullif(fi.module, ''), u.component) AS module, count(DISTINCT CASE WHEN m.source = 'manifest' AND m.key = 'activity' THEN u.id END) AS activities, count(DISTINCT CASE WHEN m.source = 'supertype' AND m.key IN ('Fragment', 'DialogFragment', 'BottomSheetDialogFragment', 'PreferenceFragmentCompat') THEN u.id END) AS fragments, count(DISTINCT CASE WHEN m.key = 'Composable' AND ${likeAny("u.name", ["%Screen", "%Route", "%Page"])} THEN u.id END) AS "composable screens", count(DISTINCT CASE WHEN m.key = 'Composable' THEN u.id END) AS composables FROM units u JOIN unit_markers m ON m.unit = u.id JOIN files fi ON fi.name = u.file WHERE ${prodFile(f, "fi")} GROUP BY 1 HAVING activities + fragments + composables > 0 ORDER BY composables DESC, activities DESC`,
    layouts: `SELECT coalesce(nullif(module, ''), directory) AS module, count(*) AS "XML layouts" FROM files WHERE name LIKE '%/res/layout%/%.xml' GROUP BY 1 ORDER BY 2 DESC`,
    // A ViewModel, or one of its members, using a DAO, a database or a network API itself.
    vmShortcuts: `WITH vm AS ${markedWith("supertype", ["ViewModel", "AndroidViewModel"])}, data AS (SELECT id FROM units WHERE kind = 'type' AND ${likeAny("name", ["%Dao", "%Api", "%ApiService", "%NetworkDataSource", "%Database", "%RetrofitNetwork"])} UNION SELECT unit FROM unit_markers WHERE key IN ('Dao', 'Database')) SELECT v.name AS "view model", v.component AS package, group_concat(DISTINCT t.name) AS "data access it uses directly" FROM unit_connections uc JOIN units src ON src.id = uc."from" JOIN units v ON v.id = coalesce(nullif(src.owner, ''), src.id) JOIN units t ON t.id = uc."to" WHERE v.id IN vm AND t.id IN data GROUP BY v.id ORDER BY count(DISTINCT t.id) DESC, 1`,
    androidSurface: `SELECT module, kind, name, CASE exported WHEN 'implied' THEN 'yes (by its intent filter)' WHEN 'true' THEN 'yes' WHEN 'false' THEN 'no' ELSE '' END AS exported, CASE WHEN launcher = 1 THEN 'launcher' ELSE '' END AS "", file, line FROM app_declarations WHERE platform = 'android' AND kind IN ('activity', 'service', 'receiver', 'provider') ORDER BY exported = 'true' OR exported = 'implied' DESC, kind, name`,
    permissions: (platform: string) => platform === "android"
        ? `SELECT name AS permission, count(DISTINCT module) AS modules, group_concat(DISTINCT module) AS "declared in" FROM app_declarations WHERE platform = 'android' AND kind = 'permission' GROUP BY 1 ORDER BY 1`
        : `SELECT kind, name, value, file FROM app_declarations WHERE platform = 'ios' AND kind IN ('usage_description', 'background_mode', 'url_scheme', 'ats_exception', 'entitlement') ORDER BY CASE kind WHEN 'ats_exception' THEN 0 WHEN 'usage_description' THEN 1 ELSE 2 END, kind, name`,
    deepLinks: `SELECT platform, name AS "answered by", value AS link, file FROM app_declarations WHERE kind IN ('deep_link', 'url_scheme') ORDER BY 1, 3`,
    // iOS
    appleTargets: `SELECT name AS target, kind, type, files, internal_dependencies AS "depends on (internal)", depends_on AS "internal dependencies" FROM modules WHERE kind IN ('xcode', 'swiftpm') AND coalesce(type, '') NOT IN ('test') ORDER BY CASE type WHEN 'ios-application' THEN 0 WHEN 'app-extension' THEN 1 ELSE 2 END, files DESC`,
    uiKinds: `SELECT coalesce(nullif(u.module, ''), u.component) AS target, count(DISTINCT CASE WHEN m.key = 'View' THEN u.id END) AS "SwiftUI views", count(DISTINCT CASE WHEN m.key IN ('UIViewController', 'UITableViewController', 'UICollectionViewController', 'UIPageViewController') THEN u.id END) AS "view controllers", count(DISTINCT CASE WHEN m.key IN ('UIView', 'UITableViewCell', 'UICollectionViewCell', 'UICollectionReusableView') THEN u.id END) AS "UIKit views" FROM units u JOIN unit_markers m ON m.unit = u.id AND m.source = 'supertype' GROUP BY 1 HAVING "SwiftUI views" + "view controllers" + "UIKit views" > 0 ORDER BY 2 + 3 + 4 DESC`,
    bigControllers: (f: SnapshotFacts) => `SELECT u.name AS "view controller", coalesce(nullif(u.module, ''), u.component) AS target, fi.complexity__lines AS "lines in its file", (SELECT count(*) FROM units o WHERE o.owner = u.id) AS methods${f.fileColumns.has("git__commits__last_180_days") ? `, fi.git__commits__last_180_days AS "commits, 180 days"` : ""} FROM units u JOIN files fi ON fi.name = u.file WHERE u.id IN ${markedWith("supertype", ["UIViewController", "UITableViewController", "UICollectionViewController"])} AND ${prodFile(f, "fi")} ORDER BY 3 DESC`,
    // The types the most folders reach: shared singletons, managers and god objects show here first.
    fanIn: `SELECT t.name AS type, coalesce(nullif(t.module, ''), t.component) AS "declared in", count(DISTINCT uc.from_component) AS "folders using it", count(DISTINCT uc."from") AS "units using it" FROM unit_connections uc JOIN units t ON t.id = uc."to" WHERE t.kind = 'type' AND uc.from_component <> uc.to_component GROUP BY t.id ORDER BY 3 DESC, 4 DESC`,
    // Views reaching a network client or service themselves.
    viewsToNetwork: (views: string[]) => `WITH v AS ${markedWith("supertype", views)}, net AS (SELECT id FROM units WHERE kind = 'type' AND ${likeAny("name", ["%Client", "%API", "%Api", "%Service", "%Endpoint", "%Request", "%Repository"])}) SELECT w.name AS view, coalesce(nullif(w.module, ''), w.component) AS "in", group_concat(DISTINCT t.name) AS "calls directly" FROM unit_connections uc JOIN units src ON src.id = uc."from" JOIN units w ON w.id = coalesce(nullif(src.owner, ''), src.id) JOIN units t ON t.id = uc."to" WHERE w.id IN v AND t.id IN net GROUP BY w.id ORDER BY count(DISTINCT t.id) DESC, 1`,
    objc: `SELECT coalesce(nullif(module, ''), directory) AS target, count(*) AS files, sum(complexity__lines) AS lines FROM files WHERE name LIKE '%.m' OR name LIKE '%.mm' OR (name LIKE '%.h' AND name NOT LIKE '%/Pods/%') GROUP BY 1 ORDER BY 3 DESC`,
    // Flutter
    pubPackages: `SELECT name AS package, type, directory, files, depends_on AS "internal dependencies" FROM modules WHERE kind = 'pub' ORDER BY files DESC`,
    flutterFolders: `SELECT u.component AS folder, count(DISTINCT CASE WHEN m.source = 'supertype' AND m.key IN ('StatelessWidget', 'StatefulWidget', 'ConsumerWidget', 'ConsumerStatefulWidget', 'HookWidget', 'HookConsumerWidget') AND ${likeAny("u.name", ["%Screen", "%Page", "%View", "%Route"])} THEN u.id END) AS screens, count(DISTINCT CASE WHEN m.source = 'supertype' AND m.key IN ('StatelessWidget', 'StatefulWidget', 'ConsumerWidget', 'ConsumerStatefulWidget', 'HookWidget', 'HookConsumerWidget') THEN u.id END) AS widgets, group_concat(DISTINCT CASE WHEN m.key IN ('Bloc', 'Cubit') THEN 'Bloc' WHEN m.key IN ('ConsumerWidget', 'ConsumerStatefulWidget', 'HookConsumerWidget', 'StateNotifier', 'Notifier', 'AsyncNotifier', 'riverpod', 'Riverpod') THEN 'Riverpod' WHEN m.key = 'ChangeNotifier' THEN 'Provider' WHEN m.key = 'GetxController' THEN 'GetX' END) AS "state management" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE u.file LIKE '%.dart' GROUP BY 1 HAVING widgets > 0 OR "state management" IS NOT NULL ORDER BY widgets DESC`,
    generated: `SELECT CASE WHEN name LIKE '%.g.dart' THEN 'json_serializable / riverpod (.g.dart)' WHEN name LIKE '%.freezed.dart' THEN 'freezed' WHEN name LIKE '%.gr.dart' THEN 'auto_route' WHEN name LIKE '%.config.dart' THEN 'injectable' WHEN name LIKE '%.drift.dart' THEN 'drift' ELSE 'written by hand' END AS source, count(*) AS files, sum(complexity__lines) AS lines FROM files WHERE name LIKE '%.dart' GROUP BY 1 ORDER BY 3 DESC`,
    // React Native
    rnScreens: `SELECT component AS folder, count(*) AS screens, group_concat(name, ', ') AS names FROM units WHERE kind <> 'module' AND coalesce(owner, '') = '' AND (file LIKE '%.tsx' OR file LIKE '%.jsx') AND ${likeAny("name", ["%Screen", "%Page", "%Modal"])} GROUP BY 1 ORDER BY 2 DESC`,
    nativeModules: `SELECT u.name AS "native module", u.file, group_concat(DISTINCT m.key) AS "bridged as" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.key IN ('ReactContextBaseJavaModule', 'ReactPackage', 'RCTBridgeModule', 'RCT_EXPORT_MODULE', 'RCT_EXTERN_MODULE', 'RCTEventEmitter', 'Module', 'SimpleViewManager', 'ViewGroupManager') GROUP BY u.id ORDER BY 2`,
    nativeLines: `SELECT CASE WHEN name LIKE '%.kt' OR name LIKE '%.java' THEN 'Android (Kotlin, Java)' WHEN name LIKE '%.swift' OR name LIKE '%.m' OR name LIKE '%.mm' THEN 'iOS (Swift, Objective-C)' ELSE 'JavaScript and TypeScript' END AS side, count(*) AS files, sum(complexity__lines) AS lines FROM files WHERE ${likeAny("name", ["%.kt", "%.java", "%.swift", "%.m", "%.mm", "%.ts", "%.tsx", "%.js", "%.jsx"])} GROUP BY 1 ORDER BY 3 DESC`,
    // Kotlin Multiplatform
    sourceSets: `SELECT coalesce(nullif(module, ''), directory) AS module, substr(name, instr(name, '/src/') + 5, instr(substr(name, instr(name, '/src/') + 5), '/') - 1) AS "source set", count(*) AS files, sum(coalesce(complexity__lines, 0)) AS lines FROM files WHERE name LIKE '%/src/%/%.kt' GROUP BY 1, 2 ORDER BY 1, 4 DESC`,
    expects: `SELECT u.name AS declaration, u.kind, coalesce(nullif(u.module, ''), u.component) AS module, u.files AS "files declaring or implementing it", CASE WHEN u.id IN (SELECT unit FROM unit_markers WHERE source = 'keyword' AND key = 'actual') THEN 'yes' ELSE 'none found' END AS "actual" FROM units u WHERE u.id IN (SELECT unit FROM unit_markers WHERE source = 'keyword' AND key = 'expect') ORDER BY 5 DESC, 3, 1`,
}

const hasTable = (f: SnapshotFacts, t: string, why: string): true | string => (f.tables.has(t) ? true : why)
const mobileNeeds = {
    apps: (f: SnapshotFacts): true | string => (f.mobileApps.length ? true : t("reports.mobileTemplates.scanFoundNoMobile")),
    units: (f: SnapshotFacts): true | string => (f.tables.has("units") && f.tables.has("unit_markers") ? true : t("reports.mobileTemplates.scanDidNotRecord")),
    links: (f: SnapshotFacts): true | string => (f.tables.has("unit_connections") ? true : t("reports.mobileTemplates.scanDidNotRecord2")),
    declarations: (f: SnapshotFacts) => hasTable(f, "app_declarations", t("reports.mobileTemplates.scanOlderThanApp")),
}
function stack(w: Writer) {
    w.sql(t("reports.mobileTemplates.stackWhatEachLibrary"), MOBILE_SQL.stackSummary, 40)
    w.sql(t("reports.mobileTemplates.sdkLevelsToolchain"), MOBILE_SQL.runtime, 20)
    w.prompt(t("reports.mobileTemplates.whichTheseChoicesYou"))
}

export const MOBILE: ReportTemplate[] = [
    {
        id: "android-review",
        name: t("reports.mobileTemplates.androidAppReview"),
        audience: t("reports.mobileTemplates.androidTeamArchitects"),
        summary: t("reports.mobileTemplates.modulesHowFeaturesDepend"),
        when: t("reports.mobileTemplates.useBeforeModularisationPush"),
        ecosystem: "android",
        title: ws => t("reports.mobileTemplates.androidReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.mobileTemplates.whatAppDoesWho"))
            w.section(t("reports.mobileTemplates.app"), true, () => { w.reading("mobile-apps"); w.reading("android"); w.reading("size") })
            w.section("Stack", mobileNeeds.apps(f), () => stack(w))
            w.section("Modules", needs.modules(f), () => {
                w.sql(t("reports.mobileTemplates.gradleModulesAppsFirst"), MOBILE_SQL.gradleModules, 60)
                w.sql(t("reports.mobileTemplates.featuresDependingOtherFeatures"), MOBILE_SQL.crossFeature, 30)
                w.prompt(t("reports.mobileTemplates.whetherFeaturesStayIndependent"))
            })
            w.section(t("reports.mobileTemplates.screensUi"), mobileNeeds.units(f), () => {
                w.sql(t("reports.mobileTemplates.screensUiModule"), MOBILE_SQL.androidScreens(f), 40)
                w.sql(t("reports.mobileTemplates.xmlLayoutsLeft"), MOBILE_SQL.layouts, 20)
                w.prompt(t("reports.mobileTemplates.howFarMoveViews"))
            })
            w.section(t("reports.mobileTemplates.viewmodelsDataLayer"), mobileNeeds.links(f), () => {
                w.sql(t("reports.mobileTemplates.viewmodelsUsingDataAccess"), MOBILE_SQL.vmShortcuts, 30)
                w.prompt(t("reports.mobileTemplates.whetherTheseShortcutsPast"))
            })
            w.section(t("reports.mobileTemplates.whatManifestExposes"), mobileNeeds.declarations(f), () => {
                w.sql(t("reports.mobileTemplates.activitiesServicesReceiversProviders"), MOBILE_SQL.androidSurface, 40)
                w.sql("Permissions", MOBILE_SQL.permissions("android"), 40)
                w.sql(t("reports.mobileTemplates.linksAppAnswers"), MOBILE_SQL.deepLinks, 20)
                w.prompt(t("reports.mobileTemplates.whichExportedComponentsOther"))
            })
            w.section(t("reports.mobileTemplates.howCodeConnects"), true, () => { structure(w); w.reading("coupling") })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt(t("reports.mobileTemplates.whatYouFoundEach")))
        },
    },
    {
        id: "ios-review",
        name: t("reports.mobileTemplates.iosAppReview"),
        audience: t("reports.mobileTemplates.iosTeamArchitects"),
        summary: t("reports.mobileTemplates.targetsPackagesSwiftuiAgainst"),
        when: t("reports.mobileTemplates.useWhenPlanningMove"),
        ecosystem: "ios",
        title: ws => `iOS review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt(t("reports.mobileTemplates.whatAppDoesWho"))
            w.section(t("reports.mobileTemplates.app"), true, () => { w.reading("mobile-apps"); w.reading("ios"); w.reading("size") })
            w.section("Stack", mobileNeeds.apps(f), () => stack(w))
            w.section(t("reports.mobileTemplates.targetsPackages"), needs.modules(f), () => {
                w.sql(t("reports.mobileTemplates.appTargetsSwiftPackages"), MOBILE_SQL.appleTargets, 60)
                w.prompt(t("reports.mobileTemplates.whetherPackagesSplitApp"))
            })
            w.section(t("reports.mobileTemplates.swiftuiUikit"), mobileNeeds.units(f), () => {
                w.sql(t("reports.mobileTemplates.viewsViewControllersTarget"), MOBILE_SQL.uiKinds, 30)
                w.sql(t("reports.mobileTemplates.largestViewControllers"), MOBILE_SQL.bigControllers(f), 15)
                w.prompt(t("reports.mobileTemplates.howFarMoveSwiftui"))
            })
            w.section(t("reports.mobileTemplates.whatEverythingReaches"), mobileNeeds.links(f), () => {
                w.sql(t("reports.mobileTemplates.typesUsedMostFolders"), MOBILE_SQL.fanIn, 15)
                w.sql(t("reports.mobileTemplates.viewsCallingClientService"), MOBILE_SQL.viewsToNetwork(["View", "UIViewController", "UITableViewController", "UICollectionViewController"]), 30)
                w.prompt(t("reports.mobileTemplates.whichTheseTypesSingletons"))
            })
            if (f.languages.some(l => l.language === "Objective-C" && l.lines > 0)) {
                w.section("Objective-C", true, () => { w.sql(t("reports.mobileTemplates.objectiveCTarget"), MOBILE_SQL.objc, 20); w.prompt(t("reports.mobileTemplates.whatLeftMoveSwift")) })
            }
            w.section(t("reports.mobileTemplates.whatAppDeclares"), mobileNeeds.declarations(f), () => {
                w.sql(t("reports.mobileTemplates.permissionsBackgroundModesUrl"), MOBILE_SQL.permissions("ios"), 50)
                w.prompt(t("reports.mobileTemplates.whetherEveryPermissionPrompt"))
            })
            w.section(t("reports.mobileTemplates.howCodeConnects"), true, () => { structure(w); w.reading("coupling") })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt(t("reports.mobileTemplates.whatYouFoundEach")))
        },
    },
    {
        id: "flutter-review",
        name: t("reports.mobileTemplates.flutterAppReview"),
        audience: t("reports.mobileTemplates.flutterTeam"),
        summary: t("reports.mobileTemplates.packagesScreensWidgetsFolder"),
        when: t("reports.mobileTemplates.useWhenMoreThan"),
        ecosystem: "flutter",
        title: ws => t("reports.mobileTemplates.flutterReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.mobileTemplates.whatAppDoesWho"))
            w.section(t("reports.mobileTemplates.app"), true, () => { w.reading("mobile-apps"); w.reading("flutter"); w.reading("size") })
            w.section("Stack", mobileNeeds.apps(f), () => stack(w))
            w.section("Packages", needs.modules(f), () => w.sql(t("reports.mobileTemplates.dartPackages"), MOBILE_SQL.pubPackages, 30))
            w.section(t("reports.mobileTemplates.screensWidgetsState"), mobileNeeds.units(f), () => {
                w.sql(t("reports.mobileTemplates.folder"), MOBILE_SQL.flutterFolders, 40)
                w.prompt(t("reports.mobileTemplates.whetherOneApproachState"))
            })
            w.section(t("reports.mobileTemplates.widgetsData"), mobileNeeds.links(f), () => {
                w.sql(t("reports.mobileTemplates.widgetsCallingRepositoryClient"), MOBILE_SQL.viewsToNetwork(["StatelessWidget", "StatefulWidget", "State", "ConsumerWidget", "ConsumerStatefulWidget", "ConsumerState", "HookWidget", "HookConsumerWidget"]), 30)
                w.sql(t("reports.mobileTemplates.typesUsedMostFolders"), MOBILE_SQL.fanIn, 15)
            })
            w.section(t("reports.mobileTemplates.generatedCode"), true, () => w.sql(t("reports.mobileTemplates.dartWhoWrote"), MOBILE_SQL.generated, 10))
            w.section(t("reports.mobileTemplates.howCodeConnects"), true, () => { structure(w); w.reading("coupling") })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt(t("reports.mobileTemplates.whatYouFoundEach")))
        },
    },
    {
        id: "react-native-review",
        name: t("reports.mobileTemplates.reactNativeAppReview"),
        audience: t("reports.mobileTemplates.reactNativeExpoTeam"),
        summary: t("reports.mobileTemplates.screensFolderNativeModules"),
        when: t("reports.mobileTemplates.useWhenDecidingWhat"),
        ecosystem: "react-native",
        title: ws => t("reports.mobileTemplates.reactNativeReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.mobileTemplates.whatAppDoesWho"))
            w.section(t("reports.mobileTemplates.app"), true, () => { w.reading("mobile-apps"); w.reading("node"); w.reading("size") })
            w.section("Stack", mobileNeeds.apps(f), () => stack(w))
            w.section("Screens", mobileNeeds.units(f), () => w.sql(t("reports.mobileTemplates.screensFolder"), MOBILE_SQL.rnScreens, 30))
            w.section(t("reports.mobileTemplates.nativeCode"), mobileNeeds.units(f), () => {
                w.sql(t("reports.mobileTemplates.javascriptNativeSide"), MOBILE_SQL.nativeLines, 5)
                w.sql(t("reports.mobileTemplates.nativeModules"), MOBILE_SQL.nativeModules, 30)
                w.prompt(t("reports.mobileTemplates.whichNativeModulesApp"))
            })
            w.section(t("reports.mobileTemplates.howCodeConnects"), true, () => { structure(w); if (f.tangles) w.sql("Tangles", SQL.tangles, 10) })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt(t("reports.mobileTemplates.whatYouFoundEach")))
        },
    },
    {
        id: "kmp-review",
        name: t("reports.mobileTemplates.kotlinMultiplatformReview"),
        audience: t("reports.mobileTemplates.teamSharingKotlinAcross"),
        summary: t("reports.mobileTemplates.howMuchCodeShared"),
        when: t("reports.mobileTemplates.useSeeHowMuch"),
        ecosystem: "kmp",
        title: ws => t("reports.mobileTemplates.multiplatformReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.mobileTemplates.whichPlatformsCodeTargets"))
            w.section(t("reports.mobileTemplates.sharedPlatformCode"), true, () => { w.reading("kmp"); w.sql(t("reports.mobileTemplates.linesModuleSourceSet"), MOBILE_SQL.sourceSets, 60) })
            w.section(t("reports.mobileTemplates.expectActual"), mobileNeeds.units(f), () => {
                w.sql(t("reports.mobileTemplates.expectDeclarations"), MOBILE_SQL.expects, 40)
                w.prompt(t("reports.mobileTemplates.whichPlatformDifferencesBelong"))
            })
            w.section("Modules", needs.modules(f), () => w.sql(t("reports.mobileTemplates.gradleModules"), MOBILE_SQL.gradleModules, 60))
            w.section("Stack", mobileNeeds.apps(f), () => stack(w))
            w.section("Findings", true, () => w.prompt(t("reports.mobileTemplates.whatYouFoundEach")))
        },
    },
]
