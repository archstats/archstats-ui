<template>
  <ViewWorkspaceLayout
    :title="t('pages.units.units')"
    v-model:search-query="searchQuery"
    :search-placeholder="t('pages.units.searchModules')"
    :show-config="true"
  >
    <template #stats>
      <span>{{ t('pages.units.modules') }} <span class="text-neutral-800">{{ graph.modules.length.toLocaleString(intlLocale) }}</span></span>
      <span class="text-neutral-400">·</span>
      <span>{{ t('pages.units.imports') }} <span class="text-neutral-800">{{ graph.edges.length.toLocaleString(intlLocale) }}</span></span>
      <template v-if="frameworkName">
        <span class="text-neutral-400">·</span>
        <span>{{ frameworkName }}</span>
      </template>
    </template>

    <template #actions>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="model.lanes.value.length === 0"
              :title="t('pages.units.saveEveryLaneGroup')"
              @click="saveLanesAsLens">
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span class="hidden min-[1440px]:inline">{{ t('pages.units.lanesLens') }}</span>
      </button>
    </template>

    <template #config-popover>
      <p class="text-sm leading-4 text-neutral-500">
<I18nT k="pages.units.lanesReadChangeBar"><template #profileLabel><span class="text-neutral-700">{{ model.profile.value.label }}</span></template><template #reason>{{ model.detection.value.reason }}</template></I18nT> </p>
      <p class="text-sm leading-4 text-neutral-500">
        {{ t('pages.units.viewReadsCodebaseModules') }}
        <template v-if="model.modulesAreMeaningful.value">
          {{ t('pages.units.theseModulesHoldDeclared', { modulesLength: graph.modules.length.toLocaleString(intlLocale), declaredLength: model.declared.value.length.toLocaleString(intlLocale) }) }}
        </template>
        <template v-else>
          {{ t('pages.units.hereEachModuleDeclares') }}
        </template>
      </p>
    </template>

    <template #visualizer>
      <div class="flex h-full w-full flex-col overflow-hidden">
        <LoadingState v-if="model.loading.value" :text="t('pages.units.readingModules')"/>

        <EmptyState v-else-if="model.error.value" icon="alert"
                    :title="t('pages.units.couldNotReadUnits')" :text="model.error.value"/>

        <EmptyState v-else-if="!model.hasUnits.value" icon="braces"
                    :title="t('pages.units.noUnitsSnapshot')"
                    :text="t('pages.units.scanRecordedNoNamed')"/>

        <template v-else>
          <DescentBar :root="rootLabel" :steps="steps"
                      :count="region ? rowCount : null" :noun="rowNoun"
                      :framework="model.frameworkOverride.value ?? AUTO"
                      :auto-label="model.detection.value.confident ? model.profile.value.label : t('pages.units.unsureUsingStructure')"
                      :profiles="model.offeredProfiles.value"
                      @up="ascendTo" @framework="setFramework"/>

          <!-- A boundary states its own claim, drawn, at the top of the
               relationship. Repeating it here in prose was the duplication
               this screen kept being called out for. -->
          <RegionClaim v-if="region?.claim && !relationship" :claim="region.claim"
                       :note="region.note ?? ''" :hint="hint"/>

          <ShapeLanding v-if="!region" class="min-h-0 flex-1"
                        :framework-name="frameworkName"
                        :module-count="graph.modules.length"
                        :unit-count="model.declared.value.length"
                        :edge-count="graph.edges.length"
                        :component-edge-count="referencesUnresolved ? componentPairs : 0"
                        :lanes="laneBands" :flows="flows" :findings="findings"
                        :framework="model.frameworkOverride.value ?? AUTO"
                        :auto-label="model.detection.value.confident ? model.profile.value.label : t('pages.units.folderStructure')"
                        :detected="model.detection.value.confident && model.profile.value.id !== 'structure'"
                        :profiles="model.offeredProfiles.value"
                        :files="landingFiles" :lines="landingLines" :paint="landingPaint" :describe="landingDescribe"
                        :highlight-for="filesLitBy" :not-layers="notLayers"
                        :map-mode="mapMode" :legend="landingLegend"
                        :links-of="landingLinks" :bad-link="landingBad"
                        @update:map-mode="setMapMode" @evidence="openMapEvidence"
                        @open="descendToFinding" @lane="descendToLane" @flow="descendToFlow"
                        @place="descendToPlace" @open-file="openModuleFile"
                        @framework="setFramework"/>

          <EmptyState v-else-if="rowCount === 0" icon="braces"
                      :title="t('pages.units.nothingHere')"
                      :text="t('pages.units.nothingRegionMatchesCurrent')"/>

          <!-- A finding about where code lives lands on the map it lives on. -->
          <EvidenceMap v-else-if="region.map" class="min-h-0"
                       :mode="region.map" :files="prodFiles" :lines="fileGraph.data.value.lines"
                       :reach="reach" :dup-names="dupNames" :dup-files="dupFiles"
                       :tray="trayPaths" :roots="String(route.query.roots ?? '')" :initial-folder="route.query.dir ? String(route.query.dir) : null" :links-of="fileLinks"
                       @toggle="toggleTray" @tray="trayPaths = $event" @open="openModuleFile" @roots="setRoots"/>

          <div v-else class="flex min-h-0 flex-1 overflow-hidden">
            <!-- A boundary region is a question about two groups, so it is
                 answered about two groups: how they relate, what is wrong at
                 the join, and which modules actually cross it. -->
            <RelationshipView v-if="relationship" class="min-w-0 flex-1"
                              :relationship="relationship" :lane-of-module="laneOfModule"
                              :head-lane="boundary!.head" :tail-lane="boundary!.tail"
                              :head-label="laneLabel(boundary!.head)" :tail-label="laneLabel(boundary!.tail)"
                              :selected-path="selectedPath" :selected-anomaly="selectedAnomaly"
                              :name-of="nameOf" :lane-color="laneColor"
                              @select="select" @inspect-pair="inspectPair"
                              @open-anomaly="openAnomaly"/>
            <!-- Anything else is a set of modules, so it is shown where those
                 modules live: the landing's map, zoomed onto them. -->
            <FocusMap v-else class="min-w-0"
                      :label="region.label" :files="moduleFiles" :lines="moduleLines"
                      :focus="visiblePaths" :selected-path="selectedPath" :pointed="pointed"
                      :paint="focusPaint" :describe="describeModule" :links-of="moduleLinks" :bad-link="laneBad"
                      :legend="laneLegend"
                      @select="onMapSelect" @open="openModuleFile" @collect="collect"/>

            <AnomalyPanel v-if="openedAnomaly" class="w-[340px] shrink-0 hairline-l min-[1500px]:w-[440px]"
                          :anomaly="openedAnomaly" :name-of="nameOf"
                          @select="select" @inspect-pair="inspectPair"/>
            <DependencyPanel v-else-if="inspectedEdge" class="w-[340px] shrink-0 hairline-l min-[1500px]:w-[440px]"
                             :from="inspectedEdge.from" :to="inspectedEdge.to"
                             :via="inspectedEdge.via" :cycle="inspectedEdge.cycle"
                             :lane-color="laneColor" @select="select"/>
            <!-- Nothing picked on a map, the panel ranks what is lit. -->
            <FocusList v-else-if="!selected && !relationship" class="w-[340px] shrink-0 hairline-l min-[1500px]:w-[440px]"
                       :modules="visible" :tray-paths="trayPaths" :initial-sort="regionSort" :lane-color="laneColor"
                       @select="onMapSelect" @point="pointed = $event"/>
            <!-- Empty, the inspector only says "pick a module"; in a window
                 narrower than about 1200px it took a third of the width from
                 the diagram and cut every name in it to eight characters. -->
            <ModulePanel v-else-if="selected || roomForInspector" class="w-[340px] shrink-0 hairline-l min-[1500px]:w-[440px]"
                         :module="selected" :uses="neighbours.uses" :used-by="neighbours.usedBy"
                         :reach="neighbours.reach" :tray-paths="trayPaths"
                         :lane-color="laneColor" :lane-label="laneLabel"
                         @select="select" @toggle-tray="toggleTray"/>
          </div>
        </template>
      </div>
    </template>

    <template #visualizer-overlays>
      <GroupActionBar ref="trayRef" :selected-items="trayPaths" kind="file" noun="module" @clear="trayPaths = []"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import DescentBar from "~/features/units/components/DescentBar.vue"
