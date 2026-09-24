<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="!store.hasData" text="Opening snapshot…"/>
    <div v-else-if="component" class="mx-auto w-full max-w-[1040px] px-6 pb-12 pt-5">
      <!-- Headline numbers, each carrying its change since the baseline scan. -->
      <StatStrip :cells="strip"/>
      <div class="mt-2 flex h-7 items-center gap-2 text-sm text-neutral-500">
        <template v-if="delta.hasBaseline.value">
          <span>Compared with</span>
          <SingleSelect :model-value="baselineOption" :options="baselineOptions" @update:model-value="pickBaseline"/>
          <span v-if="delta.isNew.value" class="text-accent-700">Not in that scan</span>
          <span v-if="!delta.comparable.value.ok" class="truncate" :title="delta.comparable.value.reasons.map(r => r.text).join(' ')">Not comparable: {{ delta.comparable.value.reasons[0]?.text }}</span>
        </template>
        <span v-else>No earlier scan to compare with.</span>
      </div>
      <p v-if="scoredFiles || hottestFile" class="text-sm text-neutral-500">
        <template v-if="scoredFiles">Health is the line-weighted mean of {{ formatNumber(scoredFiles) }} scored file{{ scoredFiles === 1 ? "" : "s" }}.</template>
        <template v-if="hottestFile && Number(hottestFile.codesmells__hotspot_score) > 0">
          Hottest file: <router-link :to="filePath(hottestFile.name)" class="font-mono text-neutral-800 underline-offset-2 hover:underline">{{ hottestFile.name.split("/").pop() }}</router-link>
          ({{ formatHotspot(Number(hottestFile.codesmells__hotspot_score)) }} of 100), which sets the component's hotspot.
        </template>
      </p>

      <!-- 1. What kind of thing is this. -->
      <ReadingBand title="Shape" :lede="role.evidence" :to="`${base}/connections`" link-label="Connections">
        <div class="grid gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
          <MainSequencePlot :points="plotPoints" :current="name"/>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="ui-tag text-neutral-800">{{ role.label }}</span>
              <span v-if="zone.label" class="ui-tag" :class="zone.id === 'main-sequence' ? 'text-green-700' : 'text-amber-700'">{{ zone.label }}</span>
            </div>
            <p v-if="zone.evidence" class="mt-2 max-w-[60ch] text-base text-neutral-600">{{ zone.evidence }}</p>
            <dl class="ui-kv mt-5 max-w-[460px] gap-x-6">
              <template v-for="m in martin" :key="m.key">
                <dt :title="m.definition">{{ m.label }}</dt>
                <dd class="whitespace-nowrap">
                  {{ m.value }}<span v-if="m.note" class="ml-2 font-sans text-xs text-neutral-400">{{ m.note }}</span>
                </dd>
              </template>
            </dl>
          </div>
        </div>
      </ReadingBand>

      <!-- 2. Where it sits in the graph. -->
      <ReadingBand title="Position" :lede="positionLede" :to="`${base}/connections`" link-label="Connections">
        <p v-if="testDependentsLine" class="-mt-2 mb-3 text-sm text-neutral-600">{{ testDependentsLine }}</p>
        <dl class="ui-kv grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-6 gap-y-1">
          <template v-for="cell in positionCells" :key="cell.label">
            <div class="flex flex-col gap-0.5">
              <dt :title="cell.title">{{ cell.label }}</dt>
              <dd class="!text-left">{{ cell.value }}</dd>
            </div>
          </template>
        </dl>

        <div v-if="position.tangle" class="mt-5">
          <h4 class="ui-label">Tangled with</h4>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <router-link v-for="member in visibleTangle" :key="member" :to="componentPath(member)" class="ui-chip font-mono" :title="member">
              {{ store.getComponentName(member) }}
            </router-link>
            <button v-if="!tangleExpanded && position.tangleMembers.length > TANGLE_PREVIEW" type="button" class="ui-chip" @click="tangleExpanded = true">
              {{ position.tangleMembers.length - TANGLE_PREVIEW }} more
            </button>
          </div>
        </div>

        <div v-if="furthestPath.length > 1" class="mt-5">
          <h4 class="ui-label">Furthest it reaches</h4>
          <div class="mt-2 flex flex-wrap items-center gap-1">
            <template v-for="(step, i) in furthestPath" :key="`${step}-${i}`">
              <Icon v-if="i > 0" icon="chevron-right" :size="12" class="shrink-0 text-neutral-300"/>
              <router-link :to="componentPath(step)" class="ui-chip font-mono" :class="{ 'is-active': step === name }" :title="step">
                {{ store.getComponentName(step) }}
              </router-link>
            </template>
          </div>
        </div>
      </ReadingBand>

      <!-- 3. What follows if it changes. -->
      <ReadingBand title="Blast radius" :lede="blastLede" :to="`${base}/connections`" link-label="Trace dependents">
        <div class="grid gap-8 md:grid-cols-2">
          <div class="min-w-0">
            <h4 class="ui-label">Depended on by</h4>
            <p v-if="topDependents.length === 0" class="mt-2 text-base text-neutral-500">Nothing imports this component.</p>
            <ul v-else class="mt-2 flex flex-col">
              <li v-for="d in topDependents" :key="d.name" class="flex h-7 items-center gap-3">
                <router-link :to="componentPath(d.name)" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="d.name">
                  {{ store.getComponentName(d.name) }}
                </router-link>
                <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(d.references) }} refs</span>
              </li>
            </ul>
          </div>
          <div class="min-w-0">
            <h4 class="ui-label">Files that reference it</h4>
            <p v-if="incomingFiles.length === 0" class="mt-2 text-base text-neutral-500">No file outside this component names it.</p>
            <ul v-else class="mt-2 flex flex-col">
              <li v-for="f in incomingFiles" :key="f.file" class="flex h-7 items-center gap-3">
                <router-link :to="`/views/files/${f.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="f.file">
                  {{ basename(f.file) }}<span class="ml-1.5 text-xs text-neutral-400">{{ dirname(f.file) }}</span>
                </router-link>
                <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(f.references) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </ReadingBand>

      <!-- 4. How it stands against every other component. -->
      <ReadingBand title="Standing" :lede="standingLede" :to="`${base}/history`" link-label="History">
        <PercentileStrip :rows="standing" :total="total"/>
        <p v-if="testLine" class="mt-3 text-sm text-neutral-600">{{ testLine }}</p>
        <div v-if="age.lines" class="mt-4 max-w-[520px]">
          <p class="text-sm text-neutral-600">{{ ageLine }}</p>
          <div class="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-neutral-100" :title="ageTitle" role="img" :aria-label="ageTitle">
            <span class="h-full bg-amber-600" :style="{ width: `${age.over5 * 100}%` }"></span>
            <span class="h-full bg-amber-400" :style="{ width: `${(age.over2 - age.over5) * 100}%` }"></span>
            <span class="h-full bg-amber-200" :style="{ width: `${(age.over1 - age.over2) * 100}%` }"></span>
          </div>
          <div class="mt-1 flex gap-3 text-xs text-neutral-500">
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-amber-600"></span>&gt; 5 y</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-amber-400"></span>&gt; 2 y</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-amber-200"></span>&gt; 1 y</span>
          </div>
        </div>
      </ReadingBand>

      <!-- 5. What it is made of. -->
      <ReadingBand title="Composition" :lede="compositionLede" :to="`${base}/inside`" link-label="Inside">
        <dl class="ui-kv grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-6 gap-y-1">
          <template v-for="cell in compositionCells" :key="cell.label">
            <div class="flex flex-col gap-0.5">
              <dt :title="cell.title">{{ cell.label }}</dt>
              <dd class="!text-left">{{ cell.value }}</dd>
            </div>
          </template>
        </dl>

        <div v-if="cohesion || leak" class="mt-6 grid gap-6 md:grid-cols-2">
          <div v-if="cohesion">
            <div class="flex items-baseline justify-between gap-3">
              <h4 class="ui-label">Co-change, inside vs outside</h4>
              <span class="font-mono text-xs tabular-nums text-neutral-500">{{ cohesion.percent }}% inside</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span class="block h-full rounded-full bg-accent-500" :style="{ width: `${cohesion.percent}%` }"></span>
            </div>
            <p class="mt-2 text-sm text-neutral-500">
              {{ formatNumber(cohesion.internal) }} shared commits among its own files, {{ formatNumber(cohesion.external) }} with files elsewhere.
            </p>
          </div>
          <div v-if="leak">
            <div class="flex items-baseline justify-between gap-3">
              <h4 class="ui-label">Neighbours inside {{ leak.groupName }}</h4>
              <span class="font-mono text-xs tabular-nums text-neutral-500">{{ leak.percent }}% inside</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span class="block h-full rounded-full" :style="{ width: `${leak.percent}%`, backgroundColor: leak.color }"></span>
            </div>
            <p class="mt-2 text-sm text-neutral-500">
              {{ formatNumber(leak.inside) }} of its {{ formatNumber(leak.total) }} connected components share the group.
            </p>
          </div>
        </div>

        <div v-if="healthSpread.total > 0" class="mt-6">
          <h4 class="ui-label">File health</h4>
          <div class="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            <span
              v-for="part in healthSpread.parts"
              :key="part.level"
              class="block h-full first:rounded-l-full last:rounded-r-full"
              :class="levelDotClass(part.level)"
              :style="{ width: `${part.share}%` }"
              :title="`${part.count} ${part.label}`"
            ></span>
          </div>
          <p class="mt-2 text-sm text-neutral-500">
            <template v-for="(part, i) in healthSpread.parts" :key="part.level"><span v-if="i > 0"> · </span>{{ part.count }} {{ part.label }}</template>
          </p>
        </div>
      </ReadingBand>

      <!-- The reference, kept but folded away. -->
      <details class="group mt-9 pt-5 hairline-t">
        <summary class="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
          <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform duration-200 group-open:rotate-90"/>
          <span>All metrics</span>
          <span class="font-mono text-xs text-neutral-400">{{ metricCount }}</span>
        </summary>
        <div class="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
          <div v-for="family in families" :key="family.name">
            <h4 class="text-base font-semibold text-neutral-900">{{ family.label }}</h4>
            <dl class="ui-kv mt-2">
              <template v-for="m in family.metrics" :key="m.key">
                <dt :title="m.definition">{{ m.label }}</dt>
                <dd>{{ m.value }}</dd>
              </template>
            </dl>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ageShares, useCodeAge } from "~/composables/useCodeAge"
