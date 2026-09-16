<template>
  <div class="w-full flex flex-col lg:flex-row gap-6 h-[80vh] min-h-[600px] overflow-hidden">
    
    <!-- LEFT PANEL: Group Tree Explorer -->
    <div class="w-full lg:w-80 shrink-0 flex flex-col bg-white border border-slate-100 rounded-3xl p-4 shadow-3xs overflow-hidden h-full">
      <div class="mb-4">
        <h3 class="text-xs font-black text-slate-800 tracking-wider uppercase mb-2 text-left">
          Group Explorer
        </h3>
        
        <!-- Search Input -->
        <div class="relative flex items-center">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search files..."
            class="w-full bg-slate-50 border border-slate-150 focus:border-slate-350 focus:outline-none focus:ring-1 focus:ring-slate-350 text-[11px] font-semibold pl-8 pr-7 py-2 rounded-xl text-slate-700 placeholder-slate-400 transition-all shadow-3xs"
          />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
          </svg>
          <button 
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer px-1"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Tree / Directory List -->
      <div class="flex-grow overflow-y-auto pr-1 flex flex-col gap-0.5 scrollbar-thin">
        
        <!-- Case A: Tree Explorer (Search is empty) -->
        <template v-if="!searchQuery.trim()">
          <div 
            v-for="node in flatTree" 
            :key="node.id"
            class="w-full"
          >
            <!-- Folder Node (Intermediate or Component) -->
            <button
              v-if="!node.isLeaf"
              @click="toggleFolderOrSelectComponent(node)"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-[11.5px] font-semibold"
              :style="{ paddingLeft: `${node.depth * 14 + 10}px` }"
              :class="[
                node.isComponent && selectedComponent === node.fullName
                  ? 'bg-slate-100 border-slate-200 text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              ]"
            >
              <span class="text-xs text-slate-450 leading-none select-none shrink-0 w-3 text-center">
                {{ isFolderExpanded(node.id) ? '▼' : '►' }}
              </span>
              <span class="text-[12px] shrink-0 leading-none">
                {{ node.isComponent ? '📦' : '📂' }}
              </span>
              <span class="truncate font-mono" :class="node.isComponent ? 'font-bold' : ''">{{ node.name }}</span>
            </button>

            <!-- File Leaf Node -->
            <button
              v-else
              @click="selectFileLeaf(node)"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all border break-all text-[11px] font-semibold"
              :style="{ paddingLeft: `${node.depth * 14 + 22}px` }"
              :class="[
                selectedFile?.name === node.fullName
                  ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-3xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              ]"
            >
              <span class="text-[12px] shrink-0 leading-none">📄</span>
              <span class="truncate font-mono">{{ node.name }}</span>
            </button>
          </div>

          <div v-if="flatTree.length === 0" class="text-center py-12 text-xs text-slate-400 italic">
            This group has no files
          </div>
        </template>

        <!-- Case B: Search List (Search is active) -->
        <template v-else>
          <button
            v-for="file in filteredLeaves"
            :key="file.name"
            @click="selectSearchFile(file)"
            class="w-full text-left px-3 py-2 rounded-xl text-[11px] font-semibold transition-all border break-all flex flex-col gap-0.5"
            :class="[
              selectedFile?.name === file.name
                ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-3xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            ]"
          >
            <div class="flex items-center gap-1.5">
              <span>📄</span>
              <span class="font-mono">{{ file.displayName }}</span>
            </div>
            <span class="text-[9px] truncate" :class="selectedFile?.name === file.name ? 'text-slate-400' : 'text-slate-400/80'">
              {{ file.name }}
            </span>
          </button>

          <div v-if="filteredLeaves.length === 0" class="text-center py-12 text-xs text-slate-400 italic">
            No matching files found
          </div>
        </template>

      </div>
    </div>

    <!-- RIGHT PANEL: Details & Code Viewer -->
    <div class="flex-grow flex flex-col min-w-0 border border-slate-100 rounded-3xl p-6 bg-white shadow-3xs overflow-y-auto h-full scrollbar-thin">
      <template v-if="selectedFile">
        <!-- File Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4 select-none">
          <div class="min-w-0 text-left">
            <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Selected File</h3>
            <h2 class="text-sm font-bold text-slate-800 tracking-tight truncate font-mono">{{ selectedFile.displayName }}</h2>
          </div>
          <!-- Link to full details -->
          <router-link
            :to="`/views/files/${selectedFile.name}`"
            class="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-800 transition-colors bg-sky-50 border border-sky-100 rounded-xl px-3.5 py-2 whitespace-nowrap shadow-3xs self-start sm:self-center"
          >
            <span>Open Full Details</span>
            <span>↗</span>
          </router-link>
        </div>

        <!-- Metric Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <!-- Lines Card -->
          <div class="bg-violet-50/60 border border-violet-100 rounded-2xl p-4 flex flex-col leading-tight text-left select-none">
            <span class="text-[9px] font-bold text-violet-500 uppercase tracking-wider mb-1">Lines of Code</span>
            <span class="text-lg font-black text-violet-800">{{ formatNum(selectedFile.complexity__lines) }}</span>
          </div>

          <!-- Commits Card -->
          <div class="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex flex-col leading-tight text-left select-none">
            <span class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Total Commits</span>
            <span class="text-lg font-black text-indigo-800">{{ formatNum(selectedFile.git__commits__total) }}</span>
          </div>

          <!-- Max Indentation Card -->
          <div class="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex flex-col leading-tight text-left select-none" v-if="selectedFile.complexity__indentation__max">
            <span class="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Max Indentation</span>
            <span class="text-lg font-black text-emerald-800">{{ selectedFile.complexity__indentation__max }}</span>
          </div>

          <!-- Authors Card -->
          <div class="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 flex flex-col leading-tight text-left select-none">
            <span class="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-1">Authors</span>
            <span class="text-lg font-black text-amber-800">{{ formatNum(selectedFile['git__authors:total'] || selectedFile.git__authors__total || 0) }}</span>
          </div>
        </div>

        <!-- Code Viewer -->
        <div class="flex-grow min-h-0">
          <FilesFileCodeViewer :file-path="selectedFile.name" />
        </div>
      </template>

      <!-- Sub-state: Component Selected, but no file selected yet -->
      <template v-else-if="selectedComponentData">
        <div class="flex-grow flex flex-col text-left">
          <!-- Component Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5 select-none">
            <div class="min-w-0">
              <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Selected Component</h3>
              <h2 class="text-sm font-bold text-slate-800 tracking-tight truncate font-mono">{{ displayComponentName }}</h2>
            </div>
            <!-- Link to full details -->
            <router-link
              :to="`/views/components/${selectedComponent}`"
              class="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors bg-violet-50 border border-violet-100 rounded-xl px-3.5 py-2 whitespace-nowrap shadow-3xs self-start sm:self-center"
            >
              <span>Open Component Details</span>
              <span>↗</span>
            </router-link>
          </div>

          <!-- Component Metric Cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 select-none">
            <!-- Files Card -->
            <div class="bg-violet-50/60 border border-violet-100 rounded-2xl p-4 flex flex-col leading-tight">
              <span class="text-[9px] font-bold text-violet-500 uppercase tracking-wider mb-1">Total Files</span>
              <span class="text-lg font-black text-violet-800">{{ formatNum(selectedComponentData.complexity__files || selectedComponentData.Complexity__files || 0) }}</span>
            </div>

            <!-- Lines Card -->
            <div class="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex flex-col leading-tight">
              <span class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Lines of Code</span>
              <span class="text-lg font-black text-indigo-800">{{ formatNum(selectedComponentData.complexity__lines || selectedComponentData.Complexity__lines || 0) }}</span>
            </div>

            <!-- Health Card -->
            <div class="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex flex-col leading-tight">
              <span class="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Code Health</span>
              <span class="text-lg font-black text-emerald-800">{{ formatVal(selectedComponentData.codesmells__code_health || selectedComponentData.Codesmells__code_health || 0, 1) }} / 10</span>
            </div>

            <!-- Hotspot Score Card -->
            <div class="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 flex flex-col leading-tight">
              <span class="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-1">Hotspot Score</span>
              <span class="text-lg font-black text-amber-800">{{ formatVal(selectedComponentData.codesmells__hotspot_score || selectedComponentData.Codesmells__hotspot_score || 0, 3) }}</span>
            </div>
          </div>

          <!-- Select File prompt -->
          <div class="flex-grow flex flex-col items-center justify-center py-12 border border-dashed border-slate-200 rounded-2xl text-center select-none bg-slate-50/30">
            <div class="text-2xl mb-2">📄</div>
            <h4 class="text-xs font-bold text-slate-700 mb-0.5">Select a File</h4>
            <p class="text-[11px] text-slate-400 max-w-xs leading-normal">Choose a file from the explorer tree on the left to view its metrics and source code.</p>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <template v-else>
        <div class="flex-grow flex flex-col items-center justify-center py-24 text-center select-none bg-slate-50/10 border border-dashed border-slate-200 rounded-3xl">
          <div class="text-3xl mb-4">📂</div>
          <h3 class="text-sm font-bold text-slate-700 mb-1">Select a Node</h3>
          <p class="text-xs text-slate-400 max-w-xs leading-normal">
            Choose a folder, component, or file from the group explorer tree to inspect details.
          </p>
        </div>
      </template>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useGroupsStore } from "~/stores/groups"
