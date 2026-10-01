<template>
  <div class="flex min-h-0 grow flex-col">
    <LoadingState v-if="loading && !commits.length" text="Counting the components each commit touched…"/>
    <EmptyState v-else-if="error" title="Could not read the history" :text="error" icon="alert"/>
    <EmptyState v-else-if="!counted.length" title="No commits to count" :text="`No commit touches a component${scoped ? ' in scope' : ''} in this snapshot.`" icon="git-branch"/>
    <div v-else class="min-h-0 grow overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 pb-12 pt-5">
        <p class="max-w-[76ch] text-lg leading-7 text-neutral-900">
          <template v-if="cmp.recent.commits >= 10 && cmp.before.commits >= 10">
            In the last year, <strong class="font-semibold">{{ pct(cmp.recent.wider) }}</strong> of commits touched four or more components,
            against {{ pct(cmp.before.wider) }} in the three years before{{ trendWords }}.
            {{ pct(cmp.recent.wide) }} touched more than one ({{ pct(cmp.before.wide) }} before).
          </template>
          <template v-else-if="cmp.recent.commits >= 10">
            In the last year, <strong class="font-semibold">{{ pct(cmp.recent.wider) }}</strong> of {{ formatNumber(cmp.recent.commits, 0) }} commits touched four or more components, and {{ pct(cmp.recent.wide) }} more than one.
          </template>
          <template v-else>
            Across the whole history, <strong class="font-semibold">{{ pct(all.wider) }}</strong> of {{ formatNumber(counted.length, 0) }} commits touched four or more components, and {{ pct(all.wide) }} more than one. The last year has too few commits to compare.
          </template>
        </p>

        <section class="flex flex-col gap-2">
          <ExhibitFrame :exhibit="figure" :title="`Components touched per commit, by ${unit}`">
            <template #aside>
              <span :title="`Commits touching more than ${SWEEP_FILES} files are renames, reformats and imports`">
                {{ sweeping ? `${formatNumber(sweeping, 0)} sweeping commits and all merges left out` : "Merges left out" }}
              </span>
            </template>
            <div ref="hostRef" class="relative w-full" :style="{ height: `${H}px` }" @mouseleave="hover = null">
              <svg v-if="width > 0" ref="svgRef" :width="width" :height="H" :viewBox="`0 0 ${width} ${H}`" class="block" role="img" aria-label="Share of commits by the number of components they touched, per period">
                <g :font-family="t.fontMono" font-size="10" :fill="t.inkSecondary">
                  <g v-for="v in [0, 0.25, 0.5, 0.75, 1]" :key="v">
                    <line :x1="M.left" :x2="width - M.right" :y1="yy(v)" :y2="yy(v)" :stroke="t.hairline"/>
                    <text :x="M.left - 6" :y="yy(v) + 3" text-anchor="end">{{ Math.round(v * 100) }}%</text>
                  </g>
                </g>
                <g v-for="(p, i) in periods" :key="p.key" :opacity="p.commits < THIN ? 0.4 : 1" @mouseenter="hover = i">
                  <rect :x="bx(i) - gap / 2" :y="M.top" :width="bw + gap" :height="innerH" fill="transparent"/>
                  <template v-if="p.commits">
                    <rect v-for="s in stack(p)" :key="s.i" :x="bx(i)" :y="s.y" :width="bw" :height="s.h" :fill="bandColor(s.i)"/>
                  </template>
                  <text v-if="showLabel(i)" :x="bx(i) + bw / 2" :y="M.top + innerH + 14" text-anchor="middle" :fill="t.inkSecondary" font-size="10" :font-family="t.fontMono">{{ p.label }}</text>
                  <text v-if="showLabel(i) && bw >= 18" :x="bx(i) + bw / 2" :y="M.top + innerH + 27" text-anchor="middle" :fill="t.inkMuted" font-size="10" :font-family="t.fontMono">{{ compact(p.commits) }}</text>
                </g>
                <!-- The share touching four or more, as a line over the columns. -->
                <path :d="widerPath" fill="none" :stroke="t.ink" stroke-width="1.5" stroke-linejoin="round"/>
                <circle v-for="(p, i) in periods" v-show="p.commits >= THIN" :key="`d${p.key}`" :cx="bx(i) + bw / 2" :cy="yy(p.wider)" r="2.5" :fill="t.ink"/>
                <rect v-if="hover !== null" :x="bx(hover) - 1" :y="M.top - 1" :width="bw + 2" :height="innerH + 2" fill="none" :stroke="t.ink" stroke-width="1"/>
              </svg>
              <div v-if="hover !== null && periods[hover]" class="ui-popover pointer-events-none absolute z-10 flex w-[220px] flex-col gap-1 px-3 py-2"
                   :style="{ left: `${Math.min(bx(hover) + bw + 8, width - 228)}px`, top: '8px' }">
                <span class="text-sm font-medium text-neutral-900">{{ periods[hover].label }} · {{ formatNumber(periods[hover].commits, 0) }} commits</span>
                <span v-for="(b, i) in BANDS" :key="b.id" class="flex items-center gap-2 text-sm text-neutral-600">
                  <span class="h-2 w-2 rounded-sm" :style="{ background: bandColor(i) }"></span>
                  <span class="flex-1">{{ b.label }}</span>
                  <span class="font-mono tabular-nums">{{ periods[hover].commits ? pct(periods[hover].bands[i] / periods[hover].commits) : "—" }}</span>
                </span>
                <span v-if="periods[hover].commits < THIN" class="text-xs text-neutral-500">Few commits: read with care.</span>
              </div>
            </div>
          </ExhibitFrame>
          <p class="text-sm text-neutral-500">
            Each column is one {{ unit }}'s commits, split by how many of today's components they touched; the number under it is how many commits it holds.
            The line is the share that touched four or more, read from the bottom. Faded columns hold fewer than {{ THIN }} commits.
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <ExhibitFrame :exhibit="aloneTable">
            <template #controls>
              <div class="ui-segmented" role="group" aria-label="Window">
                <button v-for="w in ALONE_WINDOWS" :key="w.id" type="button" :aria-pressed="aloneId === w.id" :title="anchorLabel(w.days)" @click="aloneId = w.id">{{ w.label }}</button>
              </div>
            </template>
            <template #aside>Components whose commits most often changed others too</template>
            <LoadingState v-if="aloneLoading && !alone.length" text="Pairing commits…"/>
            <p v-else-if="!aloneRows.length" class="text-sm text-neutral-500">No component had two or more commits in this window.</p>
            <table v-else class="ui-table">
              <thead>
                <tr>
                  <th class="w-8"><Checkbox :model-value="allSelected" aria-label="Select all listed" @update:model-value="toggleAll"/></th>
                  <th v-for="c in COLUMNS" :key="c.key" :class="[c.right ? 'text-right' : '', c.width, 'cursor-pointer select-none']" :title="c.title" :aria-sort="sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'" @click="sortBy(c.key)">
                    {{ c.label }}<span v-if="sortKey === c.key" class="ml-1 text-neutral-400">{{ sortDir === 1 ? "↑" : "↓" }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in aloneVisible" :key="r.component" class="is-clickable" tabindex="0" @click="toggle(r.component)" @keydown.enter.prevent="router.push(componentPath(r.component))">
                  <td @click.stop><Checkbox :model-value="selected.has(r.component)" :aria-label="`Select ${r.component}`" @update:model-value="toggle(r.component)"/></td>
                  <td class="max-w-0">
                    <router-link :to="componentPath(r.component)" class="block truncate font-mono text-sm text-neutral-800 hover:underline" :title="r.component" @click.stop>{{ label(r.component) }}</router-link>
                  </td>
                  <td class="is-num text-right">{{ formatNumber(r.commits, 0) }}</td>
                  <td class="is-num text-right">{{ formatNumber(r.commits - r.alone, 0) }}</td>
                  <td>
                    <span class="flex items-center gap-2" :title="`${formatNumber(r.alone, 0)} of ${formatNumber(r.commits, 0)} commits changed only this component`">
                      <span class="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-200">
                        <span class="block h-full bg-neutral-500" :style="{ width: `${(r.alone / r.commits) * 100}%` }"></span>
                      </span>
                      <span class="w-9 text-right font-mono text-sm tabular-nums text-neutral-700">{{ pct(r.alone / r.commits) }}</span>
                    </span>
                  </td>
                  <td class="is-num text-right">{{ formatNumber(r.partners, 0) }}</td>
                  <td class="max-w-0">
                    <span v-if="r.partner" class="flex items-center gap-2">
                      <router-link :to="componentPath(r.partner)" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-700 hover:underline" :title="r.partner" @click.stop>{{ label(r.partner) }}</router-link>
                      <span class="shrink-0 font-mono text-sm tabular-nums text-neutral-500" :title="`${r.partnerCommits} commits changed both`">{{ formatNumber(r.partnerCommits, 0) }}×</span>
                    </span>
                    <span v-else class="text-neutral-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </ExhibitFrame>
          <button v-if="aloneRows.length > aloneVisible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet self-start" @click="aloneLimit += 100">Show {{ formatNumber(Math.min(100, aloneRows.length - aloneVisible.length), 0) }} more</button>
        </section>
      </div>
    </div>
    <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :universe="aloneRows.map(r => r.component)" :show-in-except="[]"
                    @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useRouter } from "vue-router"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import { scopeWhere } from "~/features/groups/scopeSql"
