<template>
  <section class="my-12 select-none">
    <!-- Header -->
    <div class="mb-8 flex flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-2.5">
        <Headline>Software Intelligence Overview</Headline>
        <span v-if="isJavaProject" class="px-2 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase border bg-orange-50 border-orange-250 text-orange-700 animate-pulse-subtle">
          ☕ Java Detected
        </span>
        <span v-if="isSpringProject" class="px-2 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase border bg-emerald-55 text-emerald-700">
          🍃 Spring
        </span>
        <span v-if="isJpaProject" class="px-2 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase border bg-amber-50 border-amber-250 text-amber-700">
          💾 JPA
        </span>
      </div>
      <p class="text-xs font-semibold text-slate-500 max-w-2xl leading-relaxed">
        High-level structure, development activity, and complexity metrics extracted from your software repository.
      </p>
    </div>

    <!-- Main Dashboard KPI Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      <!-- Card 1: Components -->
      <div class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs hover:shadow-xs transition-all duration-300 group flex flex-col justify-between min-h-[120px]">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Components</span>
          <div class="w-7 h-7 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:scale-105 transition-transform duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.004 9.004 0 0 0-12 0M18 9.75a9 9 0 0 0-12 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-black text-slate-900 font-mono tracking-tight">{{ formatVal(getVal('component_count')) }}</div>
          <p class="text-[9px] text-slate-450 font-bold mt-1">
            <span v-if="avgFilesPerComponent" class="text-indigo-600 font-mono">~{{ avgFilesPerComponent.toFixed(1) }}</span> files per component
          </p>
        </div>
      </div>

      <!-- Card 2: Codebase Size -->
      <div class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs hover:shadow-xs transition-all duration-300 group flex flex-col justify-between min-h-[120px]">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lines of Code</span>
          <div class="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:scale-105 transition-transform duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-black text-slate-900 font-mono tracking-tight">{{ formatVal(getVal('complexity__lines')) }}</div>
          <p class="text-[9px] text-slate-450 font-bold mt-1">
            Across <span class="text-emerald-600 font-mono">{{ formatVal(getVal('complexity__files')) }}</span> files
            <span v-if="avgLinesPerFile" class="text-slate-400 font-normal"> (avg <strong class="font-mono text-emerald-600 font-bold">{{ avgLinesPerFile.toFixed(0) }}</strong> lines/file)</span>
          </p>
        </div>
      </div>

      <!-- Card 3: Git Commits -->
      <div class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs hover:shadow-xs transition-all duration-300 group flex flex-col justify-between min-h-[120px]">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Git Commits</span>
          <div class="w-7 h-7 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500 group-hover:scale-105 transition-transform duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-black text-slate-900 font-mono tracking-tight">{{ formatVal(getVal('git__commits__total')) || '—' }}</div>
          <p class="text-[9px] text-slate-450 font-bold mt-1">
            By <span class="text-violet-600 font-mono">{{ formatVal(getVal('git__authors__total')) }}</span> contributors
            <span v-if="commitsPerAuthor" class="text-slate-400 font-normal"> (avg <strong class="font-mono text-violet-600 font-bold">{{ commitsPerAuthor.toFixed(0) }}</strong>/author)</span>
          </p>
        </div>
      </div>

      <!-- Card 4: Directory Depth -->
      <div class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs hover:shadow-xs transition-all duration-300 group flex flex-col justify-between min-h-[120px]">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Directories</span>
          <div class="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-505 group-hover:scale-105 transition-transform duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-black text-slate-900 font-mono tracking-tight">{{ formatVal(getVal('directory_count')) }}</div>
          <p class="text-[9px] text-slate-450 font-bold mt-1">
            Structured into <span class="text-amber-600 font-mono">{{ formatVal(getVal('connection_count')) }}</span> direct dependencies
          </p>
        </div>
      </div>
    </div>

    <!-- Secondary Insights Section: Visual progress bars / stats -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <!-- Git Churn balance -->
      <div v-if="hasGitChurn" class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs flex flex-col justify-between">
        <div>
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Code Churn Distribution</span>
          <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">Ratio of additions vs deletions. High additions signify expansion; high deletions indicate refactoring.</p>
        </div>
        <div class="mt-4 flex flex-col gap-2">
          <!-- Stacked bar representation -->
          <div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
            <div class="bg-emerald-500 h-full transition-all duration-500" :style="{ width: additionsPercent + '%' }" :title="`Additions: ${additionsPercent.toFixed(1)}%`"></div>
            <div class="bg-rose-500 h-full transition-all duration-500" :style="{ width: deletionsPercent + '%' }" :title="`Deletions: ${deletionsPercent.toFixed(1)}%`"></div>
          </div>
          <div class="flex items-center justify-between text-[9px] font-mono">
            <span class="text-emerald-600 font-bold">+{{ formatVal(getVal('git__additions__total')) }} additions ({{ additionsPercent.toFixed(1) }}%)</span>
            <span class="text-rose-500 font-bold">-{{ formatVal(getVal('git__deletions__total')) }} deletions ({{ deletionsPercent.toFixed(1) }}%)</span>
          </div>
        </div>
      </div>

      <!-- Complexity & Abstraction Ratio -->
      <div class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs flex flex-col justify-between">
        <div>
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Codebase Modularity & Abstraction</span>
          <p class="text-[10px] text-slate-500 mt-1 leading-relaxed">
            <span v-if="abstractionRatio">Abstraction ratio represents the portion of abstract types out of all declared types. </span>
            <span>Indentation averages show nesting depth; lower is usually cleaner.</span>
          </p>
        </div>
        <div class="mt-4 flex flex-col gap-3">
          <!-- Abstraction progress bar if available -->
          <div v-if="abstractionRatio !== null" class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-[9px] font-bold text-slate-400">
              <span>Abstraction Ratio</span>
              <span class="text-indigo-600 font-mono">{{ abstractionRatio.toFixed(1) }}%</span>
            </div>
            <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div class="bg-indigo-500 h-full rounded-full transition-all duration-500" :style="{ width: abstractionRatio + '%' }"></div>
            </div>
          </div>

          <!-- Modularity stats row -->
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-slate-50 pt-2 text-[9px]">
            <div v-if="getVal('complexity__indentation__avg')" class="flex flex-col">
              <span class="text-slate-400 font-bold uppercase tracking-wider">Avg Indentation</span>
              <span class="text-slate-800 font-black font-mono mt-0.5 text-xs">{{ getVal('complexity__indentation__avg')?.toFixed(2) }}</span>
            </div>
            <div v-if="getVal('modularity__component__imports')" class="flex flex-col">
              <span class="text-slate-400 font-bold uppercase tracking-wider">Component Imports</span>
              <span class="text-slate-800 font-black font-mono mt-0.5 text-xs">{{ formatVal(getVal('modularity__component__imports')) }}</span>
            </div>
            <div v-if="getVal('modularity__component__declarations')" class="flex flex-col">
              <span class="text-slate-400 font-bold uppercase tracking-wider">Component Declarations</span>
              <span class="text-slate-800 font-black font-mono mt-0.5 text-xs">{{ formatVal(getVal('modularity__component__declarations')) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collapsible Expandable Extra/Language-Specific Stats -->
    <div v-if="extraStats.length > 0" class="border border-slate-200/60 rounded-3xl overflow-hidden bg-white shadow-3xs transition-all duration-300">
      <details class="group/details">
        <summary class="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50/50 transition-colors select-none">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Language Specifics & Custom Metrics</span>
            <span class="px-2 py-0.5 rounded-full text-[8px] font-black font-mono bg-slate-100 text-slate-500 border border-slate-200/50 uppercase tracking-wider">{{ extraStats.length }} metrics discovered</span>
          </div>
          <span class="text-slate-400 group-open/details:rotate-180 transition-transform duration-200 text-xs">▼</span>
        </summary>
        <div class="p-6 border-t border-slate-100 bg-slate-50/30 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
          <div
            v-for="stat in extraStats"
            :key="stat.key"
            class="bg-white border border-slate-100 rounded-2xl p-4 shadow-3xs hover:border-slate-200 transition-colors"
          >
            <span class="text-[8px] font-black text-slate-400 uppercase tracking-wider block truncate" :title="stat.key">{{ stat.label }}</span>
            <span class="text-base font-black text-slate-900 font-mono block mt-1.5">{{ formatStatValue(stat.value) }}</span>
          </div>
        </div>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useDataStore } from "~/stores/data"
import Headline from "~/components/ui/common/Headline.vue"
import { useJavaMetrics } from "~/composables/useJavaMetrics"

const store = useDataStore()
const { isJavaProject, isSpringProject, isJpaProject } = useJavaMetrics()

const summary = computed(() => {
  if (!store.hasData) return {}
  try {
    return store.getView<any>("summary").reduce((acc: any, item: any) => {
      acc[item.name] = item.value
      return acc
    }, {})
  } catch {
    return {}
  }
})

// Safe parsing helper
const getVal = (key: string): number | null => {
  const val = summary.value[key]
  if (val === undefined || val === null || val === '') return null
  const num = Number(val)
  return isNaN(num) ? null : num
}

// Derived Metrics
const avgFilesPerComponent = computed(() => {
  const files = getVal('complexity__files')
  const comps = getVal('component_count')
  return files && comps ? files / comps : null
})

const avgLinesPerFile = computed(() => {
  const lines = getVal('complexity__lines')
  const files = getVal('complexity__files')
  return lines && files ? lines / files : null
})

const commitsPerAuthor = computed(() => {
  const commits = getVal('git__commits__total')
  const authors = getVal('git__authors__total')
  return commits && authors ? commits / authors : null
})

// Git additions vs deletions
const hasGitChurn = computed(() => {
  return getVal('git__additions__total') !== null && getVal('git__deletions__total') !== null
})

const additionsPercent = computed(() => {
  const adds = getVal('git__additions__total') || 0
  const dels = getVal('git__deletions__total') || 0
  const total = adds + dels
  if (total === 0) return 50
  return (adds / total) * 100
})

const deletionsPercent = computed(() => {
  return 100 - additionsPercent.value
})

// Abstraction Ratio
const abstractionRatio = computed(() => {
  const abs = getVal('modularity__types__abstract')
  const total = getVal('modularity__types__total')
  if (abs === null || !total) return null
  return (abs / total) * 100
})

// Extra metrics discovery filtering
const mainDashboardKeys = new Set([
  'component_count',
  'complexity__files',
  'complexity__lines',
  'directory_count',
  'connection_count',
  'git__commits__total',
  'git__authors__total',
  'git__additions__total',
  'git__deletions__total',
  'git__age_in_days',
  'complexity__indentation__avg',
  'modularity__types__abstract',
  'modularity__types__total',
  'modularity__component__declarations',
  'modularity__component__imports',
  'version'
])

const extraStats = computed(() => {
  const extra = []
  for (const [key, val] of Object.entries(summary.value)) {
    if (!mainDashboardKeys.has(key) && val !== null && val !== undefined && val !== '') {
      extra.push({
        key,
        label: store.statNiceName(key) || key,
        value: val
      })
    }
  }
  return extra.sort((a, b) => a.label.localeCompare(b.label))
})

// Formatting helpers
function formatVal(val: any): string {
  if (val == null || val === "") return ""
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function formatStatValue(val: any): string {
  if (val == null || val === "") return "—"
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(1)
}
</script>

<style scoped>
details summary::-webkit-details-marker {
  display: none;
}
.text-amber-505 {
  color: #d97706;
}
</style>
