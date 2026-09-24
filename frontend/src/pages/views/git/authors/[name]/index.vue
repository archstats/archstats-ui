<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="loading" text="Reading author activity…"/>
    <EmptyState v-else-if="error" title="Could not read author activity" :text="error" icon="alert"/>
    <EmptyState v-else-if="!profile.row" title="No activity recorded" :text="`${name} made no commits to files in this snapshot.`" icon="user"/>
    <div v-else class="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <!-- Headline numbers: six cells, one hairline strip. -->
      <StatStrip :cells="strip"/>
      <p v-if="quietFor" class="mt-2 text-sm text-neutral-500">{{ quietFor }}</p>

      <!-- Knows best: where this author wrote the largest share of what is there. -->
      <section class="mt-8" aria-labelledby="knows-title">
        <div class="flex items-baseline justify-between">
          <h3 id="knows-title" class="ui-section-title">Knows best</h3>
          <span class="text-sm text-neutral-500">Their share of the lines ever added to each component</span>
        </div>
        <LoadingState v-if="knowsLoading" text="Reading components…"/>
        <p v-else-if="knows.length === 0" class="mt-2 text-sm text-neutral-500">No commits to a component in this snapshot.</p>
        <table v-else class="ui-table mt-2">
          <thead>
            <tr>
              <th>Component</th>
              <th class="w-[220px]">Share of lines added</th>
              <th class="w-[100px] text-right">Commits</th>
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
              <td class="is-num text-right">{{ formatNumber(k.commits) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Activity by period: the engine's day buckets for this author. -->
      <section class="mt-8" aria-labelledby="period-title">
        <h3 id="period-title" class="ui-section-title">Activity by period</h3>
        <table class="ui-table mt-2">
          <thead>
            <tr>
              <th>Metric</th>
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
          <h3 id="partners-title" class="ui-section-title">Works with</h3>
          <span class="text-sm text-neutral-500">Authors who committed to the same components</span>
        </div>
        <LoadingState v-if="partnersLoading" text="Finding co-authors…"/>
        <EmptyState v-else-if="partnersError" title="Could not read co-authors" :text="partnersError" icon="alert"/>
        <EmptyState v-else-if="partners.length === 0" title="No co-authors" :text="`Nobody else has committed to the components ${name} touched.`" icon="users"/>
        <table v-else class="ui-table mt-2">
          <thead>
            <tr>
              <th>Author</th>
              <th class="w-[160px] text-right">Shared components</th>
              <th class="w-[120px] text-right">Commits</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in partners" :key="p.author_name">
              <td class="max-w-0">
                <router-link :to="`/views/git/authors/${encodeURIComponent(p.author_name)}`" class="block truncate text-neutral-800 hover:text-neutral-900 hover:underline">{{ p.author_name }}</router-link>
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
import { anchorSql } from "~/utils/history"
import StatStrip from "~/components/detail/StatStrip.vue"
import { computed, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber, formatSigned } from "~/utils/format"
import { formatDate } from "~/utils/time"
import { AUTHOR_PERIODS, IN_SNAPSHOT, NOT_BOT_SQL, authorNamesSql, authorStatsSql, canonicalAuthorSql, periodStats, type AuthorPeriodStats } from "~/utils/authors"
import { useAuthorsStore } from "~/stores/authors"
import { useWorkspacesStore } from "~/stores/workspaces"
import { componentPath } from "~/utils/routes"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))
const authorsStore = useAuthorsStore()
const workspaces = useWorkspacesStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })
/** Every name this person committed under, as SQL. */
const me = computed(() => authorNamesSql(authorsStore.aliases, name.value))

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
  { label: "Commits", value: formatNumber(total.value.commits) },
  { label: "Additions", value: formatSigned(total.value.additions) },
  { label: "Deletions", value: formatSigned(-total.value.deletions) },
  { label: "Files changed", value: formatNumber(total.value.files) },
  { label: "Components touched", value: formatNumber(total.value.components) },
  { label: "Active", value: first.value ? `${formatMonthYear(first.value)} – ${formatMonthYear(last.value ?? first.value)}` : "—" },
])

// Every period column reads 0 for someone who stopped a while ago; say that
// once instead of leaving a table of zeros to be decoded.
const quietFor = computed(() => {
  const days = Number(profile.value.row?.days_since_last)
  if (!Number.isFinite(days) || days < 180) return ""
  const years = days / 365
  const span = years >= 1.5 ? `${years.toFixed(1)} years` : `${Math.round(days / 30)} months`
  return `No commits in the ${span} before this scan; the last was in ${formatMonthYear(last.value ?? "")}.`
})

const periods = AUTHOR_PERIODS
const periodMetrics: Array<{ key: keyof AuthorPeriodStats; label: string }> = [
  { key: "commits", label: "Commits" },
  { key: "additions", label: "Additions" },
  { key: "deletions", label: "Deletions" },
  { key: "files", label: "Files changed" },
  { key: "components", label: "Components changed" },
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
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}
</script>