import { useSvgFigure, useTable } from "~/features/export/useExportables"
import { componentLabel, componentPath } from "~/features/navigation/routes"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useStateStore } from "~/platform/state.store"
import Checkbox from "~/shared/ui/Checkbox.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { formatNumber } from "~/shared/format"
import { chartTheme, useChartTheme, withAlpha } from "~/shared/ui/useChartTheme"
import { useAuthorsStore } from "../authors.store"
import { BANDS, SWEEP_FILES, shortTails, breadthCompare, breadthPeriods, changesAlone, commitBreadthSql, commitComponentsSql, type AloneRow, type BreadthPeriod, type CommitBreadth } from "../changeShape"
import { anchorLabel, anchorSql, historyAnchor } from "../history"

const data = useDataStore()
const authors = useAuthorsStore()
const state = useStateStore()
const workspaces = useWorkspacesStore()
const router = useRouter()
const scoped = computed(() => !!scopeWhere())
const pct = (v: number) => `${Math.round(v * 100)}%`
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

// ── Commits over time ───────────────────────────────────────────────────
const { data: commits, loading, error } = useAsyncQuery<CommitBreadth[]>(
  () => (data.hasView("git_commits") ? data.query<CommitBreadth>(commitBreadthSql({ includeBots: authors.showBots, where: scopeWhere("c.file") })) : Promise.resolve([])),
  [() => authors.showBots, () => scopeWhere("c.file")],
  { initial: [] },
)
const counted = computed(() => commits.value.map(c => ({ ...c, n: Number(c.n), files: Number(c.files) })).filter(c => c.files <= SWEEP_FILES))
const sweeping = computed(() => commits.value.length - counted.value.length)
const built = computed(() => breadthPeriods(counted.value))
const periods = computed<BreadthPeriod[]>(() => built.value.periods)
const unit = computed(() => built.value.unit)
const cmp = computed(() => { void data.datasetKey; return breadthCompare(counted.value, historyAnchor().date) })
const all = computed(() => {
  const n = counted.value.length || 1
  return { wide: counted.value.filter(c => c.n > 1).length / n, wider: counted.value.filter(c => c.n >= 4).length / n }
})
const trendWords = computed(() => {
  const d = cmp.value.recent.wider - cmp.value.before.wider
  if (Math.abs(d) < 0.02) return ", about the same"
  return d > 0 ? ": changes are getting wider" : ": changes are getting narrower"
})

