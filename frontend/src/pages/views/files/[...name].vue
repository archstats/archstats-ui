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
      <router-link v-if="file?.component" :to="componentPath(file.component)" class="ui-btn ui-btn-sm" :title="`Open ${file.component}`">
        <Icon icon="boxes" :size="13" class="text-neutral-500"/><span>Component</span>
      </router-link>
    </template>
    <EmptyState v-if="store.hasData && !loading && !file" title="File not in this snapshot" :text="`${filePath} was not found in the open scan.`" icon="file-text">
      <router-link to="/views/metrics?grain=files" class="ui-btn ui-btn-sm">All files</router-link>
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
import DetailFrame, { type DetailCrumb, type DetailStat, type DetailTab } from "~/features/shell/components/DetailFrame.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"

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
  const list: DetailCrumb[] = [{ label: "Files", to: "/views/metrics?grain=files" }]
  const component = file.value?.component
  if (component) list.push({ label: String(component), to: componentPath(component) })
  return list
})

const stats = computed<DetailStat[]>(() => {
  const row = file.value
  if (!row) return []
  return [
    { label: "Lines", value: formatNumber(row.complexity__lines) },
    { label: "Commits", value: formatNumber(row.git__commits__total) },
    { label: "Authors", value: formatNumber(row.git__authors__total) },
    // What part of building, shipping or running the software the file
    // describes; engine revision 5 and later, empty for most files.
    ...(row.system_kind ? [{ label: "Kind", value: SYSTEM_KIND_LABEL[row.system_kind] ?? row.system_kind }] : []),
  ]
})

const SYSTEM_KIND_LABEL: Record<string, string> = {
  build: "Build file", lockfile: "Lockfile", ci: "Pipeline", container: "Container", deploy: "Deployment", infra: "Infrastructure", config: "Runtime config",
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

const tabs = computed<DetailTab[]>(() => {
  const base = `/views/files/${filePath.value}`
  const list: DetailTab[] = [
    { id: "overview", label: "Overview", to: base, exact: true },
    { id: "source", label: "Source", to: `${base}/source` },
    { id: "imports", label: "Imports", to: `${base}/imports` },
    { id: "history", label: "History", to: `${base}/history` },
  ]
  if (hasJava.value) list.push({ id: "java", label: "Java", to: `${base}/java` })
  return list
})
</script>
