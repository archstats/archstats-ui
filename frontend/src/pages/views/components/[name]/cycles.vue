<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <span class="ui-toolbar-meta flex items-center gap-1.5">
        <span>{{ t('pages.componentCycles.cycles') }} <span class="font-mono text-neutral-800">{{ formatNumber(selected.length) }}</span></span>
        <span class="text-neutral-300">·</span>
        <span>{{ t('pages.componentCycles.components') }} <span class="font-mono text-neutral-800">{{ formatNumber(participants.length) }}</span></span>
      </span>
      <button v-if="withComponent" type="button" class="ui-chip is-active font-mono" :title="t('pages.componentCycles.showingOnlyCyclesThese')" @click="setWith(null)">
        {{ t('pages.componentCycles.with', { withComponent: short(withComponent) }) }}<Icon icon="x" :size="11" class="ml-1 text-neutral-500"/>
      </button>
      <button v-if="selectedCut" type="button" class="ui-chip is-active font-mono" :title="t('pages.componentCycles.showingTangleImportRemoved')" @click="selectedIndex = null">
        {{ t('pages.componentCycles.cut', { from: short(selectedCut.from), to: short(selectedCut.to) }) }}<Icon icon="x" :size="11" class="ml-1 text-neutral-500"/>
      </button>
      <router-link :to="`/views/components/cycles?component=${encodeURIComponent(name)}`" class="ui-btn ui-btn-sm ml-auto">
        <Icon icon="route" :size="13" class="text-neutral-500"/><span>{{ t('pages.componentCycles.openCycles') }}</span>
      </router-link>
    </div>

    <EmptyState
      v-if="mine.length === 0"
      :title="t('pages.componentCycles.notPartAnyCycle')"
      :text="t('pages.componentCycles.doesNotAppearAny', { name: short(name) })"
      icon="route"
    />
    <div v-else class="min-h-0 grow overflow-y-auto">
      <p class="px-4 pt-3 text-base text-neutral-700">{{ lede }}</p>

      <!-- The tangle itself. Everything below is a way of reading it. -->
      <section class="px-4 pt-2">
        <CycleMap
          class="mx-auto max-w-[720px]"
          :centre="name"
          :centre-label="centreLabel"
          :nodes="mapNodes"
          :edges="mapEdges"
          :dimmed-edges="dimmedEdges"
          :dimmed-nodes="dimmedNodes"
          :cut-edge="selectedCut ? edgeKey(selectedCut.from, selectedCut.to) : null"
          :selected-node="withComponent || null"
          @select-cut="toggleCut"
          @select-node="toggleWith"
        />

        <p class="mx-auto max-w-[720px] px-1 text-sm text-neutral-600">
