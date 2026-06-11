<template>
  <div class="flex flex-col gap-6">
    <!-- File Identity Card -->
    <section class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100/70 rounded-3xl p-6 shadow-xs select-none">
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">File Identity</div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold font-mono text-slate-800 tracking-tight break-all">{{ filePath }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400">
          <span v-if="fileData?.component">
            Component: <strong class="text-slate-650">{{ store.getComponentName(fileData.component) }}</strong>
          </span>
          <span v-if="fileData?.component" class="text-slate-300">•</span>
          <span v-if="fileData?.directory">
            Directory: <strong class="text-slate-600 font-mono">{{ fileData.directory }}</strong>
          </span>
        </div>
      </div>
    </section>

    <!-- KPI Cards Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Lines of Code</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">{{ formatNum(getFileMetric('complexity__lines')) }}</div>
      </div>
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Code Health</span>
        <div class="text-xl font-bold mt-1">
          <span :class="healthBadgeClass(getFileMetric('codesmells__code_health'))">
            {{ formatVal(getFileMetric('codesmells__code_health'), 1) }}
          </span>
        </div>
      </div>
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Hotspot</span>
        <div class="text-xl font-bold mt-1">
          <span :class="hotspotBadgeClass(getFileMetric('codesmells__hotspot_score'))">
            {{ formatVal(getFileMetric('codesmells__hotspot_score'), 3) }}
          </span>
        </div>
      </div>
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Commits</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">{{ formatNum(getFileMetric('git__commits__total')) }}</div>
      </div>
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Authors</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">{{ formatNum(getFileMetric('git__authors__total')) }}</div>
      </div>
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Age (days)</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">{{ formatNum(getFileMetric('git__age_in_days')) }}</div>
      </div>
    </div>

    <!-- All Metrics — grouped by prefix -->
    <section class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs">
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 select-none">All Metrics</div>
      <div class="flex flex-col gap-2">
        <details 
          v-for="(metrics, group) in groupedMetrics" 
          :key="group" 
          class="border border-slate-100 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <summary class="px-4 py-3 bg-slate-50/50 cursor-pointer text-[10px] font-black text-slate-650 uppercase tracking-wider hover:bg-slate-50 transition-colors select-none">
            {{ group }}
            <span class="text-[9px] text-slate-400 font-bold normal-case ml-2">({{ metrics.length }} metrics)</span>
          </summary>
          <div class="divide-y divide-slate-50">
            <div 
              v-for="m in metrics" 
              :key="m.key" 
              class="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/30 transition-colors"
            >
              <span class="text-[10.5px] font-bold text-slate-600">{{ m.label }}</span>
              <span class="text-sm font-black font-mono text-slate-850">{{ m.displayValue }}</span>
            </div>
          </div>
        </details>
      </div>
    </section>

    <!-- Sibling Files in same component -->
    <section v-if="siblingFiles.length > 0" class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs">
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 select-none">
        Sibling Files in {{ fileData?.component ? store.getComponentName(fileData.component) : 'Component' }}
      </div>
      <div class="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
        <NuxtLink 
          v-for="sibling in siblingFiles" 
          :key="sibling.name" 
          :to="`/views/files/${sibling.name}`"
          class="flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all group"
        >
          <span class="text-[10.5px] font-bold text-slate-700 group-hover:text-slate-900 truncate mr-4 font-mono">{{ sibling.name }}</span>
          <div class="flex items-center gap-3 flex-shrink-0 select-none">
            <span class="text-[9px] font-mono font-bold text-slate-400">{{ formatNum(Number(sibling.complexity__lines) || 0) }} LOC</span>
            <span 
              class="text-[9px] font-black px-1.5 py-0.5 rounded-md"
              :class="healthBadgeClass(Number(sibling.codesmells__code_health) || 0)"
            >
              {{ formatVal(Number(sibling.codesmells__code_health) || 0, 1) }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const store = useDataStore()

// Resolving filePath from name parameter (supports nested layout routing)
const filePath = computed(() => {
  const parts = route.params.name
  let list = Array.isArray(parts) ? [...parts] : [parts as string]
  const last = list[list.length - 1]
  if (["git", "imports", "java"].includes(last)) {
    list.pop()
  }
  return list.join('/')
})

const escapedPath = computed(() => filePath.value.replace(/'/g, "''"))

// ── File Data ──────────────────────────────────────────────────
const fileData = computed(() => {
  if (!store.hasData) return null
  const results = store.query<Record<string, any>>(
    `SELECT * FROM files WHERE name = '${escapedPath.value}' LIMIT 1`
  )
  return results.length > 0 ? results[0] : null
})

const getFileMetric = (key: string): number => {
  if (!fileData.value) return 0
  const val = fileData.value[key] ?? fileData.value[key.toLowerCase()]
  return Number(val) || 0
}

// ── Formatting Helpers ─────────────────────────────────────────
const formatNum = (val: number): string => {
  if (val === undefined || isNaN(val)) return '—'
  return val.toLocaleString()
}

const formatVal = (val: number, precision: number = 0): string => {
  if (val === undefined || isNaN(val)) return '—'
  return val.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
}

// ── Badge Classes ──────────────────────────────────────────────
const healthBadgeClass = (val: number): string => {
  if (val >= 8) return 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100'
  if (val >= 5) return 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100'
  return 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100'
}

const hotspotBadgeClass = (val: number): string => {
  if (val >= 0.7) return 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100'
  if (val >= 0.3) return 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100'
  return 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100'
}

// ── Grouped Metrics ────────────────────────────────────────────
const SKIP_KEYS = new Set(['name', 'component', 'directory', 'report_id', 'report_timestamp', 'timestamp'])

const groupedMetrics = computed(() => {
  if (!fileData.value) return {}
  const groups: Record<string, { key: string; label: string; displayValue: string }[]> = {}

  Object.entries(fileData.value).forEach(([key, val]) => {
    if (SKIP_KEYS.has(key)) return
    if (val === null || val === undefined) return

    const parts = key.split('__')
    const group = parts[0] || 'Other'
    const label = parts.slice(1).join(' › ') || key

    if (!groups[group]) groups[group] = []
    const numVal = Number(val)
    const displayValue = isNaN(numVal) ? String(val) : numVal.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    })
    groups[group].push({ key, label, displayValue })
  })

  // Sort groups alphabetically
  const sorted: Record<string, typeof groups[string]> = {}
  Object.keys(groups).sort().forEach(k => {
    sorted[k] = groups[k].sort((a, b) => a.label.localeCompare(b.label))
  })
  return sorted
})

// ── Sibling Files ──────────────────────────────────────────────
const siblingFiles = computed(() => {
  if (!store.hasData || !fileData.value?.component) return []
  const comp = String(fileData.value.component).replace(/'/g, "''")
  return store.query<Record<string, any>>(
    `SELECT name, complexity__lines, codesmells__code_health FROM files WHERE component = '${comp}' AND name != '${escapedPath.value}' ORDER BY name LIMIT 20`
  )
})
</script>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
