<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <ViewWorkspaceLayout
    title="Architectural Hotspots"
    badge-text="Circle Packing"
    badge-color-class="bg-rose-50 border-rose-100 text-rose-700"
    :nodes-count="store.allComponents.length"
    :stats-labels="{ nodes: 'Components' }"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="sidebarExpanded"
    v-model:active-tab="activeSidebarTab"
    :tabs="[
      { id: 'perspectives', label: '🔍 Perspectives' },
      { id: 'diagnostics', label: '📊 Diagnostics' },
      { id: 'legend', label: '💡 Legend & Guide' }
    ]"
    :show-config="false"
    sidebar-width="400px"
  >
    <template #visualizer>
      <div class="w-full h-full flex flex-col relative overflow-hidden">
        <!-- Group Legend -->
        <div
          v-if="groupsStore.componentGroups.length > 0"
          class="bg-white border-b border-slate-100 px-6 py-2.5 flex flex-wrap items-center gap-2 shrink-0 w-full"
        >
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Groups:</span>
          <div
            v-for="group in groupsStore.componentGroups"
            :key="group.id"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer transition-all select-none"
            :class="[
              hiddenGroups.has(group.id)
                ? 'border-slate-100 text-slate-300 bg-slate-50/50'
                : activeFilters.has(group.id)
                  ? 'border-archstats-500 bg-archstats-50 text-archstats-800'
                  : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600'
            ]"
            @click="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
            @mouseenter="!hiddenGroups.has(group.id) && (hoveredGroupId = group.id)"
            @mouseleave="hoveredGroupId = null"
          >
            <div class="w-2.5 h-2.5 rounded-full transition-opacity" :style="{ backgroundColor: group.color }" :class="hiddenGroups.has(group.id) ? 'opacity-20' : ''"></div>
            <span :class="hiddenGroups.has(group.id) ? 'line-through' : ''">{{ group.name }}</span>
            <span class="text-slate-400 ml-0.5">({{ group.members.length }})</span>
            <button
              v-if="!hiddenGroups.has(group.id)"
              @click.stop="toggleGroupVisibility(group.id)"
              class="ml-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Hide group from view"
            >✕</button>
          </div>

          <button
            v-if="activeFilters.size > 0 || hiddenGroups.size > 0"
            @click="activeFilters.clear(); hiddenGroups.clear()"
            class="ml-auto text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            ✕ Clear
          </button>
        </div>

        <!-- Visualizer Area -->
        <div class="grow w-full flex items-center justify-center relative min-h-0">
          <HotspotsTreemap 
            :components="store.allComponents" 
            :size-metric="sizeMetric" 
            :color-metric="colorMetric"
            :highlighted-component="highlightedComponent"
            :label-high="dynamicLabelHigh"
            :label-low="dynamicLabelLow"
            :search-query="searchQuery"
            :selected-components="selectedComponents"
            :hidden-groups="hiddenGroups"
            :active-filters="activeFilters"
            :hovered-group-id="hoveredGroupId"
            @toggle-selection="toggleSelection"
            @replace-selection="replaceSelection"
          />
        </div>
      </div>
    </template>

    <template #tab-perspectives>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1 select-none">
          <h1 class="text-sm font-extrabold tracking-tight text-slate-900 leading-none">
            {{ activePresetId === 'custom' ? 'Code Hotspots (Custom)' : 'Hotspots: ' + (presets.find(p => p.id === activePresetId)?.label.split(' vs.')[0] || 'Code Hotspots') }}
          </h1>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-2.5">
            {{ activePresetId === 'custom' ? 'Custom visualization mapping. Configure size and color metrics using the panel below.' : (presets.find(p => p.id === activePresetId)?.description || 'Locate complex and highly volatile components across directory trees.') }}
          </p>
        </div>

        <!-- Perspective Presets Selection -->
        <div class="flex flex-col gap-3">
          <h3 class="font-extrabold text-[9px] text-slate-400 uppercase tracking-widest leading-none">Analysis Perspectives</h3>
          
          <div class="flex flex-col gap-2.5">
            <!-- Preset Cards -->
            <div 
              v-for="preset in presets"
              :key="preset.id"
              @click="selectPreset(preset)"
              class="flex flex-col gap-2 p-3.5 bg-white border rounded-2xl cursor-pointer transition-all duration-200 hover:border-archstats-400 hover:shadow-md"
              :class="presetIsActive(preset) 
                ? 'border-archstats-500 ring-2 ring-archstats-500/10 shadow-3xs' 
                : 'border-slate-200/70 shadow-4xs bg-white'"
            >
              <div class="flex items-center gap-2">
                <div class="p-1.5 rounded-lg text-slate-500" :class="presetIsActive(preset) ? 'bg-archstats-50 text-archstats-600' : 'bg-slate-50'">
                  <div v-html="getPresetIcon(preset.id)" class="w-4 h-4 flex items-center justify-center"></div>
                </div>
                <span class="text-xs font-bold text-slate-800">{{ preset.label }}</span>
                <span v-if="presetIsActive(preset)" class="ml-auto text-[8px] bg-archstats-500 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">Active</span>
              </div>
              <p class="text-[10px] text-slate-500 leading-normal">
                {{ preset.description }}
              </p>
              <div class="flex items-center gap-1.5 mt-1 border-t border-slate-100 pt-2 text-[9px] text-slate-400 font-medium">
                <span>Size: <strong class="text-slate-600 font-mono">{{ preset.sizeMetricName }}</strong></span>
                <span class="text-slate-300">•</span>
                <span>Heat: <strong class="text-slate-600 font-mono">{{ preset.id === 'churn' ? cleanMetricName(colorMetric) : preset.colorMetricName }}</strong></span>
              </div>
              
              <!-- Git Churn Time Selector (Only if active and has options) -->
              <div v-if="presetIsActive(preset) && preset.id === 'churn' && gitChurnTimeOptions.length > 0" class="flex flex-col gap-1.5 mt-2.5 border-t border-slate-100 pt-2.5" @click.stop>
                <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Git Volatility Range</span>
                <div class="flex flex-wrap gap-1 bg-slate-50/70 p-0.5 rounded-xl border border-slate-200/50">
                  <button 
                    v-for="opt in gitChurnTimeOptions"
                    :key="opt.value"
                    @click="selectGitChurnTime(opt.value)"
                    class="text-[8px] font-bold py-1 px-2 rounded-lg transition-all text-center tracking-wide flex-grow cursor-pointer"
                    :class="colorMetric === opt.value
                      ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/20' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Custom Metric Perspective -->
            <div 
              @click="selectCustomPreset()"
              class="flex flex-col gap-2 p-3.5 bg-white border rounded-2xl cursor-pointer transition-all duration-200 hover:border-archstats-400 hover:shadow-md"
              :class="activePresetId === 'custom' 
                ? 'border-archstats-500 ring-2 ring-archstats-500/10 shadow-3xs' 
                : 'border-slate-200/70 shadow-4xs bg-white'"
            >
              <div class="flex items-center gap-2">
                <div class="p-1.5 rounded-lg text-slate-500" :class="activePresetId === 'custom' ? 'bg-archstats-50 text-archstats-600' : 'bg-slate-50'">
                  <div v-html="getPresetIcon('custom')" class="w-4 h-4 flex items-center justify-center"></div>
                </div>
                <span class="text-xs font-bold text-slate-800">Custom Perspective</span>
                <span v-if="activePresetId === 'custom'" class="ml-auto text-[8px] bg-archstats-500 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">Active</span>
              </div>
              <p class="text-[10px] text-slate-500 leading-normal">
                Manually select specific columns to custom build your hierarchy visualization.
              </p>
              
              <!-- Collapsible panel for custom metric selectors -->
              <div v-if="activePresetId === 'custom'" class="flex flex-col gap-3 mt-2 border-t border-slate-100 pt-3" @click.stop>
                <div class="flex flex-col gap-1">
                  <label class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Circle Size (Size)</label>
                  <StatSelectSingle 
                    v-model="sizeMetric" 
                    :options="distinctStats" 
                    class="w-full"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Heat Level (Volatility)</label>
                  <StatSelectSingle 
                    v-model="colorMetric" 
                    :options="distinctStats"
                    :align-right="true"
                    class="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #tab-diagnostics>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1 select-none">
          <h3 class="font-extrabold text-[9px] text-slate-400 uppercase tracking-widest leading-none">Diagnostic Insights</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1.5">
            Automatic recommendations highlighting volatile sections and stable foundations.
          </p>
        </div>
        
        <Card 
          v-for="(card, index) in diagnosticCards"
          :key="index"
          @mouseenter="highlightedComponent = card.component?.name || null"
          @mouseleave="highlightedComponent = null"
          @click="navToComponent(card.component?.name)"
          class="flex flex-col gap-2.5 border border-slate-200/80 group cursor-pointer bg-white transition-all p-4 shadow-3xs rounded-2xl"
          :class="card.borderColor"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" :class="card.bulletColor"></span>
              <h4 class="font-bold text-slate-800 text-xs">
                {{ card.title }}
              </h4>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </div>
          
          <p class="text-[10px] text-slate-500 leading-normal">
            {{ card.description }}
          </p>
          
          <div v-if="card.component" class="mt-1 border border-slate-100 rounded-xl p-2.5 flex flex-col gap-1" :class="index === 0 ? 'bg-rose-50/40 border-rose-100/50' : index === 1 ? 'bg-emerald-50/40 border-emerald-100/50' : 'bg-amber-50/40 border-amber-100/50'">
            <span class="font-mono font-bold text-[9px] break-all select-none" :class="index === 0 ? 'text-rose-700' : index === 1 ? 'text-emerald-700' : 'text-amber-700'">
              {{ truncateName(card.component.name) }}
            </span>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-[8.5px] text-slate-500 font-medium">
              <span v-for="m in card.metrics" :key="m.label">
                {{ m.label }}: <strong class="text-slate-800 font-mono">{{ m.value }}</strong>
              </span>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <template #tab-legend>
      <div class="flex flex-col gap-4">
        <!-- Visual Encodings -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Visual Encodings</span>
          <div class="flex flex-col gap-2.5 bg-slate-50/50 border border-slate-200/50 rounded-2xl p-4">
            <div class="flex items-start gap-3">
              <div class="w-6 h-6 rounded-full bg-slate-200 border border-slate-350 flex items-center justify-center text-[10px] text-slate-600 font-bold shrink-0">Aa</div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] font-bold text-slate-800">Circle Diameter</span>
                <p class="text-[9px] text-slate-500 leading-normal">Corresponds to the selected Size metric (default: Lines of Code). Larger circles indicate more massive components requiring more comprehension overhead.</p>
              </div>
            </div>
            <div class="h-px bg-slate-100"></div>
            <div class="flex items-start gap-3">
              <div class="w-6 h-6 rounded-lg bg-gradient-to-r from-blue-300 via-amber-300 to-rose-600 shrink-0"></div>
              <div class="flex flex-col gap-0.5">
                <span class="text-[10px] font-bold text-slate-800">Color Heat Scale</span>
                <p class="text-[9px] text-slate-500 leading-normal">Ranges from cool blue (stable/inactive/simple) to warnings in amber and hot rose-crimson (high risk, churn, nesting, or coupling). Faded gray denotes zero activity.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Tips -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Quick Tips</span>
          <div class="flex flex-col gap-2.5 text-[9.5px] text-slate-600 leading-relaxed pl-1.5 list-disc gap-y-2">
            <div>🔍 <strong>Fuzzy Filtering:</strong> Type in the toolbar search to highlight files matching namespaces, components, or paths immediately.</div>
            <div>🎯 <strong>Callout Flags:</strong> The chart displays flags highlighting the absolute highest hotspot and the cleanest stable core component in the current selection.</div>
            <div>🖱️ <strong>Selection & Navigation:</strong> Click to view component details. Hold <strong>Shift</strong> and click to select multiple, or Shift+drag to draw a selection box.</div>
          </div>
        </div>
      </div>
    </template>
    </ViewWorkspaceLayout>

    <!-- Floating Group Action Bar -->
    <GroupsGroupActionBar 
      :selected-items="selectedComponents" 
      type="component" 
      @clear="selectedComponents = []" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from "vue"
