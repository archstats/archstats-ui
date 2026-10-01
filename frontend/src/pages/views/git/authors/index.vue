<template>
  <ViewWorkspaceLayout
    :queryable="false"
    :title="t('pages.gitAuthorsIndex.authors')"
    v-model:search-query="searchQuery"
    :search-placeholder="grain === 'authors' ? t('pages.gitAuthorsIndex.searchAuthors') : t('pages.gitAuthorsIndex.searchComponentsPeople')"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="grain === 'authors' ? tabs : []"
    sidebar-width="300px"
  >
    <template #stats>
      <template v-if="grain === 'components'">
        <span v-if="knowledge.rows.value.length">{{ t('pages.gitAuthorsIndex.components') }} <span class="text-neutral-800">{{ formatNumber(knowledge.summary.value.components) }}</span></span>
        <span v-if="knowledge.rows.value.length" class="text-neutral-400">·</span>
        <span v-if="knowledge.rows.value.length" :title="t('pages.gitAuthorsIndex.componentsNoActiveContributor')">{{ t('pages.gitAuthorsIndex.noActiveContributor') }} <span class="text-neutral-800">{{ formatNumber(knowledge.summary.value.byState.nobody.components) }}</span></span>
        <span v-if="knowledge.rows.value.length" class="text-neutral-400">·</span>
        <span v-if="knowledge.rows.value.length"><I18nT k="pages.gitAuthorsIndex.activePeople"><template #span><span class="text-neutral-800">{{ t('pages.gitAuthorsIndex.of', { peopleHere: formatNumber(knowledge.summary.value.peopleHere), people: formatNumber(knowledge.summary.value.people) }) }}</span></template></I18nT></span>
      </template>
      <span v-else-if="rows.length" :title="t('pages.gitAuthorsIndex.everyoneWhoCommittedFile')">
{{ t('pages.gitAuthorsIndex.contributors') }} <span class="text-neutral-800">
          <template v-if="filtered.length !== rows.length">{{ t('pages.gitAuthorsIndex.of2', { filteredLength: formatNumber(filtered.length) }) + ' ' }} </template>{{ formatNumber(rows.length) }}
        </span>
      </span>
    </template>

    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.gitAuthorsIndex.rows')">
        <button type="button" :aria-pressed="grain === 'components'" :title="t('pages.gitAuthorsIndex.perComponentHowMuch')" @click="setGrain('components')">{{ t('pages.gitAuthorsIndex.knowledge') }}</button>
        <button type="button" :aria-pressed="grain === 'authors'" :title="t('pages.gitAuthorsIndex.perPersonWhatThey')" @click="setGrain('authors')">{{ t('pages.gitAuthorsIndex.people') }}</button>
      </div>
      <div v-if="grain === 'authors'" class="ui-segmented" role="group" :aria-label="t('pages.gitAuthorsIndex.period')">
        <button v-for="p in periods" :key="p.id" type="button" :aria-pressed="period === p.id" :title="anchorLabel(p.days)" @click="period = p.id">{{ p.label }}</button>
      </div>
      <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="authorsStore.pseudonymise" :class="{ 'bg-neutral-100': authorsStore.pseudonymise }"
              :title="t('pages.gitAuthorsIndex.showEveryAuthorAuthor')"
              @click="authorsStore.setPseudonymise(!authorsStore.pseudonymise)">
        <Icon icon="user" :size="13" class="text-neutral-500"/>
        <span>{{ authorsStore.pseudonymise ? t('pages.gitAuthorsIndex.pseudonymised') : t('pages.gitAuthorsIndex.showAuthor1N') }}</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="authorsStore.showBots" :class="{ 'bg-neutral-100': authorsStore.showBots }"
              :title="t('pages.gitAuthorsIndex.dependencyBumpersCiAccounts')"
              @click="authorsStore.setShowBots(!authorsStore.showBots)">
        <Icon :icon="authorsStore.showBots ? 'eye' : 'eye-off'" :size="13" class="text-neutral-500"/>
        <span>{{ authorsStore.showBots ? t('pages.gitAuthorsIndex.botsShown') : t('pages.gitAuthorsIndex.botsHidden') }}</span>
      </button>
    </template>

    <template #visualizer>
      <KnowledgeView v-if="grain === 'components'" v-model:focused="focusedComponent" :k="knowledge" :search="searchQuery"/>
      <LoadingState v-else-if="loading" :text="t('pages.gitAuthorsIndex.readingAuthors')"/>
      <EmptyState v-else-if="error" :title="t('pages.gitAuthorsIndex.couldNotReadAuthors')" :text="error" icon="alert"/>
      <EmptyState
        v-else-if="rows.length === 0"
        :title="t('pages.gitAuthorsIndex.noAuthorsSnapshot')"
        :text="t('pages.gitAuthorsIndex.scanHasNoGit')"
        icon="users"
      />
      <EmptyState v-else-if="filtered.length === 0" :title="t('pages.gitAuthorsIndex.noAuthorsMatch')" :text="t('pages.gitAuthorsIndex.nothingMatches', { searchQuery })" icon="search">
        <button type="button" class="ui-btn ui-btn-sm" @click="searchQuery = ''">{{ t('pages.gitAuthorsIndex.clearSearch') }}</button>
      </EmptyState>
      <ExhibitFrame v-else :exhibit="authorTable" class="grow" fill header-class="h-9 shrink-0 px-4 hairline-b">
        <template #aside>{{ filtered.length.toLocaleString(intlLocale) }} {{t('common.noun.author', { count: filtered.length })}}</template>
        <div class="absolute inset-0 overflow-auto">
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
                <td class="text-right" :title="t('pages.gitAuthorsIndex.lastCommitCountedBack', { value: a.here ? t('pages.gitAuthorsIndex.active') : t('pages.gitAuthorsIndex.notActive'), idle: agoLabel(a.idle) })">
                  <span class="inline-flex items-center justify-end gap-1.5 font-mono text-sm tabular-nums" :class="a.here ? 'text-neutral-800' : 'text-neutral-500'">
                    <span class="h-1.5 w-1.5 rounded-full" :class="a.here ? 'bg-blue-500' : 'bg-neutral-300'" aria-hidden="true"></span>
                    {{ agoLabel(a.idle) }}
                  </span>
                </td>
                <td class="is-num text-right" :title="a.keeps ? t('pages.gitAuthorsIndex.mostActiveContributorSole', { components: t('common.count.component', { count: a.keeps }), keepsOnly: a.keepsOnly }) : undefined">
                  <template v-if="a.keeps">{{ formatNumber(a.keeps) }}</template><span v-else class="text-neutral-400">—</span>
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
      </ExhibitFrame>
    </template>

    <template #tab-author>
      <template v-if="selected">
        <div class="flex flex-col gap-1">
          <router-link :to="detailRoute(selected.name)" class="truncate text-base font-semibold text-neutral-900 hover:underline">{{ selected.shown }}</router-link>
          <span v-if="selected.email" class="truncate font-mono text-sm text-neutral-500" :title="selected.email">{{ selected.email }}</span>
        </div>
        <!-- The same person under another name: merged by hand, per workspace. -->
        <section v-if="authorsStore.pseudonymise" class="flex flex-col gap-2">
          <h3 class="ui-section-title">{{ t('pages.gitAuthorsIndex.alsoCommitted') }}</h3>
          <p class="text-sm leading-4 text-neutral-500">{{ t('pages.gitAuthorsIndex.namesHiddenWhileAuthors') }}</p>
        </section>
        <section v-else class="flex flex-col gap-2">
          <h3 class="ui-section-title">{{ t('pages.gitAuthorsIndex.alsoCommitted') }}</h3>
          <ul v-if="mergedInto(selected.name).length" class="flex flex-col gap-1">
            <li v-for="alias in mergedInto(selected.name)" :key="alias" class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm text-neutral-700" :title="alias">{{ alias }}</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('pages.gitAuthorsIndex.countSeparatelyAgain', { alias })" @click="authorsStore.unmerge(alias)">{{ t('pages.gitAuthorsIndex.separate') }}</button>
            </li>
          </ul>
          <SingleSelect :model-value="null" :options="mergeOptions" :placeholder="t('pages.gitAuthorsIndex.samePerson')" @update:model-value="mergeSelected"/>
          <p class="text-sm leading-4 text-neutral-500">{{ t('pages.gitAuthorsIndex.mergingFoldsOtherName') }}</p>
        </section>
        <section class="flex flex-col gap-2">
          <h3 class="ui-section-title">{{ t('pages.gitAuthorsIndex.mostActive') }}</h3>
          <p v-if="!selected.keeps" class="text-sm leading-4 text-neutral-500">{{ selected.here ? t('pages.gitAuthorsIndex.notMostActiveContributor') : t('pages.gitAuthorsIndex.lastCommittedNoLonger', { idle: agoLabel(selected.idle) }) }}</p>
          <template v-else>
            <p class="text-sm leading-4 text-neutral-600">{{ t('pages.gitAuthorsIndex.mostActiveContributor', { components: t('common.count.component', { count: selected.keeps }) }) }}<template v-if="selected.keepsOnly">{{ t('pages.gitAuthorsIndex.soleActiveContributorThem', { keepsOnly: formatNumber(selected.keepsOnly) }) }}</template>.</p>
            <ul class="flex flex-col">
              <li v-for="r in keptBy(selected.name)" :key="r.component" class="flex h-6 items-center gap-2">
                <router-link :to="componentPath(r.component)" class="min-w-0 flex-1 truncate font-mono text-sm text-neutral-800 hover:underline" :title="r.component">{{ r.component }}</router-link>
                <span class="font-mono text-xs tabular-nums text-neutral-500" :title="t('pages.gitAuthorsIndex.linesCode')">{{ formatNumber(r.lines) }}</span>
              </li>
            </ul>
          </template>
        </section>
        <section v-for="p in periods" :key="p.id" class="flex flex-col gap-2">
          <h3 class="ui-section-title" :class="{ 'text-neutral-900': p.id === period }">{{ p.title }}</h3>
          <dl class="ui-kv">
            <dt>{{ t('pages.gitAuthorsIndex.commits') }}</dt><dd>{{ formatNumber(selected.byPeriod[p.id].commits) }}</dd>
            <dt>{{ t('pages.gitAuthorsIndex.linesAdded') }}</dt><dd class="text-green-700">{{ formatSigned(selected.byPeriod[p.id].additions) }}</dd>
            <dt>{{ t('pages.gitAuthorsIndex.linesRemoved') }}</dt><dd class="text-red-700">{{ formatSigned(-selected.byPeriod[p.id].deletions) }}</dd>
            <dt>{{ t('pages.gitAuthorsIndex.files') }}</dt><dd>{{ formatNumber(selected.byPeriod[p.id].files) }}</dd>
            <dt>{{ t('pages.gitAuthorsIndex.components') }}</dt><dd>{{ formatNumber(selected.byPeriod[p.id].components) }}</dd>
          </dl>
        </section>
        <div class="pt-1">
          <router-link :to="detailRoute(selected.name)" class="ui-btn ui-btn-sm ui-btn-primary">
            <Icon icon="arrow-up-right" :size="13"/>
            <span>{{ t('pages.gitAuthorsIndex.open') }}</span>
          </router-link>
        </div>
      </template>
      <p v-else class="text-sm leading-4 text-neutral-500">{{ t('pages.gitAuthorsIndex.selectAuthorSeeTheir') }}</p>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import { anchorLabel, anchorSql } from "~/features/git/history"
