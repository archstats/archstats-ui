<template>
  <div class="w-full flex flex-col md:flex-row gap-6 h-[80vh] min-h-[500px]">
    <!-- Left Panel: File Explorer -->
    <div class="w-full md:w-80 shrink-0 flex flex-col bg-white border border-slate-100 rounded-3xl p-4 shadow-3xs overflow-hidden h-full">
      <div class="mb-4">
        <h3 class="text-xs font-bold text-slate-800 tracking-tight uppercase tracking-wider mb-2 text-left">File Explorer</h3>
        <!-- Search Input -->
        <div class="relative flex items-center">
          <input
            v-model="fileSearchQuery"
            type="text"
            placeholder="Filter files..."
            class="w-full bg-slate-50 border border-slate-150 focus:border-slate-350 focus:outline-none focus:ring-1 focus:ring-slate-350 text-[11px] font-semibold pl-8 pr-7 py-2 rounded-xl text-slate-700 placeholder-slate-400 transition-all shadow-3xs"
          />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
          </svg>
          <button 
            v-if="fileSearchQuery"
            @click="fileSearchQuery = ''"
            class="absolute right-2 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer px-1"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- File List -->
      <div class="flex-grow overflow-y-auto pr-1 flex flex-col gap-1">
        <button
          v-for="file in filteredFiles"
          :key="file.name"
          @click="selectFile(file)"
          class="w-full text-left px-3 py-2 rounded-xl text-[11px] font-semibold transition-all border break-all flex flex-col gap-0.5"
          :class="[
            activeFile?.name === file.name
              ? 'bg-slate-900 border-slate-900 text-white font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          ]"
        >
          <span class="font-mono text-left">{{ getShortName(file.name) }}</span>
          <span class="text-[9px] truncate text-left" :class="activeFile?.name === file.name ? 'text-slate-400' : 'text-slate-400'">{{ file.name }}</span>
        </button>

        <div v-if="filteredFiles.length === 0" class="text-center py-8 text-xs text-slate-400 italic">
          No files match filter
        </div>
      </div>
    </div>

    <!-- Right Panel: File Details and Code Viewer -->
    <div class="flex-grow flex flex-col min-w-0 border border-slate-100 rounded-3xl p-6 bg-white shadow-3xs overflow-y-auto h-full">
      <template v-if="activeFile">
        <!-- File Header details -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4 select-none">
          <div class="min-w-0 text-left">
            <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Selected File</h3>
            <h2 class="text-sm font-bold text-slate-800 tracking-tight truncate font-mono">{{ getShortName(activeFile.name) }}</h2>
          </div>
          <!-- Link to full details -->
          <NuxtLink
            :to="`/views/files/${activeFile.name}`"
            class="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-800 transition-colors bg-sky-50 border border-sky-100 rounded-xl px-3.5 py-2 whitespace-nowrap shadow-3xs self-start sm:self-center"
          >
            <span>Open Full Details</span>
            <span>↗</span>
          </NuxtLink>
        </div>

        <!-- Metric Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <!-- Lines Card -->
          <div class="bg-violet-50/60 border border-violet-100 rounded-2xl p-4 flex flex-col leading-tight text-left">
            <span class="text-[9px] font-bold text-violet-500 uppercase tracking-wider mb-1">Lines of Code</span>
            <span class="text-lg font-black text-violet-800">{{ activeFile.complexity__lines || activeFile.complexity__Lines || 'N/A' }}</span>
          </div>

          <!-- Commits Card -->
          <div class="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex flex-col leading-tight text-left">
            <span class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Total Commits</span>
            <span class="text-lg font-black text-indigo-800">{{ activeFile.git__commits__total || activeFile.git__commits_total || 'N/A' }}</span>
          </div>

          <!-- Complexity Card (if available) -->
          <div class="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex flex-col leading-tight text-left" v-if="activeFile.complexity__indentation__max">
            <span class="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Max Indentation</span>
            <span class="text-lg font-black text-emerald-800">{{ activeFile.complexity__indentation__max || 'N/A' }}</span>
          </div>

          <!-- Authors Card -->
          <div class="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 flex flex-col leading-tight text-left">
            <span class="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-1">Authors</span>
            <span class="text-lg font-black text-amber-800">{{ activeFile['git__authors:total'] || activeFile.git__authors__total || 'N/A' }}</span>
          </div>
        </div>

        <!-- Code Viewer -->
        <div class="flex-grow min-h-0">
          <FilesFileCodeViewer :file-path="activeFile.name" />
        </div>
      </template>

      <!-- Empty State -->
      <template v-else>
        <div class="flex-grow flex flex-col items-center justify-center py-20 text-center select-none">
          <div class="text-3xl mb-4">📂</div>
          <h3 class="text-sm font-bold text-slate-700 mb-1">Select a File</h3>
          <p class="text-xs text-slate-400 max-w-xs leading-normal">Choose a source file from the explorer sidebar to view its code metrics and contents.</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)
const fileSearchQuery = ref('')
const activeFile = ref<any | null>(null)

const files = computed(() => {
  if (!store.hasData) return []
  
  const filesList = store.query(`
    SELECT *
    FROM files
    WHERE component = '${nameInRoute.value}'
  `) as {
    name: string,
    [key: string]: any
  }[]

  return filesList
})

const filteredFiles = computed(() => {
  if (!fileSearchQuery.value.trim()) return files.value
  const q = fileSearchQuery.value.trim().toLowerCase()
  return files.value.filter(f => f.name.toLowerCase().includes(q))
})

// Auto-select the first file when files load
watch(files, (newFiles) => {
  if (newFiles.length > 0 && !activeFile.value) {
    activeFile.value = newFiles[0]
  }
}, { immediate: true })

function selectFile(file: any) {
  activeFile.value = file
}

function getShortName(path: string) {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}
</script>
