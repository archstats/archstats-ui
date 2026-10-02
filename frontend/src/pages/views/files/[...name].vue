<template>
  <DetailFrame
    :title="fileBasename"
    mono
    kind="File"
    :crumbs="crumbs"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/metrics?grain=files"
  >
    <template #actions>
      <PinButton v-if="file" kind="file" :entity-key="filePath" :title="fileBasename" :values="() => pickValues(file as any, PIN_METRICS.file)"/>
      <OpenInEditor v-if="file" :file="filePath" button-class="!h-7 !w-7"/>
      <router-link v-if="file?.component" :to="componentPath(file.component)" class="ui-btn ui-btn-sm" :title="t('pages.files.open', { component: file.component })">
        <Icon icon="boxes" :size="13" class="text-neutral-500"/><span>{{ t('pages.files.component') }}</span>
      </router-link>
    </template>
    <EmptyState v-if="store.hasData && !loading && !file" :title="t('pages.files.fileNotSnapshot')" :text="t('pages.files.wasNotFoundOpen', { filePath })" icon="file-text">
      <router-link to="/views/metrics?grain=files&view=table" class="ui-btn ui-btn-sm">{{ t('pages.files.allFiles') }}</router-link>
    </EmptyState>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import PinButton from "~/features/reports/components/PinButton.vue"
import { PIN_METRICS, pickValues } from "~/features/reports/evidence"
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import { componentPath } from "~/features/navigation/routes"
import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useFileRoute } from "~/features/files/useFileRoute"
import { useJavaMetrics } from "~/features/java/useJavaMetrics"
import { formatNumber } from "~/shared/format"
import { sqlLiteral } from "~/shared/sql"
import DetailFrame, { type DetailCrumb, type DetailStat, type DetailTab } from "~/features/shell/components/DetailFrame.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"

const store = useDataStore()
const { filePath, escapedPath, fileBasename } = useFileRoute()

type FileRow = Record<string, any>

const { data: file, loading } = useAsyncQuery<FileRow | null>(
  async () => {
    if (!filePath.value) return null
    const rows = await store.query<FileRow>(`SELECT * FROM files WHERE name = ${escapedPath.value} LIMIT 1`)
    return rows[0] ?? null
  },
  [escapedPath],
  { initial: null },
)

const crumbs = computed<DetailCrumb[]>(() => {
  const list: DetailCrumb[] = [{ label: t("pages.files.files"), to: "/views/metrics?grain=files&view=table" }]
  const component = file.value?.component
  if (component) list.push({ label: String(component), to: componentPath(component) })
  return list
})

const stats = computed<DetailStat[]>(() => {
  const row = file.value
  if (!row) return []
  return [
    { label: t("pages.files.lines"), value: formatNumber(row.complexity__lines) },
    { label: t("pages.files.commits"), value: formatNumber(row.git__commits__total) },
    { label: t("pages.files.authors"), value: formatNumber(row.git__authors__total) },
    // What part of building, shipping or running the software the file
    // describes; engine revision 5 and later, empty for most files.
    ...(row.system_kind ? [{ label: t("pages.files.kind"), value: SYSTEM_KIND_LABEL[row.system_kind] ?? row.system_kind }] : []),
  ]
})

const SYSTEM_KIND_LABEL: Record<string, string> = {
  build: t("pages.files.buildFile"), lockfile: t("pages.files.lockfile"), ci: t("pages.files.pipeline"), container: t("pages.files.container"), deploy: t("pages.files.deployment"), infra: t("pages.files.infrastructure"), config: t("pages.files.runtimeConfig"),
}

// The Java tab only exists when the engine found something Java-shaped in
// this file; the per-file metrics call answers that.
const { getJavaMetricsForFile } = useJavaMetrics()
const { data: hasJava } = useAsyncQuery<boolean>(
  async () => {
    if (!filePath.value) return false
    // A JavaScript file in a Java project got the tab, then said it held no
    // Java classes. Only Java and Kotlin sources can.
    if (!/\.(java|kt|kts)$/i.test(filePath.value)) return false
    const m = await getJavaMetricsForFile(filePath.value)
    return !!m && (m.classes > 0 || m.roles.length > 0 || m.rest.total > 0)
  },
  [filePath],
  { initial: false },
)

// The Functions tab, from revision 11, when a pack measured this file's functions.
const { data: hasFunctions } = useAsyncQuery<boolean>(
  async () => {
    if (!filePath.value || !store.hasColumn("functions", "cognitive")) return false
    const rows = await store.query<{ n: number }>(`SELECT count(*) AS n FROM functions WHERE file = ${sqlLiteral(filePath.value)}`)
    return Number(rows[0]?.n ?? 0) > 0
  },
  [filePath, () => store.datasetKey],
  { initial: false },
)

const tabs = computed<DetailTab[]>(() => {
  const base = `/views/files/${filePath.value}`
  const list: DetailTab[] = [
    { id: "overview", label: t("pages.files.overview"), to: base, exact: true },
    { id: "source", label: t("pages.files.source"), to: `${base}/source` },
    ...(hasFunctions.value ? [{ id: "functions", label: t("pages.files.functions"), to: `${base}/functions` }] : []),
    { id: "imports", label: t("pages.files.imports"), to: `${base}/imports` },
    { id: "history", label: t("pages.files.history"), to: `${base}/history` },
  ]
  if (hasJava.value) list.push({ id: "java", label: t("pages.files.java"), to: `${base}/java` })
  return list
})
</script>
