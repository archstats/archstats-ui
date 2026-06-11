<template>
  <ViewWorkspaceLayout
    title="Java OOP Metrics"
    :badge-text="badgeText"
    badge-color-class="bg-slate-50 border-slate-200 text-slate-700"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="[{ id: 'oop', label: 'OOP Metrics' }]"
    sidebar-width="380px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full flex flex-col gap-6 p-6 overflow-y-auto scroll-container select-none">
        
        <!-- Ratios Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          <!-- OOP Declarations -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col justify-between">
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">OOP Declarations</h4>
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-0.5 animate-in fade-in duration-300">
                <span class="text-[8px] text-slate-400 font-bold uppercase">Classes</span>
                <span class="text-lg font-black text-slate-850 font-mono">{{ summary.classes }}</span>
              </div>
              <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-0.5 animate-in fade-in duration-300">
                <span class="text-[8px] text-slate-400 font-bold uppercase">Methods</span>
                <span class="text-lg font-black text-slate-850 font-mono">{{ summary.methods }}</span>
              </div>
              <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-0.5 animate-in fade-in duration-300">
                <span class="text-[8px] text-slate-400 font-bold uppercase">Fields</span>
                <span class="text-lg font-black text-slate-850 font-mono">{{ summary.fields }}</span>
              </div>
            </div>
          </div>

          <!-- Ratios -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col justify-between">
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Object Oriented Ratios</h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-0.5">
                <span class="text-[8px] text-slate-450 font-black uppercase tracking-wider">Avg Methods/Class</span>
                <span class="text-xl font-black text-slate-900 font-mono">{{ avgMethodsPerClass }}</span>
              </div>
              <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-0.5">
                <span class="text-[8px] text-slate-455 font-black uppercase tracking-wider">Avg Fields/Class</span>
                <span class="text-xl font-black text-slate-900 font-mono">{{ avgFieldsPerClass }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Components Table with Java OOP stats -->
        <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
          <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Components OOP Breakdown ({{ filteredOopComponents.length }})</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-[10px] font-medium text-slate-700">
              <thead>
                <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="text-left px-3 py-2">Component</th>
                  <th class="text-center px-3 py-2">Classes</th>
                  <th class="text-center px-3 py-2">Methods</th>
                  <th class="text-center px-3 py-2">Fields</th>
                  <th class="text-right px-3 py-2">Methods/Class</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredOopComponents.length === 0">
                  <td colspan="5" class="text-center py-8 text-slate-400 italic">No components found.</td>
                </tr>
                <tr
                  v-else
                  v-for="item in filteredOopComponents"
                  :key="item.name"
                  class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td class="px-3 py-2.5 font-bold text-indigo-650 truncate max-w-[240px]">
                    <router-link :to="`/views/components/${item.name}`">{{ store.getComponentName(item.name) }}</router-link>
                  </td>
                  <td class="px-3 py-2.5 font-mono text-center text-slate-800">{{ item.classes }}</td>
                  <td class="px-3 py-2.5 font-mono text-center text-slate-800">{{ item.methods }}</td>
                  <td class="px-3 py-2.5 font-mono text-center text-slate-800">{{ item.fields }}</td>
                  <td class="px-3 py-2.5 font-mono font-bold text-right text-slate-900">{{ (item.classes ? item.methods / item.classes : 0).toFixed(1) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </template>

    <!-- Sidebar OOP tab -->
    <template #tab-oop>
      <div class="flex flex-col gap-5 select-none">
        <div class="flex flex-col gap-1">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">OOP Metrics</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1">
            Ratios of method declarations and state properties per class indicate structural cohesion and encapsulation weight across packages.
          </p>
        </div>

        <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-2">
          <h5 class="text-[9px] font-black text-slate-650 uppercase tracking-wider">Encapsulation Cohesion</h5>
          <p class="text-[10px] text-slate-500 leading-relaxed">
            High averages of methods per class can indicate overly complex files that may benefit from modular splitting. A high field count per class can indicate stateful singletons.
          </p>
        </div>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"
import { useDataStore } from "~/stores/data"
import { useJavaMetrics } from "~/composables/useJavaMetrics"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const store = useDataStore()
const { getJavaSummary } = useJavaMetrics()

useSeoMeta({ title: "OOP Metrics Insights" })

definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("oop")

const summary = computed(() => getJavaSummary())
const badgeText = computed(() => `${summary.value.classes} Classes`)

// Average ratios
const avgMethodsPerClass = computed(() => {
  const c = summary.value.classes
  const m = summary.value.methods
  return c ? (m / c).toFixed(1) : "—"
})

const avgFieldsPerClass = computed(() => {
  const c = summary.value.classes
  const f = summary.value.fields
  return c ? (f / c).toFixed(1) : "—"
})

// OOP Component list construction
interface OopCompRow {
  name: string
  classes: number
  methods: number
  fields: number
}

const oopComponentsList = computed<OopCompRow[]>(() => {
  if (!store.hasData) return []
  const list: OopCompRow[] = []
  store.allComponents.forEach((c: any) => {
    const classes = Number(c.java__class__declarations) || 0
    const methods = Number(c.java__method_declarations) || 0
    const fields = Number(c.java__field__declarations) || 0
    if (classes > 0 || methods > 0 || fields > 0) {
      list.push({
        name: c.name,
        classes,
        methods,
        fields
      })
    }
  })
  return list.sort((a, b) => b.classes - a.classes)
})

// OOP Filter
const filteredOopComponents = computed(() => {
  const list = oopComponentsList.value
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item: any) => item.name.toLowerCase().includes(q))
})
</script>

<style scoped>
.scroll-container::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