import RegionClaim from "~/features/units/components/RegionClaim.vue"
import RelationshipView from "~/features/units/components/RelationshipView.vue"
import AnomalyPanel from "~/features/units/components/AnomalyPanel.vue"
import ShapeLanding from "~/features/units/components/ShapeLanding.vue"
import FocusMap from "~/features/units/components/FocusMap.vue"
import FocusList from "~/features/units/components/FocusList.vue"
import ModulePanel from "~/features/units/components/ModulePanel.vue"
import DependencyPanel from "~/features/units/components/DependencyPanel.vue"
import { useUnitsReading } from "~/features/units/useUnitsReading"
import { useDataStore } from "~/features/snapshot/data.store"
import { useScopeStore } from "~/features/groups/scope.store"
import { useDraftStore } from "~/features/lens-builder/draft.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { AUTO, laneShade } from "~/features/frameworks/frameworkProfiles"
import { frameworkStorageKey } from "~/features/frameworks/classFacts"
import { dirTail } from "~/features/units/moduleGraph"
import { reachOf } from "~/features/units/graph"
import type { Finding, Reference, Region } from "~/features/units/findings"
import { readRelationship } from "~/features/units/relationship"
import EvidenceMap from "~/features/units/components/EvidenceMap.vue"
import { globRegExp } from "~/features/checks/checks"
import { t, intlLocale, listOf } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

