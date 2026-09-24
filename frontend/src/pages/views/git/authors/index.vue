<template>
  <ViewWorkspaceLayout
    :queryable="false"
    title="Authors"
    v-model:search-query="searchQuery"
    search-placeholder="Search authors"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="300px"
  >
    <template #stats>
      <span v-if="rows.length" title="Everyone who committed to a file in this snapshot, the same count the Overview and Activity show">
        Contributors
        <span class="text-neutral-800">
          <template v-if="filtered.length !== rows.length">{{ formatNumber(filtered.length) }} of </template>{{ formatNumber(rows.length) }}
        </span>
      </span>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Period">
        <button v-for="p in periods" :key="p.id" type="button" :aria-pressed="period === p.id" :title="anchorLabel(p.days)" @click="period = p.id">{{ p.label }}</button>
      </div>
      <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="authorsStore.pseudonymise" :class="{ 'bg-neutral-100': authorsStore.pseudonymise }"
              title="Show every author as Author 1…N, numbered by first commit, on every screen and in every export; emails and @handles are hidden"
              @click="authorsStore.setPseudonymise(!authorsStore.pseudonymise)">
        <Icon icon="user" :size="13" class="text-neutral-500"/>
        <span>{{ authorsStore.pseudonymise ? "Pseudonymised" : "Show as Author 1…N" }}</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="authorsStore.showBots" :class="{ 'bg-neutral-100': authorsStore.showBots }"
              title="Dependency bumpers, CI accounts and release-plugin commits are hidden unless shown here"
              @click="authorsStore.showBots = !authorsStore.showBots">
        <Icon :icon="authorsStore.showBots ? 'eye' : 'eye-off'" :size="13" class="text-neutral-500"/>
        <span>{{ authorsStore.showBots ? "Bots shown" : "Bots hidden" }}</span>
      </button>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading authors…"/>
      <EmptyState v-else-if="error" title="Could not read authors" :text="error" icon="alert"/>
      <EmptyState
        v-else-if="rows.length === 0"
        title="No authors in this snapshot"
        text="The scan has no git author data. Scan a git checkout to see who contributes."
        icon="users"
      />
      <EmptyState v-else-if="filtered.length === 0" title="No authors match" :text="`Nothing matches “${searchQuery}”.`" icon="search">
        <button type="button" class="ui-btn ui-btn-sm" @click="searchQuery = ''">Clear search</button>
      </EmptyState>
      <div v-else class="min-h-0 grow overflow-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th
                v-for="col in columns"
                :key="col.key"
                :class="[col.align === 'right' ? 'text-right' : '', col.width]"
                :style="col.key === 'name' ? { minWidth: '11rem' } : undefined"
                :aria-sort="sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              >
                <button
                  type="button"
                  class="inline-flex items-center gap-1 hover:text-neutral-900"
                  :class="{ 'text-neutral-900': sortKey === col.key }"
                  @click="toggleSort(col.key)"
                >
                  {{ col.label }}
                  <Icon v-if="sortKey === col.key" :icon="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="12"/>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="a in sorted"
              :key="a.name"
              class="is-clickable"
              :class="{ 'is-selected': a.name === selectedName }"
              tabindex="0"
              @click="selectedName = a.name"
              @dblclick="open(a.name)"
              @keydown.enter.prevent="open(a.name)"
            >
              <td class="max-w-0">
                <router-link
                  :to="detailRoute(a.name)"
                  class="block truncate text-neutral-900 hover:underline"
                  :title="a.email ? `${a.shown} · ${a.email}` : a.shown"
                  @click.stop
                >{{ a.shown }}</router-link>
              </td>
              <td class="is-num text-right">
                <span class="inline-flex items-center justify-end gap-2">
                  <span>{{ formatNumber(a.commits) }}</span>
                  <span class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
                    <span class="block h-full rounded-full bg-neutral-500" :style="{ width: barWidth(a.commits) }"></span>
                  </span>
                </span>
              </td>
              <td class="is-num text-right">
                <span class="text-green-700">{{ formatSigned(a.additions) }}</span>
                <span class="ml-1.5 text-red-700">{{ formatSigned(-a.deletions) }}</span>
              </td>
              <td class="is-num text-right">{{ formatNumber(a.files) }}</td>
              <td class="is-num text-right">{{ formatNumber(a.components) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #tab-author>
      <template v-if="selected">
        <div class="flex flex-col gap-1">
          <router-link :to="detailRoute(selected.name)" class="truncate text-base font-semibold text-neutral-900 hover:underline">{{ selected.shown }}</router-link>
          <span v-if="selected.email" class="truncate font-mono text-sm text-neutral-500" :title="selected.email">{{ selected.email }}</span>
        </div>
        <!-- The same person under another name: merged by hand, per workspace. -->
        <section v-if="authorsStore.pseudonymise" class="flex flex-col gap-2">
          <h3 class="ui-section-title">Also committed as</h3>
          <p class="text-sm leading-4 text-neutral-500">Names are hidden while authors are pseudonymised. Show names to merge one person's names.</p>
        </section>
        <section v-else class="flex flex-col gap-2">
          <h3 class="ui-section-title">Also committed as</h3>
          <ul v-if="mergedInto(selected.name).length" class="flex flex-col gap-1">
            <li v-for="alias in mergedInto(selected.name)" :key="alias" class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm text-neutral-700" :title="alias">{{ alias }}</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="`Count ${alias} separately again`" @click="authorsStore.unmerge(alias)">Separate</button>
            </li>
          </ul>
          <SingleSelect :model-value="null" :options="mergeOptions" placeholder="Same person as…" @update:model-value="mergeSelected"/>
          <p class="text-sm leading-4 text-neutral-500">Merging folds the other name's commits into this one on every screen of this workspace.</p>
        </section>
        <section v-for="p in periods" :key="p.id" class="flex flex-col gap-2">
          <h3 class="ui-section-title" :class="{ 'text-neutral-900': p.id === period }">{{ p.title }}</h3>
          <dl class="ui-kv">
            <dt>Commits</dt><dd>{{ formatNumber(selected.byPeriod[p.id].commits) }}</dd>
            <dt>Lines added</dt><dd class="text-green-700">{{ formatSigned(selected.byPeriod[p.id].additions) }}</dd>
            <dt>Lines removed</dt><dd class="text-red-700">{{ formatSigned(-selected.byPeriod[p.id].deletions) }}</dd>
            <dt>Files</dt><dd>{{ formatNumber(selected.byPeriod[p.id].files) }}</dd>
            <dt>Components</dt><dd>{{ formatNumber(selected.byPeriod[p.id].components) }}</dd>
          </dl>
        </section>
        <div class="pt-1">
          <router-link :to="detailRoute(selected.name)" class="ui-btn ui-btn-sm ui-btn-primary">
            <Icon icon="arrow-up-right" :size="13"/>
            <span>Open</span>
          </router-link>
        </div>
      </template>
      <p v-else class="text-sm leading-4 text-neutral-500">Select an author to see their commits, lines, files and components for every period. Double-click or press Enter to open the author.</p>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { anchorLabel, anchorSql } from "~/utils/history"
import { AUTHOR_PERIODS, authorStatsSql, namesOf, periodStats } from "~/utils/authors"
import { useAuthorsStore } from "~/stores/authors"
import { useWorkspacesStore } from "~/stores/workspaces"
import SingleSelect from "~/components/ui/common/SingleSelect.vue"
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useExportables } from "~/composables/useExportables"
import { formatNumber, formatSigned } from "~/utils/format"
import Icon from "~/components/ui/common/Icon.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const store = useDataStore()
const router = useRouter()
const workspaces = useWorkspacesStore()
const authorsStore = useAuthorsStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })

function mergedInto(name: string): string[] {
  return namesOf(authorsStore.aliases, name).slice(1)
}
const mergeOptions = computed(() => rows.value.filter(a => a.name !== selectedName.value).map(a => a.name))
function mergeSelected(other: string | null) {
  if (!other || !selectedName.value) return
  authorsStore.merge(other, selectedName.value)
}

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("author")
const tabs = [{ id: "author", label: "Author" }]

const periods = AUTHOR_PERIODS
type PeriodId = (typeof periods)[number]["id"]
const period = ref<PeriodId>("total")

interface PeriodStats { commits: number; additions: number; deletions: number; files: number; components: number }
interface AuthorRow extends PeriodStats {
  name: string
  /** The name on screen: the name, or its pseudonym. */
  shown: string
  email: string
  byPeriod: Record<PeriodId, PeriodStats>
}

// One query for the whole view; period and search work on the loaded rows.
const { data: raw, loading, error } = useAsyncQuery<Record<string, any>[]>(
  () => store.hasView("git_commits")
    ? store.query<Record<string, any>>(authorStatsSql("1", { aliases: authorsStore.aliases, includeBots: authorsStore.showBots, anchor: anchorSql() }))
    : Promise.resolve([]),
  [() => authorsStore.aliases, () => authorsStore.showBots],
  { initial: [] },
)