// ── Chart geometry ──────────────────────────────────────────────────────
const { version } = useChartTheme()
const t = computed(() => { void version.value; return chartTheme() })
const THIN = 20
const H = 280
const M = { top: 8, right: 8, bottom: 34, left: 40 }
const innerH = H - M.top - M.bottom
const hostRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const width = ref(0)
const hover = ref<number | null>(null)
const slot = computed(() => (width.value - M.left - M.right) / Math.max(1, periods.value.length))
const gap = computed(() => Math.min(8, Math.max(1, slot.value * 0.2)))
const bw = computed(() => Math.max(1, slot.value - gap.value))
const bx = (i: number) => M.left + i * slot.value + gap.value / 2
const yy = (v: number) => M.top + (1 - v) * innerH
function bandColor(i: number): string {
  const c = t.value
  return [c.hairline, withAlpha(c.blue, 0.35), withAlpha(c.blue, 0.7), c.violet][i]
}
// One band per slice, the widest commits at the bottom, so the share that
// touched four or more stands on the axis and its line reads from zero.
function stack(p: BreadthPeriod) {
  let acc = 0
  return p.bands.map((n, i) => ({ n, i })).reverse().map(({ n, i }) => {
    const share = n / p.commits
    const s = { i, y: yy(acc + share), h: share * innerH }
    acc += share
    return s
  })
}
const widerPath = computed(() => {
  let d = "", pen = false
  periods.value.forEach((p, i) => {
    if (p.commits < THIN) { pen = false; return }
    d += `${pen ? "L" : "M"}${bx(i) + bw.value / 2},${yy(p.wider)}`
    pen = true
  })
  return d
})
const labelEvery = computed(() => Math.max(1, Math.ceil(44 / Math.max(1, slot.value))))
const showLabel = (i: number) => (periods.value.length - 1 - i) % labelEvery.value === 0