// Units, read at the grain that actually has edges.
//
// A module is what an import names; the things declared inside it are its
// contents, not its peers. The screen is a descent through that: the shape of
// the whole codebase, then one region of it, then one module and what it
// declares. Findings are the stairs -- each claim opens onto the modules it
// was read off.

const PAIR_SEP = " "

const store = useDataStore()
const workspaces = useWorkspacesStore()
const scope = useScopeStore()
const draft = useDraftStore()
const route = useRoute()

// Whether the window is wide enough to keep an empty inspector open beside
// the diagram. Read live, so resizing the window changes it.
const roomForInspector = ref(typeof window === "undefined" || window.matchMedia("(min-width: 1200px)").matches)
if (typeof window !== "undefined") {
  const mq = window.matchMedia("(min-width: 1200px)")
  const onChange = (e: MediaQueryListEvent) => { roomForInspector.value = e.matches }
  mq.addEventListener("change", onChange)
  onBeforeUnmount(() => mq.removeEventListener("change", onChange))
}
const router = useRouter()
const extraRoots = computed(() => String(route.query.roots ?? "").split("\n").map((x) => x.trim()).filter(Boolean).map(globRegExp))
const {
  model, graph, frameworkName, laneColor, laneLabel, laneBands, laneOfModule, flows,
  referencesUnresolved, componentPairs, notLayers,
  fileGraph, prodFiles, reach, dupNames, dupFiles, findings,
} = useUnitsReading(() => extraRoots.value)

const searchQuery = ref("")
const trayPaths = ref<string[]>([])

const rootLabel = computed(() => workspaces.active?.name || t("pages.units.codebase"))

function setRoots(globs: string) { router.replace({ query: { ...route.query, roots: globs || undefined } }) }

// ---- the landing map --------------------------------------------------
//
// One map, three colourings: the lanes, what the entry points reach, and what
// is written twice. Lanes are read off modules; the other two off every
// production file, so the map draws the files the colouring can speak for.

type MapMode = "lane" | "reach" | "dupes"
const mapMode = computed<MapMode>(() => (["reach", "dupes"].includes(String(route.query.colour)) ? String(route.query.colour) as MapMode : "lane"))
function setMapMode(m: MapMode) { router.replace({ query: { ...route.query, colour: m === "lane" ? undefined : m } }) }
const walkedFiles = computed(() => !fileGraph.loading.value && prodFiles.value.length > 0)
const landingFiles = computed(() => (mapMode.value !== "lane" && walkedFiles.value
  ? prodFiles.value
  : moduleFiles.value))
const moduleFiles = computed(() => graph.value.modules.map((m) => m.path).filter(Boolean))
const moduleLines = computed(() => new Map(graph.value.modules.map((m) => [m.path, m.lines])))
const landingLines = computed(() => (mapMode.value !== "lane" && walkedFiles.value ? fileGraph.data.value.lines : moduleLines.value))