const rows = computed<AuthorRow[]>(() => raw.value.map(r => {
  const byPeriod = Object.fromEntries(periods.map(p => [p.id, periodStats(r, p.id)])) as Record<PeriodId, PeriodStats>
  return {
    name: String(r.author_name ?? ""),
    shown: authorsStore.display(String(r.author_name ?? "")),
    email: authorsStore.displayEmail(String(r.author_email ?? "")),
    byPeriod,
    ...byPeriod[period.value],
  }
}))

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(a => a.shown.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
})

type SortKey = "name" | "commits" | "lines" | "files" | "components"
const columns: Array<{ key: SortKey; label: string; align?: "right"; width?: string }> = [
  { key: "name", label: "Author" },
  { key: "commits", label: "Commits", align: "right", width: "w-[140px]" },
  { key: "lines", label: "Lines", align: "right", width: "w-[160px]" },
  { key: "files", label: "Files", align: "right", width: "w-[80px]" },
  { key: "components", label: "Components", align: "right", width: "w-[110px]" },
]
const sortKey = ref<SortKey>("commits")
const sortDir = ref<"asc" | "desc">("desc")

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortKey.value = key
    sortDir.value = key === "name" ? "asc" : "desc"
  }
}

function sortValue(a: AuthorRow, key: SortKey): number | string {
  if (key === "name") return a.shown.toLowerCase()
  if (key === "lines") return a.additions + a.deletions
  return a[key]
}

const sorted = computed(() => {
  const dir = sortDir.value === "asc" ? 1 : -1
  const key = sortKey.value
  return [...filtered.value].sort((a, b) => {
    const av = sortValue(a, key), bv = sortValue(b, key)
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir || a.name.localeCompare(b.name)
    return String(av).localeCompare(String(bv)) * dir
  })
})

// The commit bar is scaled against the busiest author in the period across
// every row, so searching never rescales it.
const maxCommits = computed(() => rows.value.reduce((m, a) => Math.max(m, a.commits), 0) || 1)
function barWidth(commits: number): string {
  return commits > 0 ? `${Math.max(4, (commits / maxCommits.value) * 100)}%` : "0%"
}

const selectedName = ref<string | null>(null)
const selected = computed(() => rows.value.find(a => a.name === selectedName.value) ?? null)

function detailRoute(name: string): string {
  return authorsStore.authorPath(name)
}

// Every author in the period, as sorted; names go out as they are shown.
useExportables().register({
  kind: "table",
  get title() { return `Authors (${periods.find(p => p.id === period.value)?.title ?? ""})` },
  rows: () => sorted.value.map(a => ({ author: a.shown, email: a.email, commits: a.commits, additions: a.additions, deletions: a.deletions, files: a.files, components: a.components })),
  columns: () => [
    { id: "author", label: "Author" },
    ...(authorsStore.pseudonymise ? [] : [{ id: "email", label: "Email" }]),
    { id: "commits", label: "Commits" },
    { id: "additions", label: "Lines added" },
    { id: "deletions", label: "Lines deleted" },
    { id: "files", label: "Files" },
    { id: "components", label: "Components" },
  ],
})
function open(name: string) {
  router.push(detailRoute(name))
}
</script>