import { useDataStore } from "~/stores/data"

// ═══════════════════════════════════════════════════════
// DATA & STATE
// ═══════════════════════════════════════════════════════

const route = useRoute()
const groupsStore = useGroupsStore()
const dataStore = useDataStore()

const id = computed(() => route.params.id as string)
const group = computed(() => groupsStore.getGroupById(id.value))

const searchQuery = ref('')

const selectedComponent = ref<string | null>(null)
const selectedFile = ref<any | null>(null)

// ═══════════════════════════════════════════════════════
// COMPONENT DATABASE INTEGRATION
// ═══════════════════════════════════════════════════════

// Query all files for this group's members
// dataStore.query is async, so this cannot be a computed — populate a ref instead.
const allGroupFiles = ref<Record<string, any>[]>([])
watch([() => dataStore.hasData, group], async ([hasData]) => {
  if (!group.value || !hasData) {
    allGroupFiles.value = []
    return
  }

  if (group.value.type === 'component') {
    if (group.value.members.length === 0) {
      allGroupFiles.value = []
      return
    }
    const escapedNames = group.value.members.map(m => `'${m.replace(/'/g, "''")}'`).join(',')
    const list = await dataStore.query<Record<string, any>>(`
      SELECT *
      FROM files
      WHERE component IN (${escapedNames})
      ORDER BY name
    `)
    allGroupFiles.value = list.map(f => ({
      ...f,
      complexity__lines: Number(f.complexity__lines ?? f.complexity__Lines ?? f.Complexity__lines ?? 0),
      git__commits__total: Number(f.git__commits__total ?? f.git__commits_total ?? f.Git__commits__total ?? 0),
      displayName: f.name.split('/').pop() || f.name
    }))
  } else {
    // File group
    if (group.value.members.length === 0) {
      allGroupFiles.value = []
      return
    }
    const escapedNames = group.value.members.map(m => `'${m.replace(/'/g, "''")}'`).join(',')
    const list = await dataStore.query<Record<string, any>>(`
      SELECT *
      FROM files
      WHERE name IN (${escapedNames})
      ORDER BY name
    `)
    allGroupFiles.value = list.map(f => ({
      ...f,
      complexity__lines: Number(f.complexity__lines ?? f.complexity__Lines ?? f.Complexity__lines ?? 0),
      git__commits__total: Number(f.git__commits__total ?? f.git__commits_total ?? f.Git__commits__total ?? 0),
      displayName: f.name.split('/').pop() || f.name
    }))
  }
}, { immediate: true })

