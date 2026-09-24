<template>
  <div class="flex min-h-0 grow flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="relative flex items-center">
        <Icon icon="search" :size="13" class="pointer-events-none absolute left-2 text-neutral-400"/>
        <input v-model="search" type="search" placeholder="Search components" class="ui-input ui-input-sm w-64 pl-7" aria-label="Search components">
      </div>
      <span class="ui-toolbar-meta ml-auto">
        <template v-if="search.trim()">{{ formatNumber(filtered.length) }} of {{ formatNumber(rows.length) }}</template>
        <template v-else>{{ formatNumber(rows.length) }} components</template>
      </span>
    </div>

    <LoadingState v-if="loading" text="Reading components…"/>
    <EmptyState v-else-if="error" title="Could not read components" :text="error" icon="alert"/>
    <EmptyState v-else-if="rows.length === 0" title="No components recorded" :text="`${name} has no commits attributed to a component in this snapshot.`" icon="boxes"/>
    <EmptyState v-else-if="filtered.length === 0" title="No components match" :text="`0 of ${rows.length} match “${search.trim()}”.`" icon="search">
      <button type="button" class="ui-btn ui-btn-sm" @click="search = ''">Clear search</button>
    </EmptyState>
    <div v-else class="min-h-0 grow overflow-y-auto">
      <table class="ui-table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key" class="cursor-pointer select-none hover:text-neutral-900" :class="[col.align === 'right' ? 'text-right' : '', col.width]" @click="toggleSort(col.key)">
              <span class="inline-flex items-center gap-1">{{ col.label }}<Icon v-if="sortKey === col.key" :icon="sortAsc ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sorted" :key="row.component">
            <td class="max-w-0">
              <router-link v-if="row.component" :to="componentPath(row.component)" class="block truncate font-mono text-sm font-medium text-neutral-900 hover:underline" :title="row.component">{{ row.component }}</router-link>
              <span v-else class="block truncate text-sm text-neutral-400">No component</span>
            </td>
            <td class="is-num text-right">{{ formatNumber(row.commits) }}</td>
            <td class="is-num text-right">
              <span class="text-green-700">{{ formatSigned(row.additions) }}</span>
              <span class="ml-1.5 text-red-700">{{ formatSigned(-row.deletions) }}</span>
            </td>
            <td class="is-num text-right">
              <span class="inline-flex items-center gap-1.5" :class="levelTextClass(healthLevel(row.health))">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="levelDotClass(healthLevel(row.health))"></span>{{ formatHealth(row.health) }}
              </span>
            </td>
            <td class="is-num text-right">
              <span class="inline-flex items-center gap-1.5" :class="levelTextClass(hotspotLevel(row.hotspot))">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="levelDotClass(hotspotLevel(row.hotspot))"></span>{{ formatHotspot(row.hotspot) }}
              </span>
            </td>
            <td class="is-num text-right">{{ formatDate(row.first_commit) }}</td>
            <td class="is-num text-right">{{ formatDate(row.last_commit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { componentPath } from "~/utils/routes"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber, formatSigned } from "~/utils/format"
import { formatDate } from "~/utils/time"
import { healthLevel, hotspotLevel, levelDotClass, levelTextClass, formatHealth, formatHotspot } from "~/composables/useHealth"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import Icon from "~/components/ui/common/Icon.vue"

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))
const search = ref("")
watch(name, () => { search.value = "" })

interface QueryRow {
  component: string
  commits: number
  additions: number
  deletions: number
  first_commit: string
  last_commit: string
}
interface Row extends QueryRow {
  health: number | null
  hotspot: number | null
}

const { data: queried, loading, error } = useAsyncQuery<QueryRow[]>(
  () => store.query<QueryRow>(`
    SELECT component,
           count(DISTINCT commit_hash) AS commits,
           sum(file_additions) AS additions,
           sum(file_deletions) AS deletions,
           min(commit_time) AS first_commit,
           max(commit_time) AS last_commit
    FROM git_commits
    WHERE author_name = ${sqlLiteral(name.value)}
    GROUP BY component
    ORDER BY commits DESC`),
  [name],
  { initial: [] },
)

function score(component: any, key: string): number | null {
  if (!component) return null
  const v = component[key] ?? component[store.statName(key)]
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Health and hotspot come from the components already loaded in the store.
const rows = computed<Row[]>(() => queried.value.map(r => {
  const c = store.allComponentsIndex.get(r.component)
  return {
    ...r,
    component: r.component || "",
    commits: Number(r.commits) || 0,
    additions: Number(r.additions) || 0,
    deletions: Number(r.deletions) || 0,
    health: score(c, "codesmells__code_health"),
    hotspot: score(c, "codesmells__hotspot_score"),
  }
}))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.component.toLowerCase().includes(q))
})

type SortKey = "component" | "commits" | "lines" | "health" | "hotspot" | "first_commit" | "last_commit"
const columns: Array<{ key: SortKey; label: string; align?: "right"; width?: string }> = [
  { key: "component", label: "Component" },
  { key: "commits", label: "Commits", align: "right", width: "w-[90px]" },
  { key: "lines", label: "Lines", align: "right", width: "w-[150px]" },
  { key: "health", label: "Health", align: "right", width: "w-[90px]" },
  { key: "hotspot", label: "Hotspot", align: "right", width: "w-[90px]" },
  { key: "first_commit", label: "First", align: "right", width: "w-[110px]" },
  { key: "last_commit", label: "Last", align: "right", width: "w-[110px]" },
]

const sortKey = ref<SortKey>("commits")
const sortAsc = ref(false)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === "component"
  }
}

function sortValue(r: Row, key: SortKey): number | string {
  switch (key) {
    case "component": return r.component
    case "lines": return r.additions + r.deletions
    case "health": return r.health ?? -Infinity
    case "hotspot": return r.hotspot ?? -Infinity
    case "first_commit": return new Date(r.first_commit).getTime() || 0
    case "last_commit": return new Date(r.last_commit).getTime() || 0
    default: return r[key]
  }
}

const sorted = computed(() => {
  const dir = sortAsc.value ? 1 : -1
  const key = sortKey.value
  return [...filtered.value].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir
    return (Number(av) - Number(bv)) * dir
  })
})
</script>
