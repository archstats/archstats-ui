<template>
    <Teleport to="body">
      <div 
        v-if="isOpen" 
        class="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      >
        <!-- Backdrop with blur -->
        <div 
          class="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
          @click="closeModal"
        ></div>

        <!-- Modal Card -->
        <div 
          class="bg-white border border-slate-200 rounded-3xl shadow-xl flex flex-col w-full max-w-3xl h-[85vh] max-h-[700px] z-10 overflow-hidden relative transform transition-all duration-300 scale-100 flex-1 animate-in fade-in zoom-in-95 duration-205"
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/50">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <!-- Source Component -->
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-[8px] font-black text-indigo-500 uppercase tracking-wider mb-0.5 select-none">Source Component</span>
                <span class="text-xs font-black text-slate-800 font-mono truncate select-all" :title="fromComponent">
                  {{ diffNames.fromShort }}
                </span>
                <span class="text-[9px] text-slate-400 font-mono truncate block" :title="fromComponent">
                  {{ diffNames.fromPrefix }}
                </span>
              </div>

              <!-- Arrow Flow -->
              <div class="flex items-center justify-center text-indigo-400 shrink-0 px-2 select-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 animate-pulse">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>

              <!-- Target Component -->
              <div class="flex flex-col min-w-0 text-left">
                <span class="text-[8px] font-black text-sky-500 uppercase tracking-wider mb-0.5 select-none">Target Component</span>
                <span class="text-xs font-black text-slate-800 font-mono truncate select-all" :title="toComponent">
                  {{ diffNames.toShort }}
                </span>
                <span class="text-[9px] text-slate-400 font-mono truncate block" :title="toComponent">
                  {{ diffNames.toPrefix }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0 ml-4">
              <!-- Swap Direction Button -->
              <button 
                @click="swapDirection"
                class="p-2 text-slate-500 hover:text-slate-750 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition-all cursor-pointer shadow-3xs flex items-center gap-1.5 text-[10px] font-bold select-none bg-white"
                title="Reverse Coupling Direction"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span class="hidden sm:inline">Swap Direction</span>
              </button>

              <!-- Close button -->
              <button 
                @click="closeModal" 
                class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-3xs bg-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- KPI Stats Cards (Quick Overview) -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3.5 p-5 pb-3.5 border-b border-slate-100 bg-slate-50/20 shrink-0">
            <!-- References Card -->
            <div class="bg-white border border-slate-200/60 border-l-4 border-l-indigo-500 rounded-xl p-3 flex flex-col gap-0.5 shadow-3xs text-left">
              <span class="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider select-none">Total References</span>
              <span class="text-base font-black text-slate-800 font-mono">{{ totalReferences }}</span>
            </div>
            <!-- Coupled Files Card -->
            <div class="bg-white border border-slate-200/60 border-l-4 border-l-violet-500 rounded-xl p-3 flex flex-col gap-0.5 shadow-3xs text-left">
              <span class="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider select-none">Coupled Files</span>
              <span class="text-base font-black text-slate-800 font-mono">{{ filesList.length }}</span>
            </div>
            <!-- Java Class Links Card -->
            <div class="bg-white border border-slate-200/60 border-l-4 border-l-blue-500 rounded-xl p-3 flex flex-col gap-0.5 shadow-3xs text-left">
              <span class="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider select-none">Class Links</span>
              <span class="text-base font-black text-slate-800 font-mono">{{ javaClassConnections.length }}</span>
            </div>
            <!-- Git Shared Commits Card -->
            <div class="bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-xl p-3 flex flex-col gap-0.5 shadow-3xs text-left">
              <span class="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider select-none">Git Shared Commits</span>
              <span class="text-base font-black text-slate-800 font-mono">{{ gitSharedCommits }}</span>
            </div>
          </div>

          <!-- Tabs Navigation -->
          <div class="flex items-center px-5 py-3 border-b border-slate-100 bg-white shrink-0">
            <div class="flex items-center bg-slate-100 p-1 rounded-xl w-full border border-slate-200/30">
              <button 
                v-for="tab in activeTabs" 
                :key="tab.id"
                @click="currentTab = tab.id"
                class="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 select-none"
                :class="currentTab === tab.id 
                  ? 'bg-white text-indigo-700 shadow-3xs border border-slate-200/10 scale-100' 
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'"
              >
                <!-- SVG icons instead of emojis -->
                <span v-if="tab.id === 'files'">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </span>
                <span v-else-if="tab.id === 'classes'">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                  </svg>
                </span>
                <span v-else-if="tab.id === 'git'">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185z" />
                  </svg>
                </span>
                
                <span>{{ tab.label }}</span>
                <span 
                  class="text-[8px] font-mono px-1.5 py-0.2 rounded-full" 
                  :class="currentTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200/65 text-slate-500'"
                >
                  {{ tab.count }}
                </span>
              </button>
            </div>
          </div>

          <!-- Content Area -->
          <div class="grow overflow-y-auto p-5 scroll-container min-h-0 bg-slate-50/20">
            <!-- 1. TAB: FILES & SNIPPETS -->
            <div v-show="currentTab === 'files'" class="flex flex-col gap-4">
              <div v-if="filesList.length === 0" class="text-center py-10 text-slate-400 italic text-[10px]">
                No direct referencing files found.
              </div>
              
              <div v-else class="flex flex-col gap-2">
                <!-- Info banner at the top -->
                <div class="bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-3 text-[9.5px] text-indigo-850 leading-normal flex items-start gap-2 text-left mb-2 select-none">
                  <span class="text-xs">💡</span>
                  <span>Hover over line badges to preview the code. Click "Go to file" in the popover to open the full source.</span>
                </div>

                <!-- Files List -->
                <div class="flex flex-col border border-slate-200/80 rounded-2xl bg-white divide-y divide-slate-100 overflow-hidden shadow-3xs">
                  <div 
                    v-for="file in filesList" 
                    :key="file.name"
                    class="p-4 hover:bg-slate-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div class="flex items-start gap-3 min-w-0 text-left">
                      <!-- File Icon -->
                      <div class="p-2 bg-slate-100 text-slate-550 rounded-xl shrink-0 mt-0.5 select-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                      </div>
                      
                      <div class="flex flex-col min-w-0">
                        <router-link 
                          :to="`/views/files/${file.name}`" 
                          @click="closeModal"
                          class="text-xs font-black text-slate-800 hover:text-indigo-650 hover:underline leading-tight"
                        >
                          {{ splitFilePath(file.name).filename }}
                        </router-link>
                        <span class="text-[9px] font-mono text-slate-400 truncate mt-1 select-all" :title="file.name">
                          {{ splitFilePath(file.name).dir }}/
                        </span>
                        
                        <!-- Import line ranges below the file path -->
                        <div class="flex items-center flex-wrap gap-1.5 mt-2.5">
                          <span class="text-[8.5px] text-slate-400 font-extrabold uppercase select-none mr-1">Lines:</span>
                          <SnippetPopover 
                            v-for="lr in file.lineRanges" 
                            :key="lr.label"
                            :file="file.name"
                            :lines="lr.range"
                          >
                            <span class="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/50 hover:border-amber-300 rounded text-[9px] font-mono font-black underline decoration-dotted transition-colors cursor-pointer shadow-4xs">
                              {{ lr.label }}
                            </span>
                          </SnippetPopover>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span class="px-2 py-0.5 bg-slate-100 border border-slate-200/35 text-slate-600 text-[8px] font-black uppercase tracking-wider rounded select-none">
                        {{ file.reference_count }} ref{{ file.reference_count === 1 ? '' : 's' }}
                      </span>
                      <router-link 
                        :to="`/views/files/${file.name}`" 
                        @click="closeModal"
                        class="text-[9.5px] font-bold text-indigo-600 hover:text-white bg-indigo-50/60 hover:bg-indigo-600 border border-indigo-100/50 rounded-lg px-2.5 py-1.5 transition-all text-center select-none active:scale-95 shadow-3xs flex items-center gap-1"
                      >
                        <span>Inspect</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </router-link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. TAB: CLASS LINKS -->
            <div v-show="currentTab === 'classes'" class="flex flex-col gap-4">
              <div v-if="javaClassConnections.length === 0" class="text-center py-10 text-slate-400 italic text-[10px]">
                No class-level connections found between these components.
              </div>

              <div v-else class="flex flex-col gap-0">
                <!-- Table Header -->
                <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-t-2xl text-[8px] font-black text-slate-400 uppercase tracking-wider select-none">
                  <span class="text-left">Source Class</span>
                  <span class="text-center">Refs</span>
                  <span class="text-left">Target Class</span>
                </div>
                <!-- Table Rows -->
                <div class="flex flex-col border-x border-b border-slate-200/80 rounded-b-2xl bg-white divide-y divide-slate-50 overflow-hidden shadow-3xs">
                  <div 
                    v-for="(clsConn, idx) in javaClassConnections" 
                    :key="idx"
                    class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 hover:bg-slate-50/40 transition-all"
                  >
                    <!-- Source Class -->
                    <div class="min-w-0 text-left">
                      <router-link
                        v-if="clsConn.source_file"
                        :to="`/views/files/${clsConn.source_file}`"
                        @click="closeModal"
                        class="text-[10.5px] font-bold text-slate-800 hover:text-indigo-650 hover:underline font-mono truncate block leading-tight"
                        :title="clsConn.source_class"
                      >
                        {{ splitClassName(clsConn.source_class).className }}
                      </router-link>
                      <span v-else class="text-[10.5px] font-bold text-slate-800 font-mono truncate block leading-tight" :title="clsConn.source_class">
                        {{ splitClassName(clsConn.source_class).className }}
                      </span>
                      <span class="text-[8.5px] text-slate-400 font-mono truncate block mt-0.5" :title="clsConn.source_class">
                        {{ splitClassName(clsConn.source_class).packageName }}
                      </span>
                    </div>

                    <!-- Ref Count -->
                    <div class="flex items-center justify-center shrink-0 select-none">
                      <span class="text-[9px] font-black text-slate-600 font-mono bg-slate-100 border border-slate-200/40 rounded-md px-2 py-0.5 flex items-center gap-1">
                        {{ clsConn.reference_count }}
                        <span class="text-slate-400">→</span>
                      </span>
                    </div>

                    <!-- Target Class -->
                    <div class="min-w-0 text-left">
                      <router-link
                        v-if="clsConn.target_file"
                        :to="`/views/files/${clsConn.target_file}`"
                        @click="closeModal"
                        class="text-[10.5px] font-bold text-slate-800 hover:text-sky-655 hover:underline font-mono truncate block leading-tight"
                        :title="clsConn.target_class"
                      >
                        {{ splitClassName(clsConn.target_class).className }}
                      </router-link>
                      <span v-else class="text-[10.5px] font-bold text-slate-800 font-mono truncate block leading-tight" :title="clsConn.target_class">
                        {{ splitClassName(clsConn.target_class).className }}
                      </span>
                      <span class="text-[8.5px] text-slate-400 font-mono truncate block mt-0.5" :title="clsConn.target_class">
                        {{ splitClassName(clsConn.target_class).packageName }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. TAB: GIT CO-COMMITS -->
            <div v-show="currentTab === 'git'" class="flex flex-col gap-4">
              <div v-if="!gitEnabled" class="text-center py-10 text-slate-400 italic text-[10px]">
                Git coupling statistics are not available for this database.
              </div>

              <div v-else class="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col gap-4 text-left">
                <h4 class="text-[10px] font-black text-slate-455 uppercase tracking-widest border-b border-slate-100 pb-2 select-none">
                  Git Commit Co-changes Breakdown
                </h4>
                
                <div class="p-1">
                  <GitSharedCommitSummary :from="fromComponent" :to="toComponent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect, onBeforeUnmount } from "vue"
import { useDataStore } from "~/stores/data"
import SnippetPopover from "~/components/SnippetPopover.vue"
import GitSharedCommitSummary from "~/components/components/coupling/git/GitSharedCommitSummary.vue"

const props = defineProps<{
  isOpen: boolean
  fromComponent: string
  toComponent: string
}>()

function splitFilePath(path: string) {
  if (!path) return { filename: '', dir: '' }
  const parts = path.split('/')
  const filename = parts.pop() || path
  const dir = parts.join('/')
  return { filename, dir }
}

function splitClassName(fullName: string) {
  if (!fullName) return { className: '', packageName: '' }
  const parts = fullName.split('.')
  const className = parts.pop() || fullName
  const packageName = parts.join('.')
  return { className, packageName }
}

function getDifferentiatedNames(fromName: string, toName: string) {
  if (!fromName || !toName) return {
    fromShort: fromName || '',
    fromPrefix: '',
    toShort: toName || '',
    toPrefix: ''
  }
  
  const partsA = fromName.split('.')
  const partsB = toName.split('.')
  
  let matchingCount = 0
  while (
    matchingCount < partsA.length && 
    matchingCount < partsB.length && 
    partsA[partsA.length - 1 - matchingCount] === partsB[partsB.length - 1 - matchingCount]
  ) {
    matchingCount++
  }
  
  // Keep at least 2 segments for better readability (e.g. order.domain vs currency.util)
  const segmentsToKeep = Math.max(2, matchingCount + 1)
  
  const fromShortParts = partsA.slice(-segmentsToKeep)
  const fromPrefixParts = partsA.slice(0, partsA.length - segmentsToKeep)
  const fromShort = fromShortParts.join('.')
  const fromPrefix = fromPrefixParts.length > 0 ? fromPrefixParts.join('.') + '.' : ''
  
  const toShortParts = partsB.slice(-segmentsToKeep)
  const toPrefixParts = partsB.slice(0, partsB.length - segmentsToKeep)
  const toShort = toShortParts.join('.')
  const toPrefix = toPrefixParts.length > 0 ? toPrefixParts.join('.') + '.' : ''
  
  return { fromShort, fromPrefix, toShort, toPrefix }
}

const diffNames = computed(() => {
  return getDifferentiatedNames(props.fromComponent, props.toComponent)
})

const emit = defineEmits(["close", "update:fromComponent", "update:toComponent", "update:from-component", "update:to-component"])

const store = useDataStore()

const currentTab = ref("files")

// Close modal handler
function closeModal() {
  emit("close")
}

// Swaps the analyzed direction
function swapDirection() {
  const from = props.fromComponent
  const to = props.toComponent
  emit("update:fromComponent", to)
  emit("update:toComponent", from)
  emit("update:from-component", to)
  emit("update:to-component", from)
}

// Git enabled check
const gitEnabled = computed(() => store.hasView("git_component_shared_commits"))

// 1. Files & Reference Line Numbers list query
const filesList = ref<{ name: string; reference_count: number; lineRanges: { label: string; range: string }[] }[]>([])
watchEffect(async () => {
  if (!props.isOpen || !props.fromComponent || !props.toComponent) {
    filesList.value = []
    return
  }
  
  try {
    const files = await store.query<{ file: string; reference_count: number }>(`
      SELECT file, reference_count
      FROM component_connections_direct
      WHERE "from" = '${props.fromComponent.replace(/'/g, "''")}'
        AND "to" = '${props.toComponent.replace(/'/g, "''")}'
      ORDER BY reference_count DESC
    `)

    const results = []
    for (const f of files) {
      let rawLines: number[] = []
      try {
        const snippets = await store.query<{ begin_position: string }>(`
          SELECT begin_position
          FROM snippets
          WHERE file = '${f.file.replace(/'/g, "''")}'
            AND snippet_type = '${store.statName('modularity__component__imports')}'
            AND content = '${props.toComponent.replace(/'/g, "''")}'
        `)
        
        rawLines = snippets
          .map(s => {
            if (!s.begin_position) return null
            const parts = s.begin_position.split(":")
            if (parts.length === 0) return null
            const lineNum = parseInt(parts[0])
            if (isNaN(lineNum)) return null
            return lineNum
          })
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b)
      } catch (e) {
        console.warn("Failed to query snippets in CouplingDetailsModal for file:", f.file, e)
      }

      // Collapse consecutive line numbers into ranges
      const lineRanges: { label: string; range: string }[] = []
      let i = 0
      while (i < rawLines.length) {
        const start = rawLines[i]
        let end = start
        while (i + 1 < rawLines.length && rawLines[i + 1] === end + 1) {
          i++
          end = rawLines[i]
        }
        if (start === end) {
          lineRanges.push({ label: String(start), range: `${start}-${start}` })
        } else {
          lineRanges.push({ label: `${start}-${end}`, range: `${start}-${end}` })
        }
        i++
      }

      results.push({
        name: f.file,
        reference_count: f.reference_count,
        lineRanges
      })
    }
    filesList.value = results
  } catch (e) {
    console.error("Failed to query files list in CouplingDetailsModal:", e)
    filesList.value = []
  }
})

const totalReferences = computed(() => {
  return filesList.value.reduce((sum, f) => sum + f.reference_count, 0)
})

// 2. Class Connections query
const javaClassConnections = ref<{
  source_class: string
  source_file: string
  target_class: string
  target_file: string
  reference_count: number
}[]>([])
watchEffect(async () => {
  if (!props.isOpen || !props.fromComponent || !props.toComponent) {
    javaClassConnections.value = []
    return
  }
  if (!store.hasView("java_class_connections_direct")) {
    javaClassConnections.value = []
    return
  }

  try {
    javaClassConnections.value = await store.query<{
      source_class: string
      source_file: string
      target_class: string
      target_file: string
      reference_count: number
    }>(`
      SELECT 
        jc.\`from\` as source_class, 
        f1.name as source_file,
        jc.\`to\` as target_class, 
        f2.name as target_file,
        jc.reference_count
      FROM java_class_connections_direct jc
      JOIN files f1 ON jc.\`from\` = f1.java_full_class
      JOIN files f2 ON jc.\`to\` = f2.java_full_class
      WHERE f1.component = '${props.fromComponent}' 
        AND f2.component = '${props.toComponent}'
      ORDER BY jc.reference_count DESC
    `)
  } catch {
    javaClassConnections.value = []
  }
})

// 3. Git shared commits statistic
const gitSharedCommits = ref(0)
watchEffect(async () => {
  if (!props.isOpen || !props.fromComponent || !props.toComponent) {
    gitSharedCommits.value = 0
    return
  }
  if (!gitEnabled.value) {
    gitSharedCommits.value = 0
    return
  }
  
  try {
    const results = await store.query<{ shared_commits: number }>(`
      SELECT shared_commits
      FROM git_component_shared_commits
      WHERE "pair_1" = '${props.fromComponent}'
        AND "pair_2" = '${props.toComponent}'
    `)
    gitSharedCommits.value = results.length > 0 ? results[0].shared_commits : 0
  } catch {
    gitSharedCommits.value = 0
  }
})

// Active tabs configuration
const activeTabs = computed(() => {
  const tabs = [
    { id: "files", label: "Referencing Files", icon: "📄", count: filesList.value.length }
  ]
  if (javaClassConnections.value.length > 0) {
    tabs.push({ id: "classes", label: "Class Links", icon: "☕", count: javaClassConnections.value.length })
  }
  if (gitEnabled.value && gitSharedCommits.value > 0) {
    tabs.push({ id: "git", label: "Git Co-changes", icon: "🌿", count: gitSharedCommits.value })
  }
  return tabs
})

// Escape key listener to close modal
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeModal()
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      currentTab.value = "files"
      window.addEventListener("keydown", handleKeyDown)
    } else {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown)
})

watch(
  () => [props.isOpen, props.fromComponent, props.toComponent],
  (newVal) => {
    console.log("[CouplingDetailsModal] state updated (isOpen, from, to):", newVal)
  }
)
</script>

<style scoped>
.scroll-container::-webkit-scrollbar {
  width: 5px;
  height: 5px;
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
