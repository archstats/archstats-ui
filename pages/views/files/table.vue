<template>
  <ViewWorkspaceLayout
    title="File Metrics"
    :badge-text="badgeText"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="400px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full flex flex-col overflow-hidden">
        <div class="flex-1 overflow-auto scroll-container rounded-2xl bg-white border border-slate-200/60 shadow-3xs">
          <table class="w-full text-left border-collapse min-w-[900px]">
            <thead class="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th
                  v-for="col in visibleColumns"
                  :key="col.key"
                  @click="toggleSort(col.key)"
                  class="px-3 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none hover:text-slate-800 transition-colors whitespace-nowrap"
                >
                  <div class="flex items-center gap-1">
                    {{ col.label }}
                    <span v-if="sortCol === col.key" class="text-indigo-500 text-[8px]">
                      {{ sortDir === 'asc' ? '▲' : '▼' }}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="paginatedFiles.length === 0">
                <td :colspan="visibleColumns.length" class="text-center py-12 text-slate-400 text-xs italic">
                  No files match your search.
                </td>
              </tr>
              <tr
                v-for="file in paginatedFiles"
                :key="file.name"
                @click="selectedFile = file"
                class="border-b border-slate-100 transition-all duration-100 cursor-pointer"
                :class="selectedFile?.name === file.name ? 'bg-indigo-50/60 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50/50 border-l-4 border-l-transparent'"
              >
                <td
                  v-for="col in visibleColumns"
                  :key="col.key"
                  class="px-3 py-2 text-[11px] font-mono text-slate-700 whitespace-nowrap"
                >
                  <!-- Code Health badge -->
                  <span v-if="col.key === 'codesmells__code_health'" class="inline-flex">
                    <span
                      class="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border"
                      :class="healthClass(file[col.key])"
                    >
                      {{ formatNum(file[col.key]) }}
                    </span>
                  </span>
                  <!-- Hotspot badge -->
                  <span v-else-if="col.key === 'codesmells__hotspot_score'" class="inline-flex">
                    <span
                      class="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border"
                      :class="hotspotClass(file[col.key])"
                    >
                      {{ formatNum(file[col.key]) }}
                    </span>
                  </span>
                  <!-- File name (truncated) -->
                  <span v-else-if="col.key === 'name'" class="font-semibold text-indigo-600 hover:text-indigo-800 max-w-[280px] truncate block cursor-pointer" :title="file.name" @click.stop="router.push('/views/files/' + file.name)">
                    {{ getBasename(file.name) }}
                  </span>
                  <!-- Directory -->
                  <span v-else-if="col.key === '__directory'" class="text-slate-500 max-w-[200px] truncate block" :title="getDirname(file.name)">
                    {{ getDirname(file.name) }}
                  </span>
                  <!-- Component -->
                  <span v-else-if="col.key === 'component'" class="text-slate-600 font-semibold">
                    {{ file.component || '—' }}
                  </span>
                  <!-- Default numeric -->
                  <span v-else class="tabular-nums">
                    {{ formatNum(file[col.key]) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="tableTotalPages > 1" class="mt-3 flex items-center justify-between select-none px-1">
          <button
            @click="tablePage = Math.max(1, tablePage - 1)"
            :disabled="tablePage === 1"
            class="px-2.5 py-1.5 text-[9px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Prev
          </button>
          <span class="text-[9.5px] text-slate-400 font-bold">
            Page {{ tablePage }} of {{ tableTotalPages }}  ·  {{ filteredFiles.length }} files
          </span>
          <button
            @click="tablePage = Math.min(tableTotalPages, tablePage + 1)"
            :disabled="tablePage === tableTotalPages"
            class="px-2.5 py-1.5 text-[9px] font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </template>

    <!-- SIDEBAR TAB: Table -->
    <template #tab-table>
      <div class="flex flex-col gap-5">
        <!-- Selected file details -->
        <div v-if="selectedFile" class="flex flex-col gap-3">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">File Details</h4>
          <div class="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-3xs flex flex-col gap-2">
            <div class="text-xs font-extrabold text-slate-900 font-mono break-all">{{ getBasename(selectedFile.name) }}</div>
            <div class="text-[9px] text-slate-400 font-mono break-all">{{ selectedFile.name }}</div>
            <div class="border-t border-slate-100 pt-2 mt-1 flex flex-col gap-1.5">
              <div
                v-for="col in allFileColumns"
                :key="col.key"
                class="flex items-center justify-between text-[10px]"
              >
                <span class="text-slate-500 font-semibold">{{ col.label }}</span>
                <span class="font-mono font-bold text-slate-800">{{ formatNum(selectedFile[col.key]) }}</span>
              </div>
            </div>
            <button
              @click="router.push('/views/files/' + selectedFile.name)"
              class="mt-2 w-full px-3 py-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer text-center"
            >
              View Full Details →
            </button>
          </div>
        </div>
        <div v-else class="text-center py-8 text-slate-400 text-xs italic">
          Click a row to view file details.
        </div>

        <!-- Column visibility toggles -->
        <div class="flex flex-col gap-2">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visible Columns</h4>
          <div class="flex flex-col gap-1 max-h-64 overflow-y-auto scroll-container pr-1">
            <label
              v-for="col in allFileColumns"
              :key="col.key"
              class="flex items-center gap-2 text-[10px] text-slate-700 font-semibold py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none"
            >
              <input
                type="checkbox"
                :checked="enabledColumnKeys.has(col.key)"
                @change="toggleColumn(col.key)"
                class="rounded accent-indigo-600"
              />
              {{ col.label }}
            </label>
          </div>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue"
import { useDataStore } from "~/stores/data"

const store = useDataStore()
const router = useRouter()

useSeoMeta({ title: "File Metrics Table" })
definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("table")
const tabs = [
  { id: "table", label: "Table" }
]

const badgeText = computed(() => `${filteredFiles.value.length} Files`)

// ═══════════════════════════════════════════════════════
// TABLE
// ═══════════════════════════════════════════════════════

interface ColumnDef {
  key: string
  label: string
}

const defaultColumnKeys = new Set([
  "name",
  "__directory",
  "component",
  "java_class",
  "java_full_class",
  "complexity__lines",
  "git__commits__total",
  "git__authors__total",
  "git__additions__total",
  "git__deletions__total",
  "codesmells__code_health",
  "codesmells__hotspot_score"
])

// Discover all columns dynamically
const allFileColumns = computed<ColumnDef[]>(() => {
  if (!store.hasData || !store.hasView("files")) return []
  const rawCols = store.query<{ name: string }>("SELECT name FROM PRAGMA_TABLE_INFO('files') ORDER BY 1")
  const cols: ColumnDef[] = []
  cols.push({ key: "name", label: "File" })
  cols.push({ key: "__directory", label: "Directory" })
  for (const r of rawCols) {
    if (["report_id", "timestamp", "name"].includes(r.name)) continue
    cols.push({ key: r.name, label: niceLabel(r.name) })
  }
  return cols
})

const enabledColumnKeys = ref(new Set(defaultColumnKeys))

const visibleColumns = computed(() =>
  allFileColumns.value.filter((c) => enabledColumnKeys.value.has(c.key))
)

function toggleColumn(key: string) {
  const s = new Set(enabledColumnKeys.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  enabledColumnKeys.value = s
}

function niceLabel(col: string): string {
  return col
    .replace(/__/g, " › ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// Query files
const allFiles = computed(() => {
  if (!store.hasData || !store.hasView("files")) return []
  return store.query<Record<string, any>>("SELECT * FROM files ORDER BY name")
})

// Search filter (regex-safe)
const filteredFiles = computed(() => {
  const q = searchQuery.value.trim()
  if (!q) return allFiles.value
  try {
    const re = new RegExp(q, "i")
    return allFiles.value.filter((f) => re.test(String(f.name || "")))
  } catch {
    const lower = q.toLowerCase()
    return allFiles.value.filter((f) => String(f.name || "").toLowerCase().includes(lower))
  }
})

// Sort
const sortCol = ref("name")
const sortDir = ref<"asc" | "desc">("asc")

function toggleSort(col: string) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortCol.value = col
    sortDir.value = "asc"
  }
}

const sortedFiles = computed(() => {
  const arr = [...filteredFiles.value]
  const col = sortCol.value
  const dir = sortDir.value === "asc" ? 1 : -1
  arr.sort((a, b) => {
    const va = col === "__directory" ? getDirname(a.name) : a[col]
    const vb = col === "__directory" ? getDirname(b.name) : b[col]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
  return arr
})

// Pagination
const tablePage = ref(1)
const tablePageSize = 25
const tableTotalPages = computed(() => Math.max(1, Math.ceil(sortedFiles.value.length / tablePageSize)))
const paginatedFiles = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize
  return sortedFiles.value.slice(start, start + tablePageSize)
})

watch(searchQuery, () => {
  tablePage.value = 1
})

const selectedFile = ref<Record<string, any> | null>(null)

// Helpers
function getBasename(path: string): string {
  return path?.split("/").pop() || path
}

function getDirname(path: string): string {
  const parts = (path || "").split("/")
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "/"
}

function formatNum(val: any): string {
  if (val == null || val === "") return "—"
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function healthClass(val: any): string {
  const n = Number(val)
  if (isNaN(n) || val == null) return "bg-slate-50 text-slate-400 border-slate-200"
  if (n >= 8) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (n >= 5) return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-rose-50 text-rose-700 border-rose-200"
}

function hotspotClass(val: any): string {
  const n = Number(val)
  if (isNaN(n) || val == null) return "bg-slate-50 text-slate-400 border-slate-200"
  if (n >= 0.7) return "bg-rose-50 text-rose-700 border-rose-200"
  if (n >= 0.3) return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-emerald-50 text-emerald-700 border-emerald-200"
}
</script>

<style scoped>
.scroll-container::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
