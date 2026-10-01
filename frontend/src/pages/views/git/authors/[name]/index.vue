<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="loading" :text="t('pages.gitAuthorsIndex.readingAuthorActivity')"/>
    <EmptyState v-else-if="error" :title="t('pages.gitAuthorsIndex.couldNotReadAuthor')" :text="error" icon="alert"/>
    <EmptyState v-else-if="!profile.row" :title="t('pages.gitAuthorsIndex.noActivityRecorded')" :text="t('pages.gitAuthorsIndex.madeNoCommitsFiles', { name })" icon="user"/>
    <div v-else class="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <!-- Headline numbers: six cells, one hairline strip. -->
      <StatStrip :cells="strip"/>
      <p v-if="quietFor" class="mt-2 text-sm text-neutral-500">{{ quietFor }}</p>

      <!-- Knows best: where this author wrote the largest share of what is there. -->
      <section class="mt-8" aria-labelledby="knows-title">
        <div class="flex items-baseline justify-between">
          <h3 id="knows-title" class="ui-section-title">{{ t('pages.gitAuthorsIndex.knowsBest') }}</h3>
          <span class="text-sm text-neutral-500">{{ t('pages.gitAuthorsIndex.howMuchEachComponent') }}</span>
        </div>
        <LoadingState v-if="knowsLoading" :text="t('pages.gitAuthorsIndex.readingComponents')"/>
        <p v-else-if="knows.length === 0" class="mt-2 text-sm text-neutral-500">{{ t('pages.gitAuthorsIndex.noCommitsComponentSnapshot') }}</p>
        <p v-else-if="alone.length" class="mt-2 text-sm text-neutral-600">
          {{ t('pages.gitAuthorsIndex.noOtherActiveContributor', { value: alone.length === knows.length ? t('pages.gitAuthorsIndex.everyOneThese') : t('pages.gitAuthorsIndex.these', { aloneLength: alone.length }), value2: alone.slice(0, 3).join(", "), value3: alone.length > 3 ? t('pages.gitAuthorsIndex.more', { value: alone.length - 3 }) : "" }) }}
        </p>
        <table v-else class="ui-table mt-2">
          <thead>
            <tr>
              <th>{{ t('pages.gitAuthorsIndex.component') }}</th>
              <th class="w-[220px]">{{ t('pages.gitAuthorsIndex.shareLinesAdded') }}</th>
              <th class="w-[220px]" :title="t('pages.gitAuthorsIndex.activeContributorOtherThan')">{{ t('pages.gitAuthorsIndex.nextActiveContributor') }}</th>
              <th class="w-[100px] text-right">{{ t('pages.gitAuthorsIndex.commits') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="k in knows" :key="k.component">
              <td class="max-w-0">
                <router-link :to="componentPath(k.component)" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="k.component">{{ k.component }}</router-link>
              </td>
              <td>
                <span class="flex items-center gap-2">
                  <span class="h-1.5 flex-1 rounded-full bg-neutral-100"><span class="block h-1.5 rounded-full bg-blue-500" :style="{ width: Math.round(k.share * 100) + '%' }"></span></span>
                  <span class="w-10 text-right font-mono text-sm text-neutral-700">{{ Math.round(k.share * 100) }}%</span>
                </span>
              </td>
              <td class="max-w-0">
                <span v-if="nextHere(k.component)" class="flex items-center gap-1.5">
                  <router-link :to="authorsStore.authorPath(nextHere(k.component)!.author)" class="min-w-0 truncate text-neutral-800 hover:underline">{{ authorsStore.display(nextHere(k.component)!.author) }}</router-link>
                  <span class="shrink-0 font-mono text-sm text-neutral-500">{{ Math.round(nextHere(k.component)!.share * 100) }}%</span>
                </span>
                <span v-else class="text-neutral-500">—</span>
              </td>
              <td class="is-num text-right">{{ formatNumber(k.commits) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Activity by period: the engine's day buckets for this author. -->
      <section class="mt-8" aria-labelledby="period-title">
        <h3 id="period-title" class="ui-section-title">{{ t('pages.gitAuthorsIndex.activityPeriod') }}</h3>
        <table class="ui-table mt-2">
          <thead>
            <tr>
              <th>{{ t('pages.gitAuthorsIndex.metric') }}</th>
              <th v-for="p in periods" :key="p.id" class="w-[120px] text-right">{{ p.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in periodMetrics" :key="m.key">
              <td>{{ m.label }}</td>
              <td v-for="p in periods" :key="p.id" class="is-num text-right">{{ formatNumber(periodStats(profile.row, p.id)[m.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Works with: authors who committed to the same components. -->
      <section class="mt-8 hairline-t pt-5" aria-labelledby="partners-title">
        <div class="flex items-baseline justify-between">
          <h3 id="partners-title" class="ui-section-title">{{ t('pages.gitAuthorsIndex.works') }}</h3>
          <span class="text-sm text-neutral-500">{{ t('pages.gitAuthorsIndex.authorsWhoCommittedSame') }}</span>
        </div>
        <LoadingState v-if="partnersLoading" :text="t('pages.gitAuthorsIndex.findingCoAuthors')"/>
        <EmptyState v-else-if="partnersError" :title="t('pages.gitAuthorsIndex.couldNotReadCo')" :text="partnersError" icon="alert"/>
        <EmptyState v-else-if="partners.length === 0" :title="t('pages.gitAuthorsIndex.noCoAuthors')" :text="t('pages.gitAuthorsIndex.nobodyElseHasCommitted', { name })" icon="users"/>
        <table v-else class="ui-table mt-2">
          <thead>
            <tr>
              <th>{{ t('pages.gitAuthorsIndex.author') }}</th>
              <th class="w-[160px] text-right">{{ t('pages.gitAuthorsIndex.sharedComponents') }}</th>
              <th class="w-[120px] text-right">{{ t('pages.gitAuthorsIndex.commits') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in partners" :key="p.author_name">
              <td class="max-w-0">
                <router-link :to="authorsStore.authorPath(p.author_name)" class="block truncate text-neutral-800 hover:text-neutral-900 hover:underline">{{ authorsStore.display(p.author_name) }}</router-link>
              </td>
              <td class="is-num text-right">{{ formatNumber(p.shared_components) }}</td>
              <td class="is-num text-right">{{ formatNumber(p.commits) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { anchorSql } from "~/features/git/history"
import StatStrip from "~/features/metrics/components/StatStrip.vue"
import { computed, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { sqlLiteral } from "~/shared/sql"
import { formatNumber, formatSigned } from "~/shared/format"
import { formatDate } from "~/shared/time"
import { AUTHOR_PERIODS, IN_SNAPSHOT, NOT_BOT_SQL, authorNamesSql, authorStatsSql, canonicalAuthorSql, periodStats, type AuthorPeriodStats } from "~/features/git/authors"
import { useAuthorsStore } from "~/features/git/authors.store"
import { useKnowledgeLeft } from "~/features/git/useKnowledgeLeft"
import type { Holder } from "~/features/git/knowledgeLeft"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { componentPath } from "~/features/navigation/routes"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t, dateLocale } from "~/shared/i18n"

const route = useRoute()
const store = useDataStore()

const name = computed(() => useAuthorsStore().resolve(String(route.params.name ?? "")))
const authorsStore = useAuthorsStore()
const workspaces = useWorkspacesStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })
/** Every name this person committed under, as SQL. */
const me = computed(() => authorNamesSql(authorsStore.aliases, name.value))

// Who else could be asked: per component, the person still here, other than
// this one, who wrote the most of it.
const knowledge = useKnowledgeLeft()
const byComponent = computed(() => new Map(knowledge.all.value.map(r => [r.component, r])))
function nextHere(component: string): Holder | null {
  return byComponent.value.get(component)?.holders.find(h => h.here && h.author !== name.value) ?? null
}
const alone = computed(() => knows.value.filter(k => (nextHere(k.component)?.share ?? 0) < 0.1).map(k => k.component.split(/[./\\]/).pop() || k.component))

interface Profile { row: Record<string, any> | null }

const { data: profile, loading, error } = useAsyncQuery<Profile>(
  async () => {
    const rows = await store.query<Record<string, any>>(authorStatsSql(me.value, { aliases: authorsStore.aliases, includeBots: true, anchor: anchorSql() }))
    return { row: rows[0] ?? null }
  },
  [name, () => authorsStore.aliases],
  { initial: { row: null } },
)

const total = computed(() => periodStats(profile.value.row, "total"))
const first = computed(() => profile.value.row?.first_commit as string | undefined)
const last = computed(() => profile.value.row?.last_commit as string | undefined)

const strip = computed(() => [
  { label: t("pages.gitAuthorsIndex.commits"), value: formatNumber(total.value.commits) },
  { label: t("pages.gitAuthorsIndex.additions"), value: formatSigned(total.value.additions) },
  { label: t("pages.gitAuthorsIndex.deletions"), value: formatSigned(-total.value.deletions) },
  { label: t("pages.gitAuthorsIndex.filesChanged"), value: formatNumber(total.value.files) },
  { label: t("pages.gitAuthorsIndex.componentsTouched"), value: formatNumber(total.value.components) },
  { label: t("pages.gitAuthorsIndex.active"), value: first.value ? `${formatMonthYear(first.value)} – ${formatMonthYear(last.value ?? first.value)}` : "—" },
])

// Every period column reads 0 for someone who stopped a while ago; say that
// once instead of leaving a table of zeros to be decoded.
const quietFor = computed(() => {
  const days = Number(profile.value.row?.days_since_last)
  if (!Number.isFinite(days) || days < 180) return ""
  const years = days / 365
  const span = years >= 1.5 ? t("pages.gitAuthorsIndex.years", { years: years.toFixed(1) }) : t("pages.gitAuthorsIndex.months", { value: Math.round(days / 30) })
  return t("pages.gitAuthorsIndex.noCommitsBeforeScan", { span, value: formatMonthYear(last.value ?? "") })
})

const periods = AUTHOR_PERIODS
const periodMetrics: Array<{ key: keyof AuthorPeriodStats; label: string }> = [
  { key: "commits", label: t("pages.gitAuthorsIndex.commits") },
  { key: "additions", label: t("pages.gitAuthorsIndex.additions") },
  { key: "deletions", label: t("pages.gitAuthorsIndex.deletions") },
  { key: "files", label: t("pages.gitAuthorsIndex.filesChanged") },
  { key: "components", label: t("pages.gitAuthorsIndex.componentsChanged") },
]

// Knows best: the components where this author added the largest share of
// all lines ever added, counted in the snapshot's scope. A proxy for who
// holds the knowledge, not a blame of who owns the current lines.
interface Known { component: string; share: number; commits: number }
const { data: knows, loading: knowsLoading } = useAsyncQuery<Known[]>(
  () => store.query<Known>(`
    WITH mine AS (
      SELECT component, sum(coalesce(file_additions, 0)) AS added, count(DISTINCT commit_hash) AS commits
      FROM git_commits
      WHERE ${me.value} AND ${IN_SNAPSHOT} AND component IS NOT NULL AND component != ''
      GROUP BY component
    ),
    everyone AS (
      SELECT component, sum(coalesce(file_additions, 0)) AS added
      FROM git_commits WHERE ${IN_SNAPSHOT} AND component IN (SELECT component FROM mine)
      GROUP BY component
    )
    SELECT mine.component AS component, mine.added * 1.0 / everyone.added AS share, mine.commits AS commits
    FROM mine JOIN everyone USING (component)
    WHERE everyone.added > 0
    ORDER BY mine.added DESC
    LIMIT 8`),
  [name, () => authorsStore.aliases],
  { initial: [] },
)

interface Partner { author_name: string; shared_components: number; commits: number }

const { data: partners, loading: partnersLoading, error: partnersError } = useAsyncQuery<Partner[]>(
  () => store.query<Partner>(`
    SELECT ${canonicalAuthorSql(authorsStore.aliases)} AS author_name,
           count(DISTINCT component) AS shared_components,
           count(DISTINCT commit_hash) AS commits
    FROM git_commits
    -- A deleted file belongs to no component. Older snapshots store that as
    -- '', which every deleted file shares, so any two authors who ever
    -- touched a deleted file anywhere read as partners.
    WHERE component IS NOT NULL AND component != '' AND ${IN_SNAPSHOT}
      AND component IN (SELECT DISTINCT component FROM git_commits WHERE ${me.value} AND component IS NOT NULL AND component != '')
      AND NOT ${me.value} AND ${NOT_BOT_SQL}
    GROUP BY 1
    ORDER BY shared_components DESC, commits DESC
    LIMIT 10`),
  [name, () => authorsStore.aliases],
  { initial: [] },
)

function formatMonthYear(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(dateLocale, { month: "short", year: "numeric" })
}
</script>
