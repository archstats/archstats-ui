<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="!store.hasData" :text="t('pages.componentsIndex.openingSnapshot')"/>
    <div v-else-if="component" class="mx-auto w-full max-w-[1040px] px-6 pb-12 pt-5">
      <!-- Headline numbers, each carrying its change since the baseline scan. -->
      <StatStrip :cells="strip"/>
      <div class="mt-2 flex h-7 items-center gap-2 text-sm text-neutral-500">
        <template v-if="delta.hasBaseline.value">
          <span>{{ t('pages.componentsIndex.compared') }}</span>
          <SingleSelect :model-value="baselineOption" :options="baselineOptions" @update:model-value="pickBaseline"/>
          <span v-if="delta.isNew.value" class="text-accent-700">{{ t('pages.componentsIndex.notScan') }}</span>
          <span v-if="!delta.comparable.value.ok" class="truncate" :title="delta.comparable.value.reasons.map(r => r.text).join(' ')">{{ t('pages.componentsIndex.notComparable', { text: delta.comparable.value.reasons[0]?.text }) }}</span>
        </template>
        <span v-else>{{ t('pages.componentsIndex.noEarlierScanCompare') }}</span>
      </div>
      <p v-if="scoredFiles || hottestFile" class="text-sm text-neutral-500">
        <template v-if="scoredFiles">{{ t('pages.componentsIndex.healthLineWeightedMean', { scoredFiles: formatNumber(scoredFiles), files: t('common.noun.file', { count: scoredFiles }) }) }}</template>
        <template v-if="leastHealthyFile">
          {{ ' ' + t('pages.componentsIndex.leastHealthy') }} <router-link :to="filePath(leastHealthyFile.name)" class="font-mono text-neutral-800 underline-offset-2 hover:underline">{{ leastHealthyFile.name.split("/").pop() }}</router-link>
          ({{ formatHealth(Number(leastHealthyFile.codesmells__code_health)) }}).
        </template>
        <template v-if="hottestFile && Number(hottestFile.codesmells__hotspot_score) > 0">
          {{ t('pages.componentsIndex.hottestFile') }} <router-link :to="filePath(hottestFile.name)" class="font-mono text-neutral-800 underline-offset-2 hover:underline">{{ hottestFile.name.split("/").pop() }}</router-link>
          {{ t('pages.componentsIndex.text100WhichSetsComponent', { codesmells__hotspot_score: formatHotspot(Number(hottestFile.codesmells__hotspot_score)) }) }}
        </template>
      </p>

      <!-- 1. What kind of thing is this. -->
      <ReadingBand :title="t('pages.componentsIndex.shape')" :lede="role.evidence" :to="`${base}/connections`" :link-label="t('pages.componentsIndex.connections')">
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
      <ReadingBand :title="t('pages.componentsIndex.position')" :lede="positionLede" :to="`${base}/connections`" :link-label="t('pages.componentsIndex.connections')">
        <p v-if="testDependentsLine" class="-mt-2 mb-3 text-sm text-neutral-600">{{ testDependentsLine }}</p>
        <div v-if="leans.length" class="-mt-1 mb-4">
          <button type="button" class="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900" :aria-expanded="leansOpen" @click="leansOpen = !leansOpen">
            <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform" :class="{ 'rotate-90': leansOpen }"/>
            <span>{{ t('pages.componentsIndex.dependenciesLessStableThan', { leansLength: leans.length, dependencyRowsLength: dependencyRows.length }) }}<template v-if="leansInTangle">{{ ' ' + t('pages.componentsIndex.insideTangle', { leansInTangle }) }}</template>.</span>
          </button>
          <table v-if="leansOpen" class="ui-table mt-2 max-w-[640px]">
            <thead><tr><th>{{ t('pages.componentsIndex.dependency') }}</th><th class="w-[120px] text-right">{{ t('pages.componentsIndex.instability') }}</th><th class="w-16 text-right">{{ t('pages.componentsIndex.ca') }}</th><th class="w-16 text-right">{{ t('pages.componentsIndex.ce') }}</th></tr></thead>
            <tbody>
              <tr v-for="l in leans" :key="l.to.name">
                <td class="max-w-0 truncate font-mono text-sm"><router-link :to="componentPath(l.to.name)" class="text-neutral-900 hover:underline" :title="l.to.name">{{ l.to.name }}</router-link><span v-if="l.inTangle" class="ui-tag ml-2">{{ t('pages.componentsIndex.tangle') }}</span></td>
                <td class="is-num text-right">{{ fixed(l.from.instability, 2) }} → {{ fixed(l.to.instability, 2) }}</td>
                <td class="is-num text-right">{{ l.to.afferent ?? "—" }}</td>
                <td class="is-num text-right">{{ l.to.efferent ?? "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <dl class="ui-kv grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-6 gap-y-1">
          <template v-for="cell in positionCells" :key="cell.label">
            <div class="flex flex-col gap-0.5">
              <dt :title="cell.title">{{ cell.label }}</dt>
              <dd class="!text-left">{{ cell.value }}</dd>
            </div>
          </template>
        </dl>

        <div v-if="position.tangle" class="mt-5">
          <h4 class="ui-label">{{ t('pages.componentsIndex.tangled') }}</h4>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <router-link v-for="member in visibleTangle" :key="member" :to="componentPath(member)" class="ui-chip font-mono" :title="member">
              {{ store.getComponentName(member) }}
            </router-link>
            <button v-if="!tangleExpanded && position.tangleMembers.length > TANGLE_PREVIEW" type="button" class="ui-chip" @click="tangleExpanded = true">
              {{ t('pages.componentsIndex.more', { value: position.tangleMembers.length - TANGLE_PREVIEW }) }}
            </button>
          </div>
        </div>

        <div v-if="furthestPath.length > 1" class="mt-5">
          <h4 class="ui-label">{{ t('pages.componentsIndex.furthestReaches') }}</h4>
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
      <ReadingBand :title="t('pages.componentsIndex.blastRadius')" :lede="blastLede" :to="`${base}/connections`" :link-label="t('pages.componentsIndex.traceDependents')">
        <div class="grid gap-8 md:grid-cols-2">
          <div class="min-w-0">
            <h4 class="ui-label">{{ t('pages.componentsIndex.depended') }}</h4>
            <p v-if="topDependents.length === 0" class="mt-2 text-base text-neutral-500">{{ t('pages.componentsIndex.nothingImportsComponent') }}</p>
            <ul v-else class="mt-2 flex flex-col">
              <li v-for="d in topDependents" :key="d.name" class="flex h-7 items-center gap-3">
                <router-link :to="componentPath(d.name)" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="d.name">
                  {{ store.getComponentName(d.name) }}
                </router-link>
                <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ t('pages.componentsIndex.refs', { references: formatNumber(d.references) }) }}</span>
              </li>
            </ul>
          </div>
          <div class="min-w-0">
            <h4 class="ui-label">{{ t('pages.componentsIndex.filesReference') }}</h4>
            <p v-if="incomingFiles.length === 0" class="mt-2 text-base text-neutral-500">{{ t('pages.componentsIndex.noFileOutsideComponent') }}</p>
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
        <UsedSurface :name="name"/>
      </ReadingBand>

      <WhoKnowsIt :name="name"/>

      <!-- 4. How it stands against every other component. -->
      <ReadingBand :title="t('pages.componentsIndex.standing')" :lede="standingLede" :to="`${base}/history`" :link-label="t('pages.componentsIndex.history')">
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
      <ReadingBand :title="t('pages.componentsIndex.composition')" :lede="compositionLede" :to="`${base}/inside`" :link-label="t('pages.componentsIndex.inside2')">
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
              <h4 class="ui-label">{{ t('pages.componentsIndex.coChangeInsideVs') }}</h4>
              <span class="font-mono text-xs tabular-nums text-neutral-500">{{ t('pages.componentsIndex.inside', { percent: cohesion.percent }) }}</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span class="block h-full rounded-full bg-accent-500" :style="{ width: `${cohesion.percent}%` }"></span>
            </div>
            <p class="mt-2 text-sm text-neutral-500">
              {{ t('pages.componentsIndex.sharedCommitsAmongOwn', { internal: formatNumber(cohesion.internal), external: formatNumber(cohesion.external) }) }}
            </p>
          </div>
          <div v-if="leak">
            <div class="flex items-baseline justify-between gap-3">
              <h4 class="ui-label">{{ t('pages.componentsIndex.neighboursInside', { groupName: leak.groupName }) }}</h4>
              <span class="font-mono text-xs tabular-nums text-neutral-500">{{ t('pages.componentsIndex.inside', { percent: leak.percent }) }}</span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span class="block h-full rounded-full" :style="{ width: `${leak.percent}%`, backgroundColor: leak.color }"></span>
            </div>
            <p class="mt-2 text-sm text-neutral-500">
              {{ t('pages.componentsIndex.connectedComponentsShareGroup', { inside: formatNumber(leak.inside), leakTotal: formatNumber(leak.total) }) }}
            </p>
          </div>
        </div>

        <div v-if="healthSpread.total > 0" class="mt-6">
          <h4 class="ui-label">{{ t('pages.componentsIndex.fileHealth') }}</h4>
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
        <ComplexFunctions :component="name" section-class="mt-6"/>
      </ReadingBand>

      <!-- 6. What it ships in: the deployables that hold it, from the
           build, pipeline and deployment files (engine revision 5). -->
      <ReadingBand v-if="deployablesKnown" :title="t('pages.componentsIndex.ships')" :lede="shipsLede" to="/views/deployables" :link-label="t('pages.componentsIndex.deployables')">
        <ul v-if="ships.length" class="flex flex-col gap-1">
          <li v-for="s in ships" :key="s.deployable.id" class="flex items-baseline gap-3 text-sm">
            <span class="font-mono text-neutral-800">{{ s.deployable.id }}</span>
            <span class="text-neutral-500">{{ s.deployable.kind }}<template v-if="s.deployable.runtime"> · {{ s.deployable.runtime }}</template></span>
            <span class="ml-auto tabular-nums text-neutral-500" :title="t('pages.componentsIndex.componentSFiles', { files: s.files })">{{ t('pages.componentsIndex.files', { files: formatNumber(s.files) }) }}</span>
          </li>
        </ul>
        <p v-if="shipCalls.length" class="mt-3 text-sm text-neutral-600">
          {{ t('pages.componentsIndex.runTime', { theyCall: t('common.noun.itCalls', { count: ships.length }), value: shipCalls.slice(0, 6).join(", ") }) }}<template v-if="shipCalls.length > 6">{{ ' ' + t('pages.componentsIndex.more2', { value: shipCalls.length - 6 }) }}</template>.
        </p>
      </ReadingBand>

      <!-- The reference, kept but folded away. -->
      <details class="group mt-9 pt-5 hairline-t">
        <summary class="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
          <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform duration-200 group-open:rotate-90"/>
          <span>{{ t('pages.componentsIndex.allMetrics') }}</span>
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
import UsedSurface from "~/features/metrics/components/UsedSurface.vue"
import WhoKnowsIt from "~/features/git/components/WhoKnowsIt.vue";
import { leansOnLessStable } from "~/features/metrics/sdp"
import { ageShares, useCodeAge } from "~/features/git/useCodeAge"
import { componentPath, filePath } from "~/features/navigation/routes"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useGroupsStore } from "~/features/groups/groups.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useComponentDelta } from "~/features/trends/useComponentDelta"
import { useComponentPosition } from "~/features/metrics/useComponentPosition"
import { componentRole, componentZone, rankOf } from "~/features/metrics/componentRole"
import { cycleCountsByComponent, type CyclePath } from "~/features/cycles/cycles"
import { formatNumber, fixed } from "~/shared/format"
import { formatScanTime } from "~/shared/time"
import { NO_DELTA, type Delta } from "~/features/trends/delta"
import { sqlLiteral } from "~/shared/sql"
import { healthLevel, levelDotClass, formatHealth, formatHotspot, hotspotLevel, type HealthLevel } from "~/features/metrics/useHealth"
import StatStrip, { type StatCell } from "~/features/metrics/components/StatStrip.vue"
import ComplexFunctions from "~/features/metrics/components/ComplexFunctions.vue"
import ReadingBand from "~/shared/ui/ReadingBand.vue"
import MainSequencePlot from "~/features/metrics/components/MainSequencePlot.vue"
import PercentileStrip, { type StandingRow } from "~/features/metrics/components/PercentileStrip.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import SingleSelect from "~/shared/ui/SingleSelect.vue"
import Icon from "~/shared/ui/Icon.vue"
import { useDeployables } from "~/features/deployables/useDeployables"
import { shipsIn } from "~/features/deployables/deployables"
import { hopsOf } from "~/features/snapshot/hops"
import { fileCoChangeSql, sweepingLimit } from "~/features/snapshot/fileCoChange"
import { implicitAbstractionLanguage } from "~/features/metrics/abstraction"
import { t } from "~/shared/i18n"