let ro: ResizeObserver | null = null
watch(hostRef, el => {
  ro?.disconnect()
  if (!el) return
  ro = new ResizeObserver(([e]) => { width.value = Math.floor(e.contentRect.width) })
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())
const figure = useSvgFigure({
  title: "Components touched per commit",
  svg: () => svgRef.value,
  // Top band first, the order they stack in.
  legend: () => ({
    items: [
      ...BANDS.map((b, i) => ({ label: b.label, color: bandColor(i) })).reverse(),
      { label: "Share touching four or more", color: t.value.ink, mark: "line" as const },
    ],
    notes: [`A column per ${unit.value}, each the share of its commits; faded columns have few commits.`],
  }),
})

// ── What rarely changes alone ───────────────────────────────────────────
const ALONE_WINDOWS = [
  { id: "180", label: "180 d", days: 180 as number | null },
  { id: "365", label: "1 y", days: 365 as number | null },
  { id: "all", label: "All", days: null as number | null },
] as const
const aloneId = computed<string>({
  get: () => { const v = state.get<string>("activity.alone", "365"); return ALONE_WINDOWS.some(w => w.id === v) ? v : "365" },
  set: v => state.set("activity.alone", v === "365" ? null : v),
})
const aloneDays = computed(() => ALONE_WINDOWS.find(w => w.id === aloneId.value)!.days)
const { data: pairs, loading: aloneLoading } = useAsyncQuery<Array<{ h: string; component: string; files: number }>>(
  () => (data.hasView("git_commits")
    ? data.query(commitComponentsSql({ days: aloneDays.value, anchor: anchorSql(), includeBots: authors.showBots, where: scopeWhere("c.file") }))
    : Promise.resolve([])),
  [aloneDays, () => authors.showBots, () => scopeWhere("c.file")],
  { initial: [] },
)
const alone = computed<AloneRow[]>(() => {
  // Sweeping commits are left out here too: a reformat changes everything together.
  const files = new Map<string, number>()
  for (const p of pairs.value) files.set(p.h, (files.get(p.h) ?? 0) + (Number(p.files) || 0))
  return changesAlone(pairs.value.filter(p => (files.get(p.h) ?? 0) <= SWEEP_FILES))
})

const COLUMNS = [
  { key: "component", label: "Component" },
  { key: "commits", label: "Commits", right: true, width: "w-[88px]" },
  { key: "together", label: "With others", right: true, width: "w-[104px]", title: "Commits that also changed another component" },
  { key: "aloneShare", label: "Changed alone", width: "w-[170px]", title: "Share of its commits that changed no other component" },
  { key: "partners", label: "Changed with", right: true, width: "w-[112px]", title: "Other components its commits changed" },
  { key: "partner", label: "Most often with", width: "w-[28%]" },
] as const
type Key = (typeof COLUMNS)[number]["key"]
const sortKey = ref<Key>("together")
const sortDir = ref<1 | -1>(-1)
function sortBy(k: Key) {
  if (sortKey.value === k) sortDir.value = sortDir.value === 1 ? -1 : 1
  else { sortKey.value = k; sortDir.value = k === "component" || k === "partner" || k === "aloneShare" ? 1 : -1 }
}
const val = (r: AloneRow, k: Key): number | string =>
  k === "together" ? r.commits - r.alone : k === "aloneShare" ? r.alone / r.commits : k === "partner" ? (r.partner ?? "￿") : r[k]
const aloneRows = computed(() => {
  const k = sortKey.value, d = sortDir.value
  return alone.value.filter(r => r.commits >= 2).sort((a, b) => {
    const x = val(a, k), y = val(b, k)
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)
    return c * d || (b.commits - b.alone) - (a.commits - a.alone) || a.component.localeCompare(b.component)
  })
})
const tails = computed(() => shortTails([...new Set(pairs.value.map(p => p.component))]))
const label = (c: string) => (c === "." ? componentLabel(c, workspaces.active?.name) : tails.value.get(c) ?? c)

