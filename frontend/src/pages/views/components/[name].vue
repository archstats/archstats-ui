<template>
  <DetailFrame
    :title="componentLabel(nameInRoute, workspaces.active?.name)"
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
import { componentLabel, componentPath } from "~/utils/routes"
import { useWorkspacesStore } from "~/stores/workspaces"
// Five tabs, each named for the question it answers: what this is and where
// it sits (Reading), what it touches (Connections), what it is tangled in
// (Cycles), what it is made of (Inside), and how it got here (History).
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { formatNumber } from "~/utils/format"
import DetailFrame, { type DetailTab } from "~/components/detail/DetailFrame.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import Icon from "~/components/ui/common/Icon.vue"

const route = useRoute()
const store = useDataStore()
const workspaces = useWorkspacesStore()

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

const cycleCount = computed(() =>
  (store.allCyclesExpanded as Array<{ nodes: string[] }>).filter(c => c.nodes.includes(nameInRoute.value)).length)

const tabs = computed<DetailTab[]>(() => {
  const base = componentPath(nameInRoute.value)
  return [
    { id: "reading", label: "Reading", to: base, exact: true },
    { id: "connections", label: "Connections", to: `${base}/connections` },
    { id: "cycles", label: "Cycles", to: `${base}/cycles`, count: cycleCount.value || undefined },
    { id: "inside", label: "Inside", to: `${base}/inside`, count: metric("complexity__files") || undefined },
    { id: "history", label: "History", to: `${base}/history` },
  ]
})
</script>