import { useDataStore } from "~/stores/data"
import { useRouter } from "vue-router"
import { useGroupsStore } from "~/stores/groups"
import StatSelectSingle from "~/components/ui/stat-select/StatSelectSingle.vue"
import HotspotsTreemap from "~/components/components/hotspots/HotspotsTreemap.vue"
import Card from "~/components/ui/card/Card.vue"
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue"

const store = useDataStore()
const router = useRouter()
const groupsStore = useGroupsStore()

const selectedComponents = ref<string[]>([])
const hoveredGroupId = ref<string | null>(null)
const activeFilters = reactive(new Set<string>())
const hiddenGroups = reactive(new Set<string>())

function toggleFilter(groupId: string) {
  if (activeFilters.has(groupId)) activeFilters.delete(groupId)
  else activeFilters.add(groupId)
}

function toggleGroupVisibility(groupId: string) {
  if (hiddenGroups.has(groupId)) hiddenGroups.delete(groupId)
  else hiddenGroups.add(groupId)
}

function toggleSelection(name: string) {
  const idx = selectedComponents.value.indexOf(name)
  if (idx !== -1) {
    selectedComponents.value.splice(idx, 1)
  } else {
    selectedComponents.value.push(name)
  }
}

function replaceSelection(names: string[]) {
  selectedComponents.value = [...names]
}