// ═══════════════════════════════════════════════════════
// COMPACT TREE BUILDING (VS CODE STYLE SINGLE-CHILD MERGE)
// ═══════════════════════════════════════════════════════

interface TreeNode {
  name: string
  fullName: string
  isLeaf: boolean
  isComponent: boolean
  children: TreeNode[]
  fileData?: any
}

// Builds the tree
const tree = computed(() => {
  if (!group.value) return []
  
  let rawTree: TreeNode[] = []
  if (group.value.type === 'component') {
    rawTree = buildComponentGroupTree(group.value.members, allGroupFiles.value)
  } else {
    rawTree = buildFileGroupTree(allGroupFiles.value)
  }
  
  // Compact single-child directory nodes
  return compactTree(rawTree)
})

// Component Group Tree builder
function buildComponentGroupTree(components: string[], files: any[]): TreeNode[] {
  const root: TreeNode[] = []
  
  // Group files by component
  const filesByComp = new Map<string, any[]>()
  for (const file of files) {
    if (!file.component) continue
    if (!filesByComp.has(file.component)) {
      filesByComp.set(file.component, [])
    }
    filesByComp.get(file.component)!.push(file)
  }
  
  for (const compName of components) {
    const segments = compName.includes('/') ? compName.split('/') : compName.split('.')
    let currentLevel = root
    let accumulatedPath = ''
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (!segment) continue
      
      accumulatedPath = accumulatedPath 
        ? (compName.includes('/') ? `${accumulatedPath}/${segment}` : `${accumulatedPath}.${segment}`)
        : segment
        
      const isLast = i === segments.length - 1
      
      let existingNode = currentLevel.find(n => n.name === segment)
      if (!existingNode) {
        existingNode = {
          name: segment,
          fullName: isLast ? compName : accumulatedPath,
          isLeaf: false,
          isComponent: isLast,
          children: []
        }
        currentLevel.push(existingNode)
      }
      
      if (isLast) {
        // Add files as children directly inside the component folder
        const compFiles = filesByComp.get(compName) || []
        existingNode.children = compFiles.map(file => ({
          name: file.displayName,
          fullName: file.name,
          isLeaf: true,
          isComponent: false,
          children: [],
          fileData: file
        }))
        existingNode.children.sort((a, b) => a.name.localeCompare(b.name))
      }
      
      currentLevel.sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1
        return a.name.localeCompare(b.name)
      })
      
      currentLevel = existingNode.children
    }
  }
  
  return root
}

