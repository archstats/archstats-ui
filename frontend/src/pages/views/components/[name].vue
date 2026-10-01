<template>
  <DetailFrame
    :title="componentLabel(nameInRoute, workspaces.active?.name)"
    mono
    kind="Component"
    :crumbs="[{ label: t('pages.components.components'), to: '/views/metrics?view=table' }]"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/metrics"
  >
    <template #actions>
      <PinButton v-if="component" kind="component" :entity-key="nameInRoute" :title="nameInRoute" :values="() => pickValues(component as any, PIN_METRICS.component)"/>
      <router-link :to="`/views/components/hotspots?focus=${encodeURIComponent(nameInRoute)}`" class="ui-btn ui-btn-sm" :title="t('pages.components.showComponentHotspots')">
        <Icon icon="flame" :size="13" class="text-neutral-500"/><span>{{ t('pages.components.hotspots') }}</span>
      </router-link>
    </template>
    <EmptyState v-if="store.hasData && !component" :title="t('pages.components.componentNotSnapshot')" :text="t('pages.components.wasNotFoundOpen', { nameInRoute })" icon="boxes">
      <router-link to="/views/metrics?view=table" class="ui-btn ui-btn-sm">{{ t('pages.components.allComponents') }}</router-link>
    </EmptyState>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import PinButton from "~/features/reports/components/PinButton.vue"
import { PIN_METRICS, pickValues } from "~/features/reports/evidence"
import { componentLabel, componentPath } from "~/features/navigation/routes"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
// Five tabs, each named for the question it answers: what this is and where
// it sits (Reading), what it touches (Connections), what it is tangled in
// (Cycles), what it is made of (Inside), and how it got here (History).
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { formatNumber } from "~/shared/format"
import DetailFrame, { type DetailTab } from "~/features/shell/components/DetailFrame.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import Icon from "~/shared/ui/Icon.vue"
import { t } from "~/shared/i18n"

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
    { label: t("pages.components.files"), value: formatNumber(metric("complexity__files")) },
    { label: t("pages.components.lines"), value: formatNumber(metric("complexity__lines")) },
  ]
  if (store.getDistinctComponentColumns.includes("git__commits__total")) {
    out.push({ label: t("pages.components.commits"), value: formatNumber(metric("git__commits__total")) })
  }
  return out
})

const cycleCount = computed(() =>
  (store.allCyclesExpanded as Array<{ nodes: string[] }>).filter(c => c.nodes.includes(nameInRoute.value)).length)

const tabs = computed<DetailTab[]>(() => {
  const base = componentPath(nameInRoute.value)
  return [
    { id: "reading", label: t("pages.components.reading"), to: base, exact: true },
    { id: "connections", label: t("pages.components.connections"), to: `${base}/connections` },
    { id: "cycles", label: t("pages.components.cycles"), to: `${base}/cycles`, count: cycleCount.value || undefined },
    { id: "inside", label: t("pages.components.inside"), to: `${base}/inside`, count: metric("complexity__files") || undefined },
    { id: "history", label: t("pages.components.history"), to: `${base}/history` },
  ]
})
</script>