const highlightedComponent = ref<string | null>(null)
const activePresetId = ref<string>("")

const searchQuery = ref("")
const sidebarExpanded = ref(true)
const activeSidebarTab = ref("perspectives")

useSeoMeta({
  title: "Architectural Hotspots",
})

definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const distinctStats = computed<string[]>(() => {
  if (!store.hasData) return []
  return store.getDistinctComponentColumns as string[]
})

const sizeMetric = ref("")
const colorMetric = ref("")

interface HotspotPreset {
  id: string
  label: string
  description: string
  sizeMetric: string
  colorMetric: string
  labelHigh: string
  labelLow: string
  sizeMetricName: string
  colorMetricName: string
}

// Generate presets dynamically based on SQLite columns
const presets = computed<HotspotPreset[]>(() => {
  if (!store.hasData) return []
  const columns = distinctStats.value
  const list: HotspotPreset[] = []

  const linesKey = columns.find((c: string) => c.toLowerCase().includes("lines") || c.toLowerCase().includes("complexity__lines")) || ""
  if (!linesKey) return list

  // Preset 1: Git Churn
  const commitsKey = columns.find((c: string) => c.toLowerCase().includes("commits__total") || c.toLowerCase().includes("commits:total") || c.toLowerCase().includes("commits"))
  if (commitsKey) {
    list.push({
      id: "churn",
      label: "Git Churn & Volatility",
      description: "Map change frequency (commits) against component size (LOC) to locate active development hotspots.",
      sizeMetric: linesKey,
      colorMetric: commitsKey,
      labelHigh: "High Churn Hotspot 🔴",
      labelLow: "Stable & Inactive Core 🟢",
      sizeMetricName: "LOC",
      colorMetricName: "Commits"
    })
  }

  // Preset 2: Logical Complexity
  const indentKey = columns.find((c: string) => c.toLowerCase().includes("indentation__max") || c.toLowerCase().includes("indentation__avg") || c.toLowerCase().includes("indent"))
  if (indentKey) {
    list.push({
      id: "complexity",
      label: "Logical Complexity",
      description: "Map logical nesting level (max indentation) against size (LOC) to isolate logic-heavy refactoring priorities.",
      sizeMetric: linesKey,
      colorMetric: indentKey,
      labelHigh: "Deep Logic Warning 🔴",
      labelLow: "Flat & Simple 🟢",
      sizeMetricName: "LOC",
      colorMetricName: "Max Indent"
    })
  }

  // Preset 3: Coupling Cycles
  const cyclesKey = columns.find((c: string) => c.toLowerCase().includes("cycles__short__count") || c.toLowerCase().includes("cycles") || c.toLowerCase().includes("coupling__efferent"))
  if (cyclesKey) {
    list.push({
      id: "coupling",
      label: "Dependency Cycles & Coupling",
      description: "Map cycle connections or efferent couplings against component size to locate tightly bound risk zones.",
      sizeMetric: linesKey,
      colorMetric: cyclesKey,
      labelHigh: "High Coupling Risk 🔴",
      labelLow: "Decoupled / Isolated 🟢",
      sizeMetricName: "LOC",
      colorMetricName: "Cycles Count"
    })
  }

  // Preset 4: Stability
  const instKey = columns.find((c: string) => c.toLowerCase().includes("instability"))
  if (instKey) {
    list.push({
      id: "stability",
      label: "Component Instability",
      description: "Map package instability against component size to identify volatile layers and stable core domains.",
      sizeMetric: linesKey,
      colorMetric: instKey,
      labelHigh: "Highly Volatile Area 🔴",
      labelLow: "Highly Stable Core 🟢",
      sizeMetricName: "LOC",
      colorMetricName: "Instability"
    })
  }

  return list
})

