<template>
  <div class="flex min-h-0 grow flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <div class="relative flex items-center">
        <Icon icon="search" :size="13" class="pointer-events-none absolute left-2 text-neutral-400"/>
        <input v-model="search" type="search" placeholder="Search files" class="ui-input ui-input-sm w-64 pl-7" aria-label="Search files">
      </div>
      <span class="ui-toolbar-meta ml-auto">
        <template v-if="search.trim()">{{ formatNumber(filtered.length) }} of {{ formatNumber(rows.length) }}</template>
        <template v-else>{{ formatNumber(rows.length) }} files</template>
      </span>
      <div v-if="totalPages > 1" class="flex items-center gap-2 text-sm text-neutral-500">
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="page <= 1" aria-label="Previous page" @click="goToPage(page - 1)">
          <Icon :size="14" icon="chevron-left"/>
        </button>
        <span class="font-mono tabular-nums">{{ page }} / {{ totalPages }}</span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="page >= totalPages" aria-label="Next page" @click="goToPage(page + 1)">
          <Icon :size="14" icon="chevron-right"/>
        </button>
      </div>
    </div>

    <LoadingState v-if="loading" text="Reading files…"/>
    <EmptyState v-else-if="error" title="Could not read files" :text="error" icon="alert"/>
    <EmptyState v-else-if="rows.length === 0" title="No files recorded" :text="`${name} has no file changes in this snapshot.`" icon="file-code"/>
    <EmptyState v-else-if="filtered.length === 0" title="No files match" :text="`0 of ${rows.length} match “${search.trim()}”.`" icon="search">
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
          <tr v-for="row in pageRows" :key="row.file">
            <td class="max-w-0">
              <router-link :to="`/views/files/${row.file}`" class="block truncate font-mono text-sm font-medium text-neutral-900 hover:underline" :title="row.file">{{ row.file }}</router-link>
            </td>
            <td class="max-w-0">
              <router-link v-if="row.component" :to="`/views/components/${row.component}`" class="block truncate font-mono text-sm text-neutral-700 hover:text-neutral-900 hover:underline" :title="row.component">{{ row.component }}</router-link>
              <span v-else class="text-neutral-400">—</span>
            </td>
            <td class="is-num text-right">{{ formatNumber(row.commits) }}</td>
            <td class="is-num text-right">
              <span class="text-green-700">{{ formatSigned(row.additions) }}</span>
              <span class="ml-1.5 text-red-700">{{ formatSigned(-row.deletions) }}</span>
            </td>
            <td class="is-num text-right">{{ formatDate(row.last_commit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber, formatSigned } from "~/utils/format"
import { formatDate } from "~/utils/time"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import Icon from "~/components/ui/common/Icon.vue"

const route = useRoute()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))
const search = ref("")

interface Row {
  file: string
  component: string
  commits: number
  additions: number
  deletions: number
  last_commit: string
}

const { data: rows, loading, error } = useAsyncQuery<Row[]>(
  async () => {
    const [changes, files] = await Promise.all([
      store.query<Omit<Row, "component">>(`
        SELECT file,
               count(DISTINCT commit_hash) AS commits,
               sum(file_additions) AS additions,
               sum(file_deletions) AS deletions,
               max(commit_time) AS last_commit
        FROM git_commits
        WHERE author_name = ${sqlLiteral(name.value)}
        GROUP BY file
        ORDER BY commits DESC`),
      store.query<{ name: string; component: string }>("SELECT name, component FROM files"),
    ])
    const componentOf = new Map(files.map(f => [f.name, f.component || ""]))
    return changes.map(r => ({
      file: r.file || "",
      component: componentOf.get(r.file) ?? "",
      commits: Number(r.commits) || 0,
      additions: Number(r.additions) || 0,
      deletions: Number(r.deletions) || 0,
      last_commit: r.last_commit,
    }))
  },
  [name],
  { initial: [] },
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.file.toLowerCase().includes(q) || r.component.toLowerCase().includes(q))
})

type SortKey = "file" | "component" | "commits" | "lines" | "last_commit"
const columns: Array<{ key: SortKey; label: string; align?: "right"; width?: string }> = [
  { key: "file", label: "File" },
  { key: "component", label: "Component", width: "w-[260px]" },
  { key: "commits", label: "Commits", align: "right", width: "w-[90px]" },
  { key: "lines", label: "Lines", align: "right", width: "w-[150px]" },
  { key: "last_commit", label: "Last", align: "right", width: "w-[110px]" },
]

const sortKey = ref<SortKey>("commits")
const sortAsc = ref(false)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === "file" || key === "component"
  }
  page.value = 1
}

function sortValue(r: Row, key: SortKey): number | string {
  switch (key) {
    case "lines": return r.additions + r.deletions
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

// Pagination: 50 rows a page, the same prev/next control ElementTable uses.
const PAGE_SIZE = 50
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE_SIZE)))
const pageRows = computed(() => sorted.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

function goToPage(p: number) {
  page.value = Math.max(1, Math.min(p, totalPages.value))
}

watch(name, () => { search.value = ""; page.value = 1 })
watch(search, () => { page.value = 1 })
watch(totalPages, () => goToPage(page.value))
</script>
