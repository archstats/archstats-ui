<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="loading" text="Reading file…"/>
    <EmptyState v-else-if="error" title="Could not read file" :text="error" icon="alert"/>
    <EmptyState v-else-if="!file" title="File not in this snapshot" :text="`${filePath} was not found in the open scan.`" icon="file-text"/>
    <div v-else class="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <!-- Stat strip: one hairline frame, six readings. -->
      <StatStrip :cells="strip"/>
      <p v-if="nature" class="mt-3 max-w-[70ch] text-base text-neutral-600">
        <span class="font-medium text-neutral-900">{{ nature.title }}</span> {{ nature.text }}
      </p>

      <HealthBreakdown :file="file"/>

      <!-- Metrics: the named readings this file has, grouped by family. Zeros
           and readings without a definition wait behind the disclosure. -->
      <section class="mt-5 pt-5 hairline-t">
        <h2 class="ui-section-title">Metrics</h2>
        <EmptyState v-if="metricGroups.shown.length === 0 && metricGroups.rest.length === 0" title="No metrics recorded" text="The engine stored no numeric columns for this file."/>
        <div v-else-if="metricGroups.shown.length" class="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <div v-for="group in metricGroups.shown" :key="group.id">
            <h3 class="ui-label mb-2">{{ group.label }}</h3>
            <dl class="ui-kv">
              <template v-for="m in group.metrics" :key="m.key">
                <dt><MetricHint :id="m.key">{{ m.label }}</MetricHint></dt>
                <dd>{{ m.value }}</dd>
              </template>
            </dl>
          </div>
        </div>
        <button v-if="metricGroups.rest.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-3" :aria-expanded="showRest" @click="showRest = !showRest">
          <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform" :class="{ 'rotate-90': showRest }"/>
          <span>{{ showRest ? "Hide" : "Show" }} {{ metricGroups.rest.length }} more: zero or undocumented</span>
        </button>
        <dl v-if="showRest" class="ui-kv mt-2 max-w-[520px]">
          <template v-for="m in metricGroups.rest" :key="m.key">
            <dt :class="{ 'font-mono text-sm': !m.definition }"><MetricHint :id="m.key">{{ m.label }}</MetricHint></dt>
            <dd>{{ m.value }}</dd>
          </template>
        </dl>
      </section>

      <!-- Siblings: the other files in the same component. -->
      <section class="mt-5 pt-5 hairline-t">
        <div class="flex items-baseline gap-2">
          <h2 class="ui-section-title">Siblings</h2>
          <span v-if="file.component" class="font-mono text-xs text-neutral-500">{{ file.component }}</span>
        </div>
        <EmptyState v-if="!file.component" title="No component" text="This file is not assigned to a component, so it has no siblings."/>
        <LoadingState v-else-if="siblingsLoading" text="Reading files…"/>
        <EmptyState v-else-if="siblingsError" title="Could not read siblings" :text="siblingsError" icon="alert"/>
        <div v-else class="mt-3 overflow-hidden rounded-lg hairline">
          <table class="ui-table">
            <thead>
              <tr>
                <th>Name</th>
                <th class="w-[90px] text-right">Lines</th>
                <th class="w-[90px] text-right">Health</th>
                <th class="w-[90px] text-right">Commits</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in siblings" :key="s.name" :class="{ 'is-selected': s.name === filePath }">
                <td class="max-w-0">
                  <router-link :to="`/views/files/${s.name}`" class="block truncate font-mono text-sm text-neutral-800 hover:text-neutral-900 hover:underline" :title="s.name">{{ basename(s.name) }}</router-link>
                </td>
                <td class="is-num text-right">{{ formatNumber(s.complexity__lines) }}</td>
                <td class="is-num text-right">
                  <span class="inline-flex items-center gap-1.5" :class="levelTextClass(healthLevel(s.codesmells__code_health))">
                    <span class="h-1.5 w-1.5 rounded-full" :class="levelDotClass(healthLevel(s.codesmells__code_health))"></span>
                    <span>{{ formatHealth(s.codesmells__code_health) }}</span>
                  </span>
                </td>
                <td class="is-num text-right">{{ formatNumber(s.git__commits__total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import StatStrip from "~/components/detail/StatStrip.vue"
import MetricHint from "~/components/ui/common/MetricHint.vue"
import HealthBreakdown from "~/components/files/HealthBreakdown.vue"
import { computed, ref } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useFileRoute } from "~/composables/useFileRoute"
import { healthLevel, hotspotLevel, levelDotClass, levelTextClass, formatHealth, formatHotspot, type HealthLevel } from "~/composables/useHealth"
import { formatDays, formatNumber } from "~/utils/format"
import Icon from "~/components/ui/common/Icon.vue"
import { sqlLiteral } from "~/utils/sql"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const store = useDataStore()
const { filePath, escapedPath } = useFileRoute()

type FileRow = Record<string, any>

const { data: file, loading, error } = useAsyncQuery<FileRow | null>(
  async () => {
    if (!filePath.value) return null
    const rows = await store.query<FileRow>(`SELECT * FROM files WHERE name = ${escapedPath.value} LIMIT 1`)
    return rows[0] ?? null
  },
  [escapedPath],
  { initial: null },
)

// Missing values read as a dash, never as zero.
function num(key: string): number | null {
  const v = file.value?.[key]
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const strip = computed<{ label: string; value: string; level?: HealthLevel }[]>(() => {
  const health = num("codesmells__code_health")
  const hotspot = num("codesmells__hotspot_score")
  const age = num("git__age_in_days")
  return [
    { label: "Lines", value: formatNumber(num("complexity__lines")) },
    { label: "Code health", value: formatHealth(health), level: healthLevel(health) },
    { label: "Hotspot", value: formatHotspot(hotspot), level: hotspotLevel(hotspot) },
    { label: "Commits", value: formatNumber(num("git__commits__total")) },
    { label: "Authors", value: formatNumber(num("git__authors__total")) },
    { label: "Age", value: formatDays(age) },
  ]
})

// Every numeric column of the row, grouped by the metric family prefix.
const HIDDEN_COLUMNS = new Set(["report_id", "timestamp", "name", "directory", "component", "git__repository", "java_class", "java_full_class"])
const FAMILIES: { id: string; label: string }[] = [
  { id: "complexity", label: "Complexity" },
  { id: "codesmells", label: "Code smells" },
  { id: "modularity", label: "Modularity" },
  { id: "git", label: "Git" },
  { id: "java", label: "Java" },
  { id: "other", label: "Other" },
]

function isNumericValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true
  if (typeof v === "number") return true
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
}

// A reading shows when it has a definition to name it and a value to say.
// Every column used to show: seventeen Java and Spring zeros on a JavaScript
// file, and ids with no definition spelled out as "Modularity → Import → Raw".
const showRest = ref(false)
interface Reading { key: string; label: string; value: string; definition: string }
const metricGroups = computed(() => {
  const row = file.value
  if (!row) return { shown: [] as Array<{ id: string; label: string; metrics: Reading[] }>, rest: [] as Reading[] }
  const byFamily = new Map<string, Reading[]>()
  const rest: Reading[] = []
  for (const [key, raw] of Object.entries(row)) {
    if (HIDDEN_COLUMNS.has(key) || !isNumericValue(raw)) continue
    const def = store.definitions.get(key)
    const reading = { key, label: def?.name || key, value: formatNumber(raw as any), definition: def?.short ?? "" }
    const n = Number(raw)
    if (!def?.name || raw === null || raw === "" || n === 0) { rest.push(reading); continue }
    const prefix = key.split("__")[0]
    const family = FAMILIES.some(f => f.id === prefix) ? prefix : "other"
    const list = byFamily.get(family) ?? []
    list.push(reading)
    byFamily.set(family, list)
  }
  return {
    shown: FAMILIES.filter(f => byFamily.has(f.id)).map(f => ({ ...f, metrics: byFamily.get(f.id)!.sort((a, b) => a.label.localeCompare(b.label)) })),
    rest: rest.sort((a, b) => a.label.localeCompare(b.label)),
  }
})

// What kind of file this is, when that changes how to read it. The engine
// marks third-party and generated files; text that is not code simply has no
// health reading. Older snapshots mark nothing and say nothing here.
const nature = computed(() => {
  if (!file.value) return null
  if (num("complexity__files__third_party") === 1) return { title: "Someone else's code.", text: "A vendored package, minified bundle or known library carried in the repository: counted in files and lines, never scored for health, and left out of hotspots." }
  if (num("complexity__files__generated") === 1) return { title: "Written by a tool.", text: "Its header says it was generated, so it is counted but not scored: nobody here wrote it, and nobody should refactor it by hand." }
  if (num("codesmells__code_health") === null && (num("complexity__lines") ?? 0) > 0 && store.snapshotOutdated === false) {
    return { title: "Not code.", text: "Translations, stylesheets, data and documents get no health reading; one reads how code is shaped." }
  }
  return null
})

// Siblings: the same component, largest first.
const component = computed(() => (file.value?.component ? String(file.value.component) : ""))
const { data: siblings, loading: siblingsLoading, error: siblingsError } = useAsyncQuery<FileRow[]>(
  async () => {
    if (!component.value) return []
    return store.query<FileRow>(`SELECT * FROM files WHERE component = ${sqlLiteral(component.value)} ORDER BY complexity__lines DESC`)
  },
  [component],
  { initial: [] },
)

function basename(path: string): string {
  const parts = String(path).split("/")
  return parts[parts.length - 1] || path
}
</script>
