<template>
  <div class="flex flex-col gap-6">
    <div v-if="component" class="flex flex-col gap-6 animate-fade-in">
      
      <!-- PAGE HEADER DESCRIPTION -->
      <section class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-2">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Relevance Analysis</div>
        <h2 class="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span>External File Coupling Matrix</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-amber-50 border border-amber-200 text-amber-700 font-mono">
            Cross-Component
          </span>
        </h2>
        <p class="text-xs text-slate-400 leading-relaxed max-w-2xl">
          Trace couplings between files inside this component and files in other components. Helps identify hidden inter-component dependencies and logical cross-talk.
        </p>
      </section>

      <!-- METRIC HIGHLIGHTS CARDS -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- 1. Semantic Matches -->
        <div class="bg-white border border-slate-150 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-2">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">External Semantic Allies</span>
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <div>
            <span class="text-2xl font-black text-slate-800 font-mono">{{ semanticMatchesCount }}</span>
            <span class="text-[10px] font-bold text-slate-400 ml-1">files</span>
          </div>
          <p class="text-[9px] text-slate-450 leading-normal">
            External files with similar names (Jaccard &ge; 0.5) to files in this component.
          </p>
        </div>

        <!-- 2. Git Co-Commit Peers -->
        <div class="bg-white border border-slate-150 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-2">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">External Git Co-Changes</span>
            <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <div>
            <span class="text-2xl font-black text-slate-800 font-mono">{{ gitCoChangesCount }}</span>
            <span class="text-[10px] font-bold text-slate-400 ml-1">files</span>
          </div>
          <p class="text-[9px] text-slate-450 leading-normal">
            External files changed in the same commits as files in this component.
          </p>
        </div>

        <!-- 3. Nearest Graph Neighbors -->
        <div class="bg-white border border-slate-150 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-2">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">External Graph Neighbors</span>
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div>
            <span class="text-2xl font-black text-slate-800 font-mono">{{ graphNeighborsCount }}</span>
            <span class="text-[10px] font-bold text-slate-400 ml-1">direct ties</span>
          </div>
          <p class="text-[9px] text-slate-450 leading-normal">
            External files directly imported by or importing files in this component.
          </p>
        </div>
      </div>

      <!-- TABLE & CONTROLS CARD -->
      <section class="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-6">
        
        <div class="flex flex-col gap-4 border-b border-slate-100 pb-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 class="text-xs font-black uppercase tracking-widest text-slate-400">External File Relationships</h3>

            <!-- Search bar -->
            <div class="relative max-w-xs w-full">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21-21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
                </svg>
              </span>
              <input
                type="text"
                v-model="searchQuery"
                placeholder="Search file names..."
                class="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-700 font-semibold placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <!-- Sorting Controls & Metric Filters -->
          <div class="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
            <div class="flex items-center gap-1.5">
              <span>Sort by:</span>
              <select 
                v-model="sortBy" 
                class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ling">Linguistic Similarity</option>
                <option value="git">Git Co-changes</option>
                <option value="path">Path Distance</option>
                <option value="name">Name</option>
              </select>
            </div>

            <div class="flex items-center gap-3 ml-0 sm:ml-auto">
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" v-model="filterGit" class="rounded accent-slate-800 w-3.5 h-3.5" />
                <span>Git Coupling Only</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" v-model="filterPath" class="rounded accent-slate-800 w-3.5 h-3.5" />
                <span>Connected Only</span>
              </label>
            </div>
          </div>
        </div>

        <!-- RELATIONS DATA GRID -->
        <div class="w-full overflow-x-auto min-h-[300px]">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th class="py-3 px-4">Internal File</th>
                <th class="py-3 px-4">External Related File</th>
                <th class="py-3 px-4 text-center">Semantic Similarity</th>
                <th class="py-3 px-4 text-center">Git Co-Changes</th>
                <th class="py-3 px-4 text-center">Path Distance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-xs font-semibold text-slate-700">
              <tr 
                v-for="rel in paginatedRelations" 
                :key="rel.id" 
                class="hover:bg-slate-50/50 transition-colors group"
              >
                <td class="py-3 px-4 max-w-[200px] truncate font-mono text-[11px] text-slate-550">
                  <button 
                    @click="navigateToFile(rel.internalFile)"
                    class="hover:text-indigo-600 text-left font-semibold"
                    :title="rel.internalFile"
                  >
                    {{ getFileBasename(rel.internalFile) }}
                  </button>
                </td>
                
                <td class="py-3 px-4 max-w-[250px] truncate font-mono text-[11px]">
                  <button 
                    @click="navigateToFile(rel.relatedFile)"
                    class="text-indigo-600 hover:text-indigo-900 hover:underline text-left font-semibold"
                    :title="rel.relatedFile"
                  >
                    {{ getFileBasename(rel.relatedFile) }}
                  </button>
                  <div class="text-[9px] text-slate-400 mt-0.5 font-sans truncate">
                    Component: <span class="text-slate-500 font-medium">{{ rel.relatedComponent }}</span>
                  </div>
                </td>

                <!-- Semantic similarity bar -->
                <td class="py-3 px-4 text-center w-40">
                  <div class="flex items-center justify-center gap-2">
                    <div class="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        class="h-full rounded-full transition-all duration-500" 
                        :class="rel.linguisticSimilarity >= 0.7 ? 'bg-indigo-500' : 'bg-slate-400'"
                        :style="{ width: `${rel.linguisticSimilarity * 100}%` }"
                      ></div>
                    </div>
                    <span class="font-mono text-[10px] font-bold text-slate-600 w-8 text-right">
                      {{ rel.linguisticSimilarity > 0 ? (rel.linguisticSimilarity * 100).toFixed(0) + '%' : '0%' }}
                    </span>
                  </div>
                </td>

                <!-- Git co-changes -->
                <td class="py-3 px-4 text-center">
                  <span 
                    v-if="rel.gitCoChanges > 0"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-[10px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3">
                      <path fill-rule="evenodd" d="M12.969 2.11a1.277 1.277 0 0 1 .89.89l1.956 5.867a.382.382 0 0 0 .362.261h6.17a1.277 1.277 0 0 1 .809 2.29l-4.992 3.63a.382.382 0 0 0-.131.424l1.956 5.867a1.277 1.277 0 0 1-1.964 1.425l-4.992-3.63a.382.382 0 0 0-.44 0l-4.992 3.63c-.66.48-1.554-.17-1.293-.956l1.956-5.867a.382.382 0 0 0-.131-.424l-4.992-3.63a1.277 1.277 0 0 1 .809-2.29h6.17a.382.382 0 0 0 .362-.261L11.19 3a1.277 1.277 0 0 1 .89-.89h.89Z" clip-rule="evenodd" />
                    </svg>
                    {{ rel.gitCoChanges }}
                  </span>
                  <span v-else class="text-slate-300 font-mono">-</span>
                </td>

                <!-- Path Distance -->
                <td class="py-3 px-4 text-center">
                  <span 
                    v-if="rel.pathDistance === 1"
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100"
                  >
                    Direct
                  </span>
                  <span 
                    v-else-if="rel.pathDistance > 1"
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-sky-50 text-sky-700 border border-sky-100 font-mono"
                  >
                    {{ rel.pathDistance }} hops
                  </span>
                  <span 
                    v-else
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-50 text-slate-400 border border-slate-100"
                  >
                    Unconnected
                  </span>
                </td>
              </tr>

              <tr v-if="filteredRelations.length === 0">
                <td colspan="5" class="py-12 text-center text-slate-400 italic">
                  No relationships match the selected filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- PAGINATION CONTROLS -->
        <div 
          v-if="filteredRelations.length > pageSize" 
          class="flex items-center justify-between border-t border-slate-100 pt-4"
        >
          <span class="text-xs text-slate-450 font-medium">
            Showing {{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, filteredRelations.length) }} of {{ filteredRelations.length }} relations
          </span>
          <div class="flex items-center gap-1.5">
            <button
              @click="page = Math.max(1, page - 1)"
              :disabled="page === 1"
              class="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Prev
            </button>
            <span class="text-xs font-mono font-extrabold text-slate-800 px-2">{{ page }} / {{ Math.ceil(filteredRelations.length / pageSize) }}</span>
            <button
              @click="page = Math.min(Math.ceil(filteredRelations.length / pageSize), page + 1)"
              :disabled="page === Math.ceil(filteredRelations.length / pageSize)"
              class="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </section>

    </div>
    
    <div v-else class="text-center py-12 text-slate-400 font-medium italic">
      Component data is loading...
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const router = useRouter()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)
const component = computed(() => store.allComponents.find(c => c.name === nameInRoute.value)!)