const REACH = {
  root: { label: t("pages.units.entryPoint"), color: "rgb(var(--c-blue-500))", words: t("pages.units.entryPoint2") },
  reached: { label: t("pages.units.reached"), color: "rgb(var(--c-neutral-300))", words: t("pages.units.reachedEntryPoint") },
  tests: { label: t("pages.units.onlyTests"), color: "rgb(var(--c-amber-400))", words: t("pages.units.reachedOnlyTests") },
  none: { label: t("pages.units.reachedNothing"), color: "rgb(var(--c-red-500))", words: t("pages.units.reachedNothing2") },
} as const
const unreachedSet = computed(() => new Set(reach.value.unreachable))
const testOnlySet = computed(() => new Set(reach.value.testOnly))
const reachKind = (f: string): keyof typeof REACH => (reach.value.roots.has(f) ? "root" : unreachedSet.value.has(f) ? "none" : testOnlySet.value.has(f) ? "tests" : "reached")
const dupNameFiles = computed(() => new Set(dupNames.value.flatMap((d) => d.files)))
const dupFileFiles = computed(() => new Set(dupFiles.value.flatMap((d) => d.files)))
const DUP_NAME = "rgb(var(--c-violet-500))", DUP_FILE = "rgb(var(--c-violet-200))", PLAIN = "rgb(var(--c-neutral-200))"

function landingPaint(path: string) {
  if (mapMode.value === "reach") return REACH[reachKind(path)].color
  if (mapMode.value === "dupes") return dupNameFiles.value.has(path) ? DUP_NAME : dupFileFiles.value.has(path) ? DUP_FILE : PLAIN
  return lanePaint(path)
}
function landingDescribe(path: string) {
  if (mapMode.value === "reach") return REACH[reachKind(path)].words
  if (mapMode.value === "dupes") return dupNameFiles.value.has(path) ? t("pages.units.declaresNameAnotherFile") : dupFileFiles.value.has(path) ? t("pages.units.fileNameUsedAnother") : t("pages.units.nothingRepeated")
  return describeModule(path)
}
const landingLegend = computed(() => {
  if (mapMode.value === "reach") {
    const c = { root: 0, reached: 0, tests: 0, none: 0 }
    for (const f of prodFiles.value) c[reachKind(f)]++
    return (Object.keys(REACH) as Array<keyof typeof REACH>).map((k) => ({ label: REACH[k].label, color: REACH[k].color, count: c[k] }))
  }
  if (mapMode.value === "dupes") return [
    { label: t("pages.units.declaresNameAnotherFile2"), color: DUP_NAME, count: dupNameFiles.value.size },
    { label: t("pages.units.sharesFileName"), color: DUP_FILE, count: [...dupFileFiles.value].filter((f) => !dupNameFiles.value.has(f)).length },
  ]
  return laneLegend.value
})
const laneLegend = computed(() => laneBands.value.map((l) => ({ label: l.label, color: lanePaint(graph.value.modules.find((m) => m.lane === l.id)?.path ?? ""), count: l.count })))
// A file's references, for the lines the map draws on hover. The lane
// colouring reads the module graph the stack is drawn from; reach and
// repetition read the file graph their walk used.
const fileAdj = computed(() => {
  const out = new Map<string, string[]>(), into = new Map<string, string[]>()
  for (const e of fileGraph.edges.value) {
    if (e.from === e.to) continue
    out.set(e.from, [...(out.get(e.from) ?? []), e.to])
    into.set(e.to, [...(into.get(e.to) ?? []), e.from])
  }
  return { out, into }
})
function fileLinks(path: string) { return { uses: fileAdj.value.out.get(path) ?? [], usedBy: fileAdj.value.into.get(path) ?? [] } }
function moduleLinks(path: string) { return { uses: graph.value.outgoing.get(path) ?? [], usedBy: graph.value.incoming.get(path) ?? [] } }
function landingLinks(path: string) { return mapMode.value !== "lane" ? fileLinks(path) : moduleLinks(path) }
/** Lane pair "a>b" → references that way and back, to tell the grain from against it. */
const laneTraffic = computed(() => new Map(flows.value.map((f) => [f.from + ">" + f.to, f])))
function landingBad(from: string, to: string) { return mapMode.value === "lane" && laneBad(from, to) }
/** Whether a module reference runs against the grain of the lanes it joins. */
function laneBad(from: string, to: string) {
  const a = laneOfModule.value.get(from), b = laneOfModule.value.get(to)
  if (!a || !b || a === b || notLayers.value.includes(a) || notLayers.value.includes(b)) return false
  const f = laneTraffic.value.get(a + ">" + b)
  return !!f && (f.reverse > f.count || (f.reverse === f.count && a > b))
}
function openMapEvidence() { descend({ finding: mapMode.value === "reach" ? "unreached" : "twice" }) }
function lanePaint(path: string) {
  return laneShade(laneColor(graph.value.byPath.get(path)?.lane ?? ""), "map")
}
/** On a focused map the lit modules take their lane's strong shade: the pale one,
 *  on a grey lane, read no different from the faded rest. */