const aloneLimit = ref(50)
watch([aloneDays, sortKey, sortDir], () => { aloneLimit.value = 50 })
const aloneVisible = computed(() => aloneRows.value.slice(0, aloneLimit.value))

const selected = ref<Set<string>>(new Set())
const allSelected = computed(() => aloneVisible.value.length > 0 && aloneVisible.value.every(r => selected.value.has(r.component)))
function toggle(c: string) { const n = new Set(selected.value); n.has(c) ? n.delete(c) : n.add(c); selected.value = n }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(aloneVisible.value.map(r => r.component)) }

const aloneTable = useTable({
  title: "What rarely changes alone",
  rows: () => aloneRows.value.map(r => ({ component: r.component, commits: r.commits, with_others: r.commits - r.alone, changed_alone: Number((r.alone / r.commits).toFixed(3)), changed_with: r.partners, most_often_with: r.partner ?? "", together: r.partnerCommits })),
  columns: () => [
    { id: "component", label: "Component" }, { id: "commits", label: "Commits" }, { id: "with_others", label: "With others" },
    { id: "changed_alone", label: "Changed alone" }, { id: "changed_with", label: "Changed with" },
    { id: "most_often_with", label: "Most often with" }, { id: "together", label: "Commits together" },
  ],
  // Nothing is said while the commits still load: a report's take reads a reason as "there is nothing here".
  disabledReason: () => (!loading.value && !aloneLoading.value && !aloneRows.value.length ? "No component had two or more commits in this window." : null),
  ready: () => !loading.value && !aloneLoading.value,
})
</script>
