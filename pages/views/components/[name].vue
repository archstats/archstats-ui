<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <ViewWorkspaceLayout
      :title="component?.name || nameInRoute"
      badge-text="Component Module"
      badge-color-class="bg-blue-50 border-blue-100 text-blue-700"
      :nodes-count="filesCount"
      :connections-count="cyclesCount"
      :stats-labels="{ nodes: 'Files', connections: 'Cycles' }"
      :show-config="false"
      :is-sidebar-open="false"
    >
      <!-- Action slot for Back to Hotspots -->
      <template #actions>
        <NuxtLink 
          to="/views/components/hotspots" 
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Hotspots
        </NuxtLink>
      </template>

      <!-- Visualizer slot for the main content grid and subpages -->
      <template #visualizer>
        <div class="w-full h-full flex flex-col md:flex-row gap-6 min-h-[480px] overflow-hidden">
          
          <!-- LEFT SIDEBAR: Grouped Navigation Menu (Desktop) -->
          <div class="hidden md:flex flex-col gap-5 w-56 shrink-0 bg-white border border-slate-100 rounded-2xl p-4 shadow-3xs overflow-y-auto">
            <div v-for="group in categorizedTabs" :key="group.categoryName" class="flex flex-col gap-1.5">
              <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 select-none pb-1.5 border-b border-slate-50">
                {{ group.categoryName }}
              </span>
              
              <div class="flex flex-col gap-0.5">
                <NuxtLink 
                  v-for="tab in group.tabs" 
                  :key="tab.tabId"
                  :to="getTabUrl(tab.tabId)"
                  class="text-[11px] font-bold px-3 py-2 rounded-xl transition-all tracking-wide flex items-center gap-2.5"
                  :class="isTabActive(tab.tabId)
                    ? 'bg-slate-800 text-white shadow-xs font-black' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/70'"
                >
                  <span 
                    class="w-1.5 h-1.5 rounded-full shrink-0" 
                    :class="[
                      isTabActive(tab.tabId) ? 'bg-white' : '',
                      !isTabActive(tab.tabId) && group.categoryName === 'Overview' ? 'bg-blue-400/80' : '',
                      !isTabActive(tab.tabId) && group.categoryName === 'Relationships' ? 'bg-indigo-400/80' : '',
                      !isTabActive(tab.tabId) && group.categoryName === 'Graph & Cycles' ? 'bg-emerald-400/80' : '',
                    ]"
                  ></span>
                  {{ tab.title }}
                </NuxtLink>
              </div>
            </div>
          </div>

          <!-- TOP BAR: Scrollable Tabs Menu (Mobile Viewports) -->
          <div class="md:hidden w-full flex items-center gap-1.5 bg-white border border-slate-100 p-2.5 rounded-xl overflow-x-auto scrollbar-none shrink-0 shadow-3xs">
            <NuxtLink 
              v-for="tab in flattenedMobileTabs" 
              :key="tab.tabId"
              :to="getTabUrl(tab.tabId)"
              class="text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all tracking-wide flex-shrink-0"
              :class="isTabActive(tab.tabId)
                ? 'bg-slate-800 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
            >
              {{ tab.title }}
            </NuxtLink>
          </div>

          <!-- MAIN CANVAS AREA -->
          <div class="flex-1 min-w-0 bg-white border border-slate-100 rounded-2xl p-6 shadow-3xs overflow-y-auto">
            <NuxtPage />
          </div>

        </div>
      </template>
    </ViewWorkspaceLayout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue"
import { useRoute, useSeoMeta, definePageMeta } from "#imports"
import { useDataStore } from "~/stores/data"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const route = useRoute()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)
const component = computed(() => store.allComponents.find((c: any) => c.name === nameInRoute.value)!)

const getMetric = (keyName: string): number => {
  if (!component.value) return 0
  const val = component.value[keyName] ?? 
              component.value[keyName.toLowerCase()] ?? 
              component.value[store.statName(keyName)] ?? 
              component.value[store.statName(keyName.toLowerCase())]
  return Number(val) || 0
}

const filesCount = computed(() => {
  return getMetric('Complexity__files') || undefined
})

const cyclesCount = computed(() => {
  return getMetric('Cycles__Short__count') || undefined
})

onMounted(() => {
  useSeoMeta({
    title: `Component: ${nameInRoute.value}`,
    description: `Architectural analysis details for module ${nameInRoute.value}`
  })
})

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ],
})

const { isJavaProject, getJavaMetricsForComponent } = useJavaMetrics()

const hasJavaMetrics = computed(() => {
  if (!nameInRoute.value) return false
  const metrics = getJavaMetricsForComponent(nameInRoute.value)
  return metrics && (metrics.classes > 0 || metrics.springBeans > 0 || metrics.jpaEntities > 0)
})

const categorizedTabs = computed(() => {
  const overviewTabs = [
    { title: "Info", tabId: "info" },
    { title: "Files", tabId: "files" }
  ]
  if (isJavaProject.value && hasJavaMetrics.value) {
    overviewTabs.push({ title: "Java Insights", tabId: "java" })
  }

  const relationshipTabs = [
    { title: "Component Matrix", tabId: "component-matrix" },
    { title: "External File Matrix", tabId: "external-file-matrix" },
    { title: "Internal File Matrix", tabId: "internal-file-matrix" },
    { title: "Git Activity", tabId: "git" }
  ]

  const graphTabs = [
    { title: "Cycles", tabId: "cycles" },
    { title: "Static Coupling", tabId: "static-coupling" },
    { title: "Circle of Influence", tabId: "circle-of-influence" }
  ]

  return [
    { categoryName: "Overview", tabs: overviewTabs },
    { categoryName: "Relationships", tabs: relationshipTabs },
    { categoryName: "Graph & Cycles", tabs: graphTabs }
  ]
})

const flattenedMobileTabs = computed(() => {
  return categorizedTabs.value.flatMap(group => group.tabs)
})

const getTabUrl = (tabId: string) => {
  const base = `/views/components/${nameInRoute.value}`
  if (tabId === "info") return base
  return `${base}/${tabId}`
}

const isTabActive = (tabId: string) => {
  const path = route.path.replace(/\/$/, "")
  if (tabId === "info") {
    return !["/files", "/cycles", "/static-coupling", "/git", "/java", "/component-matrix", "/external-file-matrix", "/internal-file-matrix", "/circle-of-influence"].some(suffix => path.endsWith(suffix))
  }
  return path.endsWith(`/${tabId}`)
}
</script>

<style scoped>
/* Scrollbar styling */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
