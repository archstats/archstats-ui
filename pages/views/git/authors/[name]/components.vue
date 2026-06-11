<template>
  <div class="w-full flex flex-col gap-6">
    <section class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-2">
        <div>
          <h3 class="text-sm font-bold text-slate-800 tracking-tight">Components Contributed To</h3>
          <p class="text-xs text-slate-400">All components this author has committed code to, ranked by activity</p>
        </div>
        <span class="text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
          {{ componentRows.length }} components
        </span>
      </div>

      <div v-if="componentRows.length === 0" class="text-slate-400 italic text-sm py-12 text-center">
        No component data recorded for this author.
      </div>

      <div v-else class="w-full overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-slate-100">
              <th
                v-for="col in columns"
                :key="col.key"
                class="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2.5 cursor-pointer hover:text-slate-600 transition-colors select-none"
                :class="col.align === 'right' ? 'text-right pl-4' : 'pr-4'"
                @click="toggleSort(col.key)"
              >
                <span class="inline-flex items-center gap-1">
                  {{ col.label }}
                  <svg v-if="sortKey === col.key" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-2.5 h-2.5 transition-transform" :class="sortDir === 'desc' ? '' : 'rotate-180'">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="row.component"
              class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer group"
              @click="navigateTo(`/views/components/${row.component}`)"
            >
              <td class="text-xs font-bold text-slate-700 py-3 pr-4 group-hover:text-slate-900 transition-colors">
                {{ store.getComponentName(row.component) }}
              </td>
              <td class="text-xs font-black font-mono text-slate-800 py-3 pl-4 text-right">{{ Number(row.commits).toLocaleString() }}</td>
              <td class="text-xs font-black font-mono text-emerald-600 py-3 pl-4 text-right">+{{ Number(row.additions).toLocaleString() }}</td>
              <td class="text-xs font-black font-mono text-rose-600 py-3 pl-4 text-right">-{{ Number(row.deletions).toLocaleString() }}</td>
              <td class="text-xs font-mono text-slate-500 py-3 pl-4 text-right">{{ formatDate(row.first_commit) }}</td>
              <td class="text-xs font-mono text-slate-500 py-3 pl-4 text-right">{{ formatDate(row.last_commit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { useRoute, navigateTo } from "#imports"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const store = useDataStore()

const authorName = computed(() => route.params.name as string)
const escapedName = computed(() => authorName.value.replace(/'/g, "''"))

interface ComponentRow {
  component: string
  commits: number
  additions: number
  deletions: number
  first_commit: string
  last_commit: string
}

const componentRows = computed(() => {
  if (!store.hasData) return []
  return store.query<ComponentRow>(
    `SELECT component,
            count(DISTINCT commit_hash) as commits,
            sum(file_additions) as additions,
            sum(file_deletions) as deletions,
            min(commit_time) as first_commit,
            max(commit_time) as last_commit
     FROM git_commits
     WHERE author_name = '${escapedName.value}'
     GROUP BY component
     ORDER BY commits DESC`
  )
})

const columns = [
  { key: "component", label: "Component", align: "left" },
  { key: "commits", label: "Commits", align: "right" },
  { key: "additions", label: "Additions", align: "right" },
  { key: "deletions", label: "Deletions", align: "right" },
  { key: "first_commit", label: "First Commit", align: "right" },
  { key: "last_commit", label: "Last Commit", align: "right" }
]

const sortKey = ref("commits")
const sortDir = ref<"asc" | "desc">("desc")

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortKey.value = key
    sortDir.value = "desc"
  }
}

const sortedRows = computed(() => {
  const rows = [...componentRows.value]
  const key = sortKey.value as keyof ComponentRow
  const dir = sortDir.value === "asc" ? 1 : -1
  return rows.sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]
    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * dir
    }
    return (Number(aVal) - Number(bVal)) * dir
  })
})

function formatDate(timeString: string | number) {
  if (!timeString) return "—"
  const date = new Date(timeString)
  return isNaN(date.getTime()) ? String(timeString) : date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>