import { componentPath, filePath } from "~/utils/routes"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useComponentDelta } from "~/composables/useComponentDelta"
import { useComponentPosition } from "~/composables/useComponentPosition"
import { componentRole, componentZone, rankOf } from "~/utils/componentRole"
import { cycleCountsByComponent, type CyclePath } from "~/utils/cycles"
import { formatNumber } from "~/utils/format"
import { formatScanTime } from "~/utils/time"
import { NO_DELTA, type Delta } from "~/utils/delta"
import { sqlLiteral } from "~/utils/sql"
import { healthLevel, levelDotClass, formatHealth, formatHotspot, hotspotLevel, type HealthLevel } from "~/composables/useHealth"
import StatStrip, { type StatCell } from "~/components/detail/StatStrip.vue"
import ReadingBand from "~/components/component/ReadingBand.vue"
import MainSequencePlot from "~/components/component/MainSequencePlot.vue"
import PercentileStrip, { type StandingRow } from "~/components/component/PercentileStrip.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import SingleSelect from "~/components/ui/common/SingleSelect.vue"
import Icon from "~/components/ui/common/Icon.vue"
import { hopsOf } from "~/utils/hops"
import { implicitAbstractionLanguage } from "~/utils/abstraction"

const route = useRoute()
const store = useDataStore()
const groupsStore = useGroupsStore()