const route = useRoute()
const store = useDataStore()
const groupsStore = useGroupsStore()

const name = computed(() => String(route.params.name ?? ""))

// Which deployables hold this component, and what those call.
const { model: deployables, available: deployablesAvailable } = useDeployables()
const deployablesKnown = computed(() => deployablesAvailable() && deployables.value.deployables.length > 0)
const ships = computed(() => shipsIn(deployables.value, name.value))
const shipCalls = computed(() => {
  const mine = new Set(ships.value.map(s => s.deployable.id))
  return [...new Set(deployables.value.links.filter(l => mine.has(l.from) && l.kind === "calls" && l.to_kind === "deployable" && !mine.has(l.to)).map(l => l.to))].sort()
})
const shipsLede = computed(() => {
  if (!ships.value.length) return "No build file puts this component in a container, app or function."
  if (ships.value.length === 1) return t("pages.componentsIndex.ships2", { deployableId: ships.value[0].deployable.id })
  return t("pages.componentsIndex.shipsDeployablesChangeChange", { shipsLength: ships.value.length })
})
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
  codesmells__code_health: t("pages.componentsIndex.codeHealth"), codesmells__hotspot_score: t("pages.componentsIndex.hotspot"), complexity__lines: t("pages.componentsIndex.lines"),
  complexity__files: t("pages.componentsIndex.files2"), git__commits__total: t("pages.componentsIndex.commits"), git__authors__total: t("pages.componentsIndex.authors"),
  modularity__instability: t("pages.componentsIndex.instability"), modularity__coupling__dependents: t("pages.componentsIndex.dependents"),
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
      evidence: t("pages.componentsIndex.hasNoAbstractTypes", { lang }),
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
  add("modularity__coupling__dependents", t("pages.componentsIndex.dependentsLabel"), n => formatNumber(n), t("pages.componentsIndex.dependentsHint"))
  add("modularity__coupling__dependencies", t("pages.componentsIndex.dependenciesLabel"), n => formatNumber(n), t("pages.componentsIndex.dependenciesHint"))
  add("modularity__coupling__afferent", t("pages.componentsIndex.importingFilesLabel"), n => formatNumber(n), t("pages.componentsIndex.importingFilesHint"))
  const lang = implicitLanguage.value
  add("modularity__abstractness", t("pages.componentsIndex.abstractnessLabel"), n => (lang ? t("pages.componentsIndex.notApplicable") : fixed(n, 2)), lang ? t("pages.componentsIndex.noAbstractTypes", { lang }) : types ? t("pages.componentsIndex.typesAbstract", { abstract: formatNumber(abstract ?? 0), types: formatNumber(types) }) : "")
  add("modularity__instability", t("pages.componentsIndex.instabilityLabel"), n => fixed(n, 2), t("pages.componentsIndex.instabilityHint"))
  add("modularity__distance_main_sequence", t("pages.componentsIndex.distanceLabel"), n => (lang ? t("pages.componentsIndex.notApplicable") : fixed(n, 2)), lang ? t("pages.componentsIndex.needsAbstractness") : t("pages.componentsIndex.distanceHint"))
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
  const tangle2 = position.value.tangle
  if (tangle2) {
    return t("pages.componentsIndex.sitsStronglyConnectedGroup", { group_size: formatNumber(Number(tangle2.group_size)) })
  }
  if (cyclesCount.value > 0) {
    return t("pages.componentsIndex.appearsDependency", { cyclesCount: formatNumber(cyclesCount.value), cycles: t("common.noun.cycle", { count: cyclesCount.value }) })
  }
  return t("pages.componentsIndex.noCycleRunsThrough")
})

