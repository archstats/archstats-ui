<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="loading" :text="t('pages.filesIndex.readingFile')"/>
    <EmptyState v-else-if="error" :title="t('pages.filesIndex.couldNotReadFile')" :text="error" icon="alert"/>
    <EmptyState v-else-if="!file" :title="t('pages.filesIndex.fileNotSnapshot')" :text="t('pages.filesIndex.wasNotFoundOpen', { filePath })" icon="file-text"/>
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
        <h2 class="ui-section-title">{{ t('pages.filesIndex.metrics') }}</h2>
        <EmptyState v-if="metricGroups.shown.length === 0 && metricGroups.rest.length === 0" :title="t('pages.filesIndex.noMetricsRecorded')" :text="t('pages.filesIndex.engineStoredNoNumeric')"/>
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
          <span>{{ t('pages.filesIndex.moreZeroUndocumented', { value: showRest ? t('pages.filesIndex.hide') : t('pages.filesIndex.show'), restLength: metricGroups.rest.length }) }}</span>
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
          <h2 class="ui-section-title">{{ t('pages.filesIndex.siblings') }}</h2>
          <span v-if="file.component" class="font-mono text-xs text-neutral-500">{{ file.component }}</span>
        </div>
        <EmptyState v-if="!file.component" :title="t('pages.filesIndex.noComponent')" :text="t('pages.filesIndex.fileNotAssignedComponent')"/>
        <LoadingState v-else-if="siblingsLoading" :text="t('pages.filesIndex.readingFiles')"/>
        <EmptyState v-else-if="siblingsError" :title="t('pages.filesIndex.couldNotReadSiblings')" :text="siblingsError" icon="alert"/>
        <div v-else class="mt-3 overflow-hidden rounded-lg hairline">
          <table class="ui-table">
            <thead>
              <tr>
                <th>{{ t('pages.filesIndex.name') }}</th>
                <th class="w-[90px] text-right">{{ t('pages.filesIndex.lines') }}</th>
                <th class="w-[90px] text-right">{{ t('pages.filesIndex.health') }}</th>
                <th class="w-[90px] text-right">{{ t('pages.filesIndex.commits') }}</th>
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
import { useCodeAge } from "~/features/git/useCodeAge"
import StatStrip from "~/features/metrics/components/StatStrip.vue"
import MetricHint from "~/features/snapshot/components/MetricHint.vue"
import HealthBreakdown from "~/features/metrics/components/HealthBreakdown.vue"
import { computed, ref } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useFileRoute } from "~/features/files/useFileRoute"
import { healthLevel, hotspotLevel, levelDotClass, levelTextClass, formatHealth, formatHotspot, type HealthLevel } from "~/features/metrics/useHealth"
import { formatDays, formatNumber } from "~/shared/format"
import Icon from "~/shared/ui/Icon.vue"
import { sqlLiteral } from "~/shared/sql"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"

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

const codeAge = useCodeAge()
const lastChanged = computed(() => (file.value ? codeAge.byFile.value.get(String(file.value.name)) ?? null : null))
const strip = computed<{ label: string; value: string; level?: HealthLevel }[]>(() => {
  const health = num("codesmells__code_health")
  const hotspot = num("codesmells__hotspot_score")
  const age = num("git__age_in_days")
  return [
    { label: t("pages.filesIndex.lines"), value: formatNumber(num("complexity__lines")) },
    { label: t("pages.filesIndex.codeHealth"), value: formatHealth(health), level: healthLevel(health) },
    { label: t("pages.filesIndex.hotspot"), value: formatHotspot(hotspot), level: hotspotLevel(hotspot) },
    { label: t("pages.filesIndex.commits"), value: formatNumber(num("git__commits__total")) },
    { label: t("pages.filesIndex.authors"), value: formatNumber(num("git__authors__total")) },
    { label: t("pages.filesIndex.firstCommit"), value: age === null ? "—" : t("ui.time.ago", { span: formatDays(age) }) },
    { label: t("pages.filesIndex.lastChanged"), value: lastChanged.value === null ? "—" : t("ui.time.ago", { span: formatDays(lastChanged.value) }) },
  ].filter(c => c.label !== t("pages.filesIndex.authors") || lastChanged.value === null)
})

// Every numeric column of the row, grouped by the metric family prefix.
const HIDDEN_COLUMNS = new Set(["report_id", "timestamp", "name", "directory", "component", "git__repository", "java_class", "java_full_class"])
const FAMILIES: { id: string; label: string }[] = [
  { id: "complexity", label: t("pages.filesIndex.complexity") },
  { id: "codesmells", label: t("pages.filesIndex.codeSmells") },
  { id: "modularity", label: t("pages.filesIndex.modularity") },
  { id: "git", label: t("pages.filesIndex.git") },
  { id: "java", label: t("pages.filesIndex.java") },
  { id: "other", label: t("pages.filesIndex.other") },
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
  if (num("complexity__files__third_party") === 1) return { title: t("pages.filesIndex.someoneElseSCode"), text: t("pages.filesIndex.vendoredPackageMinifiedBundle") }
  if (num("complexity__files__generated") === 1) return { title: t("pages.filesIndex.writtenTool"), text: t("pages.filesIndex.headerSaysWasGenerated") }
  const role = file.value.role ?? (store.fileRoleIndex.get(String(file.value.name)) ?? null)
  if (role === "test") return { title: t("pages.filesIndex.testCode"), text: store.rolesRecorded ? t("pages.filesIndex.countedTestsProductionSwitch") : t("pages.filesIndex.testPathProductionSwitch") }
  if (num("codesmells__code_health") === null && (num("complexity__lines") ?? 0) > 0 && store.snapshotOutdated === false) {
    return { title: t("pages.filesIndex.notCode"), text: t("pages.filesIndex.translationsStylesheetsDataDocuments") }
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