import { AUTHOR_PERIODS, authorStatsSql, namesOf, periodStats } from "~/features/git/authors"
import { useAuthorsStore } from "~/features/git/authors.store"
import { scopeWhere } from "~/features/groups/scopeSql"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import SingleSelect from "~/shared/ui/SingleSelect.vue"
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import KnowledgeView from "~/features/git/components/KnowledgeView.vue"
import { useKnowledgeLeft } from "~/features/git/useKnowledgeLeft"
import { componentPath } from "~/features/navigation/routes"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useTable } from "~/features/export/useExportables"
import { formatNumber, formatSigned } from "~/shared/format"
import Icon from "~/shared/ui/Icon.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t, intlLocale } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT"

const store = useDataStore()
const router = useRouter()
const route = useRoute()
// Authors, or components by how concentrated their authorship is.
// Knowledge ("components", the default) reads who is still here per
// component; People ("authors") is the list of contributors.
const grain = computed(() => (route.query.grain === "authors" ? "authors" : "components"))
function setGrain(g: "authors" | "components") {
  const query: Record<string, any> = { ...route.query }
  if (g === "authors") query.grain = "authors"; else delete query.grain
  void router.replace({ query })
}
const knowledge = useKnowledgeLeft()
const focusedComponent = ref<string | null>(null)
function keptBy(name: string) {
  return knowledge.rows.value.filter(r => r.ask?.author === name).sort((a, b) => b.lines - a.lines).slice(0, 12)
}
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
const activeTab = ref(grain.value === "authors" ? "author" : "component")
watch(grain, g => { activeTab.value = g === "authors" ? "author" : "component" })
const tabs = [{ id: "author", label: t("pages.gitAuthorsIndex.author") }]

