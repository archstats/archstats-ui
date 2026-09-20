<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="loading" text="Reading author activity…"/>
    <EmptyState v-else-if="error" title="Could not read author activity" :text="error" icon="alert"/>
    <EmptyState v-else-if="!profile.row" title="No activity recorded" :text="`${name} has no row in git_authors for this snapshot.`" icon="user"/>
    <div v-else class="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <!-- Headline numbers: six cells, one hairline strip. -->
      <StatStrip :cells="strip"/>

      <!-- Activity by period: the engine's day buckets for this author. -->
      <section class="mt-8" aria-labelledby="period-title">
        <h3 id="period-title" class="ui-section-title">Activity by period</h3>
        <table class="ui-table mt-2">
          <thead>
            <tr>
              <th>Metric</th>
              <th v-for="p in periods" :key="p.suffix" class="w-[120px] text-right">{{ p.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in periodMetrics" :key="m.key">
              <td>{{ m.label }}</td>
              <td v-for="p in periods" :key="p.suffix" class="is-num text-right">{{ formatNumber(value(`git__${m.key}${p.suffix}`)) }}</td>
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
import StatStrip from "~/components/detail/StatStrip.vue"
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber, formatSigned } from "~/utils/format"
import { formatDate } from "~/utils/time"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

interface Profile {
  row: Record<string, any> | null
  firstCommit: string | null
}

const { data: profile, loading, error } = useAsyncQuery<Profile>(
  async () => {
    const [rows, span] = await Promise.all([
      store.query<Record<string, any>>(`SELECT * FROM git_authors WHERE author_name = ${sqlLiteral(name.value)} LIMIT 1`),
      store.query<{ first_commit: string | null }>(`SELECT min(commit_time) AS first_commit FROM git_commits WHERE author_name = ${sqlLiteral(name.value)}`),
    ])
    return { row: rows[0] ?? null, firstCommit: span[0]?.first_commit ?? null }
  },
  [name],
  { initial: { row: null, firstCommit: null } },
)

function value(key: string): number {
  return Number(profile.value.row?.[key]) || 0
}

const strip = computed(() => [
  { label: "Commits", value: formatNumber(value("git__commits__total")) },
  { label: "Additions", value: formatSigned(value("git__additions__total")) },
  { label: "Deletions", value: formatSigned(-value("git__deletions__total")) },
  { label: "Files changed", value: formatNumber(value("git__unique_file_changes__total")) },
  { label: "Components touched", value: formatNumber(value("git__unique_component_changes__total")) },
  { label: "Active since", value: profile.value.firstCommit ? formatMonthYear(profile.value.firstCommit) : "—" },
])

// Column names in git_authors: git__<metric>__total and git__<metric>__last_<n>_days.
const periods = [
  { label: "Total", suffix: "__total" },
  { label: "180 d", suffix: "__last_180_days" },
  { label: "90 d", suffix: "__last_90_days" },
  { label: "30 d", suffix: "__last_30_days" },
]
const periodMetrics = [
  { key: "commits", label: "Commits" },
  { key: "additions", label: "Additions" },
  { key: "deletions", label: "Deletions" },
  { key: "unique_file_changes", label: "Files changed" },
  { key: "unique_component_changes", label: "Components changed" },
]

interface Partner { author_name: string; shared_components: number; commits: number }

const { data: partners, loading: partnersLoading, error: partnersError } = useAsyncQuery<Partner[]>(
  () => store.query<Partner>(`
    SELECT author_name,
           count(DISTINCT component) AS shared_components,
           count(DISTINCT commit_hash) AS commits
    FROM git_commits
    WHERE component IN (SELECT DISTINCT component FROM git_commits WHERE author_name = ${sqlLiteral(name.value)})
      AND author_name != ${sqlLiteral(name.value)}
    GROUP BY author_name
    ORDER BY shared_components DESC, commits DESC
    LIMIT 10`),
  [name],
  { initial: [] },
)

function formatMonthYear(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
}
</script>