function focusPaint(path: string) {
  if (!focusSet.value.has(path)) return lanePaint(path)
  return laneShade(laneColor(graph.value.byPath.get(path)?.lane ?? ""), "lit")
}
function describeModule(path: string) {
  const m = graph.value.byPath.get(path)
  if (!m) return ""
  return t("pages.units.importedImports", { lane: laneLabel(m.lane), fanIn: m.fanIn, fanOut: m.fanOut, value: m.inCycle.length ? t("pages.units.cycle") : "" })
}
/** The files a hovered lane, or a hovered link between two lanes, is made of. */
function filesLitBy(on: { lane: string } | { a: string; b: string }) {
  const lanes = laneOfModule.value
  if ("lane" in on) return new Set(graph.value.modules.filter((m) => m.lane === on.lane).map((m) => m.path))
  const out = new Set<string>()
  for (const e of graph.value.edges) {
    const f = lanes.get(e.from), t = lanes.get(e.to)
    if ((f === on.a && t === on.b) || (f === on.b && t === on.a)) { out.add(e.from); out.add(e.to) }
  }
  return out
}

// ---- the descent ------------------------------------------------------
//
// The path rides the URL, so a reading can be linked, bookmarked and returned
// to -- the same way every other view in the app keeps its state.

const region = computed<Region | null>(() => regionFromQuery())
const selectedPath = computed(() => (route.query.m as string) || null)

/** The grid cell under inspection: one module importing another. */
const selectedPair = computed<[string, string] | null>(() => {
  const raw = route.query.pair
  if (typeof raw !== "string") return null
  const [from, to] = raw.split(PAIR_SEP)
  return from && to ? [from, to] : null
})

const inspectedEdge = computed(() => {
  const pair = selectedPair.value
  if (!pair) return null
  const [from, to] = pair
  const edge = graph.value.between.get(from + "\n" + to)
  const a = graph.value.byPath.get(from)
  const b = graph.value.byPath.get(to)
  if (!edge || !a || !b) return null
  return { from: a, to: b, via: edge.via, cycle: !!graph.value.between.get(to + "\n" + from) }
})

function inspectPair(from: string, to: string) {
  const next: Record<string, any> = { ...route.query }
  delete next.m
  delete next.an
  next.pair = from + PAIR_SEP + to
  router.replace({ query: next })
}