// File Group Tree builder
function buildFileGroupTree(files: any[]): TreeNode[] {
  const root: TreeNode[] = []
  
  for (const file of files) {
    const segments = file.name.split('/')
    let currentLevel = root
    let accumulatedPath = ''
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (!segment) continue
      
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment
      const isLast = i === segments.length - 1
      
      let existingNode = currentLevel.find(n => n.name === segment)
      if (!existingNode) {
        existingNode = {
          name: segment,
          fullName: isLast ? file.name : accumulatedPath,
          isLeaf: isLast,
          isComponent: false,
          children: [],
          fileData: isLast ? file : undefined
        }
        currentLevel.push(existingNode)
      }
      
      currentLevel.sort((a, b) => {
        if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1
        return a.name.localeCompare(b.name)
      })
      
      currentLevel = existingNode.children
    }
  }
  
  return root
}

// Recursively merges single-child directories
function compactTree(nodes: TreeNode[]): TreeNode[] {
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      node.children = compactTree(node.children)
    }
    
    // If folder has exactly 1 child, and that child is also a folder (or component), merge them
    if (node.children && node.children.length === 1) {
      const child = node.children[0]
      if (!child.isLeaf) {
        const separator = node.fullName.includes('/') || child.name.includes('/') ? '/' : '.'
        node.name = `${node.name}${separator}${child.name}`
        node.fullName = child.fullName
        node.isComponent = child.isComponent
        node.children = child.children
        node.fileData = child.fileData
      }
    }
  }
  return nodes
}