<I18nT k="pages.componentCycles.everyLineOneImport"><template #span><span class="text-accent-700">{{ t('pages.componentCycles.boldOnes') }}</span></template><template #selectedLength>{{ formatNumber(selected.length) }}</template><template #mapEdgesLength>{{ formatNumber(mapEdges.length) }}</template><template #centreLabel>{{ centreLabel }}</template><template #participantsLength>{{ formatNumber(participants.length) }}</template></I18nT> </p>

        <!-- A ring component, once chosen, says what can be done with it. -->
        <div v-if="withComponent" class="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 hairline">
          <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="withComponent">{{ short(withComponent) }}</span>
          <span class="shrink-0 text-sm text-neutral-500">{{ t('pages.componentCycles.sharesCycles', { selectedLength: formatNumber(selected.length), mineLength: formatNumber(mine.length) }) }}</span>
          <router-link :to="componentPath(withComponent)" class="ui-btn ui-btn-sm ml-auto shrink-0">
            <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/><span>{{ t('pages.componentCycles.open') }}</span>
          </router-link>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="setWith(null)">
            <Icon icon="x" :size="13" class="text-neutral-500"/><span>{{ t('pages.componentCycles.clear') }}</span>
          </button>
        </div>
      </section>

      <!-- Where to cut: the decision the map is arguing for. -->
      <section v-if="plan.length > 0" class="mt-5 px-4">
        <div class="flex items-baseline justify-between gap-4">
          <h3 class="ui-section-title">{{ t('pages.componentCycles.whereCut') }}</h3>
          <span class="text-sm text-neutral-500">{{ planLede }}</span>
        </div>
        <p class="mt-1.5 max-w-[92ch] text-sm text-neutral-500">
          {{ t('pages.componentCycles.cycleBreaksIfYou') }}
        </p>
        <p v-if="verdict" class="mt-1.5 max-w-[92ch] text-base" :class="completion.clear ? 'text-neutral-700' : 'text-amber-700'">{{ verdict }}</p>

        <!-- Column names, so no number on this page is unlabelled. -->
        <div class="mt-3 flex items-center gap-3 px-3 pb-1 text-xs text-neutral-500">
          <span class="w-4 shrink-0"></span>
          <span class="min-w-0 grow">{{ t('pages.componentCycles.importRemove') }}</span>
          <span class="hidden w-[150px] shrink-0 sm:block"></span>
          <span class="w-[104px] shrink-0 text-right">{{ t('pages.componentCycles.cyclesBreaks') }}</span>
          <span class="w-[150px] shrink-0 text-right">{{ t('pages.componentCycles.workRemove') }}</span>
          <span class="w-[76px] shrink-0 text-right">{{ t('pages.componentCycles.stillLooping') }}</span>
        </div>

        <ol class="overflow-hidden rounded-lg hairline">
          <li v-for="(step, i) in fullPlan" :key="`${step.from}-${step.to}`" class="hairline-b last:border-b-0">
            <div v-if="step.beyondListed && i === plan.length" class="bg-ground px-3 py-1.5 text-xs text-neutral-500 hairline-b">
              {{ t('pages.componentCycles.beyondListedCyclesEach') }}
            </div>
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-neutral-50"
              :class="{ 'bg-accent-50': selectedIndex === i }"
              :aria-pressed="selectedIndex === i"
              @click="toggleCut(i)"
            >
              <span class="w-4 shrink-0 text-right font-mono text-xs text-neutral-400">{{ i + 1 }}</span>
              <span class="flex min-w-0 grow items-center gap-2">
                <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="step.from">{{ short(step.from) }}</span>
                <span class="shrink-0 text-sm text-neutral-500">{{ t('pages.componentCycles.imports') }}</span>
                <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="step.to">{{ short(step.to) }}</span>
              </span>
              <span class="hidden w-[150px] shrink-0 items-center sm:flex">
                <span class="h-1 w-full overflow-hidden rounded-full bg-neutral-100">
                  <span class="block h-full rounded-full bg-accent-500" :style="{ width: `${Math.round((step.breaks / Math.max(1, selected.length)) * 100)}%` }"></span>
                </span>
              </span>
              <span
                class="w-[104px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500"
                :title="step.beyondListed ? t('pages.componentCycles.foundLoopComponentsSurvived', { loopSize: step.loopSize }) : t('pages.componentCycles.removingImportDestroysCycles', { breaks: step.breaks, selectedLength: selected.length })"
              >
                <template v-if="step.beyondListed">{{ t('pages.componentCycles.longLoop', { loopSize: step.loopSize }) }}</template>
                <template v-else><I18nT k="pages.componentCycles.of"><template #breaks><span class="text-neutral-800">{{ formatNumber(step.breaks) }}</span></template><template #selectedLength>{{ formatNumber(selected.length) }}</template></I18nT></template>
              </span>
              <span class="w-[150px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500" :title="costTitle(step)">
                {{ formatNumber(step.references) }} {{t('common.noun.ref', { count: step.references })}}<template v-if="step.sharedCommits">
                  · <span :class="entangled(step) ? 'text-amber-700' : ''">{{ t('pages.componentCycles.shared', { sharedCommits: formatNumber(step.sharedCommits) }) }}</span>
                </template>
              </span>
              <span class="w-[76px] shrink-0 text-right font-mono text-xs tabular-nums" :class="step.remaining === 0 && !step.beyondListed ? 'text-green-700' : 'text-neutral-400'">
                {{ step.beyondListed ? "—" : step.remaining === 0 ? "none" : formatNumber(step.remaining) }}
              </span>
            </button>

            <div v-if="selectedIndex === i" class="bg-ground px-3 py-3 hairline-t">
              <LoadingState v-if="cutFilesLoading" :text="t('pages.componentCycles.readingImports')"/>
              <template v-else>
                <p v-if="cutStory" class="mb-3 max-w-[80ch] text-base text-neutral-700">{{ cutStory }}</p>
                <div class="grid gap-x-8 gap-y-4 md:grid-cols-2">
                  <div v-if="cutDetail.symbols.length > 0" class="min-w-0">
                    <h4 class="ui-label">{{ t('pages.componentCycles.whatBreak') }}</h4>
                    <ul class="mt-1.5 flex flex-col">
                      <li v-for="sym in cutDetail.symbols" :key="sym.name" class="flex h-6 items-center gap-3">
                        <span class="min-w-0 truncate font-mono text-sm text-neutral-800" :title="sym.name">{{ sym.name }}</span>
                        <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ sym.files }} {{t('common.noun.file', { count: sym.files })}}</span>
                      </li>
                    </ul>
                  </div>
                  <div class="min-w-0">
                    <h4 class="ui-label">{{ t('pages.componentCycles.where') }}</h4>
                    <p v-if="cutDetail.sites.length === 0" class="mt-1.5 text-sm text-neutral-500">{{ t('pages.componentCycles.snapshotRecordsNoFile') }}</p>
                    <ul v-else class="mt-1.5 flex flex-col">
                      <li v-for="site in cutDetail.sites" :key="site.file" class="group flex h-6 items-center gap-3">
                        <router-link :to="`/views/files/${site.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="site.file">
                          {{ basename(site.file) }}<span v-if="site.line" class="text-neutral-500">:{{ site.line }}</span>
                          <span class="ml-1.5 text-xs text-neutral-400">{{ dirname(site.file) }}</span>
                        </router-link>
                        <OpenInEditor :file="site.file" :line="site.line || undefined" class="ml-auto opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"/>
                        <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(site.references) }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>
            </div>
          </li>
        </ol>
      </section>

      <!-- The cycles themselves, for when the picture is not enough. -->
      <details class="group mt-6 px-4 pb-8">
        <summary class="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
          <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform duration-200 group-open:rotate-90"/>
          <span>{{ t('pages.componentCycles.everyCycle') }}</span>
          <span class="font-mono text-xs text-neutral-400">{{ formatNumber(shown.length) }}</span>
        </summary>

        <div class="mt-3 flex h-8 items-center gap-3">
          <label class="flex items-center gap-1.5 text-sm text-neutral-700">
            <input v-model="shortestOnly" type="checkbox" class="ui-check"/>
            {{ t('pages.componentCycles.shortestOnly') }}
          </label>
          <div class="ui-segmented ml-auto" role="group" :aria-label="t('pages.componentCycles.sortCycles')">
            <button v-for="s in sorts" :key="s.id" type="button" :aria-pressed="sortBy === s.id" :title="s.title" @click="sortBy = s.id">{{ s.label }}</button>
          </div>
        </div>

        <EmptyState v-if="shown.length === 0" class="py-8" :title="t('pages.componentCycles.nothingMatches')" :text="t('pages.componentCycles.noCycleHereMatches')" icon="route"/>
        <table v-else class="ui-table mt-1">
          <thead>
            <tr>
              <th class="w-[48px]">{{ t('pages.componentCycles.size') }}</th>
              <th>{{ t('pages.componentCycles.through') }} <span class="normal-case text-neutral-400">{{ t('pages.componentCycles.back', { centreLabel }) }}</span></th>
              <th class="w-[124px] text-right">{{ t('pages.componentCycles.sharedCommits') }}</th>
              <th class="w-[96px] text-right" :title="severityTitle">{{ t('pages.componentCycles.severity') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cycle in shown" :key="cycle.id">
              <td class="is-num">{{ cycle.size }}</td>
              <td class="max-w-0">
                <span class="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                  <span v-if="cycle.through.length === 1" class="ui-tag shrink-0" :title="t('pages.componentCycles.theseTwoImportEach')">{{ t('pages.componentCycles.mutual') }}</span>
                  <template v-for="(node, i) in cycle.through" :key="`${cycle.id}-${i}`">
                    <Icon v-if="i !== 0" icon="chevron-right" :size="12" class="shrink-0 text-neutral-300"/>
                    <button
                      type="button"
                      class="font-mono text-sm transition-colors hover:text-neutral-900"
                      :class="node === withComponent ? 'text-accent-700' : 'text-neutral-800'"
                      :title="t('pages.componentCycles.showOnlyCyclesThese', { node })"
                      @click="toggleWith(node)"
                    >{{ short(node) }}</button>
                  </template>
                </span>
              </td>
              <td class="is-num text-right">{{ cycle.sharedCommits ? formatNumber(cycle.sharedCommits) : "—" }}</td>
              <td class="is-num text-right text-neutral-500">{{ formatNumber(cycle.severity) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import { TRUSTED_PAIR_SQL } from "~/features/git/cochange"
import { componentPath } from "~/features/navigation/routes"
// A component's cycles, drawn rather than listed.
//
// Every cycle leaves this component and returns to it, so the map puts it in
// the middle and rings it with everything its loops pass through. The cut
// plan is the argument the map is making; the table is the evidence, folded
// away until someone wants it.
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { formatNumber } from "~/shared/format"
import { sqlIn, sqlLiteral } from "~/shared/sql"
import { detectSeparator } from "~/features/snapshot/names"
import { segmentPrefix } from "~/features/connections/neighbours"
import { cutPlan, cycleCountsByComponent, edgeKey, edgesOf, extendCutPlan, lineOf, participantsOf, pathWithout, symbolOwner, type CutStep, type CyclePath, type Digraph } from "~/features/cycles/cycles"
import CycleMap, { type MapEdge, type MapNode } from "~/features/cycles/components/CycleMap.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

type SortKey = "severity" | "size" | "sharedCommits"

const route = useRoute()
const router = useRouter()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

const separator = computed(() => detectSeparator(store.allComponents.map((c: any) => c.name)))
const sharedPrefix = computed(() => segmentPrefix(store.getProjectPrefixIfAny, separator.value))
function short(componentName: string): string {
  const prefix = sharedPrefix.value
  if (!prefix || !componentName.startsWith(prefix)) return componentName
  return componentName.slice(prefix.length) || componentName
}
/** Short enough for the middle of the map. */
const centreLabel = computed(() => {
  const label = short(name.value)
  if (!separator.value) return label
  const parts = label.split(separator.value).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : label
})

// ── Filters, both of which the map drives ──────────────────────────
const withComponent = computed(() => String(route.query.with ?? ""))
function setWith(other: string | null) {
  const query = { ...route.query }
  if (other) query.with = other; else delete query.with
  void router.replace({ query })
}
const toggleWith = (other: string) => setWith(other === withComponent.value ? null : other)

const shortestOnly = ref(false)
const sortBy = ref<SortKey>("severity")
const selectedIndex = ref<number | null>(null)
watch([name, withComponent], () => { shortestOnly.value = false; selectedIndex.value = null })

const sorts: Array<{ id: SortKey; label: string; title: string }> = [
  { id: "severity", label: t("pages.componentCycles.severity"), title: t("pages.componentCycles.lengthSharedCommitsAverage") },
  { id: "size", label: t("pages.componentCycles.size"), title: t("pages.componentCycles.howManyComponentsCycle") },
  { id: "sharedCommits", label: t("pages.componentCycles.sharedCommits"), title: t("pages.componentCycles.commitsTouchedEveryComponent") },
]
const severityTitle = t("pages.componentCycles.readingViewNotEngine")

// ── The cycles ─────────────────────────────────────────────────────
const mine = computed<CyclePath[]>(() =>
  (store.allCyclesExpanded as CyclePath[]).filter(c => c.nodes.includes(name.value)))

const selected = computed<CyclePath[]>(() =>
  withComponent.value ? mine.value.filter(c => c.nodes.includes(withComponent.value)) : mine.value)

const participants = computed(() => participantsOf(selected.value, name.value))

// ── The cut plan ───────────────────────────────────────────────────
const referenceIndex = computed(() => {
  const refs = new Map<string, number>()
  for (const c of store.componentConnections as any[]) {
    const key = edgeKey(c.from, c.to)
    refs.set(key, (refs.get(key) ?? 0) + (Number(c.reference_count) || 0))
  }
  return refs
})

const { data: coChange } = useAsyncQuery<Map<string, number>>(
  async () => {
    const names = [name.value, ...participants.value.map(p => p.name)]
    if (names.length < 2 || !store.hasView("git_component_shared_commits")) return new Map()
    const rows = await store.query<{ pair_1: string; pair_2: string; shared_commits: number }>(`
      SELECT pair_1, pair_2, shared_commits FROM git_component_shared_commits
      WHERE pair_1 IN ${sqlIn(names)} AND pair_2 IN ${sqlIn(names)} AND ${TRUSTED_PAIR_SQL}`)
    const out = new Map<string, number>()
    for (const r of rows) {
      const n = Number(r.shared_commits) || 0
      out.set(edgeKey(r.pair_1, r.pair_2), n)
      out.set(edgeKey(r.pair_2, r.pair_1), n)
    }
    return out
  },
  [participants],
  { initial: new Map() },
)

const plan = computed(() => cutPlan(selected.value, {
  references: (from, to) => referenceIndex.value.get(edgeKey(from, to)) ?? 0,
  sharedCommits: (from, to) => coChange.value.get(edgeKey(from, to)) ?? null,
}))

// The snapshot lists only the SHORTEST cycles, so breaking all of them can
// still leave a longer loop standing — measured, it usually does. Check the
// real dependency graph and keep cutting until it is clear.
const digraph = computed<Digraph>(() => {
  const out = new Map<string, Set<string>>()
  for (const c of store.componentConnections as any[]) {
    if (!c.from || !c.to || c.from === c.to) continue
    const tos = out.get(c.from) ?? new Set<string>()
    tos.add(c.to)
    out.set(c.from, tos)
  }
  return out
})

const completion = computed(() => {
  if (withComponent.value || plan.value.length === 0) return { extra: [] as CutStep[], clear: false, checked: false }
  const { extra, clear } = extendCutPlan(digraph.value, name.value, plan.value, {
    references: (from, to) => referenceIndex.value.get(edgeKey(from, to)) ?? 0,
    sharedCommits: (from, to) => coChange.value.get(edgeKey(from, to)) ?? null,
  })
  return { extra, clear, checked: true }
})

const fullPlan = computed(() => [...plan.value, ...completion.value.extra])

const verdict = computed(() => {
  const { extra, clear, checked } = completion.value
  if (!checked) return ""
  if (clear && extra.length === 0) {
    return t("pages.componentCycles.checkedAgainstFullDependency", { planLength: formatNumber(plan.value.length), centreLabel: centreLabel.value })
  }
  if (clear) {
    return t("pages.componentCycles.thoseBreakEveryCycle", { extraLength: formatNumber(extra.length), cuts: t("common.noun.cut", { count: extra.length }) })
  }
  return t("pages.componentCycles.thoseBreakEveryCycle2", { extraLength: formatNumber(extra.length) })
})

const selectedCut = computed(() => (selectedIndex.value === null ? null : fullPlan.value[selectedIndex.value] ?? null))
function toggleCut(i: number) {
  selectedIndex.value = selectedIndex.value === i ? null : i
}

// ── The map ────────────────────────────────────────────────────────
const cutIndexByEdge = computed(() => {
  const map = new Map<string, number>()
  fullPlan.value.forEach((step, i) => map.set(edgeKey(step.from, step.to), i))
  return map
})

function tailOf(componentName: string, segments: number): string {
  const label = short(componentName)
  if (!separator.value) return label
  const parts = label.split(separator.value).filter(Boolean)
  return parts.slice(-segments).join(separator.value)
}

/** The shortest tail that tells the ring's components apart, then elided. */
function ringLabels(names: string[]): Map<string, string> {
  const labels = new Map<string, string>()
  let depth = 2
  let left = names
  while (left.length > 0 && depth <= 5) {
    const at = new Map<string, string[]>()
    for (const componentName of left) {
      const tail = tailOf(componentName, depth)
      at.set(tail, [...(at.get(tail) ?? []), componentName])
    }
    const still: string[] = []
    for (const [tail, owners] of at) {
      if (owners.length === 1) labels.set(owners[0], tail)
      else still.push(...owners)
    }
    left = still
    depth++
  }
  for (const componentName of left) labels.set(componentName, short(componentName))
  for (const [componentName, label] of labels) {
    if (label.length > 20) labels.set(componentName, `…${label.slice(-19)}`)
  }
  return labels
}

const mapNodes = computed<MapNode[]>(() => {
  const labels = ringLabels(participants.value.map(p => p.name))
  return participants.value.map(p => ({ name: p.name, label: labels.get(p.name) ?? short(p.name), cycles: p.count }))
})

const mapEdges = computed<MapEdge[]>(() => {
  const counts = new Map<string, { from: string; to: string; cycles: number }>()
  for (const cycle of selected.value) {
    for (const { from, to } of edgesOf(cycle.nodes)) {
      const key = edgeKey(from, to)
      const seen = counts.get(key)
      if (seen) seen.cycles++
      else counts.set(key, { from, to, cycles: 1 })
    }
  }
  return Array.from(counts.values()).map(e => {
    const cut = cutIndexByEdge.value.get(edgeKey(e.from, e.to)) ?? null
    return { ...e, cut, breaks: cut === null ? undefined : fullPlan.value[cut].breaks || undefined }
  })
})

/** What is left standing once the chosen cut is made. */
const surviving = computed<CyclePath[]>(() => {
  const cut = selectedCut.value
  if (!cut) return selected.value
  const gone = new Set(cut.cycleIds)
  return selected.value.filter(c => !gone.has(c.id))
})

const aliveEdges = computed(() => {
  const alive = new Set<string>()
  for (const cycle of surviving.value) {
    for (const { from, to } of edgesOf(cycle.nodes)) alive.add(edgeKey(from, to))
  }
  return alive
})

const dimmedEdges = computed(() => {
  if (!selectedCut.value) return new Set<string>()
  return new Set(mapEdges.value.map(e => edgeKey(e.from, e.to)).filter(k => !aliveEdges.value.has(k)))
})

const dimmedNodes = computed(() => {
  if (!selectedCut.value) return new Set<string>()
  const alive = new Set(surviving.value.flatMap(c => c.nodes))
  return new Set(mapNodes.value.map(n => n.name).filter(n => !alive.has(n)))
})

// ── What a cut means in the code ───────────────────────────────────
interface CutDetail {
  symbols: Array<{ name: string; files: number }>
  sites: Array<{ file: string; line: number | null; references: number }>
}
const EMPTY_DETAIL: CutDetail = { symbols: [], sites: [] }
const componentNames = computed(() => new Set(store.allComponents.map((c: any) => c.name as string)))

const { data: cutDetail, loading: cutFilesLoading } = useAsyncQuery<CutDetail>(
  async () => {
    const cut = selectedCut.value
    if (!cut) return EMPTY_DETAIL

    const files = await store.query<{ file: string; references: number }>(`
      SELECT file, SUM(reference_count) AS "references"
      FROM ${store.runtimeComponentEdges}
      WHERE "from" = ${sqlLiteral(cut.from)} AND "to" = ${sqlLiteral(cut.to)}
      GROUP BY file ORDER BY "references" DESC LIMIT 40`)
    if (files.length === 0 || !store.hasView("snippets")) {
      return { symbols: [], sites: files.map(f => ({ file: f.file, line: null, references: Number(f.references) || 0 })) }
    }

    const snippets = await store.query<{ file: string; content: string; snippet_type: string; begin_position: string }>(`
      SELECT file, content, snippet_type, begin_position FROM snippets
      WHERE file IN ${sqlIn(files.map(f => f.file))} AND snippet_type LIKE '%import%'`)

    const lines = new Map<string, number>()
    const symbolFiles = new Map<string, Set<string>>()
    for (const row of snippets) {
      if (row.snippet_type === "modularity__component__imports") {
        if (row.content !== cut.to) continue
        const line = lineOf(row.begin_position)
        if (line !== null && !lines.has(row.file)) lines.set(row.file, line)
        continue
      }
      if (symbolOwner(row.content, componentNames.value, separator.value) !== cut.to) continue
      const seen = symbolFiles.get(row.content) ?? new Set<string>()
      seen.add(row.file)
      symbolFiles.set(row.content, seen)
      const line = lineOf(row.begin_position)
      if (line !== null && !lines.has(row.file)) lines.set(row.file, line)
    }

    return {
      symbols: Array.from(symbolFiles, ([symbol, seen]) => ({ name: symbol, files: seen.size }))
        .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)),
      sites: files.map(f => ({ file: f.file, line: lines.get(f.file) ?? null, references: Number(f.references) || 0 })),
    }
  },
  [selectedCut],
  { initial: EMPTY_DETAIL },
)

const ownCommits = computed(() => {
  const c: any = store.allComponentsIndex.get(name.value)
  const n = Number(c?.git__commits__total)
  return Number.isFinite(n) && n > 0 ? n : null
})
function coChangeShare(step: CutStep): number | null {
  if (!step.sharedCommits || !ownCommits.value) return null
  return Math.min(1, step.sharedCommits / ownCommits.value)
}
const entangled = (step: CutStep) => (coChangeShare(step) ?? 0) >= 0.75
function costTitle(step: CutStep): string {
  const refs = t("pages.componentCycles.importRemove2", { references: step.references, references2: t("common.noun.reference", { count: step.references }) })
  const share = coChangeShare(step)
  if (share === null) return refs
  return t("pages.componentCycles.commitsTouchedBothComponent", { refs, sharedCommits: step.sharedCommits, value: Math.round(share * 100) })
}

const cutStory = computed(() => {
  const cut = selectedCut.value
  if (!cut) return ""
  const symbols = cutDetail.value.symbols
  const files = cutDetail.value.sites.length
  const importers = `${files} ${files === 1 ? t("pages.componentCycles.fileImports") : t("pages.componentCycles.filesImport")}`
  const what = symbols.length === 1
    ? t("pages.componentCycles.oneName", { importers, to: short(cut.to), name: symbols[0].name })
    : symbols.length > 1
      ? t("pages.componentCycles.names", { importers, symbolsLength: symbols.length, to: short(cut.to) })
      : `${importers} ${short(cut.to)}.`
  const share = coChangeShare(cut)
  const together = share !== null && share >= 0.75
    ? t("pages.componentCycles.twoHaveBarelyChanged", { sharedCommits: cut.sharedCommits, ownCommits: ownCommits.value })
    : ""
  return `${what}${together}`
})

// ── The list ───────────────────────────────────────────────────────
const smallest = computed(() => selected.value.reduce((min, c) => Math.min(min, c.size), Infinity))

const shown = computed(() => {
  let list = selected.value
  if (selectedCut.value) {
    const ids = new Set(selectedCut.value.cycleIds)
    list = list.filter(c => ids.has(c.id))
  }
  if (shortestOnly.value) list = list.filter(c => c.size === smallest.value)
  return [...list]
    .sort((a, b) => {
      if (sortBy.value === "size") return a.size - b.size || b.severity - a.severity
      if (sortBy.value === "sharedCommits") return b.sharedCommits - a.sharedCommits || b.severity - a.severity
      return b.severity - a.severity
    })
    .map(c => ({ ...c, through: pathWithout(c.nodes, name.value) }))
})

// ── The readings, now that the map carries the shape ───────────────
const calibration = computed(() => {
  const counts = cycleCountsByComponent(store.allCyclesExpanded as CyclePath[])
  const total = store.allComponents.length
  if (total < 10) return ""
  const ours = counts.get(name.value) ?? 0
  if (ours <= 0) return ""
  let above = 0, atLeast = 0
  for (const n of counts.values()) { if (n > ours) above++; if (n >= ours) atLeast++ }
  if (above === 0) return atLeast > 1 ? t("pages.componentCycles.tiedMostTangledComponent") : t("pages.componentCycles.mostTangledComponentSnapshot")
  // Strictly less tangled, components in no cycle included; never "100%",
  // which would count this component against itself.
  const percentile = Math.min(99, Math.floor(((total - atLeast) / total) * 100))
  return percentile >= 50 ? t("pages.componentCycles.moreTangledThanCodebase", { percentile }) : ""
})

const lede = computed(() => {
  const n = selected.value.length
  if (n === 0) return ""
  if (withComponent.value) {
    return t("pages.componentCycles.cyclesAlsoRunThrough", { n: formatNumber(n), mineLength: formatNumber(mine.value.length), withComponent: short(withComponent.value) })
  }
  const sizes = selected.value.map(c => c.size)
  const span = Math.min(...sizes) === Math.max(...sizes) ? t("pages.componentCycles.componentsLong", { value: Math.min(...sizes) }) : t("pages.componentCycles.componentsLong2", { value: Math.min(...sizes), value2: Math.max(...sizes) })
  return t("pages.componentCycles.throughOther", { cycles: t("common.count.cycle", { count: n }), participantsLength: formatNumber(participants.value.length), components: t("common.noun.component", { count: participants.value.length }), span, calibration: calibration.value })
})

const planLede = computed(() => {
  const total = selected.value.length
  if (plan.value.length === 0 || total === 0) return ""
  let covered = 0, taken = 0
  for (const step of plan.value) {
    covered += step.breaks
    taken++
    if (covered >= total * 0.8) break
  }
  // The head of the plan, said as the head: "removing 3 imports destroys 53 of
  // the 66" beside "those break every cycle listed" read as two answers.
  const all = plan.value.length
  if (taken >= all) return t("pages.componentCycles.all", { all: formatNumber(all), value: all === 1 ? t("pages.componentCycles.importBreaks") : t("pages.componentCycles.importsBreak"), total: formatNumber(total) })
  return t("pages.componentCycles.firstBreakAllBreak", { taken: formatNumber(taken), covered: formatNumber(covered), total: formatNumber(total), all: formatNumber(all) })
})

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}
function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}
</script>
