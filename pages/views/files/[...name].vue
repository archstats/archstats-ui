<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <ViewWorkspaceLayout
      :title="fileBasename"
      badge-text="File"
      badge-color-class="bg-violet-50 border-violet-100 text-violet-700"
      :nodes-count="linesCount"
      :connections-count="commitsCount"
      :stats-labels="{ nodes: 'Lines of Code', connections: 'Commits' }"
      :show-config="false"
      :is-sidebar-open="false"
    >
      <!-- Action slot for Back to Table -->
      <template #actions>
        <div class="flex items-center gap-3">
          <NuxtLink 
            v-if="fileData?.component"
            :to="`/views/components/${fileData.component}`" 
            class="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-800 transition-colors bg-sky-50/70 border border-sky-100 rounded-lg px-2.5 py-1"
          >
            <span>📦</span>
            <span>Component: {{ fileData.component }}</span>
          </NuxtLink>
          <NuxtLink 
            to="/views/files/table" 
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Explorer
          </NuxtLink>
        </div>
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
                      !isTabActive(tab.tabId) && group.categoryName === 'Overview' ? 'bg-violet-400/80' : '',
                      !isTabActive(tab.tabId) && group.categoryName === 'Revisions' ? 'bg-indigo-400/80' : '',
                      !isTabActive(tab.tabId) && group.categoryName === 'Structure' ? 'bg-emerald-400/80' : '',
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
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const route = useRoute()
const store = useDataStore()
const { isJavaProject, getJavaMetricsForFile } = useJavaMetrics()

// Resolving filePath from name parameter (supports catch-all route segments)
const filePath = computed(() => {
  const parts = route.params.name
  let list = Array.isArray(parts) ? [...parts] : [parts as string]
  const last = list[list.length - 1]
  if (["contents", "git", "imports", "java"].includes(last)) {
    list.pop()
  }
  return list.join('/')
})

const escapedPath = computed(() => filePath.value.replace(/'/g, "''"))

const fileBasename = computed(() => {
  const parts = filePath.value.split('/')
  return parts[parts.length - 1] || filePath.value
})

const fileData = computed(() => {
  if (!store.hasData) return null
  const results = store.query<Record<string, any>>(
    `SELECT * FROM files WHERE name = '${escapedPath.value}' LIMIT 1`
  )
  return results.length > 0 ? results[0] : null
})

const getMetric = (keyName: string): number => {
  if (!fileData.value) return 0
  const val = fileData.value[keyName] ?? fileData.value[keyName.toLowerCase()]
  return Number(val) || 0
}

const linesCount = computed(() => {
  return getMetric('complexity__lines') || undefined
})

const commitsCount = computed(() => {
  return getMetric('git__commits__total') || undefined
})

const javaMetrics = computed(() => {
  if (!filePath.value) return null
  return getJavaMetricsForFile(filePath.value)
})

const hasJavaMetrics = computed(() => {
  if (!javaMetrics.value) return false
  return javaMetrics.value.classes > 0 || javaMetrics.value.roles.length > 0 || javaMetrics.value.rest.total > 0
})

onMounted(() => {
  useSeoMeta({
    title: `File: ${fileBasename.value}`,
    description: `Architectural analysis details for file ${filePath.value}`
  })
})

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ],
})

const categorizedTabs = computed(() => {
  const overviewTabs = [
    { title: "Info", tabId: "info" },
    { title: "Source Code", tabId: "contents" }
  ]

  const revisionsTabs = [
    { title: "Git History", tabId: "git" }
  ]

  const structureTabs = [
    { title: "Imports", tabId: "imports" }
  ]
  if (isJavaProject.value && hasJavaMetrics.value) {
    structureTabs.push({ title: "Java Insights", tabId: "java" })
  }

  return [
    { categoryName: "Overview", tabs: overviewTabs },
    { categoryName: "Revisions", tabs: revisionsTabs },
    { categoryName: "Structure", tabs: structureTabs }
  ]
})

const flattenedMobileTabs = computed(() => {
  return categorizedTabs.value.flatMap(group => group.tabs)
})

const getTabUrl = (tabId: string) => {
  const base = `/views/files/${filePath.value}`
  if (tabId === "info") return base
  return `${base}/${tabId}`
}

const isTabActive = (tabId: string) => {
  const path = route.path.replace(/\/$/, "")
  if (tabId === "info") {
    return !["/contents", "/git", "/imports", "/java"].some(suffix => path.endsWith(suffix))
  }
  return path.endsWith(`/${tabId}`)
}
</script>

<style scoped>
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