const name = computed(() => String(route.params.name ?? ""))
const base = computed(() => componentPath(name.value))
const component = computed<any>(() => store.allComponentsIndex.get(name.value))
const total = computed(() => store.allComponents.length)

function raw(key: string): number | null {
  const c = component.value
  if (!c) return null
  const v = c[key]
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function definitionOf(key: string): string {
  const def = store.definitions.get(key)
  return def?.short_description || def?.long_description || ""
}

function label(key: string): string {
  return store.statNiceName(key) || key
}

// ── Comparison against an earlier scan ─────────────────────────────
const delta = useComponentDelta(name)
const baselineOptions = computed(() => delta.candidates.value.map(s => ({ id: s.id, name: formatScanTime(s.finishedAt ?? s.startedAt) })))
const baselineOption = computed(() => {
  const current = delta.baselineScan.value
  return current ? baselineOptions.value.find(o => o.id === current.id) ?? null : null
})
function pickBaseline(option: any) {
  delta.chosenId.value = option?.id ?? null
}
const deltaOf = (key: string) => delta.deltaFor(key, raw(key))

// ── The strip ──────────────────────────────────────────────────────
const STRIP_LABELS: Record<string, string> = {
  codesmells__code_health: "Code health", codesmells__hotspot_score: "Hotspot", complexity__lines: "Lines",
  complexity__files: "Files", git__commits__total: "Commits", git__authors__total: "Authors",
  modularity__instability: "Instability", modularity__coupling__dependents: "Dependents",
}

const strip = computed<StatCell[]>(() => {
  const cells: StatCell[] = []
  const push = (
    key: string,
    format: (n: number) => string,
    direction: "up-good" | "up-risk" | "neutral",
    decimals = 0,
    level?: (n: number) => HealthLevel,
  ) => {
    const n = raw(key)
    if (n === null) return
    cells.push({
      key, label: STRIP_LABELS[key] ?? label(key), value: format(n), title: definitionOf(key),
      level: level ? level(n) : undefined, delta: key === "codesmells__hotspot_score" ? hotspotDelta.value : deltaOf(key), direction, decimals,
    })
  }
  push("codesmells__code_health", formatHealth, "up-good", 1, healthLevel)
  push("codesmells__hotspot_score", formatHotspot, "up-risk", 0, hotspotLevel)
  push("complexity__lines", n => formatNumber(n), "neutral")
  push("complexity__files", n => formatNumber(n), "neutral")
  push("git__commits__total", n => formatNumber(n), "neutral")
  push("git__authors__total", n => formatNumber(n), "neutral")
  push("modularity__instability", n => n.toFixed(2), "neutral", 2)
  push("modularity__coupling__dependents", n => formatNumber(n), "neutral")
  return cells.slice(0, 6)
})

// ── Standing keys, also the source of the percentile lookups ───────
const RANKED: Array<{ key: string; direction: "up-good" | "up-risk" | "neutral"; decimals?: number }> = [
  { key: "codesmells__code_health", direction: "up-good", decimals: 1 },
  { key: "codesmells__hotspot_score", direction: "up-risk" },
  { key: "complexity__lines", direction: "neutral" },
  { key: "complexity__files", direction: "neutral" },
  { key: "modularity__coupling__dependents", direction: "neutral" },
  { key: "modularity__coupling__dependencies", direction: "neutral" },
  { key: "modularity__distance_main_sequence", direction: "up-risk", decimals: 2 },
  { key: "graph__page_rank", direction: "neutral", decimals: 3 },
  { key: "graph__betweenness", direction: "neutral", decimals: 1 },
  { key: "git__commits__total", direction: "neutral" },
  { key: "git__authors__total", direction: "neutral" },
  { key: "git__unique_file_changes__total", direction: "neutral" },
]

// Every ranked metric's values once, sorted high to low; ranking a component
// against 5,000 others must not re-sort per row.
const sortedValues = computed(() => {
  const out = new Map<string, number[]>()
  for (const { key } of RANKED) {
    out.set(key, (store.allComponents as any[]).map(c => Number(c[key])).filter(n => Number.isFinite(n)).sort((a, b) => b - a))
  }
  return out
})

function percentileOf(key: string): number {
  const mine = raw(key)
  if (mine === null) return 0
  return rankOf(mine, sortedValues.value.get(key) ?? []).percentile
}

// ── Band 1: Shape ──────────────────────────────────────────────────
// The exact counts, from the connection rows the store already holds; the
// columns above agree with these, and standing in for them when a snapshot
// predates them costs one pass.
const directCounts = computed(() => {
  const me = name.value
  const inSet = new Set<string>(), outSet = new Set<string>()
  for (const c of store.componentConnections as any[]) {
    if (c.to === me && c.from !== me) inSet.add(c.from)
    else if (c.from === me && c.to !== me) outSet.add(c.to)
  }
  return { dependents: inSet.size, dependencies: outSet.size }
})

function coupling(kind: "dependents" | "dependencies"): number {
  return raw(`modularity__coupling__${kind}`) ?? directCounts.value[kind]
}

// `modularity__coupling__afferent` counts the FILES that import a component,
// not the components: for Sylius\Component\Core\Model it reads 1,405 where
// 443 components import it. Everything that says "components" reads the
// dependents/dependencies columns, which are the distinct component counts.
const role = computed(() => componentRole({
  afferent: coupling("dependents"),
  efferent: coupling("dependencies"),
  afferentPercentile: percentileOf("modularity__coupling__dependents"),
  efferentPercentile: percentileOf("modularity__coupling__dependencies"),
}))

// A language with nothing to declare abstract reads 0.00 abstractness on every
// component, and each zone and distance built on it would be a claim about
// the language rather than the design. Instability is untouched.
const implicitLanguage = computed(() => implicitAbstractionLanguage(store.componentFilesIndex.get(name.value) ?? []))

const zone = computed(() => {
  const lang = implicitLanguage.value
  if (lang) {
    return {
      id: "none", label: "",
      evidence: `${lang} has no abstract types to count, so abstractness reads 0 whatever the design, and the zones and the distance from the main sequence say nothing here. Instability still holds.`,
    }
  }
  return componentZone(raw("modularity__abstractness"), raw("modularity__instability"))
})

const plotPoints = computed(() => (store.allComponents as any[])
  .map(c => ({ name: c.name, abstractness: Number(c.modularity__abstractness), instability: Number(c.modularity__instability) }))
  .filter(p => Number.isFinite(p.abstractness) && Number.isFinite(p.instability)))

const martin = computed(() => {
  const rows: Array<{ key: string; label: string; value: string; note: string; definition: string }> = []
  const add = (key: string, labelText: string, format: (n: number) => string, note = "") => {
    const n = raw(key)
    if (n === null) return
    rows.push({ key, label: labelText, value: format(n), note, definition: definitionOf(key) })
  }
  const abstract = raw("modularity__types__abstract")
  const types = raw("modularity__types__total")
  add("modularity__coupling__dependents", "Dependents", n => formatNumber(n), "components import it")
  add("modularity__coupling__dependencies", "Dependencies", n => formatNumber(n), "components it imports")
  add("modularity__coupling__afferent", "Importing files", n => formatNumber(n), "files elsewhere that import it")
  const lang = implicitLanguage.value
  add("modularity__abstractness", "Abstractness", n => (lang ? "n/a" : n.toFixed(2)), lang ? `${lang} declares no abstract types` : types ? `${formatNumber(abstract ?? 0)} of ${formatNumber(types)} types abstract` : "")
  add("modularity__instability", "Instability", n => n.toFixed(2), "0 stable, 1 unstable")
  add("modularity__distance_main_sequence", "Distance from main sequence", n => (lang ? "n/a" : n.toFixed(2)), lang ? "needs abstractness" : "0 is on the line")
  return rows
})

// ── Band 2: Position ───────────────────────────────────────────────
const { position: positionData, furthestPath } = useComponentPosition(name)
const position = computed(() => positionData.value)
const TANGLE_PREVIEW = 12
const tangleExpanded = ref(false)
watch(name, () => { tangleExpanded.value = false })
const visibleTangle = computed(() => tangleExpanded.value ? position.value.tangleMembers : position.value.tangleMembers.slice(0, TANGLE_PREVIEW))

const cyclesCount = computed(() => store.allCyclesExpanded.filter((c: any) => c.nodes.includes(name.value)).length)

const positionLede = computed(() => {
  const t = position.value.tangle
  if (t) {
    return `It sits in a strongly connected group of ${formatNumber(Number(t.group_size))} components: each one can reach every other, so none of them can be lifted out alone.`
  }
  if (cyclesCount.value > 0) {
    return `It appears in ${formatNumber(cyclesCount.value)} dependency ${cyclesCount.value === 1 ? "cycle" : "cycles"}.`
  }
  return "No cycle runs through it; its dependencies flow one way."
})

const positionCells = computed(() => {
  const cells: Array<{ label: string; value: string; title: string }> = []
  const community = position.value.community
  if (community) {
    cells.push({
      label: "Community",
      value: `${formatNumber(Number(community.community_size))} components`,
      title: `Community ${community.community_nr} — the components it clusters with`,
    })
  }
  cells.push({
    label: "Strongly connected group",
    value: position.value.tangle ? `${formatNumber(Number(position.value.tangle.group_size))} components` : "On its own",
    title: "Components that can all reach each other; none can be extracted alone",
  })
  cells.push({
    label: "Cycles",
    value: cyclesCount.value ? formatNumber(cyclesCount.value) : "None",
    title: "Shortest dependency cycles this component appears in",
  })
  const furthest = position.value.furthest
  if (furthest) {
    cells.push({
      label: "Furthest reach",
      value: `${formatNumber(hopsOf(furthest.furthest_component_shortest_path, furthest.furthest_component_distance))} hops`,
      title: `The component furthest away that it still reaches: ${furthest.furthest_component}`,
    })
  }
  return cells
})

// ── Why the health and hotspot read what they do ───────────────────
// A component's health is the line-weighted mean of its scored files; its
// hotspot is its hottest file's. Both say so under the strip, with the file.
const scoredFiles = computed(() => (loaded.value?.files ?? []).filter(f => f.codesmells__code_health !== null).length)
const hottestFile = computed(() => {
  let best: FileRow | null = null
  for (const f of loaded.value?.files ?? []) if (f.codesmells__hotspot_score !== null && (!best || Number(f.codesmells__hotspot_score) > Number(best.codesmells__hotspot_score))) best = f
  return best
})

// The hotspot score is scaled against each snapshot's own hottest file, so
// two scores from two scans do not compare. The raw value does (revision 2):
// its change is shown in this snapshot's points, and nothing is shown when
// either side lacks it.
const { data: maxRawHotspot } = useAsyncQuery<number | null>(
  async () => {
    if (!store.hasColumn("files", "codesmells__hotspot__raw")) return null
    const rows = await store.query<{ m: number | null }>("SELECT max(codesmells__hotspot__raw) AS m FROM files")
    return rows[0]?.m ?? null
  },
  [() => store.datasetKey],
  { initial: null },
)
const hotspotDelta = computed<Delta>(() => {
  const current = raw("codesmells__hotspot__raw")
  const max = maxRawHotspot.value
  if (current === null || !max) return NO_DELTA
  const d = delta.deltaFor("codesmells__hotspot__raw", current)
  if (d.change === null) return d
  return { change: (d.change / max) * 100, baseline: d.baseline === null ? null : (d.baseline / max) * 100, isNew: d.isNew }
})

// ── Code age: how much of it has sat untouched ─────────────────────
const codeAge = useCodeAge()
const age = computed(() => ageShares((loaded.value?.files ?? []).map(f => ({ lines: Number(f.complexity__lines) || 0, days: codeAge.byFile.value.get(f.name) }))))
const pctOf = (v: number) => `${Math.round(v * 100)}%`
const ageLine = computed(() => `${pctOf(age.value.over2)} of its lines are in files unchanged for more than 2 years; ${pctOf(age.value.over1)} for more than a year.`)
const ageTitle = computed(() => `Lines in files unchanged for > 5 y: ${pctOf(age.value.over5)}, > 2 y: ${pctOf(age.value.over2)}, > 1 y: ${pctOf(age.value.over1)}`)

// ── Tests: here, and elsewhere reaching in ──────────────────────────
// Whether a component is tested, read from file roles (recorded, or by path
// convention on older snapshots): its own test files, and test files in other
// components that import it.
const { data: importers } = useAsyncQuery<Array<{ file: string; from: string }>>(
  () => (name.value ? store.query(`SELECT DISTINCT file, "from" FROM ${store.runtimeComponentEdges} WHERE "to" = ${sqlLiteral(name.value)} AND "from" <> ${sqlLiteral(name.value)}`) : Promise.resolve([])),
  [name, () => store.datasetKey],
  { initial: [] },
)
const testLine = computed(() => {
  const roles = store.fileRoleIndex
  const mine = (loaded.value?.files ?? []).filter(f => roles.get(f.name) === "test")
  const lines = mine.reduce((s, f) => s + (Number(f.complexity__lines) || 0), 0)
  const outside = new Set(importers.value.filter(i => roles.get(i.file) === "test").map(i => i.file)).size
  if (!mine.length && !outside) return (loaded.value?.files.length ?? 0) > 0 ? "No test file is here or imports it." : ""
  const parts = [mine.length ? `Tests: ${formatNumber(lines)} lines in ${formatNumber(mine.length)} file${mine.length === 1 ? "" : "s"} here` : "No test files here"]
  parts.push(outside ? `${formatNumber(outside)} test file${outside === 1 ? "" : "s"} elsewhere import${outside === 1 ? "s" : ""} it` : "no test file elsewhere imports it")
  return parts.join(" · ") + (store.rolesRecorded ? "." : " (tests found by path convention).")
})
const testDependentsLine = computed(() => {
  const dependents = [...new Set(importers.value.map(i => i.from))]
  if (dependents.length === 0) return ""
  const roles = store.fileRoleIndex
  const files = store.componentFilesIndex
  const tests = dependents.filter(d => { const fs = files.get(d) ?? []; return fs.length > 0 && fs.every(f => roles.get(f) === "test") }).length
  return tests ? `${formatNumber(tests)} of ${formatNumber(dependents.length)} dependents are test components.` : ""
})

// ── Bands 3 and 5: one query for what the store does not hold ──────
interface FileRow { name: string; directory: string | null; codesmells__code_health: number | null; complexity__lines: number | null; codesmells__hotspot_score: number | null }
interface IncomingFile { file: string; references: number }
interface Loaded {
  incomingFiles: IncomingFile[]
  reachedBy: number
  files: FileRow[]
  cohesion: { internal: number; external: number } | null
}

const EMPTY_LOAD: Loaded = { incomingFiles: [], reachedBy: 0, files: [], cohesion: null }

const { data: loaded } = useAsyncQuery<Loaded>(
  async () => {
    if (!name.value) return EMPTY_LOAD
    const lit = sqlLiteral(name.value)

    // Which files carry the incoming dependency: the column the pair query
    // has always aggregated away, and the one a reader has to open next.
    const incomingFiles = await store.query<IncomingFile>(`
      SELECT file, SUM(reference_count) AS "references"
      FROM ${store.runtimeComponentEdges}
      WHERE "to" = ${lit} AND "from" <> ${lit}
      GROUP BY file ORDER BY "references" DESC LIMIT 8`)

    const reached = store.hasView("component_connections_indirect")
      ? await store.query<{ n: number }>(`SELECT COUNT(DISTINCT "from") AS n FROM component_connections_indirect WHERE "to" = ${lit} AND "from" <> ${lit}`)
      : []

    const files = await store.query<FileRow>(`
      SELECT name, directory, codesmells__code_health, complexity__lines${store.hasColumn("files", "codesmells__hotspot_score") ? ", codesmells__hotspot_score" : ", NULL AS codesmells__hotspot_score"}
      FROM files WHERE component = ${lit}`)

    // Co-change that stays inside the component against co-change that leaves
    // it. The matrix holds some pairs in both directions, so pairs are
    // normalised before they are summed.
    const cohesion = store.hasView("file_matrix") && files.length > 1
      ? (await store.query<{ internal: number; external: number }>(`
          WITH mine AS (SELECT name FROM files WHERE component = ${lit}),
               touching AS (
                 SELECT CASE WHEN "from" < "to" THEN "from" ELSE "to" END AS a,
                        CASE WHEN "from" < "to" THEN "to" ELSE "from" END AS b,
                        MAX(git_co_changes) AS co
                 FROM file_matrix
                 WHERE git_co_changes > 0
                   AND ("from" IN (SELECT name FROM mine) OR "to" IN (SELECT name FROM mine))
                 GROUP BY a, b
               )
          SELECT
            COALESCE(SUM(CASE WHEN a IN (SELECT name FROM mine) AND b IN (SELECT name FROM mine) THEN co END), 0) AS internal,
            COALESCE(SUM(CASE WHEN a IN (SELECT name FROM mine) AND b IN (SELECT name FROM mine) THEN NULL ELSE co END), 0) AS external
          FROM touching`))[0] ?? null
      : null

    return { incomingFiles, reachedBy: Number(reached[0]?.n) || 0, files, cohesion }
  },
  [name],
  { initial: EMPTY_LOAD },
)

const topDependents = computed(() => {
  const me = name.value
  const byName = new Map<string, number>()
  for (const c of store.componentConnections as any[]) {
    if (c.to !== me || c.from === me) continue
    byName.set(c.from, (byName.get(c.from) ?? 0) + (Number(c.reference_count) || 0))
  }
  return Array.from(byName, ([n, references]) => ({ name: n, references }))
    .sort((a, b) => b.references - a.references || a.name.localeCompare(b.name))
    .slice(0, 8)
})

const incomingFiles = computed(() => loaded.value.incomingFiles)

const blastLede = computed(() => {
  const direct = coupling("dependents")
  if (direct === 0) return "Nothing imports it, so changing it breaks nothing else in this snapshot."
  const reached = loaded.value.reachedBy
  const importers = `${formatNumber(direct)} ${direct === 1 ? "component imports" : "components import"} it directly`
  if (reached > direct) return `${importers}, and ${formatNumber(reached)} reach it once indirect paths are counted.`
  return `${importers}.`
})

// ── Band 4: Standing ───────────────────────────────────────────────
// Counted here from the cycle list rather than read from
// `cycles__short__count`: engines before the fix counted positions in cycle
// paths, so whoever started a cycle was counted twice (openadmin.dto read 106
// against 53). Current engines agree with this count; older snapshots do not.
const cycleCounts = computed(() => cycleCountsByComponent(store.allCyclesExpanded as CyclePath[]))
const cycleStanding = computed<StandingRow | null>(() => {
  const counts = cycleCounts.value
  const ours = counts.get(name.value) ?? 0
  const sorted = (store.allComponents as any[]).map(c => counts.get(c.name) ?? 0).sort((a, b) => b - a)
  if (sorted.length === 0) return null
  const { rank, percentile } = rankOf(ours, sorted)
  return {
    key: "cycles__real__count",
    label: "Cycles",
    value: formatNumber(ours),
    rank,
    percentile,
    definition: "Distinct dependency cycles this component appears in",
    direction: "up-risk",
    decimals: 0,
  }
})

const standing = computed<StandingRow[]>(() => {
  if (!component.value) return []
  const rows = RANKED.flatMap(({ key, direction, decimals }) => {
    // Ranked against a codebase where every value is 1 - instability, it is instability again, upside down.
    if (key === "modularity__distance_main_sequence" && implicitLanguage.value) return []
    const mine = raw(key)
    if (mine === null) return []
    const sorted = sortedValues.value.get(key) ?? []
    if (sorted.length === 0) return []
    const { rank, percentile } = rankOf(mine, sorted)
    const value = key === "codesmells__code_health" ? formatHealth(mine)
      : key === "codesmells__hotspot_score" ? formatHotspot(mine)
        : formatNumber(mine, decimals ?? 2)
    return [{ key, label: label(key), value, rank, percentile, definition: definitionOf(key), direction, decimals, delta: deltaOf(key) }]
  })
  const cycles = cycleStanding.value
  return cycles ? [...rows.slice(0, 7), cycles, ...rows.slice(7)] : rows
})

// Where a health score stands, counting only components strictly better or
// worse. Ties counted against it: gin's 10.0, the best score there, read
// "below 62% of the 8 components".
function healthStanding(health: number): string {
  const all = sortedValues.value.get("codesmells__code_health") ?? []
  const n = all.length
  const better = all.filter(v => v > health).length
  const worse = all.filter(v => v < health).length
  const tied = n - better - worse - 1
  const of = `of the ${formatNumber(total.value)} components in this snapshot`
  if (n <= 1) return "the only component with a reading"
  if (better === 0) return tied > 0 ? `the best in this snapshot, shared with ${formatNumber(tied)} other${tied === 1 ? "" : "s"}` : "the best in this snapshot"
  if (worse === 0) return tied > 0 ? `the lowest in this snapshot, shared with ${formatNumber(tied)} other${tied === 1 ? "" : "s"}` : "the lowest in this snapshot"
  return worse >= better
    ? `better than ${Math.floor((worse / n) * 100)}% ${of}`
    : `worse than ${Math.floor((better / n) * 100)}% ${of}`
}

const standingLede = computed(() => {
  const health = raw("codesmells__code_health")
  if (health !== null) {
    return `Code health ${formatHealth(health)}, ${healthStanding(health)}.`
  }
  const hotspot = raw("codesmells__hotspot_score")
  if (hotspot !== null) {
    const { rank } = rankOf(hotspot, sortedValues.value.get("codesmells__hotspot_score") ?? [])
    return `Hotspot score ${formatHotspot(hotspot)}, ranked ${formatNumber(rank)} of ${formatNumber(total.value)}.`
  }
  return `Ranked against the other ${formatNumber(Math.max(total.value - 1, 0))} components in this snapshot.`
})

// ── Band 5: Composition ────────────────────────────────────────────
const directories = computed(() => new Set(loaded.value.files.map(f => f.directory).filter(Boolean)).size)

const compositionCells = computed(() => {
  const cells: Array<{ label: string; value: string; title: string }> = []
  const add = (labelText: string, value: string, title = "") => cells.push({ label: labelText, value, title })
  add("Files", formatNumber(raw("complexity__files") ?? loaded.value.files.length))
  add("Lines", formatNumber(raw("complexity__lines") ?? 0))
  const types = raw("modularity__types__total")
  if (types !== null) {
    const abstract = raw("modularity__types__abstract") ?? 0
    add("Types", abstract ? `${formatNumber(types)} · ${formatNumber(abstract)} abstract` : formatNumber(types), definitionOf("modularity__types__total"))
  }
  const methods = raw("java__method_declarations")
  if (methods) add("Methods", formatNumber(methods), definitionOf("java__method_declarations"))
  if (directories.value > 0) add("Directories", formatNumber(directories.value), "Folders its files are spread across")
  const indentation = raw("complexity__indentation__avg")
  if (indentation !== null) add("Average indentation", indentation.toFixed(2), definitionOf("complexity__indentation__avg"))
  return cells
})

const cohesion = computed(() => {
  const c = loaded.value.cohesion
  if (!c) return null
  const internal = Number(c.internal) || 0
  const external = Number(c.external) || 0
  if (internal + external === 0) return null
  return { internal, external, percent: Math.round((internal / (internal + external)) * 100) }
})

const groups = computed(() => groupsStore.componentGroupIndex.get(name.value) ?? [])

// How much of the component's coupling stays inside the group it belongs to:
// the question groups exist to answer, asked from the component's side.
const leak = computed(() => {
  const group = groups.value[0]
  if (!group) return null
  const members = groupsStore.resolved.get(group.id)?.components
  if (!members) return null
  const me = name.value
  const neighbours = new Set<string>()
  for (const c of store.componentConnections as any[]) {
    if (c.from === me && c.to !== me) neighbours.add(c.to)
    else if (c.to === me && c.from !== me) neighbours.add(c.from)
  }
  if (neighbours.size === 0) return null
  const inside = Array.from(neighbours).filter(n => members.has(n)).length
  return {
    groupName: group.name, color: group.color, inside, total: neighbours.size,
    percent: Math.round((inside / neighbours.size) * 100),
  }
})

const healthSpread = computed(() => {
  const counts: Record<"good" | "warn" | "bad", number> = { good: 0, warn: 0, bad: 0 }
  let scored = 0
  for (const f of loaded.value.files) {
    const level = healthLevel(f.codesmells__code_health)
    if (level === "none") continue
    counts[level]++
    scored++
  }
  const parts = ([
    { level: "good" as const, label: "healthy" },
    { level: "warn" as const, label: "to watch" },
    { level: "bad" as const, label: "alerting" },
  ]).filter(p => counts[p.level] > 0)
    .map(p => ({ ...p, count: counts[p.level], share: scored ? (counts[p.level] / scored) * 100 : 0 }))
  return { total: scored, parts }
})

const compositionLede = computed(() => {
  const files = raw("complexity__files") ?? loaded.value.files.length
  const lines = raw("complexity__lines") ?? 0
  const spread = directories.value > 1 ? ` across ${formatNumber(directories.value)} directories` : ""
  const c = cohesion.value
  const cohesionText = c ? ` ${c.percent}% of their shared commits stay inside the component.` : ""
  return `${formatNumber(files)} ${files === 1 ? "file" : "files"}, ${formatNumber(lines)} lines${spread}.${cohesionText}`
})

// ── The reference dump, cleaned ────────────────────────────────────
const IDENTITY = new Set(["name", "report_id", "timestamp", "connections", "git__repository", "java_class", "java_full_class"])
const CORE_FAMILIES = new Set(["complexity", "codesmells", "modularity", "graph", "cycles", "git"])
const FAMILY_LABELS: Record<string, string> = {
  complexity: "Complexity", codesmells: "Code smells", modularity: "Modularity", graph: "Graph centrality",
  cycles: "Cycles", git: "Git", java: "Java", js: "JavaScript",
}

const families = computed(() => {
  if (!component.value) return []
  const grouped = new Map<string, Array<{ key: string; label: string; value: string; definition: string }>>()
  const nonZero = new Set<string>()
  for (const key of store.getDistinctComponentColumns) {
    if (IDENTITY.has(key)) continue
    const n = raw(key)
    if (n === null) continue
    const family = key.split("__")[0]
    if (n !== 0) nonZero.add(family)
    const list = grouped.get(family) ?? []
    list.push({ key, label: label(key), value: formatNumber(n, 3), definition: definitionOf(key) })
    grouped.set(family, list)
  }
  const order = Object.keys(FAMILY_LABELS)
  return Array.from(grouped.entries())
    // A family of nothing but zeros is noise unless the engine always fills
    // it: a Java project has no React components to report.
    .filter(([family]) => CORE_FAMILIES.has(family) || nonZero.has(family))
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
    .map(([familyName, metrics]) => ({ name: familyName, label: FAMILY_LABELS[familyName] ?? familyName, metrics }))
})

const metricCount = computed(() => families.value.reduce((a, f) => a + f.metrics.length, 0))

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}
function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}
</script>
