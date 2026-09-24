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
import { componentPath } from "~/utils/routes"
import { computed } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { useFileRoute } from "~/composables/useFileRoute"
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import { formatNumber } from "~/utils/format"
import DetailFrame, { type DetailCrumb, type DetailStat, type DetailTab } from "~/components/detail/DetailFrame.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import Icon from "~/components/ui/common/Icon.vue"

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
  ]
})

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
