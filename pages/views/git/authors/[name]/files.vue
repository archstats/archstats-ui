<template>
  <div class="w-full flex flex-col gap-6">
    <section class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-2">
        <div>
          <h3 class="text-sm font-bold text-slate-800 tracking-tight">Files Touched</h3>
          <p class="text-xs text-slate-400">All files this author has committed changes to</p>
        </div>
        <span class="text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
          {{ fileRows.length }} files · Page {{ currentPage }} of {{ totalPages }}
        </span>
      </div>

      <div v-if="fileRows.length === 0" class="text-slate-400 italic text-sm py-12 text-center">
        No file data recorded for this author.
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
              v-for="row in paginatedRows"
              :key="row.file"
              class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer group"
              @click="navigateTo(`/views/files/${encodeURIComponent(row.file)}`)"
            >
              <td class="text-xs font-bold text-slate-700 py-3 pr-4 group-hover:text-slate-900 transition-colors max-w-[280px]">
                <span class="truncate block" :title="row.file">{{ getBasename(row.file) }}</span>
              </td>
              <td class="text-xs text-slate-500 py-3 pr-4">
                <NuxtLink
                  v-if="row.component"
                  :to="`/views/components/${row.component}`"
                  class="hover:text-slate-800 transition-colors font-semibold"
                  @click.stop
                >
                  {{ store.getComponentName(row.component) }}
                </NuxtLink>
                <span v-else class="italic text-slate-300">—</span>
              </td>
              <td class="text-xs font-black font-mono text-slate-800 py-3 pl-4 text-right">{{ Number(row.commits).toLocaleString() }}</td>
              <td class="text-xs font-black font-mono text-emerald-600 py-3 pl-4 text-right">+{{ Number(row.additions).toLocaleString() }}</td>
              <td class="text-xs font-black font-mono text-rose-600 py-3 pl-4 text-right">-{{ Number(row.deletions).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-1.5 pt-2">
        <button
          class="text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all"
          :class="currentPage === 1
            ? 'border-slate-100 text-slate-300 cursor-not-allowed'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
          :disabled="currentPage === 1"
          @click="currentPage = Math.max(1, currentPage - 1)"
        >
          ← Prev
        </button>
        <button
          v-for="page in visiblePages"
          :key="page"
          class="text-[10px] font-bold w-7 h-7 rounded-lg border transition-all"
          :class="page === currentPage
            ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
            : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'"
          @click="currentPage = page"
        >
          {{ page }}
        </button>
        <button
          class="text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all"
          :class="currentPage === totalPages
            ? 'border-slate-100 text-slate-300 cursor-not-allowed'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'"
          :disabled="currentPage === totalPages"
          @click="currentPage = Math.min(totalPages, currentPage + 1)"
        >
          Next →
        </button>
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

interface FileRow {
  file: string
  component: string
  commits: number
  additions: number
  deletions: number
}

const fileRows = computed(() => {
  if (!store.hasData) return []
  return store.query<FileRow>(
    `SELECT file,
            component,
            count(DISTINCT commit_hash) as commits,
            sum(file_additions) as additions,
            sum(file_deletions) as deletions
     FROM git_commits
     WHERE author_name = '${escapedName.value}'
     GROUP BY file
     ORDER BY commits DESC`
  )
})

const columns = [
  { key: "file", label: "File", align: "left" },
  { key: "component", label: "Component", align: "left" },
  { key: "commits", label: "Commits", align: "right" },
  { key: "additions", label: "Additions", align: "right" },
  { key: "deletions", label: "Deletions", align: "right" }
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
  currentPage.value = 1
}

const sortedRows = computed(() => {
  const rows = [...fileRows.value]
  const key = sortKey.value as keyof FileRow
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

// Pagination
const PAGE_SIZE = 25
const currentPage = ref(1)

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / PAGE_SIZE)))

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedRows.value.slice(start, start + PAGE_SIZE)
})

const visiblePages = computed(() => {
  const pages: number[] = []
  const start = Math.max(1, currentPage.value - 2)
  const end = Math.min(totalPages.value, currentPage.value + 2)
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  return pages
})

function getBasename(filepath: string): string {
  const parts = filepath.split('/')
  return parts[parts.length - 1] || filepath
}
</script>