onMounted(() => {
  const availablePresets = presets.value
  if (availablePresets.length > 0) {
    // Select first preset by default
    selectPreset(availablePresets[0])
  } else {
    // Fallback to manual selection
    activePresetId.value = "custom"
    const columns = distinctStats.value
    const linesDefault = columns.find((c: string) => c.toLowerCase().includes("lines") || c.toLowerCase().includes("complexity__lines"))
    sizeMetric.value = linesDefault || columns[0] || ""
    
    const commitsDefault = columns.find((c: string) => c.toLowerCase().includes("commits__total") || c.toLowerCase().includes("commits:total") || c.toLowerCase().includes("commits"))
    colorMetric.value = commitsDefault || columns[1] || columns[0] || ""
  }
})

function selectPreset(preset: HotspotPreset) {
  activePresetId.value = preset.id
  sizeMetric.value = preset.sizeMetric
  
  if (preset.id === "churn") {
    const activeOption = gitChurnTimeOptions.value.find((o: any) => o.value === colorMetric.value)
    if (!activeOption) {
      colorMetric.value = preset.colorMetric
    }
  } else {
    colorMetric.value = preset.colorMetric
  }
}

function selectCustomPreset() {
  activePresetId.value = "custom"
}

function presetIsActive(preset: HotspotPreset) {
  return activePresetId.value === preset.id
}

