<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <ViewWorkspaceLayout
      :title="authorName"
      badge-text="Git Author"
      badge-color-class="bg-violet-50 border-violet-100 text-violet-700"
      :nodes-count="totalCommits"
      :stats-labels="{ nodes: 'Commits' }"
      :show-config="false"
      :is-sidebar-open="false"
    >
      <!-- Action slot for Back to Git -->
      <template #actions>
        <NuxtLink 
          to="/views/git/authors" 
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Git
        </NuxtLink>
      </template>

      <!-- Visualizer slot for the main tab navigation & NuxtPage -->
      <template #visualizer>
        <div class="w-full h-full flex flex-col bg-white rounded-2xl p-6 shadow-3xs overflow-y-auto min-h-[480px]">
          <!-- Symmetrical subpage tab link bar -->
          <div class="flex items-center gap-1.5 border-b border-slate-100 pb-3 mb-6 overflow-x-auto scrollbar-none shrink-0">
            <NuxtLink 
              v-for="tab in tabConfig" 
              :key="tab.tabId"
              :to="getTabUrl(tab.tabId)"
              class="text-xs font-bold px-4 py-2 rounded-xl transition-all tracking-wide flex-shrink-0"
              :class="isTabActive(tab.tabId)
                ? 'bg-slate-800 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
            >
              {{ tab.title }}
            </NuxtLink>
          </div>

          <!-- Active child subpage canvas slot -->
          <div class="w-full grow">
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

const authorName = computed(() => route.params.name as string)
const escapedName = computed(() => authorName.value.replace(/'/g, "''"))

const totalCommits = computed(() => {
  if (!store.hasData) return undefined
  const rows = store.query<{ git__commits__total: number }>(
    `SELECT git__commits__total FROM git_authors WHERE author_name = '${escapedName.value}'`
  )
  return rows.length > 0 ? Number(rows[0].git__commits__total) || undefined : undefined
})

onMounted(() => {
  useSeoMeta({
    title: `Git Author: ${authorName.value}`,
    description: `Git activity and contribution analysis for ${authorName.value}`
  })
})

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ],
})

const tabConfig = [
  { title: "Overview", tabId: "overview" },
  { title: "Timeline", tabId: "timeline" },
  { title: "Components", tabId: "components" },
  { title: "Files", tabId: "files" }
]

const getTabUrl = (tabId: string) => {
  const base = `/views/git/authors/${authorName.value}`
  if (tabId === "overview") return base
  return `${base}/${tabId}`
}

const isTabActive = (tabId: string) => {
  const path = route.path.replace(/\/$/, "")
  if (tabId === "overview") {
    return !["/timeline", "/components", "/files"].some(suffix => path.endsWith(suffix))
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