const positionCells = computed(() => {
  const cells: Array<{ label: string; value: string; title: string }> = []
  const community = position.value.community
  if (community) {
    cells.push({
      label: t("pages.componentsIndex.community"),
      value: `${formatNumber(Number(community.community_size))} components`,
      title: t("pages.componentsIndex.communityComponentsClusters", { community_nr: community.community_nr }),
    })
  }
  cells.push({
    label: t("pages.componentsIndex.stronglyConnectedGroup"),
    value: position.value.tangle ? `${formatNumber(Number(position.value.tangle.group_size))} components` : "On its own",
    title: t("pages.componentsIndex.componentsCanAllReach"),
  })
  cells.push({
    label: t("pages.componentsIndex.cycles"),
    value: cyclesCount.value ? formatNumber(cyclesCount.value) : "None",
    title: t("pages.componentsIndex.shortestDependencyCyclesComponent"),
  })
  const furthest = position.value.furthest
  if (furthest) {
    cells.push({
      label: t("pages.componentsIndex.furthestReach"),
      value: `${formatNumber(hopsOf(furthest.furthest_component_shortest_path, furthest.furthest_component_distance))} hops`,
      title: t("pages.componentsIndex.componentFurthestAwayStill", { furthest_component: furthest.furthest_component }),
    })
  }
  return cells
})