const periods = AUTHOR_PERIODS
type PeriodId = (typeof periods)[number]["id"]
const period = ref<PeriodId>("total")

interface PeriodStats { commits: number; additions: number; deletions: number; files: number; components: number }
interface AuthorRow extends PeriodStats {
  name: string
  /** Days before the anchor of their last commit. */
  idle: number
  /** Committed within the Knowledge window. */
  here: boolean
  keeps: number
  keepsOnly: number
  /** The name on screen: the name, or its pseudonym. */
  shown: string
  email: string
  byPeriod: Record<PeriodId, PeriodStats>
}

// One query for the whole view; period and search work on the loaded rows.
const { data: raw, loading, error } = useAsyncQuery<Record<string, any>[]>(
  () => store.hasView("git_commits")
    ? store.query<Record<string, any>>(authorStatsSql(scopeWhere() ?? "1", { aliases: authorsStore.aliases, includeBots: authorsStore.showBots, anchor: anchorSql() }))
    : Promise.resolve([]),
  [() => authorsStore.aliases, () => authorsStore.showBots, () => scopeWhere()],
  { initial: [] },
)


const rows = computed<AuthorRow[]>(() => raw.value.map(r => {
  const byPeriod = Object.fromEntries(periods.map(p => [p.id, periodStats(r, p.id)])) as Record<PeriodId, PeriodStats>
  return {
    name: String(r.author_name ?? ""),
    shown: authorsStore.display(String(r.author_name ?? "")),
    email: authorsStore.displayEmail(String(r.author_email ?? "")),
    byPeriod,
    idle: Number(r.days_since_last) || 0,
    here: (Number(r.days_since_last) || 0) <= knowledge.windowDays.value,
    keeps: knowledge.holdings.value.get(String(r.author_name ?? ""))?.keeps ?? 0,
    keepsOnly: knowledge.holdings.value.get(String(r.author_name ?? ""))?.only ?? 0,
    ...byPeriod[period.value],
  }
}))

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(a => a.shown.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
})

