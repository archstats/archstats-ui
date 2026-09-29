<template>
  <div class="flex min-h-0 grow flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="ui-segmented" role="group" aria-label="Window">
        <button v-for="w in NOW_WINDOWS" :key="w.id" type="button" :aria-pressed="windowId === w.id" :title="anchorLabel(w.days)" @click="windowId = w.id">{{ w.label }}</button>
      </div>
      <span class="text-sm text-neutral-600">against the two years before</span>
      <span class="ui-toolbar-meta ml-auto">changed lines = added + removed · merges and bots left out</span>
    </div>

    <LoadingState v-if="loading && !w.rows.length" text="Adding up where the work went…"/>
    <EmptyState v-else-if="error" title="Could not read the history" :text="error" icon="alert"/>
    <EmptyState v-else-if="!w.lines" title="Nothing changed in this window" :text="`No commit in the ${windowWords} touches a component${scoped ? ' in scope' : ''}. Try a longer window.`" icon="git-branch">
      <button v-if="windowId !== '365'" type="button" class="ui-btn ui-btn-sm" @click="windowId = '365'">Show the last year</button>
    </EmptyState>
    <div v-else class="min-h-0 grow overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 pb-12 pt-5">
        <p class="max-w-[76ch] text-lg leading-7 text-neutral-900">
          In the {{ windowWords }}, <strong class="font-semibold">{{ formatNumber(w.lines, 0) }} lines</strong> changed in {{ formatNumber(w.rows.length, 0) }} components; half of them went into
          <strong class="font-semibold">{{ w.half === 1 ? "one" : formatNumber(w.half, 0) }}</strong>.
          <template v-if="w.rising.length">
            {{ w.rising.length === 1 ? "One" : formatNumber(w.rising.length, 0) }} took more than four times {{ w.rising.length === 1 ? "its" : "their" }} share of the two years before:
            <template v-for="(r, i) in w.rising.slice(0, 3)" :key="r.component"><code class="font-mono text-base">{{ tails.get(r.component) }}</code>{{ i < Math.min(3, w.rising.length) - 2 ? ", " : i === Math.min(3, w.rising.length) - 2 ? " and " : "" }}</template><template v-if="w.rising.length > 3">, and {{ w.rising.length - 3 }} more</template>.
          </template>
          <template v-if="w.quiet.length"> {{ w.quiet.length === 1 ? "One component" : `${formatNumber(w.quiet.length, 0)} components` }} that took 1% or more before went quiet.</template>
        </p>

        <section class="flex flex-col gap-2">
          <ExhibitFrame :exhibit="linesTable" title="Where the changed lines went">
            <template #controls>
              <span class="flex items-center gap-1.5 text-sm text-neutral-600"><span class="h-2.5 w-2.5 rounded-full bg-blue-500"></span>{{ windowLabel }}</span>
              <span class="ml-2 flex items-center gap-1.5 text-sm text-neutral-600"><span class="h-2.5 w-2.5 rounded-full border-[1.5px] border-neutral-500 bg-surface"></span>The two years before</span>
            </template>
            <template #aside>Share of all changed lines in each period</template>
            <table class="ui-table">
              <thead>
                <tr>
                  <th class="w-8"><Checkbox :model-value="allSelected" aria-label="Select all listed" @update:model-value="toggleAll"/></th>
                  <th>Component</th>
                  <th class="w-[34%]"><span class="sr-only">Share now against before</span></th>
                  <th class="w-[72px] text-right" :title="`Share of the ${windowWords}' changed lines`">Now</th>
                  <th class="w-[72px] text-right" title="Share of the changed lines in the two years before">Before</th>
                  <th class="w-[80px] text-right">Commits</th>
                  <th class="w-[72px] text-right" title="People who committed to it in the window">People</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in visible" :key="r.component" class="is-clickable" tabindex="0" @click="toggle(r.component)" @keydown.enter.prevent="router.push(componentPath(r.component))">
                  <td @click.stop><Checkbox :model-value="selected.has(r.component)" :aria-label="`Select ${r.component}`" @update:model-value="toggle(r.component)"/></td>
                  <td class="max-w-0">
                    <router-link :to="componentPath(r.component)" class="block truncate font-mono text-sm text-neutral-800 hover:underline" :title="r.component" @click.stop>{{ label(r.component) }}</router-link>
                  </td>
                  <td>
                    <!-- Now as a filled dot, before as a ring, on one scale for every row. -->
                    <span class="relative block h-3" :title="`${pct(r.share)} of the ${windowWords}' changed lines; ${pct(r.beforeShare)} in the two years before`">
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
          <button v-if="w.rows.length > visible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet self-start" @click="limit = w.rows.length">Show the other {{ formatNumber(w.rows.length - visible.length, 0) }}, each under {{ pct(w.rows[visible.length].share) }}</button>
        </section>

        <section v-if="w.quiet.length" class="flex flex-col gap-2">
          <div class="flex items-baseline gap-3">
            <h3 class="ui-section-title">Gone quiet</h3>
            <span class="text-sm text-neutral-500">Took 1% or more of the changed lines before, and under a fifth of that now</span>
          </div>
          <ul class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-6">
            <li v-for="r in w.quiet.slice(0, 12)" :key="r.component" class="flex h-8 items-center gap-3 hairline-b">
              <Checkbox :model-value="selected.has(r.component)" :aria-label="`Select ${r.component}`" @update:model-value="toggle(r.component)"/>
              <router-link :to="componentPath(r.component)" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-800 hover:underline" :title="r.component">{{ label(r.component) }}</router-link>
              <span class="font-mono text-sm tabular-nums text-neutral-500" :title="`${pct(r.beforeShare)} before, ${pct(r.share)} now`">{{ pct(r.beforeShare) }} → {{ pct(r.share) }}</span>
            </li>
          </ul>
          <p v-if="w.quiet.length > 12" class="text-sm text-neutral-500">and {{ w.quiet.length - 12 }} more</p>
        </section>
      </div>
    </div>
    <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :universe="w.rows.map(r => r.component)" :show-in-except="[]"
                    @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import { scopeWhere } from "~/features/groups/scopeSql"
import { useTable } from "~/features/export/useExportables"
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

const data = useDataStore()
const authors = useAuthorsStore()
const state = useStateStore()
const workspaces = useWorkspacesStore()
const router = useRouter()

const windowId = computed<NowWindowId>({
  get: () => { const v = state.get<string>("activity.now", "90"); return (NOW_WINDOWS.some(w => w.id === v) ? v : "90") as NowWindowId },
  set: v => state.set("activity.now", v === "90" ? null : v),
})
const days = computed(() => NOW_WINDOWS.find(w => w.id === windowId.value)!.days)
const windowWords = computed(() => (days.value === 365 ? "last year" : `last ${days.value} days`))
const windowLabel = computed(() => (days.value === 365 ? "The last year" : `The last ${days.value} days`))
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

const linesTable = useTable({
  get title() { return `Where the changed lines went (${windowWords.value})` },
  rows: () => w.value.rows.map(r => ({ component: r.component, changed_lines: r.lines, share_now: Number(r.share.toFixed(4)), share_before: Number(r.beforeShare.toFixed(4)), commits: r.commits, people: r.people })),
  columns: () => [
    { id: "component", label: "Component" }, { id: "changed_lines", label: "Changed lines" },
    { id: "share_now", label: "Share now" }, { id: "share_before", label: "Share in the two years before" },
    { id: "commits", label: "Commits" }, { id: "people", label: "People" },
  ],
  disabledReason: () => (!w.value.rows.length ? "Nothing changed in this window." : null),
})
</script>