// ═══════════════════════════════════════════════════════
// TREE TRAVERSAL & VISIBILITY
// ═══════════════════════════════════════════════════════

const expandedNodes = ref<Set<string>>(new Set())

// Auto-expand all folders on load
const autoExpandAll = (nodes: TreeNode[]) => {
  for (const node of nodes) {
    if (!node.isLeaf) {
      expandedNodes.value.add(node.fullName)
      autoExpandAll(node.children)
    }
  }
}

watch(tree, (newTree) => {
  if (newTree.length > 0 && expandedNodes.value.size === 0) {
    autoExpandAll(newTree)
  }
}, { immediate: true })

const toggleFolderOrSelectComponent = (node: any) => {
  // If component, select it for metrics overview in details panel
  if (node.isComponent) {
    selectedComponent.value = node.fullName
    selectedFile.value = null
  }
  
  // Toggle expansion
  if (expandedNodes.value.has(node.fullName)) {
    expandedNodes.value.delete(node.fullName)
  } else {
    expandedNodes.value.add(node.fullName)
  }
}

const isFolderExpanded = (nodeId: string) => {
  return expandedNodes.value.has(nodeId)
}

const selectFileLeaf = (node: any) => {
  selectedComponent.value = null
  selectedFile.value = node.fileData
}

const flatTree = computed(() => {
  const result: {
    id: string
    name: string
    fullName: string
    isLeaf: boolean
    isComponent: boolean
    depth: number
    fileData?: any
  }[] = []
  
  function traverse(nodes: TreeNode[], depth = 0) {
    for (const node of nodes) {
      result.push({
        id: node.fullName,
        name: node.name,
        fullName: node.fullName,
        isLeaf: node.isLeaf,
        isComponent: node.isComponent,
        depth,
        fileData: node.fileData
      })
      
      if (!node.isLeaf && expandedNodes.value.has(node.fullName)) {
        traverse(node.children, depth + 1)
      }
    }
  }
  
  traverse(tree.value)
  return result
})

// ═══════════════════════════════════════════════════════
// RIGHT VIEW METADATA
// ═══════════════════════════════════════════════════════

const displayComponentName = computed(() => {
  if (!selectedComponent.value) return ''
  return dataStore.getComponentName(selectedComponent.value)
})

const selectedComponentData = computed(() => {
  if (!selectedComponent.value) return null
  return dataStore.allComponentsIndex.get(selectedComponent.value) || null
})

// ═══════════════════════════════════════════════════════
// SEARCH LIST SELECTIONS
// ═══════════════════════════════════════════════════════

const filteredLeaves = computed(() => {
  if (!searchQuery.value.trim()) return []
  const q = searchQuery.value.trim().toLowerCase()
  return allGroupFiles.value.filter(file => 
    file.name.toLowerCase().includes(q) ||
    file.displayName.toLowerCase().includes(q)
  )
})

const selectSearchFile = (file: any) => {
  selectedComponent.value = null
  selectedFile.value = file
}

// ═══════════════════════════════════════════════════════
// FORMATTING & UI HELPERS
// ═══════════════════════════════════════════════════════

const formatNum = (val: number): string => {
  if (val === undefined || isNaN(val) || val === null) return '—'
  return val.toLocaleString()
}

const formatVal = (val: number, precision: number = 0): string => {
  if (val === undefined || isNaN(val) || val === null) return '—'
  return val.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
}
</script>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