function regionFromQuery(): Region | null {
  const q = route.query
  if (q.finding) return findings.value.find((f) => f.id === q.finding)?.region ?? null
  if (q.lane) {
    const id = String(q.lane)
    const inLane = graph.value.modules.filter((m) => m.lane === id)
    if (!inLane.length) return null
    const leaning = inLane.filter((m) => m.fanIn > 0).length
    const knotted = inLane.filter((m) => m.inCycle.length > 0).length
    return {
      id: "lane:" + id,
      label: laneLabel(id),
      paths: inLane.map((m) => m.path),
      note: t("pages.units.sortedHowMuchRest"),
      claim: {
        headline: t("pages.units.holds", { id: laneLabel(id), modules: t("common.count.module", { count: inLane.length }) }),
        detail: knotted > 0
          ? t("pages.units.importedSomethingElseCycle", { leaning: leaning.toLocaleString(intlLocale), knotted })
          : t("pages.units.themImportedSomethingElse", { leaning: leaning.toLocaleString(intlLocale) }),
        tone: knotted > 0 ? "warn" : "neutral",
      },
    }
  }
  if (q.flow) {
    const [a, b] = String(q.flow).split(",")
    const lanes = laneOfModule.value
    const between = graph.value.edges.filter((e) => {
      const from = lanes.get(e.from), to = lanes.get(e.to)
      return (from === a && to === b) || (from === b && to === a)
    })
    if (!between.length) return null
    const forward = between.filter((e) => lanes.get(e.from) === a).length
    const backward = between.length - forward
    const [heavy, light, heavyN, lightN] = forward >= backward
      ? [laneLabel(a), laneLabel(b), forward, backward]
      : [laneLabel(b), laneLabel(a), backward, forward]
    const minorityLane = forward >= backward ? b : a
    const weights = new Map(graph.value.edges.map((e) => [e.from + "\n" + e.to, e.via.length]))
    return {
      id: "flow:" + a + "," + b,
      label: t("pages.units.and", { a: laneLabel(a), b: laneLabel(b) }),
      paths: [...new Set(between.flatMap((e) => [e.from, e.to]))],
      // Sorted so the traffic against the grain -- the part worth arguing
      // about -- is at the top rather than buried under the majority. Which
      // lane that starts from depends on the counts, not on the order the
      // two lanes happen to be named in.
      references: between
        .map((e) => ({
          from: e.from, to: e.to, weight: e.via.length,
          back: weights.get(e.to + "\n" + e.from),
        }))
        .sort((x, y) =>
          Number(lanes.get(y.from) === minorityLane) - Number(lanes.get(x.from) === minorityLane) ||
          y.weight - x.weight),
      note: "",
      sides: { a, b },
      claim: {
        headline: lightN === 0
          ? t("pages.units.importsNeverOtherWay", { heavy, light })
          : t("pages.units.importsTimesImportsBack", { heavy, light, heavyN, light2: light, heavy2: heavy, lightN }),
        detail: lightN === 0
          ? t("pages.units.allReferencesRunOne", { heavyN })
          : t("pages.units.trafficRunsAgainstGrain", { value: Math.round((lightN / between.length) * 100) }),
        tone: lightN === 0 ? "neutral" : "warn",
      },
    }
  }
  if (q.dir) {
    const dir = String(q.dir)
    const inDir = graph.value.modules.filter((m) => m.path.startsWith(dir + "/"))
    if (!inDir.length) return null
    const byLane = new Map<string, number>()
    for (const m of inDir) byLane.set(m.lane, (byLane.get(m.lane) ?? 0) + 1)
    const lanesHere = [...byLane].sort((a, b) => b[1] - a[1])
    const knotted = inDir.filter((m) => m.inCycle.length > 0).length
    const n = inDir.length.toLocaleString(intlLocale)
    return {
      id: "dir:" + dir,
      label: dir.split("/").slice(-2).join("/") + "/",
      paths: inDir.map((m) => m.path),
      note: t("pages.units.sortedHowMuchRest"),
      claim: {
        headline: t("pages.units.dirHolds", { dir: `${dir}/`, modules: t("common.count.module", { count: inDir.length }) }),
        detail: (lanesHere.length === 1
          ? t("pages.units.allThem", { value: laneLabel(lanesHere[0][0]) })
          : t("pages.units.mostThen", { value: laneLabel(lanesHere[0][0]), value2: lanesHere[0][1], value3: listOf(lanesHere.slice(1, 3).map(([l, c]) => `${laneLabel(l)} (${c})`)) }))
          + (knotted ? t("pages.units.cycleNeighbour", { knotted }) : ""),
        tone: knotted > 0 ? "warn" : "neutral",
      },
    }
  }
  if (q.q) {
    const needle = String(q.q).toLowerCase()
    return {
      id: "search:" + needle,
      label: '"' + q.q + '"',
      paths: graph.value.modules
        .filter((m) => m.path.toLowerCase().includes(needle) ||
          m.units.some((u) => u.name.toLowerCase().includes(needle)))
        .map((m) => m.path),
      note: t("pages.units.matchedModulePathSomething"),
      claim: {
        headline: t("pages.units.modulesMatching", { q: q.q }),
        detail: t("pages.units.matchedModulePathSomething"),
        tone: "neutral",
      },
    }
  }
  return null
}

/** Searching is itself a descent: it names a region of the codebase. */
watch(searchQuery, (q) => {
  const next: Record<string, any> = { ...route.query }
  const needle = q.trim()
  if (needle) { delete next.finding; delete next.lane; delete next.flow; delete next.dir; next.q = needle }
  else delete next.q
  delete next.m
  router.replace({ query: next })
})
watch(() => route.query.q, (q) => {
  if (String(q ?? "") !== searchQuery.value.trim()) searchQuery.value = String(q ?? "")
}, { immediate: true })

