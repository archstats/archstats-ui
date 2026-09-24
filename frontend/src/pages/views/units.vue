<template>
  <ViewWorkspaceLayout
    title="Units"
    v-model:search-query="searchQuery"
    search-placeholder="Search modules"
    :show-config="true"
  >
    <template #stats>
      <span>Modules <span class="text-neutral-800">{{ graph.modules.length.toLocaleString() }}</span></span>
      <span class="text-neutral-400">·</span>
      <span>Imports <span class="text-neutral-800">{{ graph.edges.length.toLocaleString() }}</span></span>
      <template v-if="frameworkName">
        <span class="text-neutral-400">·</span>
        <span>{{ frameworkName }}</span>
      </template>
    </template>

    <template #actions>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="model.lanes.value.length === 0"
              title="Save every lane as a group in a Layer lens, so the other views can roll up and colour by it"
              @click="saveLanesAsLens">
        <Icon icon="layers" :size="13" class="text-neutral-500"/>
        <span class="hidden min-[1440px]:inline">Lanes → lens</span>
      </button>
    </template>

    <template #config-popover>
      <p class="text-sm leading-4 text-neutral-500">
        Lanes are read as <span class="text-neutral-700">{{ model.profile.value.label }}</span>.
        {{ model.detection.value.reason }} Change it from the bar above the view.
      </p>
      <p class="text-sm leading-4 text-neutral-500">
        This view reads the codebase as modules, because a module is what an import names.
        <template v-if="model.modulesAreMeaningful.value">
          These {{ graph.modules.length.toLocaleString() }} modules hold
          {{ model.declared.value.length.toLocaleString() }} declared things between them.
        </template>
        <template v-else>
          Here each module declares one thing, so the two readings are the same.
        </template>
      </p>
    </template>

    <template #visualizer>
      <div class="flex h-full w-full flex-col overflow-hidden">
        <LoadingState v-if="model.loading.value" text="Reading modules…"/>

        <EmptyState v-else-if="model.error.value" icon="alert"
                    title="Could not read the units" :text="model.error.value"/>

        <EmptyState v-else-if="!model.hasUnits.value" icon="braces"
                    title="No units in this snapshot"
                    text="This scan recorded no named things to read. Re-scan with a build that records units."/>

        <template v-else>
          <DescentBar :root="rootLabel" :steps="steps"
                      :count="region ? rowCount : null" :noun="rowNoun"
                      :framework="model.frameworkOverride.value ?? AUTO"
                      :auto-label="model.detection.value.confident ? model.profile.value.label : 'unsure, using structure'"
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
                        :auto-label="model.detection.value.confident ? model.profile.value.label : 'by folder structure'"
                        :detected="model.detection.value.confident && model.profile.value.id !== 'structure'"
                        :profiles="model.offeredProfiles.value"
                        @open="descendToFinding" @lane="descendToLane" @flow="descendToFlow"
                        @framework="setFramework"/>

          <EmptyState v-else-if="rowCount === 0" icon="braces"
                      title="Nothing here"
                      text="Nothing in this region matches the current search and scope."/>

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
            <ReferenceList v-else-if="references" class="min-w-0 flex-1"
                           :references="references" :by-path="graph.byPath"
                           :selected-path="selectedPath" :mutual="region?.id === 'knots'"
                           :lane-color="laneColor"
                           @select="select"/>
            <ModuleList v-else class="min-w-0 flex-1"
                        :modules="visible" :selected-path="selectedPath" :tray-paths="trayPaths"
                        :show-holds="model.modulesAreMeaningful.value || region?.id === 'crowded'"
                        :initial-sort="regionSort"
                        :lane-color="laneColor" :lane-label="laneLabel"
                        @select="select" @toggle-tray="toggleTray"/>

            <AnomalyPanel v-if="openedAnomaly" class="w-[340px] shrink-0 hairline-l min-[1500px]:w-[440px]"
                          :anomaly="openedAnomaly" :name-of="nameOf"
                          @select="select" @inspect-pair="inspectPair"/>
            <DependencyPanel v-else-if="inspectedEdge" class="w-[340px] shrink-0 hairline-l min-[1500px]:w-[440px]"
                             :from="inspectedEdge.from" :to="inspectedEdge.to"
                             :via="inspectedEdge.via" :cycle="inspectedEdge.cycle"
                             :lane-color="laneColor" @select="select"/>
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
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import Icon from "~/components/ui/common/Icon.vue"
import GroupActionBar from "~/components/groups/GroupActionBar.vue"
import DescentBar from "~/components/units/DescentBar.vue"
import RegionClaim from "~/components/units/RegionClaim.vue"
import ReferenceList from "~/components/units/ReferenceList.vue"
import RelationshipView from "~/components/units/RelationshipView.vue"
import AnomalyPanel from "~/components/units/AnomalyPanel.vue"
import ShapeLanding from "~/components/units/ShapeLanding.vue"
import ModuleList from "~/components/units/ModuleList.vue"
import ModulePanel from "~/components/units/ModulePanel.vue"
import DependencyPanel from "~/components/units/DependencyPanel.vue"
import { useUnitsModel } from "~/composables/useUnitsModel"
import { useDataStore } from "~/stores/data"
import { useScopeStore } from "~/stores/scope"
import { useDraftStore } from "~/stores/draft"
import { useWorkspacesStore } from "~/stores/workspaces"
import { AUTO, laneOf } from "~/utils/javaFrameworks"
import { frameworkStorageKey } from "~/utils/javaFacts"
import { dirTail } from "~/utils/moduleGraph"
import { laneFlows, reachOf } from "~/utils/graph"
import { findingsFor, type Finding, type Reference, type Region } from "~/utils/findings"
import { readRelationship } from "~/utils/relationship"

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
const model = useUnitsModel()

