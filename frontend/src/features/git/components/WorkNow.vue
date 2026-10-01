<template>
  <div class="flex min-h-0 grow flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="ui-segmented" role="group" :aria-label="t('git.workNow.window')">
        <button v-for="w in NOW_WINDOWS" :key="w.id" type="button" :aria-pressed="windowId === w.id" :title="anchorLabel(w.days)" @click="windowId = w.id">{{ w.label }}</button>
      </div>
      <span class="text-sm text-neutral-600">{{ t('git.workNow.againstTwoYearsBefore') }}</span>
      <span class="ui-toolbar-meta ml-auto">{{ t('git.workNow.changedLinesAddedRemoved') }}</span>
    </div>

    <LoadingState v-if="loading && !w.rows.length" :text="t('git.workNow.addingUpWhereWork')"/>
    <EmptyState v-else-if="error" :title="t('git.workNow.couldNotReadHistory')" :text="error" icon="alert"/>
    <EmptyState v-else-if="!w.lines" :title="t('git.workNow.nothingChangedWindow')" :text="t('git.workNow.noCommitTouchesComponent', { windowWords, value: scoped ? t('git.workNow.scope') : '' })" icon="git-branch">
      <button v-if="windowId !== '365'" type="button" class="ui-btn ui-btn-sm" @click="windowId = '365'">{{ t('git.workNow.showLastYear') }}</button>
    </EmptyState>
    <div v-else class="min-h-0 grow overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 pb-12 pt-5">
        <p class="max-w-[76ch] text-lg leading-7 text-neutral-900">
          <I18nT k="git.workNow.linesWentInto"><template #window>{{ windowWords }}</template><template #lines><strong class="font-semibold">{{ t('git.workNow.lines', { lines: formatNumber(w.lines, 0) }) }}</strong></template><template #components>{{ t('common.count.component', { count: w.rows.length }) }}</template><template #half><strong class="font-semibold">{{ w.half === 1 ? t('git.workNow.oneLower') : formatNumber(w.half, 0) }}</strong></template></I18nT>
          <template v-if="w.rising.length">
            {{ t('git.workNow.tookMoreThanFour', { value: w.rising.length === 1 ? t('git.workNow.one') : formatNumber(w.rising.length, 0), their: t('common.noun.its', { count: w.rising.length }) }) }}
            <template v-for="(r, i) in w.rising.slice(0, 3)" :key="r.component"><code class="font-mono text-base">{{ tails.get(r.component) }}</code>{{ i < Math.min(3, w.rising.length) - 2 ? ", " : i === Math.min(3, w.rising.length) - 2 ? ` ${t('git.workNow.and')} ` : "" }}</template><template v-if="w.rising.length > 3">{{ t('git.workNow.more2', { value: w.rising.length - 3 }) }}</template>.
          </template>
          <template v-if="w.quiet.length">{{ ' ' + t('git.workNow.took1MoreBefore', { value: w.quiet.length === 1 ? t('git.workNow.oneComponent') : t('git.workNow.components', { quietLength: formatNumber(w.quiet.length, 0) }) }) }}</template>
        </p>

        <!-- The biggest moves, as a picture: where the work went to, and where it came from. -->
        <section v-if="movers.length >= 3" class="flex flex-col gap-2">
          <ExhibitFrame :exhibit="moversFigure" :title="t('git.workNow.whereWorkMoved')">
            <template #aside>{{ t('git.workNow.componentsWhoseShareMoved', { moversLength: movers.length }) }}</template>
            <div ref="moversHost" class="w-full">
              <svg ref="moversSvg" :viewBox="`0 0 ${mw} ${mh}`" :width="mw" :height="mh" class="block max-w-full" role="img" :aria-label="t('git.workNow.eachComponentSShare')">
                <g v-for="moverTick in moverTicks" :key="moverTick">
                  <line :x1="mx(moverTick)" :x2="mx(moverTick)" y1="14" :y2="mh - 4" stroke="rgb(var(--c-neutral-200))" stroke-dasharray="2 3"/>
                  <text :x="mx(moverTick)" y="10" font-size="10" text-anchor="middle" fill="rgb(var(--c-neutral-500))" font-family="ui-monospace, monospace">{{ pct(moverTick) }}</text>
                </g>
                <g v-for="(r, i) in movers" :key="r.component" :transform="`translate(0 ${24 + i * ROW})`">
                  <text x="0" y="4" font-size="11" fill="rgb(var(--c-neutral-800))" font-family="ui-monospace, monospace">{{ clip(label(r.component), Math.floor(labelW / 7)) }}</text>
                  <line :x1="mx(r.beforeShare)" :x2="mx(r.share)" y1="0" y2="0" :stroke="r.share >= r.beforeShare ? 'rgb(var(--c-blue-300))' : 'rgb(var(--c-neutral-300))'" stroke-width="2.5" stroke-linecap="round"/>
                  <circle :cx="mx(r.beforeShare)" cy="0" r="4.5" fill="rgb(var(--c-surface))" stroke="rgb(var(--c-neutral-500))" stroke-width="1.5"/>
                  <circle :cx="mx(r.share)" cy="0" r="4.5" fill="rgb(var(--c-blue-500))"/>
                  <text :x="mw" y="4" font-size="10.5" text-anchor="end" fill="rgb(var(--c-neutral-600))" font-family="ui-monospace, monospace">{{ r.beforeLines ? pct(r.beforeShare) : "new" }} → {{ pct(r.share) }}</text>
                </g>
              </svg>
            </div>
          </ExhibitFrame>
        </section>

        <section class="flex flex-col gap-2">
          <ExhibitFrame :exhibit="linesTable" :title="t('git.workNow.whereChangedLinesWent')">
            <template #controls>
              <span class="flex items-center gap-1.5 text-sm text-neutral-600"><span class="h-2.5 w-2.5 rounded-full bg-blue-500"></span>{{ windowLabel }}</span>
              <span class="ml-2 flex items-center gap-1.5 text-sm text-neutral-600"><span class="h-2.5 w-2.5 rounded-full border-[1.5px] border-neutral-500 bg-surface"></span>{{ t('git.workNow.twoYearsBefore') }}</span>
            </template>
            <template #aside>{{ t('git.workNow.shareAllChangedLines') }}</template>
            <table class="ui-table">
              <thead>
                <tr>
                  <th class="w-8"><Checkbox :model-value="allSelected" :aria-label="t('git.workNow.selectAllListed')" @update:model-value="toggleAll"/></th>
                  <th>{{ t('git.workNow.component') }}</th>
                  <th class="w-[34%]"><span class="sr-only">{{ t('git.workNow.shareNowAgainstBefore') }}</span></th>
                  <th class="w-[72px] text-right" :title="t('git.workNow.shareChangedLines', { windowWords })">{{ t('git.workNow.now') }}</th>
                  <th class="w-[72px] text-right" :title="t('git.workNow.shareChangedLinesTwo')">{{ t('git.workNow.before') }}</th>
                  <th class="w-[80px] text-right">{{ t('git.workNow.commits') }}</th>
                  <th class="w-[72px] text-right" :title="t('git.workNow.peopleWhoCommittedWindow')">{{ t('git.workNow.people') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in visible" :key="r.component" class="is-clickable" tabindex="0" @click="toggle(r.component)" @keydown.enter.prevent="router.push(componentPath(r.component))">
                  <td @click.stop><Checkbox :model-value="selected.has(r.component)" :aria-label="t('git.workNow.select', { component: r.component })" @update:model-value="toggle(r.component)"/></td>
                  <td class="max-w-0">
                    <router-link :to="componentPath(r.component)" class="block truncate font-mono text-sm text-neutral-800 hover:underline" :title="r.component" @click.stop>{{ label(r.component) }}</router-link>
                  </td>
                  <td>
                    <!-- Now as a filled dot, before as a ring, on one scale for every row. -->
                    <span class="relative block h-3" :title="t('git.workNow.changedLinesTwoYears', { share: pct(r.share), windowWords, beforeShare: pct(r.beforeShare) })">
                      <span class="absolute inset-x-0 top-1/2 h-px bg-neutral-100"></span>
                      <span class="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full" :class="r.share >= r.beforeShare ? 'bg-blue-200' : 'bg-neutral-200'"
                            :style="{ left: `${pos(Math.min(r.share, r.beforeShare))}%`, width: `${Math.abs(pos(r.share) - pos(r.beforeShare))}%` }"></span>
                      <span class="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-neutral-500 bg-surface" :style="{ left: `${pos(r.beforeShare)}%` }"></span>
                      <span class="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500" :style="{ left: `${pos(r.share)}%` }"></span>
                    </span>
                  </td>
                  <td class="is-num text-right text-neutral-900">{{ pct(r.share) }}</td>
                  <td class="is-num text-right text-neutral-500">{{ r.beforeLines ? pct(r.beforeShare) : "—" }}</td>
                  <td class="is-num text-right">{{ formatNumber(r.commits, 0) }}</td>
                  <td class="is-num text-right">{{ formatNumber(r.people, 0) }}</td>
                </tr>
              </tbody>
            </table>
          </ExhibitFrame>
          <button v-if="w.rows.length > visible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet self-start" @click="limit = w.rows.length">{{ t('git.workNow.showOtherEachUnder', { value: formatNumber(w.rows.length - visible.length, 0), share: pct(w.rows[visible.length].share) }) }}</button>
        </section>

        <section v-if="w.quiet.length" class="flex flex-col gap-2">
          <div class="flex items-baseline gap-3">
            <h3 class="ui-section-title">{{ t('git.workNow.goneQuiet') }}</h3>
            <span class="text-sm text-neutral-500">{{ t('git.workNow.took1MoreChanged') }}</span>
          </div>
          <ul class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-6">
            <li v-for="r in w.quiet.slice(0, 12)" :key="r.component" class="flex h-8 items-center gap-3 hairline-b">
              <Checkbox :model-value="selected.has(r.component)" :aria-label="t('git.workNow.select', { component: r.component })" @update:model-value="toggle(r.component)"/>
              <router-link :to="componentPath(r.component)" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-800 hover:underline" :title="r.component">{{ label(r.component) }}</router-link>
              <span class="font-mono text-sm tabular-nums text-neutral-500" :title="t('git.workNow.beforeNow', { beforeShare: pct(r.beforeShare), share: pct(r.share) })">{{ pct(r.beforeShare) }} → {{ pct(r.share) }}</span>
            </li>
          </ul>
          <p v-if="w.quiet.length > 12" class="text-sm text-neutral-500">{{ t('git.workNow.more', { value: w.quiet.length - 12 }) }}</p>
        </section>
      </div>
    </div>
    <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :universe="w.rows.map(r => r.component)" :show-in-except="[]"
                    @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import { scopeWhere } from "~/features/groups/scopeSql"
import { REPORT_FIGURE_WIDTH, useSvgFigure, useTable } from "~/features/export/useExportables"
import { componentLabel, componentPath } from "~/features/navigation/routes"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useStateStore } from "~/platform/state.store"
import Checkbox from "~/shared/ui/Checkbox.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { formatNumber } from "~/shared/format"
import { useAuthorsStore } from "../authors.store"
import { NOW_WINDOWS, buildWorkNow, shortTails, workNowSql, type NowWindowId, type WorkNowInput } from "../changeShape"
import { anchorLabel, anchorSql } from "../history"
import I18nT from "~/shared/ui/I18nT";
import { t } from "~/shared/i18n"

const data = useDataStore()
const authors = useAuthorsStore()
const state = useStateStore()
const workspaces = useWorkspacesStore()
const router = useRouter()

// A report's slot can ask for a window in the address (?window=30); otherwise the one last chosen here.
const route = useRoute()
const windowId = computed<NowWindowId>({
  get: () => {
    const asked = typeof route.query.window === "string" ? route.query.window : null
    const v = asked && NOW_WINDOWS.some(w => w.id === asked) ? asked : state.get<string>("activity.now", "90")
    return (NOW_WINDOWS.some(w => w.id === v) ? v : "90") as NowWindowId
  },
  set: v => {
    state.set("activity.now", v === "90" ? null : v)
    if (route.query.window) { const query = { ...route.query }; delete query.window; void router.replace({ query }) }
  },
})
const days = computed(() => NOW_WINDOWS.find(w => w.id === windowId.value)!.days)
const windowWords = computed(() => (days.value === 365 ? t("git.workNow.lastYear") : t("git.workNow.lastDays", { days: days.value })))
const windowLabel = computed(() => (days.value === 365 ? t("git.workNow.lastYear2") : t("git.workNow.lastDays2", { days: days.value })))
const scoped = computed(() => !!scopeWhere())

const { data: raw, loading, error } = useAsyncQuery<WorkNowInput[]>(
  () => (data.hasView("git_commits")
    ? data.query<WorkNowInput>(workNowSql({ days: days.value, anchor: anchorSql(), aliases: authors.aliases, includeBots: authors.showBots, where: scopeWhere("c.file") }))
    : Promise.resolve([])),
  [days, () => authors.aliases, () => authors.showBots, () => scopeWhere("c.file")],
  { initial: [] },
)
const w = computed(() => buildWorkNow(raw.value))
const tails = computed(() => shortTails(raw.value.map(r => r.component)))
const label = (c: string) => (c === "." ? componentLabel(c, workspaces.active?.name) : tails.value.get(c) ?? c)

// One scale for both dots on every row, so rows compare.
const maxShare = computed(() => Math.max(0.0001, ...w.value.rows.slice(0, 200).map(r => Math.max(r.share, r.beforeShare))))
const pos = (v: number) => 1.5 + (v / maxShare.value) * 97
const pct = (v: number) => (v > 0 && v < 0.001 ? "<0.1%" : v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`)

const limit = ref(24)
watch(days, () => { limit.value = 24 })
const visible = computed(() => w.value.rows.slice(0, limit.value))

const selected = ref<Set<string>>(new Set())
const allSelected = computed(() => visible.value.length > 0 && visible.value.every(r => selected.value.has(r.component)))
function toggle(c: string) { const n = new Set(selected.value); n.has(c) ? n.delete(c) : n.add(c); selected.value = n }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(visible.value.map(r => r.component)) }

// ── Where the work moved: the biggest shifts in share, both ways ─────────
const ROW = 22, LABEL_W = 230, VALUE_W = 110
const movers = computed(() => w.value.rows
  .filter(r => Math.max(r.share, r.beforeShare) >= 0.005)
  .sort((a, b) => Math.abs(b.share - b.beforeShare) - Math.abs(a.share - a.beforeShare))
  .slice(0, 16)
  .sort((a, b) => (b.share - b.beforeShare) - (a.share - a.beforeShare)))
const moversHost = ref<HTMLElement | null>(null)
const moversSvg = ref<SVGSVGElement | null>(null)
const hostW = ref(900)
// Drawn for export at a report page's width; otherwise the width it is given.
const exportW = ref<number | null>(null)
const mw = computed(() => exportW.value ?? hostW.value)
let ro: ResizeObserver | null = null
watch(moversHost, (el, old) => {
  ro ??= new ResizeObserver(e => { hostW.value = Math.max(480, Math.floor(e[0].contentRect.width)) })
  if (old) ro.unobserve(old)
  if (el) ro.observe(el)
}, { flush: "post" })
onBeforeUnmount(() => ro?.disconnect())
const mh = computed(() => 24 + movers.value.length * ROW)
const moverMax = computed(() => Math.max(0.001, ...movers.value.map(r => Math.max(r.share, r.beforeShare))))
const labelW = computed(() => Math.min(LABEL_W, Math.round(mw.value * 0.3)))
const mx = (v: number) => labelW.value + (v / moverMax.value) * (mw.value - labelW.value - VALUE_W - 12)
const moverTicks = computed(() => { const m = moverMax.value; const step = m > 0.2 ? 0.1 : m > 0.08 ? 0.02 : m > 0.03 ? 0.01 : 0.005; return Array.from({ length: Math.floor(m / step) + 1 }, (_, i) => i * step) })
const clip = (s: string, n: number) => (s.length > n ? "…" + s.slice(-(n - 1)) : s)
const moversFigure = useSvgFigure({
  title: () => t("git.workNow.whereWorkMovedAgainst", { windowWords: windowWords.value }),
  svg: () => moversSvg.value,
  exportWidth: REPORT_FIGURE_WIDTH,
  relayout: width => { exportW.value = width },
  legend: () => ({
    items: [
      { label: windowLabel.value, color: "rgb(var(--c-blue-500))", mark: "dot" },
      { label: t("git.workNow.twoYearsBefore"), color: "rgb(var(--c-neutral-500))", mark: "ring" },
    ],
    notes: [t("git.workNow.eachRowComponentS")],
  }),
})

const linesTable = useTable({
  get title() { return t("git.workNow.whereChangedLinesWent2", { windowWords: windowWords.value }) },
  rows: () => w.value.rows.map(r => ({ component: r.component, changed_lines: r.lines, share_now: Number(r.share.toFixed(4)), share_before: Number(r.beforeShare.toFixed(4)), commits: r.commits, people: r.people })),
  columns: () => [
    { id: "component", label: t("git.workNow.component") }, { id: "changed_lines", label: t("git.workNow.changedLines") },
    { id: "share_now", label: t("git.workNow.shareNow") }, { id: "share_before", label: t("git.workNow.shareTwoYearsBefore") },
    { id: "commits", label: t("git.workNow.commits") }, { id: "people", label: t("git.workNow.people") },
  ],
  // Nothing is said while the history still loads: a report's take reads a reason as "there is nothing here".
  disabledReason: () => (!loading.value && !w.value.rows.length ? t("git.workNow.nothingChangedWindow2") : null),
  ready: () => !loading.value,
})
</script>
