<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <ViewWorkspaceLayout
      v-if="group"
      :title="group.name"
      :badge-text="group.type === 'component' ? 'Component Group' : 'File Group'"
      badge-color-class="bg-violet-50 border-violet-100 text-violet-700"
      :nodes-count="group.members.length"
      :connections-count="totalLoc"
      :stats-labels="{ nodes: 'Members', connections: 'Lines of Code' }"
      :show-config="false"
      :is-sidebar-open="false"
    >
      <!-- Title slot to show dynamic color dot next to the name -->
      <template #title>
        <div class="flex items-center gap-2.5">
          <span 
            class="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-200/50 shadow-3xs" 
            :style="{ backgroundColor: group.color }"
          ></span>
          <span>{{ group.name }}</span>
        </div>
      </template>

      <!-- Action slot for Back to Group Coupling -->
      <template #actions>
        <router-link 
          to="/views/components/group-coupling" 
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Group Coupling
        </router-link>
      </template>

      <!-- Visualizer slot for the layout subpages -->
      <template #visualizer>
        <div class="w-full h-full flex flex-col md:flex-row gap-6 min-h-[480px] overflow-hidden">
          
          <!-- LEFT SIDEBAR: Navigation Menu -->
          <div class="hidden md:flex flex-col gap-5 w-56 shrink-0 bg-white border border-slate-100 rounded-2xl p-4 shadow-3xs overflow-y-auto">
            <div class="flex flex-col gap-1.5">
              <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 select-none pb-1.5 border-b border-slate-50">
                Navigation
              </span>
              
              <div class="flex flex-col gap-0.5">
                <router-link 
                  v-for="tab in tabs" 
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
                      isTabActive(tab.tabId) ? 'bg-white' : 'bg-slate-400',
                    ]"
                  ></span>
                  {{ tab.title }}
                </router-link>
              </div>
            </div>
          </div>

          <!-- TOP BAR: Mobile Tabs Menu -->
          <div class="md:hidden w-full flex items-center gap-1.5 bg-white border border-slate-100 p-2.5 rounded-xl overflow-x-auto scrollbar-none shrink-0 shadow-3xs">
            <router-link 
              v-for="tab in tabs" 
              :key="tab.tabId"
              :to="getTabUrl(tab.tabId)"
              class="text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all tracking-wide flex-shrink-0"
              :class="isTabActive(tab.tabId)
                ? 'bg-slate-800 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
            >
              {{ tab.title }}
            </router-link>
          </div>

          <!-- MAIN CANVAS AREA -->
          <div class="flex-1 min-w-0 bg-white border border-slate-100 rounded-2xl p-6 shadow-3xs overflow-y-auto">
            <NuxtPage />
          </div>

        </div>
      </template>
    </ViewWorkspaceLayout>

    <!-- Fallback if group not found -->
    <div v-else class="flex-grow flex flex-col items-center justify-center py-20 text-center select-none bg-white border border-slate-100 rounded-2xl p-6">
      <div class="text-4xl mb-4">⚠️</div>
      <h3 class="text-sm font-bold text-slate-700 mb-1">Group Not Found</h3>
      <p class="text-xs text-slate-400 max-w-xs leading-normal mb-4">The requested group could not be found. It may have been deleted.</p>
      <router-link 
        to="/views/components/group-coupling" 
        class="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-xl transition-all"
      >
        Go to Group Coupling
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useGroupsStore } from "~/stores/groups"
import { useDataStore } from "~/stores/data"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const route = useRoute()
const groupsStore = useGroupsStore()
const dataStore = useDataStore()

const id = computed(() => route.params.id as string)
const group = computed(() => groupsStore.getGroupById(id.value))

// Aggregate metrics computation
// dataStore.query is async, so this cannot be a computed — populate a ref instead.
const totalLoc = ref(0)
watch([() => dataStore.hasData, group], async ([hasData]) => {
  if (!group.value || !hasData) {
    totalLoc.value = 0
    return
  }

  if (group.value.type === 'component') {
    totalLoc.value = group.value.members.reduce((acc, compName) => {
      const comp = dataStore.allComponentsIndex.get(compName)
      if (!comp) return acc
      const loc = comp.complexity__lines ?? comp.complexity__Lines ?? comp.Complexity__lines ?? comp.Complexity__Lines ?? 0
      return acc + Number(loc)
    }, 0)
  } else {
    // File group
    if (group.value.members.length === 0) {
      totalLoc.value = 0
      return
    }
    const escapedNames = group.value.members.map(m => `'${m.replace(/'/g, "''")}'`).join(',')
    const results = await dataStore.query<Record<string, any>>(
      `SELECT SUM(COALESCE(complexity__lines, complexity__Lines, 0)) as total_lines FROM files WHERE name IN (${escapedNames})`
    )
    totalLoc.value = results.length > 0 ? Number(results[0].total_lines || 0) : 0
  }
}, { immediate: true })

const tabs = [
  { title: "Overview", tabId: "info" },
  { title: "Explorer", tabId: "explorer" }
]

const getTabUrl = (tabId: string) => {
  const base = `/views/groups/${id.value}`
  if (tabId === "info") return base
  return `${base}/${tabId}`
}

const isTabActive = (tabId: string) => {
  const path = route.path.replace(/\/$/, "")
  if (tabId === "info") {
    return !path.endsWith('/explorer')
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