function descend(query: Record<string, string>) {
  router.push({ query })
}
function descendToFinding(f: Finding) { descend({ finding: f.id }) }
function descendToLane(id: string) { descend({ lane: id }) }
function descendToFlow(a: string, b: string) { descend({ flow: a + "," + b }) }
/** A folder on the landing map is a region; a file is its folder, with it picked. */
function descendToPlace(path: string, kind: "file" | "folder") {
  // Coloured by reach or repetition, a folder opens that evidence, narrowed to it.
  if (mapMode.value !== "lane") {
    const dir = kind === "folder" ? path : path.slice(0, path.lastIndexOf("/"))
    descend({ finding: mapMode.value === "reach" ? "unreached" : "twice", dir })
    return
  }
  if (kind === "folder") descend({ dir: path })
  else descend({ dir: path.slice(0, path.lastIndexOf("/")), m: path })
}

const steps = computed(() => {
  const out: Array<{ label: string; title?: string }> = []
  if (region.value) out.push({ label: region.value.label, title: region.value.note })
  if (selected.value) out.push({ label: selected.value.name, title: selected.value.path })
  return out
})

/** -1 is the root; 0 is the region. Every step drops what sits below it. */
function ascendTo(index: number) {
  if (index < 0) { router.push({ query: {} }); return }
  const next: Record<string, any> = { ...route.query }
  delete next.m
  delete next.an
  router.replace({ query: next })
}

function select(path: string) {
  const next: Record<string, any> = { ...route.query }
  delete next.pair
  delete next.an
  if (path === selectedPath.value) delete next.m
  else next.m = path
  router.replace({ query: next })
}

/** Double-clicking a module in the grid opens the file it is. */
function openModuleFile(path: string) {
  router.push({ path: `/views/files/${path}` })
}

// ---- what is on screen ------------------------------------------------

/** The order each region's note promises. */
const regionSort = computed(() => {
  switch (region.value?.id) {
    case "crowded": return { by: "holds" as const, descending: true }
    // Those that import nothing either first, as the note says.
    case "dark": return { by: "fanOut" as const, descending: false }
    default: return { by: "fanIn" as const, descending: true }
  }
})

const visible = computed(() => {
  const r = region.value
  if (!r) return []
  const wanted = new Set(r.paths)
  return graph.value.modules.filter((m) => {
    if (!wanted.has(m.path)) return false
    if (scope.isActive && !scope.fileInScope(m.path, m.component)) return false
    return true
  })
})

const visiblePaths = computed(() => visible.value.map((m) => m.path))
const focusSet = computed(() => new Set(visiblePaths.value))
/** The module a row in the side list points at, lit alone on the map. */
const pointed = ref<string | null>(null)
watch(region, () => { pointed.value = null })

/** A click on the map or the list: inspect, or with ⌘ collect. Empty ground clears. */
function onMapSelect(path: string | null, additive: boolean) {
  if (additive && path) { toggleTray(path); return }
  if (!path) { if (selectedPath.value) select(selectedPath.value); return }
  select(path)
}
function collect(paths: string[]) { trayPaths.value = [...new Set([...trayPaths.value, ...paths])] }

const selected = computed(() =>
  selectedPath.value ? graph.value.byPath.get(selectedPath.value) ?? null : null)

/** The evidence, when the region is about dependencies rather than modules. */
const references = computed<Reference[] | null>(() => {
  const list = region.value?.references
  if (!list) return null
  if (!scope.isActive) return list
  const byPath = graph.value.byPath
  const inScope = (path: string) => {
    const m = byPath.get(path)
    return !!m && scope.fileInScope(m.path, m.component)
  }
  return list.filter((r) => inScope(r.from) && inScope(r.to))
})

function nameOf(path: string) { return graph.value.byPath.get(path)?.name ?? path }
function dirOf(path: string) { return dirTail(graph.value.byPath.get(path)?.dir ?? "", 3) }
function laneOfPath(path: string) { return graph.value.byPath.get(path)?.lane ?? "" }

