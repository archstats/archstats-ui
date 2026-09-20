<template>
  <DetailFrame
    :title="nameInRoute"
    mono
    kind="Component"
    :crumbs="[{ label: 'Components', to: '/views/metrics' }]"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/metrics"
  >
    <template #actions>
      <router-link :to="`/views/components/hotspots?focus=${encodeURIComponent(nameInRoute)}`" class="ui-btn ui-btn-sm" title="Show this component in Hotspots">
        <Icon icon="flame" :size="13" class="text-neutral-500"/><span>Hotspots</span>
      </router-link>
    </template>
    <EmptyState v-if="store.hasData && !component" title="Component not in this snapshot" :text="`${nameInRoute} was not found in the open scan.`" icon="boxes">
      <router-link to="/views/metrics" class="ui-btn ui-btn-sm">All components</router-link>
    </EmptyState>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import { formatNumber } from "~/utils/format"
import DetailFrame, { type DetailTab } from "~/components/detail/DetailFrame.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import Icon from "~/components/ui/common/Icon.vue"

const route = useRoute()
const store = useDataStore()

const nameInRoute = computed(() => String(route.params.name ?? ""))
const component = computed(() => store.allComponentsIndex.get(nameInRoute.value))

function metric(key: string): number {
  const c: any = component.value
  if (!c) return 0
  const v = c[key] ?? c[store.statName(key)]
  return Number(v) || 0
}

const stats = computed(() => {
  if (!component.value) return []
  const out = [
    { label: "Files", value: formatNumber(metric("complexity__files")) },
    { label: "Lines", value: formatNumber(metric("complexity__lines")) },
  ]
  if (store.getDistinctComponentColumns.includes("git__commits__total")) {
    out.push({ label: "Commits", value: formatNumber(metric("git__commits__total")) })
  }
  return out
})

const cyclesCount = computed(() => store.allCyclesExpanded.filter(c => c.nodes.includes(nameInRoute.value)).length)

const { isJavaProject, getJavaMetricsForComponent } = useJavaMetrics()
const hasJava = ref(false)
watch(nameInRoute, async (name) => {
  hasJava.value = false
  if (!name || !isJavaProject.value) return
  const m = await getJavaMetricsForComponent(name)
  hasJava.value = !!m && (m.classes > 0 || m.springBeans > 0 || m.jpaEntities > 0)
}, { immediate: true })
watch(isJavaProject, async (java) => {
  if (!java || !nameInRoute.value) return
  const m = await getJavaMetricsForComponent(nameInRoute.value)
  hasJava.value = !!m && (m.classes > 0 || m.springBeans > 0 || m.jpaEntities > 0)
})

const tabs = computed<DetailTab[]>(() => {
  const base = `/views/components/${nameInRoute.value}`
  const list: DetailTab[] = [
    { id: "overview", label: "Overview", to: base, exact: true },
    { id: "dependencies", label: "Dependencies", to: `${base}/dependencies` },
    { id: "files", label: "Files", to: `${base}/files`, count: metric("complexity__files") || undefined },
    { id: "history", label: "History", to: `${base}/history` },
    { id: "cycles", label: "Cycles", to: `${base}/cycles`, count: cyclesCount.value || undefined },
  ]
  if (hasJava.value) list.push({ id: "java", label: "Java", to: `${base}/java` })
  return list
})
</script>
