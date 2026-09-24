<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Controls row: period on the left, counts on the right. -->
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="relative flex items-center gap-2">
        <div class="ui-segmented" role="group" aria-label="Period">
          <button v-for="p in periods" :key="p.id" type="button" :aria-pressed="period === p.id" :title="anchorLabel(p.days, anchor)" @click="pickPeriod(p.id)">{{ p.label }}</button>
          <button type="button" :aria-pressed="period === 'custom'" :title="range ? rangeLabel : 'Choose the dates'" @click="rangeOpen = !rangeOpen">{{ period === "custom" && range ? rangeShort : "Custom…" }}</button>
        </div>
        <template v-if="rangeOpen">
          <div class="fixed inset-0 z-40" @click="rangeOpen = false"></div>
          <form class="ui-popover absolute left-0 top-full z-50 mt-1 flex w-72 flex-col gap-3 p-3 animate-in" @submit.prevent="applyRange">
            <label class="flex items-center justify-between gap-3 text-sm text-neutral-700">Since <input v-model="draftSince" type="date" class="ui-input ui-input-sm w-40" :max="anchorDay"></label>
            <label class="flex items-center justify-between gap-3 text-sm text-neutral-700">Until <input v-model="draftUntil" type="date" class="ui-input ui-input-sm w-40" :max="anchorDay"></label>
            <p v-if="rangeError" class="text-sm text-red-700">{{ rangeError }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-if="baselineDay" type="button" class="ui-chip" @click="draftSince = baselineDay; draftUntil = anchorDay">Since the baseline commit</button>
              <button v-if="range" type="button" class="ui-chip" @click="draftSince = range.since; draftUntil = range.until">Since {{ range.since }}</button>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="rangeOpen = false">Cancel</button>
              <button type="submit" class="ui-btn ui-btn-sm ui-btn-primary">Apply</button>
            </div>
          </form>
        </template>
      </div>
      <div class="ui-segmented" role="group" aria-label="Order">
        <button type="button" :aria-pressed="order === 'date'" @click="order = 'date'">Date</button>
        <button type="button" :aria-pressed="order === 'widest'" title="Commits that touched the most components first" @click="order = 'widest'">Widest</button>
      </div>
      <button v-if="order === 'widest' && sweeping > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="`Commits touching more than ${sweepLimit} files: renames, reformats, merges`" @click="showSweeping = !showSweeping">
        {{ showSweeping ? "Sweeping commits shown" : `${formatNumber(sweeping)} sweeping commits hidden` }}
      </button>
      <button v-if="!includeBots && botCommits > 0" type="button" class="ui-btn ui-btn-sm ui-btn-quiet"
              :title="authorsStore.showBots ? 'Hide commits made by bots and release plugins' : 'Commits made by bots and release plugins are left out'"
              @click="authorsStore.setShowBots(!authorsStore.showBots)">
        <Icon :icon="authorsStore.showBots ? 'eye' : 'eye-off'" :size="13" class="text-neutral-500"/>
        <span>{{ authorsStore.showBots ? "Bots shown" : `${formatNumber(botCommits)} bot commits hidden` }}</span>
      </button>
      <span class="ui-toolbar-meta ml-auto flex items-center gap-1.5">
        <span>Commits <span class="font-mono text-neutral-800">{{ formatNumber(commits.length) }}</span></span>
        <span class="text-neutral-300">·</span>
        <span>Authors <span class="font-mono text-neutral-800">{{ formatNumber(authors.length) }}</span></span>
        <span class="text-neutral-300">·</span>
        <span class="font-mono text-green-700">{{ formatSigned(totals.additions) }}</span>
        <span class="font-mono text-red-700">{{ formatSigned(-totals.deletions) }}</span>
        <template v-if="span">
          <span class="text-neutral-300">·</span>
          <span class="font-mono">{{ span }}</span>
        </template>
      </span>
    </div>

    <LoadingState v-if="loading" text="Reading commit history…"/>
    <EmptyState v-else-if="error" title="Could not read commits" :text="error" icon="alert"/>
    <EmptyState v-else-if="allCommits.length === 0" title="No commits recorded" :text="emptyText" icon="git-branch"/>
    <div v-else class="flex min-h-0 grow overflow-hidden">
      <!-- Left: calendar and the commit list. -->
      <div class="flex min-w-0 grow flex-col overflow-y-auto">
        <!-- A day grid reads a year at most; a longer range reads as months. -->
        <div v-if="!longRange" class="shrink-0 overflow-x-auto px-4 pb-3 pt-4 hairline-b">
          <GitActivityChart :start-date="chartStart" :end-date="chartEnd" :commits="commits"/>
        </div>
        <div v-if="(monthly || longRange) && commits.length > 0" class="shrink-0 px-4 pb-3 pt-4 hairline-b">
          <h3 class="ui-section-title mb-2">Lines added and removed by month</h3>
          <MonthlyChangesChart :commits="commits" :height="140"/>
        </div>
        <EmptyState v-if="commits.length === 0" :title="period === 'custom' ? 'No commits between these dates' : 'No commits in this period'" text="Widen the period to see earlier activity."/>
        <table v-else class="ui-table">
          <thead>
            <tr>
              <th class="w-[72px]">Commit</th>
              <th>Message</th>
              <th class="w-[160px]">Author</th>
              <th class="w-[110px] text-right">Date</th>
              <th class="w-[60px] text-right">Files</th>
              <th class="w-[90px] text-right" title="Components the commit touched">Comps</th>
              <th class="w-[120px] text-right">Lines</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in visibleCommits" :key="c.commit_hash" class="is-clickable" :class="{ 'is-selected': selectedHash === c.commit_hash }" @click="select(selectedHash === c.commit_hash ? null : c.commit_hash)">
              <td class="is-num"><span :title="c.commit_hash">{{ shortHash(c.commit_hash) }}</span></td>
              <td class="max-w-0"><span class="block truncate" :title="authorsStore.displayText(c.commit_message)">{{ firstLine(authorsStore.displayText(c.commit_message)) }}</span></td>
              <td class="max-w-0">
                <router-link :to="authorsStore.authorPath(c.author_name)" class="block truncate text-neutral-800 hover:text-neutral-900 hover:underline" :title="authorsStore.displayEmail(c.author_email)">{{ authorsStore.display(c.author_name) }}</router-link>
              </td>
              <td class="is-num text-right">{{ formatDate(c.commit_time) }}</td>
              <td class="is-num text-right">{{ formatNumber(c.files_changed) }}</td>
              <td class="is-num text-right">{{ formatNumber((c as any).components_changed) }}</td>
              <td class="is-num text-right">
                <span class="text-green-700">{{ formatSigned(c.additions) }}</span>
                <span class="ml-1.5 text-red-700">{{ formatSigned(-Number(c.deletions || 0)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="commits.length > visibleCommits.length" class="flex shrink-0 items-center justify-center py-3">
          <button type="button" class="ui-btn ui-btn-sm" @click="limit += 100">Show more <span class="font-mono text-neutral-500">{{ formatNumber(commits.length - visibleCommits.length) }} left</span></button>
        </div>
      </div>

      <!-- Right: contributors for the period. -->
      <aside class="flex w-[260px] shrink-0 flex-col overflow-y-auto bg-ground hairline-l">
        <CommitFootprint v-if="selectedHash" :hash="selectedHash" @close="select(null)"/>
        <template v-else>
        <h3 class="ui-section-title px-4 pb-2 pt-4">Contributors</h3>
        <ul class="flex flex-col">
          <li v-for="a in visibleAuthors" :key="a.name">
            <router-link :to="authorsStore.authorPath(a.name)" class="flex h-8 items-center gap-3 px-4 transition-colors hover:bg-neutral-100">
              <span class="min-w-0 flex-1 truncate text-base text-neutral-800" :title="authorsStore.displayEmail(a.email)">{{ authorsStore.display(a.name) }}</span>
              <span class="font-mono text-sm tabular-nums text-neutral-600">{{ formatNumber(a.count) }}</span>
              <span class="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                <span class="block h-full rounded-full bg-neutral-500" :style="{ width: `${Math.max(4, (a.count / maxAuthorCount) * 100)}%` }"></span>
              </span>
            </router-link>
          </li>
        </ul>
        <button v-if="authors.length > visibleAuthors.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 mb-4 mt-2 self-start" @click="showAllAuthors = true">Show all {{ authors.length }}</button>
        </template>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router"
import CommitFootprint from "~/components/git/CommitFootprint.vue"
import { useStateStore } from "~/stores/state"
import { computed, ref, watch } from "vue";
import { useDataStore } from "~/stores/data";
import type { GitCommit } from "~/utils/git";
import { formatDate } from "~/utils/time";
import { formatNumber, formatSigned, shortHash } from "~/utils/format";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { NOT_BOT_SQL, canonicalAuthorSql } from "~/utils/authors";
import { HISTORY_PERIODS, anchorLabel, historyAnchor, type HistoryPeriodId } from "~/utils/history";
import { useAuthorsStore } from "~/stores/authors";
import { useWorkspacesStore } from "~/stores/workspaces";
import Icon from "~/components/ui/common/Icon.vue";
import GitActivityChart from "~/components/components/git/git-activity/GitActivityChart.vue";
import MonthlyChangesChart from "~/components/git/MonthlyChangesChart.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";

// One commit history for components, files and authors: the caller supplies
// the WHERE predicate (already escaped through sqlLiteral) and the rest is
// identical everywhere. `monthly` adds the additions/deletions bars by month
// between the calendar and the list (the Activity view uses it).
const props = defineProps<{
  where: string
  emptyText?: string
  monthly?: boolean
  /** An author's own history keeps their release commits; everywhere else bots follow the toggle. */
  includeBots?: boolean
}>()

const store = useDataStore()
const authorsStore = useAuthorsStore()
const workspaces = useWorkspacesStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })

const periods = HISTORY_PERIODS
const stateStore = useStateStore()
// A custom range is kept per workspace: "since the engagement started" is
// the question for weeks, not one visit.
const range = computed(() => stateStore.get<{ since: string; until: string } | null>("history.range", null))
const period = ref<HistoryPeriodId | "custom">(range.value ? "custom" : "all")
const rangeOpen = ref(false)
const draftSince = ref(range.value?.since ?? "")
const draftUntil = ref(range.value?.until ?? "")
const rangeError = ref("")
function pickPeriod(id: HistoryPeriodId) {
  period.value = id
  stateStore.set("history.range", null)
}
function applyRange() {
  rangeError.value = ""
  if (!draftSince.value || !draftUntil.value) { rangeError.value = "Both dates are needed."; return }
  if (draftUntil.value < draftSince.value) { rangeError.value = "Until is before Since."; return }
  const until = draftUntil.value > anchorDay.value ? anchorDay.value : draftUntil.value
  stateStore.set("history.range", { since: draftSince.value, until })
  period.value = "custom"
  rangeOpen.value = false
}
const limit = ref(100)
const showAllAuthors = ref(false)

const { data: allCommits, loading, error } = useAsyncQuery<GitCommit[]>(
  () => store.query<GitCommit>(`
    select commit_hash, commit_time, commit_message, ${canonicalAuthorSql(authorsStore.aliases)} as author_name, author_email,
           count(file) as files_changed, count(distinct component) as components_changed, sum(file_additions) as additions, sum(file_deletions) as deletions,
           max(case when ${NOT_BOT_SQL} then 0 else 1 end) as is_bot
    from git_commits
    where ${props.where}
    group by commit_hash
    order by commit_time desc`),
  [() => props.where, () => authorsStore.aliases],
  { initial: [] },
)

// Periods count back from the snapshot's anchor: the scanned commit from
// analysis revision 2, the scan before it. Never from today: a snapshot keeps
// saying what it said when it was taken.
const anchor = computed(() => { void store.datasetKey; return historyAnchor() })

watch([() => props.where, period], () => { limit.value = 100; showAllAuthors.value = false })

const now = computed(() => anchor.value.date)
const periodDays = computed(() => period.value === "custom" ? 0 : periods.find(p => p.id === period.value)?.days ?? 0)
const anchorDay = computed(() => anchor.value.date.toISOString().slice(0, 10))
const baselineDay = computed(() => {
  const id = (workspaces.active as any)?.baselineScanId
  const s: any = id ? workspaces.scans.find((x: any) => x.id === id) : null
  const t = s?.headTime ?? s?.startedAt
  return t ? new Date(t).toISOString().slice(0, 10) : ""
})
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const rangeShort = computed(() => (range.value ? `${fmtDay(range.value.since)} – ${fmtDay(range.value.until)}` : ""))
const rangeLabel = computed(() => (range.value ? `${rangeShort.value}${anchor.value.commit ? ` (${anchor.value.commit.slice(0, 7)})` : ""}` : ""))

const isBot = (c: GitCommit) => Number((c as any).is_bot) === 1
const botCommits = computed(() => allCommits.value.filter(isBot).length)
const counted = computed(() => (props.includeBots || authorsStore.showBots ? allCommits.value : allCommits.value.filter(c => !isBot(c))))

const commits = computed(() => {
  if (period.value === "custom" && range.value) {
    const from = new Date(`${range.value.since}T00:00:00Z`).getTime()
    const to = new Date(`${range.value.until}T23:59:59Z`).getTime()
    return counted.value.filter(c => { const t = new Date(c.commit_time).getTime(); return t >= from && t <= to })
  }
  if (!periodDays.value) return counted.value
  const cutoff = now.value.getTime() - periodDays.value * 86400000
  return counted.value.filter(c => new Date(c.commit_time).getTime() >= cutoff)
})

// Date or Widest: the commits that touched the most components first. Widest
// leaves sweeping commits (renames, reformats) out unless asked: they are
// widest by construction and say nothing about the architecture.
const order = ref<"date" | "widest">("date")
const showSweeping = ref(false)
const sweepLimit = ref(100)
watch(() => store.datasetKey, async () => {
  try { const [r] = await store.query<{ v: string | null }>(`SELECT (SELECT value FROM _snapshot WHERE key = 'git_max_changes_per_commit' LIMIT 1) AS v`); sweepLimit.value = Number(r?.v) || 100 } catch { sweepLimit.value = 100 }
}, { immediate: true })
const sweeping = computed(() => commits.value.filter(c => Number(c.files_changed) > sweepLimit.value).length)
const ordered = computed(() => {
  if (order.value === "date") return commits.value
  const list = showSweeping.value ? commits.value : commits.value.filter(c => Number(c.files_changed) <= sweepLimit.value)
  return [...list].sort((a: any, b: any) => (Number(b.components_changed) || 0) - (Number(a.components_changed) || 0) || (Number(b.files_changed) || 0) - (Number(a.files_changed) || 0))
})
const visibleCommits = computed(() => ordered.value.slice(0, limit.value))

// The selected commit, kept in the URL (?commit=) so a footprint can be linked.
const route = useRoute()
const router = useRouter()
const selectedHash = computed(() => (typeof route.query.commit === "string" ? route.query.commit : null))
function select(hash: string | null) {
  const query = { ...route.query }
  if (hash) query.commit = hash; else delete query.commit
  void router.replace({ query })
}

const totals = computed(() => commits.value.reduce((acc, c) => {
  acc.additions += Number(c.additions) || 0
  acc.deletions += Number(c.deletions) || 0
  return acc
}, { additions: 0, deletions: 0 }))

const authors = computed(() => {
  const counts = new Map<string, { name: string; email: string; count: number }>()
  for (const c of commits.value) {
    const name = c.author_name || "Unknown"
    const entry = counts.get(name) ?? { name, email: c.author_email || "", count: 0 }
    entry.count++
    counts.set(name, entry)
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)
})
const visibleAuthors = computed(() => showAllAuthors.value ? authors.value : authors.value.slice(0, 8))
const maxAuthorCount = computed(() => authors.value[0]?.count || 1)

// The calendar covers the selected period ending today; with no period it
// shows the last year of recorded activity, so an old repository is not an
// empty grid.
const lastCommit = computed(() => {
  const times = allCommits.value.map(c => new Date(c.commit_time).getTime()).filter(t => !Number.isNaN(t))
  return times.length ? new Date(Math.max(...times)) : now.value
})

// More than a year of history on "All": the day grid would show only its
// last year, mostly empty for a component that settled long ago.
const longRange = computed(() => {
  if (periodDays.value) return false
  const times = commits.value.map(c => new Date(c.commit_time).getTime()).filter(t => !Number.isNaN(t))
  return times.length > 0 && Math.max(...times) - Math.min(...times) > 400 * 86400000
})
const chartEnd = computed(() => periodDays.value ? now.value : (lastCommit.value < now.value ? lastCommit.value : now.value))
const chartStart = computed(() => {
  const days = periodDays.value || 365
  return new Date(chartEnd.value.getTime() - days * 86400000)
})

const span = computed(() => {
  if (commits.value.length === 0) return ""
  const times = commits.value.map(c => new Date(c.commit_time).getTime()).filter(t => !Number.isNaN(t))
  if (times.length === 0) return ""
  const first = new Date(Math.min(...times))
  const last = new Date(Math.max(...times))
  return `${formatDate(first)} – ${formatDate(last)}`
})

function firstLine(message: string | null | undefined): string {
  return (message || "").split("\n")[0]
}
</script>