// ── Why the health and hotspot read what they do ───────────────────
// A component's health is the line-weighted mean of its scored files; its
// hotspot is its hottest file's. Both say so under the strip, with the file.
const scoredFiles = computed(() => (loaded.value?.files ?? []).filter(f => f.codesmells__code_health !== null).length)
// The mean can hide one bad file among many good ones, so the worst is named beside it.
const leastHealthyFile = computed(() => {
  if (scoredFiles.value < 2) return null
  let worst: FileRow | null = null
  for (const f of loaded.value?.files ?? []) if (f.codesmells__code_health !== null && (!worst || Number(f.codesmells__code_health) < Number(worst.codesmells__code_health))) worst = f
  return worst
})
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
const ageLine = computed(() => t("pages.componentsIndex.linesFilesUnchangedMore", { over2: pctOf(age.value.over2), over1: pctOf(age.value.over1) }))
const ageTitle = computed(() => t("pages.componentsIndex.linesFilesUnchanged5", { over5: pctOf(age.value.over5), over2: pctOf(age.value.over2), over1: pctOf(age.value.over1) }))

// ── Leaning on something more volatile (stable dependencies) ───────
const stab = (n: string) => {
  const c: any = store.allComponentsIndex.get(n)
  const v = (k: string) => (c && c[k] !== null && c[k] !== undefined && Number.isFinite(Number(c[k])) ? Number(c[k]) : null)
  return { name: n, instability: v("modularity__instability"), afferent: v("modularity__coupling__afferent"), efferent: v("modularity__coupling__efferent") }
}
const dependencyRows = computed(() => [...new Set((store.componentConnections as any[]).filter(c => c.from === name.value && c.to !== name.value).map(c => c.to as string))].map(stab))
const leans = computed(() => {
  const members = new Set(position.value?.tangleMembers ?? [])
  return leansOnLessStable(stab(name.value), dependencyRows.value, n => (members.has(n) || (n === name.value && members.size) ? "tangle" : null))
})
const leansInTangle = computed(() => leans.value.filter(l => l.inTangle).length)
const leansOpen = ref(false)

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
  if (!mine.length && !outside) return (loaded.value?.files.length ?? 0) > 0 ? t("pages.componentsIndex.noTestFileHere") : ""
  const parts = [mine.length ? t("pages.componentsIndex.testsLinesHere", { lines: formatNumber(lines), files: t("common.count.file", { count: mine.length }) }) : t("pages.componentsIndex.noTestFilesHere")]
  parts.push(outside ? t("pages.componentsIndex.testElsewhereImport", { outside: formatNumber(outside), files: t("common.noun.file", { count: outside }), item: t("common.noun.s", { count: outside }) }) : t("pages.componentsIndex.noTestFileElsewhere"))
  return parts.join(" · ") + (store.rolesRecorded ? "." : t("pages.componentsIndex.testsFoundPathConvention"))
})
const testDependentsLine = computed(() => {
  const dependents = [...new Set(importers.value.map(i => i.from))]
  if (dependents.length === 0) return ""
  const roles = store.fileRoleIndex
  const files = store.componentFilesIndex
  const tests = dependents.filter(d => { const fs = files.get(d) ?? []; return fs.length > 0 && fs.every(f => roles.get(f) === "test") }).length
  return tests ? t("pages.componentsIndex.dependentsTestComponents", { tests: formatNumber(tests), dependentsLength: formatNumber(dependents.length) }) : ""
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
    // it, over file pairs with at least one file here (one row per pair).
    const mine = `SELECT name FROM files WHERE component = ${lit}`
    const cohesion = store.hasView("git_commits") && files.length > 1
      ? (await store.query<{ internal: number; external: number }>(`
          WITH touching AS (${fileCoChangeSql(sweepingLimit(store.snapshotInfo), mine)})
          SELECT
            COALESCE(SUM(CASE WHEN "from" IN (${mine}) AND "to" IN (${mine}) THEN shared END), 0) AS internal,
            COALESCE(SUM(CASE WHEN "from" IN (${mine}) AND "to" IN (${mine}) THEN NULL ELSE shared END), 0) AS external
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
  if (direct === 0) return t("pages.componentsIndex.nothingImportsSoChanging")
  const reached = loaded.value.reachedBy
  const importers = t("pages.componentsIndex.directly", { componentsImport: t("common.count.componentImports", { count: direct }) })
  if (reached > direct) return t("pages.componentsIndex.reachOnceIndirectPaths", { importers, reached: formatNumber(reached) })
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
    label: t("pages.componentsIndex.cycles"),
    value: formatNumber(ours),
    rank,
    percentile,
    definition: t("pages.componentsIndex.distinctDependencyCyclesComponent"),
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
  const of = t("pages.componentsIndex.componentsSnapshot", { total: formatNumber(total.value) })
  if (n <= 1) return t("pages.componentsIndex.onlyComponentReading")
  if (better === 0) return tied > 0 ? t("pages.componentsIndex.bestSnapshotShared", { others: t("common.count.other", { count: tied }) }) : t("pages.componentsIndex.bestSnapshot")
  if (worse === 0) return tied > 0 ? t("pages.componentsIndex.lowestSnapshotShared", { others: t("common.count.other", { count: tied }) }) : t("pages.componentsIndex.lowestSnapshot")
  return worse >= better
    ? t("pages.componentsIndex.betterThan", { value: Math.floor((worse / n) * 100), of })
    : t("pages.componentsIndex.worseThan", { value: Math.floor((better / n) * 100), of })
}

const standingLede = computed(() => {
  const health = raw("codesmells__code_health")
  if (health !== null) {
    return t("pages.componentsIndex.codeHealth2", { health: formatHealth(health), health2: healthStanding(health) })
  }
  const hotspot = raw("codesmells__hotspot_score")
  if (hotspot !== null) {
    const { rank } = rankOf(hotspot, sortedValues.value.get("codesmells__hotspot_score") ?? [])
    return t("pages.componentsIndex.hotspotScoreRanked", { hotspot: formatHotspot(hotspot), rank: formatNumber(rank), total: formatNumber(total.value) })
  }
  return t("pages.componentsIndex.rankedAgainstOtherComponents", { max: formatNumber(Math.max(total.value - 1, 0)) })
})

// ── Band 5: Composition ────────────────────────────────────────────
const directories = computed(() => new Set(loaded.value.files.map(f => f.directory).filter(Boolean)).size)

const compositionCells = computed(() => {
  const cells: Array<{ label: string; value: string; title: string }> = []
  const add = (labelText: string, value: string, title = "") => cells.push({ label: labelText, value, title })
  add(t("pages.componentsIndex.filesLabel"), formatNumber(raw("complexity__files") ?? loaded.value.files.length))
  add(t("pages.componentsIndex.linesLabel"), formatNumber(raw("complexity__lines") ?? 0))
  const types = raw("modularity__types__total")
  if (types !== null) {
    const abstract = raw("modularity__types__abstract") ?? 0
    add(t("pages.componentsIndex.typesLabel"), abstract ? t("pages.componentsIndex.typesWithAbstract", { types: formatNumber(types), abstract: formatNumber(abstract) }) : formatNumber(types), definitionOf("modularity__types__total"))
  }
  const methods = raw("java__method_declarations")
  if (methods) add(t("pages.componentsIndex.methodsLabel"), formatNumber(methods), definitionOf("java__method_declarations"))
  if (directories.value > 0) add(t("pages.componentsIndex.directoriesLabel"), formatNumber(directories.value), t("pages.componentsIndex.directoriesHint"))
  const indentation = raw("complexity__indentation__avg")
  if (indentation !== null) add(t("pages.componentsIndex.indentationLabel"), fixed(indentation, 2), definitionOf("complexity__indentation__avg"))
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
    { level: "good" as const, label: t("pages.componentsIndex.healthy") },
    { level: "warn" as const, label: t("pages.componentsIndex.watch") },
    { level: "bad" as const, label: t("pages.componentsIndex.alerting") },
  ]).filter(p => counts[p.level] > 0)
    .map(p => ({ ...p, count: counts[p.level], share: scored ? (counts[p.level] / scored) * 100 : 0 }))
  return { total: scored, parts }
})

const compositionLede = computed(() => {
  const files = raw("complexity__files") ?? loaded.value.files.length
  const lines = raw("complexity__lines") ?? 0
  const spread = directories.value > 1 ? t("pages.componentsIndex.acrossDirectories", { directories: formatNumber(directories.value) }) : ""
  const c = cohesion.value
  const cohesionText = c ? t("pages.componentsIndex.theirSharedCommitsStay", { percent: c.percent }) : ""
  return t("pages.componentsIndex.lines2", { files: t("common.count.file", { count: files }), lines: formatNumber(lines), spread, cohesionText })
})

// ── The reference dump, cleaned ────────────────────────────────────
const IDENTITY = new Set(["name", "report_id", "timestamp", "connections", "git__repository", "java_class", "java_full_class"])
const CORE_FAMILIES = new Set(["complexity", "codesmells", "modularity", "graph", "cycles", "git"])
const FAMILY_LABELS: Record<string, string> = {
  complexity: t("pages.componentsIndex.complexity"), codesmells: t("pages.componentsIndex.codeSmells"), modularity: t("pages.componentsIndex.modularity"), graph: t("pages.componentsIndex.graphCentrality"),
  cycles: t("pages.componentsIndex.cycles"), git: t("pages.componentsIndex.git"), java: t("pages.componentsIndex.java"), js: "JavaScript",
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