const searchQuery = ref("")
const sortBy = ref("ling")
const filterGit = ref(false)
const filterPath = ref(false)

const page = ref(1)
const pageSize = 15

// Reset page when filters change
watch([searchQuery, sortBy, filterGit, filterPath], () => {
  page.value = 1
})

// Safe quote escape for SQLite
const escapedName = computed(() => nameInRoute.value.replace(/'/g, "''"))

// ═══════════════════════════════════════════════════════
// FILE MATRIX RELATIONSHIPS (EXTERNAL)
// ═══════════════════════════════════════════════════════

const externalRelations = computed(() => {
  if (!store.hasData || !store.hasView("file_matrix") || !store.hasView("files")) return []

  // Get set of files in current component for classification
  const componentFilesList = store.query<{ name: string }>(`
    SELECT name 
    FROM files 
    WHERE component = '${escapedName.value}'
  `)
  const internalFilesSet = new Set(componentFilesList.map(f => f.name))

  // File to Component lookup map
  const fileComponentList = store.query<{ name: string; component: string }>(`
    SELECT name, component FROM files
  `)
  const fileComponentMap = new Map(fileComponentList.map(f => [f.name, f.component || ""]))

  // Query relations involving files of this component
  const rows = store.query<{
    from: string
    to: string
    linguistic_similarity: number
    git_co_changes: number
    path_distance: number
  }>(`
    SELECT * 
    FROM file_matrix 
    WHERE "from" IN (SELECT name FROM files WHERE component = '${escapedName.value}') 
       OR "to" IN (SELECT name FROM files WHERE component = '${escapedName.value}')
  `)

  const external: any[] = []

  rows.forEach((r, index) => {
    const isFromInternal = internalFilesSet.has(r.from)
    const isToInternal = internalFilesSet.has(r.to)

    // Skip internal-to-internal pairs
    if (isFromInternal && isToInternal) return

    const internalFile = isFromInternal ? r.from : r.to
    const relatedFile = isFromInternal ? r.to : r.from

    external.push({
      id: `file-ext-${index}`,
      internalFile,
      relatedFile,
      relatedComponent: fileComponentMap.get(relatedFile) || "Unknown",
      linguisticSimilarity: r.linguistic_similarity || 0,
      gitCoChanges: r.git_co_changes || 0,
      pathDistance: r.path_distance
    })
  })

  return external
})

const filteredRelations = computed(() => {
  let list = [...externalRelations.value]

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    list = list.filter(r => 
      r.internalFile.toLowerCase().includes(query) || 
      r.relatedFile.toLowerCase().includes(query) ||
      r.relatedComponent.toLowerCase().includes(query)
    )
  }

  // Filter Git co-changes
  if (filterGit.value) {
    list = list.filter(r => r.gitCoChanges > 0)
  }

  // Filter Connected path
  if (filterPath.value) {
    list = list.filter(r => r.pathDistance >= 1)
  }

  // Sort
  list.sort((a, b) => {
    if (sortBy.value === "ling") {
      return b.linguisticSimilarity - a.linguisticSimilarity
    } else if (sortBy.value === "git") {
      return b.gitCoChanges - a.gitCoChanges
    } else if (sortBy.value === "path") {
      const d1 = a.pathDistance === -1 ? 999 : a.pathDistance
      const d2 = b.pathDistance === -1 ? 999 : b.pathDistance
      return d1 - d2
    } else {
      return a.relatedFile.localeCompare(b.relatedFile)
    }
  })

  return list
})

const paginatedRelations = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredRelations.value.slice(start, start + pageSize)
})

// ═══════════════════════════════════════════════════════
// METRIC SUMMARIES
// ═══════════════════════════════════════════════════════

const semanticMatchesCount = computed(() => {
  return externalRelations.value.filter(r => r.linguisticSimilarity >= 0.5).length
})

const gitCoChangesCount = computed(() => {
  return externalRelations.value.filter(r => r.gitCoChanges > 0).length
})

const graphNeighborsCount = computed(() => {
  return externalRelations.value.filter(r => r.pathDistance === 1).length
})

// ═══════════════════════════════════════════════════════
// NAVIGATIONAL & DISPLAY HELPERS
// ═══════════════════════════════════════════════════════

const getFileBasename = (path: string): string => {
  const segments = path.split("/")
  return segments[segments.length - 1]
}

const navigateToFile = (filePath: string) => {
  router.push(`/views/files/${filePath}`)
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