// Automatically sync selection ID if metrics change from Custom Mode
watch([sizeMetric, colorMetric], ([newSize, newColor]) => {
  if (activePresetId.value === "churn" && newColor.toLowerCase().includes("commits")) {
    return
  }
  
  const matched = presets.value.find((p: HotspotPreset) => p.sizeMetric === newSize && p.colorMetric === newColor)
  if (matched) {
    activePresetId.value = matched.id
  } else {
    if (activePresetId.value !== "custom") {
      activePresetId.value = "custom"
    }
  }
})

const gitChurnTimeOptions = computed(() => {
  if (!store.hasData) return []
  const columns = distinctStats.value
  const options: Array<{ label: string; value: string }> = []
  
  // Find total commits key
  const totalKey = columns.find((c: string) => c.toLowerCase() === "git__commits__total" || c.toLowerCase() === "git__commits" || c.toLowerCase() === "commits__total" || c.toLowerCase() === "commits")
  if (totalKey) {
    options.push({
      label: "All Time",
      value: totalKey
    })
  }
  
  // Find git__commits__last_X_days columns
  const regex = /git__commits__last_(\d+)_days/i
  const matches = columns.map((c: string) => {
    const m = c.match(regex)
    return m ? { days: parseInt(m[1]), column: c } : null
  }).filter((x: any): x is { days: number; column: string } => x !== null)
  
  matches.sort((a: any, b: any) => a.days - b.days)
  
  matches.forEach((m: any) => {
    options.push({
      label: `Last ${m.days} Days`,
      value: m.column
    })
  })
  
  return options
})