const graph = computed(() => model.moduleGraph.value)
const searchQuery = ref("")
const trayPaths = ref<string[]>([])

const frameworkName = computed(() =>
  model.detection.value.confident && model.profile.value.id !== "structure" ? model.profile.value.label : "")

const rootLabel = computed(() => workspaces.active?.name || "This codebase")

function laneColor(lane: string) { return laneOf(model.profile.value, lane).color }
function laneLabel(lane: string) { return laneOf(model.profile.value, lane).label }

/** Lanes as bands, counted in modules rather than units. */
const laneBands = computed(() => {
  const counts = new Map<string, number>()
  for (const m of graph.value.modules) counts.set(m.lane, (counts.get(m.lane) ?? 0) + 1)
  return model.profile.value.lanes
    .filter((l) => counts.has(l.id))
    .map((l) => ({ id: l.id, label: l.label, color: l.color, count: counts.get(l.id) ?? 0 }))
})

const laneOfModule = computed(() => new Map(graph.value.modules.map((m) => [m.path, m.lane])))
const flows = computed(() => laneFlows(laneOfModule.value, graph.value.edges))
// No reference between modules resolved, while the component graph has
// thousands: the snapshot could not read unit references for this language,
// not a codebase in which nothing imports anything. Absence findings built
// on that would call every module a deletion candidate (nopCommerce: 3,537).
const referencesUnresolved = computed(() => graph.value.edges.length === 0 && store.componentConnections.length > 0)
/** Distinct component pairs, the figure Connections shows, not import rows. */
const componentPairs = computed(() => new Set((store.componentConnections as Array<{ from: string; to: string }>).filter((c) => c.from !== c.to).map((c) => c.from + "\u0000" + c.to)).size)
const findings = computed(() => {
  const all = findingsFor({
    graph: graph.value, laneLabel, generated: model.generated.value,
    definitional: new Set(model.profile.value.lanes.filter((l) => l.byReferences).map((l) => l.id)),
  })
  return referencesUnresolved.value ? all.filter((f) => f.id !== "dark") : all
})

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
      note: "Sorted by how much the rest of the codebase leans on them.",
      claim: {
        headline: `${laneLabel(id)} holds ${inLane.length.toLocaleString()} ${inLane.length === 1 ? "module" : "modules"}.`,
        detail: knotted > 0
          ? `${leaning.toLocaleString()} are imported by something else, and ${knotted} are in a cycle with a neighbour.`
          : `${leaning.toLocaleString()} of them are imported by something else, and none are in a cycle.`,
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
      label: laneLabel(a) + " and " + laneLabel(b),
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
          ? `${heavy} imports ${light}, and never the other way round.`
          : `${heavy} imports ${light} ${heavyN} times, and ${light} imports ${heavy} ${lightN} back.`,
        detail: lightN === 0
          ? `All ${heavyN} references run one way. That is a layer holding.`
          : `${Math.round((lightN / between.length) * 100)}% of the traffic runs against the grain.`,
        tone: lightN === 0 ? "neutral" : "warn",
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
      note: "Matched on the module path or on something it declares.",
      claim: {
        headline: `Modules matching “${q.q}”.`,
        detail: "Matched on the module path or on something it declares.",
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
  if (needle) { delete next.finding; delete next.lane; delete next.flow; next.q = needle }
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

const rowCount = computed(() => references.value?.length ?? visible.value.length)
const rowNoun = computed(() => (references.value ? "reference" : "module"))

/** What the rows below do, said once rather than left to be discovered. */
const hint = computed(() => {
  if (relationship.value) return "Open a warning to see the dependencies behind it, or a module to inspect it."
  if (references.value) return "Click either side of a row to inspect that module."
  return "Click a module to inspect it. Hold ⌘ to collect modules into a group instead. Red marks a cycle."
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
    return [{ name: lane.label, parts, reasons: ["same lane " + lane.label] }]
  })

  if (groups.length === 0) return
  draft.setGroups("Layer", groups, "horizontal")
  router.push({ path: "/views/connections", query: { rep: "graph" } })
}
</script>