type SortKey = "name" | "idle" | "keeps" | "commits" | "lines" | "files" | "components"
const columns: Array<{ key: SortKey; label: string; align?: "right"; width?: string }> = [
  { key: "name", label: t("pages.gitAuthorsIndex.author") },
  { key: "idle", label: t("pages.gitAuthorsIndex.lastCommit"), align: "right", width: "w-[120px]" },
  { key: "keeps", label: t("pages.gitAuthorsIndex.mostActive"), align: "right", width: "w-[112px]" },
  { key: "commits", label: t("pages.gitAuthorsIndex.commits"), align: "right", width: "w-[140px]" },
  { key: "lines", label: t("pages.gitAuthorsIndex.lines"), align: "right", width: "w-[160px]" },
  { key: "files", label: t("pages.gitAuthorsIndex.files"), align: "right", width: "w-[80px]" },
  { key: "components", label: t("pages.gitAuthorsIndex.components"), align: "right", width: "w-[110px]" },
]
const sortKey = ref<SortKey>("commits")
const sortDir = ref<"asc" | "desc">("desc")

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortKey.value = key
    sortDir.value = key === "name" || key === "idle" ? "asc" : "desc"
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

function agoLabel(days: number): string {
  if (days < 1) return "today"
  if (days < 60) return t("pages.gitAuthorsIndex.dAgo", { days: Math.round(days) })
  if (days < 540) return t("pages.gitAuthorsIndex.moAgo", { value: Math.round(days / 30) })
  return t("pages.gitAuthorsIndex.yAgo", { value: (days / 365).toFixed(1) })
}

const selectedName = ref<string | null>(null)
const selected = computed(() => rows.value.find(a => a.name === selectedName.value) ?? null)

function detailRoute(name: string): string {
  return authorsStore.authorPath(name)
}

// Every author in the period, as sorted; names go out as they are shown.
const authorTable = useTable({
  get title() { return `Authors (${periods.find(p => p.id === period.value)?.title ?? ""})` },
  rows: () => sorted.value.map(a => ({ author: a.shown, email: a.email, days_since_last_commit: Math.round(a.idle), keeps: a.keeps, commits: a.commits, additions: a.additions, deletions: a.deletions, files: a.files, components: a.components })),
  columns: () => [
    { id: "author", label: t("pages.gitAuthorsIndex.author") },
    ...(authorsStore.pseudonymise ? [] : [{ id: "email", label: t("pages.gitAuthorsIndex.email") }]),
    { id: "days_since_last_commit", label: t("pages.gitAuthorsIndex.daysSinceLastCommit") },
    { id: "keeps", label: t("pages.gitAuthorsIndex.mostActiveComponents") },
    { id: "commits", label: t("pages.gitAuthorsIndex.commits") },
    { id: "additions", label: t("pages.gitAuthorsIndex.linesAdded") },
    { id: "deletions", label: t("pages.gitAuthorsIndex.linesDeleted") },
    { id: "files", label: t("pages.gitAuthorsIndex.files") },
    { id: "components", label: t("pages.gitAuthorsIndex.components") },
  ],
})
function open(name: string) {
  router.push(detailRoute(name))
}
</script>