function selectGitChurnTime(columnName: string) {
  colorMetric.value = columnName
}

const dynamicLabelHigh = computed(() => {
  const matched = presets.value.find(p => p.id === activePresetId.value)
  if (matched) return matched.labelHigh
  
  const metric = colorMetric.value.toLowerCase()
  if (metric.includes("commits") || metric.includes("churn")) return "High Churn Hotspot 🔴"
  if (metric.includes("indent") || metric.includes("complexity")) return "Deep Logic Warning 🔴"
  if (metric.includes("cycles") || metric.includes("coupling")) return "High Coupling Risk 🔴"
  if (metric.includes("instability")) return "Highly Volatile Area 🔴"
  return "High Heat Zone 🔴"
})

const dynamicLabelLow = computed(() => {
  const matched = presets.value.find(p => p.id === activePresetId.value)
  if (matched) return matched.labelLow
  
  const metric = colorMetric.value.toLowerCase()
  if (metric.includes("commits") || metric.includes("churn")) return "Stable & Inactive 🟢"
  if (metric.includes("indent") || metric.includes("complexity")) return "Flat & Simple 🟢"
  if (metric.includes("cycles") || metric.includes("coupling")) return "Decoupled / Isolated 🟢"
  if (metric.includes("instability")) return "Highly Stable Core 🟢"
  return "Quiet Favorable Zone 🟢"
})

function cleanMetricName(key: string): string {
  const k = key.toLowerCase()
  if (k.includes("lines") || k.includes("loc")) return "LOC"
  if (k.includes("commits__last_")) {
    const match = k.match(/commits__last_(\d+)_days/)
    return match ? `Commits (Last ${match[1]} Days)` : "Commits"
  }
  if (k.includes("commits") || k.includes("churn")) return "Commits"
  if (k.includes("indent")) return "Max Indent"
  if (k.includes("cycles")) return "Cycles"
  if (k.includes("instability")) return "Instability"
  if (k.includes("abstractness")) return "Abstractness"
  return key.split("__").pop() || key
}

function truncateName(name: string): string {
  if (!name) return ""
  if (name.length <= 26) return name
  const idx = Math.max(name.lastIndexOf("\\"), name.lastIndexOf("/"))
  if (idx !== -1 && name.length - idx < 26) {
    return ".." + name.substring(idx)
  }
  return name.substring(0, 24) + ".."
}

