
<template>
  <section>
    <!-- Page header: what this is, which snapshot. -->
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
      <span class="font-mono text-sm text-neutral-500">{{ workspaceName }}<template v-if="snapshotLabel"> · snapshot {{ snapshotLabel }}</template></span>
      <span v-if="isJavaProject" class="ui-tag">Java</span>
      <span v-if="isSpringProject" class="ui-tag">Spring</span>
      <span v-if="isJpaProject" class="ui-tag">JPA</span>
    </div>

    <!-- Stats strip: one hairline frame, six readings. -->
    <dl class="mt-5 grid grid-cols-3 overflow-hidden rounded-lg hairline lg:grid-cols-6">
      <div v-for="(stat, i) in strip" :key="stat.label" class="flex flex-col gap-1 px-4 py-3" :class="{ 'hairline-l': i % 3 !== 0, 'lg:hairline-l': i !== 0, 'hairline-t lg:border-t-0': i >= 3 }">
        <dt class="ui-label">{{ stat.label }}</dt>
        <dd class="text-[22px] font-medium leading-7 tabular text-neutral-900">{{ stat.value }}</dd>
        <dd v-if="stat.sub" class="text-sm leading-4 text-neutral-500">{{ stat.sub }}</dd>
      </div>
    </dl>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <!-- Structure -->
      <div class="ui-panel p-4">
        <h2 class="ui-panel-title">Structure</h2>
        <dl class="mt-3 flex flex-col gap-3">
          <div v-if="abstractionRatio !== null">
            <div class="flex items-baseline justify-between">
              <dt class="text-base text-neutral-600">Abstract types</dt>
              <dd class="font-mono text-sm tabular-nums text-neutral-900">{{ abstractionRatio.toFixed(1) }}%</dd>
            </div>
            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div class="h-full rounded-full bg-neutral-500 transition-[width]" :style="{ width: abstractionRatio + '%' }"></div>
            </div>
            <p class="mt-1 text-sm leading-4 text-neutral-500">Share of abstract types among all declared types.</p>
          </div>
          <div class="ui-kv">
            <template v-if="getVal('complexity__indentation__avg') !== null">
              <dt>Average indentation</dt><dd>{{ getVal('complexity__indentation__avg')?.toFixed(2) }}</dd>
            </template>
            <template v-if="getVal('modularity__component__imports') !== null">
              <dt>Component imports</dt><dd>{{ formatVal(getVal('modularity__component__imports')) }}</dd>
            </template>
            <template v-if="getVal('modularity__component__declarations') !== null">
              <dt>Component declarations</dt><dd>{{ formatVal(getVal('modularity__component__declarations')) }}</dd>
            </template>
            <template v-if="getVal('connection_count') !== null">
              <dt>Direct dependencies</dt><dd>{{ formatVal(getVal('connection_count')) }}</dd>
            </template>
            <template v-if="avgFilesPerComponent">
              <dt>Files per component</dt><dd>{{ avgFilesPerComponent.toFixed(1) }}</dd>
            </template>
            <template v-if="avgLinesPerFile">
              <dt>Lines per file</dt><dd>{{ avgLinesPerFile.toFixed(0) }}</dd>
            </template>
          </div>
          <div v-if="isJavaProject && javaStats.length > 0" class="pt-3 hairline-t">
            <span class="ui-label">Java</span>
            <div class="ui-kv mt-1.5">
              <template v-for="stat in javaStats" :key="stat.key">
                <dt>{{ stat.label }}</dt><dd>{{ formatVal(stat.value) }}</dd>
              </template>
            </div>
          </div>
        </dl>
      </div>

      <!-- Activity -->
      <div class="ui-panel p-4">
        <h2 class="ui-panel-title">Activity</h2>
        <div v-if="hasGitChurn" class="mt-3">
          <div class="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div class="h-full bg-green-500" :style="{ width: additionsPercent + '%' }" :title="`Additions ${additionsPercent.toFixed(1)}%`"></div>
            <div class="h-full bg-red-500" :style="{ width: deletionsPercent + '%' }" :title="`Deletions ${deletionsPercent.toFixed(1)}%`"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between font-mono text-sm tabular-nums">
            <span class="text-green-700">+{{ formatVal(getVal('git__additions__total')) }} added</span>
            <span class="text-red-700">−{{ formatVal(getVal('git__deletions__total')) }} removed</span>
          </div>
        </div>
        <div class="mt-3 overflow-x-auto">
          <slot name="activity"></slot>
        </div>
      </div>
    </div>

    <!-- Everything else the engine measured. -->
    <details v-if="extraStats.length > 0" class="group/details mt-4 rounded-lg hairline">
      <summary class="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-base font-medium text-neutral-800 hover:bg-neutral-50">
        <Icon icon="chevron-right" :size="14" class="text-neutral-400 transition-transform group-open/details:rotate-90"/>
        More metrics
        <span class="ui-tag">{{ extraStats.length }}</span>
      </summary>
      <dl class="ui-kv gap-y-1.5 px-4 pb-4 pt-2 hairline-t sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:gap-x-6">
        <template v-for="stat in extraStats" :key="stat.key">
          <dt :title="stat.key">{{ stat.label }}</dt>
          <dd>{{ formatStatValue(stat.value) }}</dd>
        </template>
      </dl>
    </details>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useDataStore } from "~/stores/data"
import Icon from "~/components/ui/common/Icon.vue"
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import { useWorkspacesStore } from "~/stores/workspaces"
import { formatScanTime } from "~/utils/time"

const store = useDataStore()
const workspaces = useWorkspacesStore()
const { isJavaProject, isSpringProject, isJpaProject } = useJavaMetrics()

const workspaceName = computed(() => workspaces.active?.name ?? "")
const snapshotLabel = computed(() => {
  const scan = workspaces.openScan
  return scan ? formatScanTime(scan.startedAt) : ""
})

// The six readings in the strip. Missing values read as a dash, never as zero.
const strip = computed(() => {
  const n = (key: string) => (getVal(key) === null ? "—" : formatVal(getVal(key)))
  return [
    { label: "Components", value: n("component_count") },
    { label: "Files", value: n("complexity__files") },
    { label: "Lines", value: n("complexity__lines") },
    { label: "Directories", value: n("directory_count") },
    { label: "Commits", value: n("git__commits__total"), sub: "to files in the snapshot" },
    { label: "Contributors", value: n("git__authors__total"), sub: commitsPerAuthor.value ? `${commitsPerAuthor.value.toFixed(0)} commits each` : "" },
  ]
})

const summary = ref<Record<string, any>>({})
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    if (!hasData) {
      summary.value = {}
      return
    }
    try {
      const rows = await store.getView<any>("summary")
      summary.value = rows.reduce((acc: any, item: any) => {
        acc[item.name] = item.value
        return acc
      }, {})
    } catch {
      summary.value = {}
    }
  },
  { immediate: true }
)

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

// Java counts from the summary table; only the keys the scan produced show.
const javaKeys = [
  { key: "java__class__declarations", label: "Classes" },
  { key: "java__method_declarations", label: "Methods" },
  { key: "java__field__declarations", label: "Fields" },
  { key: "java__spring__beans", label: "Spring beans" },
  { key: "java__jpa__entities", label: "JPA entities" },
]
const javaStats = computed(() =>
  javaKeys
    .map(k => ({ ...k, value: getVal(k.key) }))
    .filter((s): s is { key: string; label: string; value: number } => s.value !== null),
)

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
  'version',
  ...javaKeys.map(k => k.key),
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