/** The two groups a boundary region is about, and how big each one is. */
const boundary = computed(() => {
  const sides = region.value?.sides
  const refs = references.value
  if (!sides || !refs?.length) return null
  const lanes = laneOfModule.value
  const fromA = refs.filter((r) => lanes.get(r.from) === sides.a).length
  const aLeads = fromA >= refs.length - fromA
  const head = aLeads ? sides.a : sides.b
  const tail = aLeads ? sides.b : sides.a
  const count = (lane: string) => graph.value.modules.filter((m) => m.lane === lane).length
  return { head, tail, headModules: count(head), tailModules: count(tail) }
})

const relationship = computed(() => {
  const sides = region.value?.sides
  if (!sides || !references.value?.length) return null
  return readRelationship({
    references: references.value,
    laneOf: laneOfModule.value,
    a: sides.a,
    b: sides.b,
    nameOf,
    labelOf: laneLabel,
  })
})

/** Which anomaly is open, so the reading can be linked like everything else. */
const selectedAnomaly = computed(() => (route.query.an as string) || null)
const openedAnomaly = computed(() =>
  relationship.value?.anomalies.find((a) => a.id === selectedAnomaly.value) ?? null)

function openAnomaly(id: string) {
  const next: Record<string, any> = { ...route.query }
  delete next.m
  delete next.pair
  next.an = id === selectedAnomaly.value ? undefined : id
  if (!next.an) delete next.an
  router.replace({ query: next })
}

const rowCount = computed(() => (region.value?.map ? region.value.paths.length : relationship.value ? references.value?.length ?? 0 : visible.value.length))
const rowNoun = computed(() => (region.value?.map ? "file" : relationship.value ? "reference" : "module"))

/** What the rows below do, said once rather than left to be discovered. */
const hint = computed(() => {
  if (region.value?.map) return t("pages.units.clickFileMapList")
  if (relationship.value) return t("pages.units.openWarningSeeDependencies")
  return t("pages.units.clickFileMapInspect")
})

const neighbours = computed(() => {
  const path = selectedPath.value
  if (!path) return { uses: [], usedBy: [], reach: null }
  const { byPath, incoming, outgoing, edges } = graph.value
  const lookup = (paths: string[] | undefined) =>
    (paths ?? []).map((p) => byPath.get(p)).filter(Boolean) as typeof graph.value.modules
  return {
    uses: lookup(outgoing.get(path)),
    usedBy: lookup(incoming.get(path)),
    // Walked per selection rather than for every module up front: one
    // traversal costs nothing, 1,217 of them on load would cost the opening.
    reach: reachOf(edges, path),
  }
})

/** Groups are the slicing concept, so every view offers the same tray. */
function toggleTray(path: string) {
  trayPaths.value = trayPaths.value.includes(path)
    ? trayPaths.value.filter((x) => x !== path)
    : [...trayPaths.value, path]
}

function setFramework(value: string) {
  model.frameworkOverride.value = value === AUTO ? null : value
  try {
    const key = frameworkStorageKey(null, store.datasetKey)
    if (value === AUTO) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // A browser refusing storage costs the remembered choice and nothing else.
  }
}

/** Every lane becomes a group in a Layer lens, so the other views can roll up
 *  and colour by the same reading. A lane that covers a component whole is
 *  recorded as the component rather than as its file list. */
function saveLanesAsLens() {
  const byLane = new Map<string, Map<string, string[]>>()
  for (const m of graph.value.modules) {
    if (!m.path) continue
    const perComponent = byLane.get(m.lane) ?? new Map<string, string[]>()
    perComponent.set(m.component, [...(perComponent.get(m.component) ?? []), m.path])
    byLane.set(m.lane, perComponent)
  }

  const groups = model.lanes.value.flatMap((lane) => {
    const perComponent = byLane.get(lane.id)
    if (!perComponent?.size) return []
    const parts = [...perComponent.entries()].map(([component, files]) => {
      const all = store.componentFilesIndex.get(component) ?? []
      const whole = all.length > 0 && all.every((f) => files.includes(f))
      return { component, files: whole ? null : [...new Set(files)].sort() }
    })
    return [{ name: lane.label, parts, reasons: [t("pages.units.sameLane", { laneLabel: lane.label })] }]
  })

  if (groups.length === 0) return
  draft.setGroups("Layer", groups, "horizontal")
  router.push({ path: "/views/connections", query: { rep: "graph" } })
}
</script>