function getPresetIcon(id: string) {
  if (id === 'churn') {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.467 5.99 5.99 0 0 0-1.925 3.546 5.974 5.974 0 0 1-2.133-1A3.75 3.75 0 0 0 12 18Z" />
    </svg>`
  }
  if (id === 'complexity') {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
    </svg>`
  }
  if (id === 'coupling') {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>`
  }
  if (id === 'stability') {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.567 48.567 0 0 1 12 4.5c-2.288 0-4.52.227-6.75.667m13.5 0a48.555 48.555 0 0 0-13.5 0M21 6.75c0 2.76-2.015 5-4.5 5S12 9.51 12 6.75m0 0c0-2.76 2.015-5 4.5-5S21 4 21 6.75ZM12 6.75c0 2.76-2.015 5-4.5 5S3 9.51 3 6.75m0 0c0-2.76 2.015-5 4.5-5S12 4 12 6.75Z" />
    </svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
  </svg>`
}

function navToComponent(name?: string) {
  if (name) {
    router.push(`/views/components/${name}`)
  }
}

// Compute dynamic, highly-curated diagnostic cards based on the selected perspective
const diagnosticCards = computed(() => {
  if (store.allComponents.length === 0) return []

  const activeId = activePresetId.value
  const list: any[] = []

  // Resolve active metrics
  const sizeKey = store.statName(sizeMetric.value)
  const colorKey = store.statName(colorMetric.value)

  if (!sizeKey || !colorKey) return []

  // 1. Compute Card 1: High Hotspot Risk
  const sortedForHotspot = [...store.allComponents].map((c: any) => {
    const size = Number(c[sizeKey]) || 0
    const heat = Number(c[colorKey]) || 0
    return {
      component: c,
      score: size * heat,
      size,
      heat
    }
  }).sort((a: any, b: any) => b.score - a.score)
  
  const c1 = sortedForHotspot[0]?.component
  const c1Size = sortedForHotspot[0]?.size || 0
  const c1Heat = sortedForHotspot[0]?.heat || 0

  // 2. Compute Card 2: Stable / Clean / Favorable Core
  // Sorts by heat ascending (cleanest first) and then by size descending (largest first)
  const sortedForClean = [...store.allComponents].map((c: any) => {
    const size = Number(c[sizeKey]) || 0
    const heat = Number(c[colorKey]) || 0
    return {
      component: c,
      size,
      heat
    }
  }).sort((a: any, b: any) => {
    if (a.heat !== b.heat) return a.heat - b.heat
    return b.size - a.size
  })
  
  const c2 = sortedForClean[0]?.component
  const c2Size = sortedForClean[0]?.size || 0
  const c2Heat = sortedForClean[0]?.heat || 0

  // 3. Compute Card 3: Secondary Insight
  let c3: any = null
  let c3Title = ""
  let c3Desc = ""
  let c3MetricLabel = ""
  let c3MetricVal = ""
  let c3BulletColor = "bg-amber-500"
  let c3BorderColor = "hover:border-amber-400"

  const indentCol = store.getDistinctComponentColumns.find((c: string) => c.toLowerCase().includes("indentation__max") || c.toLowerCase().includes("indent")) || ""
  const commitsCol = store.getDistinctComponentColumns.find((c: string) => c.toLowerCase().includes("commits__total") || c.toLowerCase().includes("commits") || c.toLowerCase().includes("churn")) || ""
  const instCol = store.getDistinctComponentColumns.find((c: string) => c.toLowerCase().includes("instability")) || ""

  if (activeId === "churn" || activeId === "stability" || activeId === "custom") {
    // Show indentation/complexity warnings
    c3Title = "Uplift Complexity"
    c3Desc = "Packages with deep indentation levels denoting heavy nested logical branches that are hard to comprehend."
    c3MetricLabel = "Max Indent"
    c3BulletColor = "bg-amber-500"
    c3BorderColor = "hover:border-amber-400"
    if (indentCol) {
      const sorted = [...store.allComponents].sort((a: any, b: any) => (Number(b[indentCol]) || 0) - (Number(a[indentCol]) || 0))
      c3 = sorted[0]
      c3MetricVal = String(c3?.[indentCol] || 0)
    }
  } else if (activeId === "complexity") {
    // Show high churn/modification warning
    c3Title = "Active Modification Volatility"
    c3Desc = "Highly complex nesting structures undergoing frequent Git modifications. High-priority refactor target."
    c3MetricLabel = "Commits"
    c3BulletColor = "bg-rose-500"
    c3BorderColor = "hover:border-rose-400"
    if (commitsCol) {
      const sorted = [...store.allComponents].sort((a: any, b: any) => (Number(b[commitsCol]) || 0) - (Number(a[commitsCol]) || 0))
      c3 = sorted[0]
      c3MetricVal = String(c3?.[commitsCol] || 0)
    }
  } else if (activeId === "coupling") {
    // Show instability warnings
    c3Title = "Instability Risk Check"
    c3Desc = "Coupled package sections with extreme instability indexes. Sensitive to breaking changes."
    c3MetricLabel = "Instability"
    c3BulletColor = "bg-indigo-500"
    c3BorderColor = "hover:border-indigo-400"
    if (instCol) {
      const sorted = [...store.allComponents].sort((a: any, b: any) => (Number(b[instCol]) || 0) - (Number(a[instCol]) || 0))
      c3 = sorted[0]
      c3MetricVal = (Number(c3?.[instCol]) || 0).toFixed(2)
    }
  }

  // Card 1 properties based on active preset
  let c1Title = ""
  let c1Desc = ""
  if (activeId === "churn") {
    c1Title = "High Churn Hotspot"
    c1Desc = "High-frequency code changes combined with structural complexity. Highly volatile refactor target."
  } else if (activeId === "complexity") {
    c1Title = "Deep Logic Warning"
    c1Desc = "Large components with deep nested logic branches. Indicates high cyclomatic complexity."
  } else if (activeId === "coupling") {
    c1Title = "High Coupling Risk"
    c1Desc = "Tightly coupled components exhibiting high dependency cycles. Risk of cascading downstream failures."
  } else if (activeId === "stability") {
    c1Title = "Highly Volatile Area"
    c1Desc = "Components with high instability indexes. Highly sensitive to changes in other components."
  } else {
    c1Title = "High Heat Hotspot"
    c1Desc = "Components exhibiting high structural size and high customized heat metrics."
  }

  // Card 2 properties based on active preset
  let c2Title = ""
  let c2Desc = ""
  if (activeId === "churn") {
    c2Title = "Stable & Inactive Core"
    c2Desc = "Favorable large components with very low change rates. Represents the reliable backend."
  } else if (activeId === "complexity") {
    c2Title = "Flat & Simple Structure"
    c2Desc = "Components with shallow indentation levels. Excellent clean code with linear control flow."
  } else if (activeId === "coupling") {
    c2Title = "Decoupled / Isolated Module"
    c2Desc = "Highly isolated structural components that minimize cascading side effects during refactoring."
  } else if (activeId === "stability") {
    c2Title = "Highly Stable Core"
    c2Desc = "Robust, reliable packages with low instability. Many depend on them; they rarely change."
  } else {
    c2Title = "Low Heat / Stable Core"
    c2Desc = "Favorable components showing lowest customized heat and high structural density."
  }

  // Return cards
  list.push({
    title: c1Title,
    description: c1Desc,
    bulletColor: "bg-rose-500",
    borderColor: "hover:border-rose-400",
    component: c1,
    metrics: [
      { label: cleanMetricName(sizeMetric.value), value: String(c1Size) },
      { label: cleanMetricName(colorMetric.value), value: String(c1Heat) }
    ]
  })

  list.push({
    title: c2Title,
    description: c2Desc,
    bulletColor: "bg-emerald-500",
    borderColor: "hover:border-emerald-400",
    component: c2,
    metrics: [
      { label: cleanMetricName(sizeMetric.value), value: String(c2Size) },
      { label: cleanMetricName(colorMetric.value), value: String(c2Heat) }
    ]
  })

  if (c3) {
    list.push({
      title: c3Title,
      description: c3Desc,
      bulletColor: c3BulletColor,
      borderColor: c3BorderColor,
      component: c3,
      metrics: [
        { label: c3MetricLabel, value: c3MetricVal }
      ]
    })
  }

  return list
})
</script>

<style>
</style>
