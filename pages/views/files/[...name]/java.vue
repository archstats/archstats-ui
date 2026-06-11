<template>
  <div class="flex flex-col gap-6">
    <!-- Clean Horizontal Stats Strip -->
    <div v-if="javaMetrics" class="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold text-slate-500 border-b border-slate-100 pb-4 select-none">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 font-mono font-medium">Classes:</span>
        <span class="text-slate-800 font-black font-mono text-sm">{{ javaMetrics.classes }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 font-mono font-medium">Methods:</span>
        <span class="text-slate-800 font-black font-mono text-sm">{{ javaMetrics.methods }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 font-mono font-medium">Fields:</span>
        <span class="text-slate-800 font-black font-mono text-sm">{{ javaMetrics.fields }}</span>
      </div>
      <div class="flex items-center gap-1.5" v-if="javaMetrics.rest.total > 0">
        <span class="text-slate-400 font-mono font-medium">REST Endpoints:</span>
        <span class="text-indigo-650 font-black font-mono text-sm">{{ javaMetrics.rest.total }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 font-mono font-medium">Outgoing Dependencies:</span>
        <span class="text-slate-800 font-black font-mono text-sm">{{ resolvedOutgoingReferences.length }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 font-mono font-medium">Incoming References:</span>
        <span class="text-slate-800 font-black font-mono text-sm">{{ resolvedIncomingReferences.length }}</span>
      </div>
      <div 
        v-if="fileViolations.length > 0"
        class="flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg border border-rose-100/60 font-mono text-[9px]"
      >
        <span>Violations:</span>
        <strong>{{ fileViolations.length }}</strong>
      </div>
      <div class="ml-auto flex flex-wrap gap-1">
        <span
          v-for="role in javaMetrics.roles"
          :key="role"
          class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border border-slate-200 bg-slate-100 text-slate-500 font-mono"
        >
          {{ role }}
        </span>
      </div>
    </div>

    <!-- Main Grid Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- LEFT COLUMN: Wiring & Dependencies (Span 2) -->
      <div class="lg:col-span-2 flex flex-col gap-6">
        
        <!-- File Neighborhood Dependency Graph Card -->
        <div class="bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-3xs flex flex-col gap-4 relative overflow-hidden h-[360px]">
          <div class="flex items-center justify-between border-b border-slate-900 pb-3 shrink-0 z-10 select-none">
            <div>
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Interactive Neighborhood Map</h4>
              <p class="text-[8px] text-slate-500 mt-0.5">Incoming References (Left) &rarr; Active Class (Center) &rarr; Outgoing Dependencies (Right)</p>
            </div>
            
            <button 
              @click="resetNeighborhoodZoom"
              class="text-[9px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
            >
              Reset View
            </button>
          </div>

          <!-- Legend Overlay inside Neighborhood Graph -->
          <div class="absolute bottom-6 left-6 flex flex-wrap gap-x-4 gap-y-1.5 text-[8px] font-bold z-10 bg-slate-900/60 backdrop-blur-xs px-3 py-2 rounded-xl border border-slate-850 select-none">
            <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-indigo-500"></span><span class="text-slate-400">Controller</span></div>
            <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-slate-400">Service</span></div>
            <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-slate-400">Repository</span></div>
            <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span><span class="text-slate-400">Entity</span></div>
            <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-slate-500"></span><span class="text-slate-400">Other</span></div>
            <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-white ring-2 ring-indigo-500"></span><span class="text-indigo-400 font-extrabold">Active File</span></div>
          </div>

          <div class="grow relative min-h-[200px]">
            <svg ref="neighborhoodSvgRef" class="w-full h-full bg-slate-950 rounded-2xl"></svg>
          </div>
        </div>
        
        <!-- Outgoing Dependencies Dashboard -->
        <div class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-3 select-none">
            <span class="text-xs">📤</span>
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Outgoing Dependencies ({{ resolvedOutgoingReferences.length }})</h4>
          </div>
          
          <div class="overflow-x-auto max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
            <table class="w-full text-[10px] text-left text-slate-700">
              <thead>
                <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black select-none">
                  <th class="py-2 pr-3">Imported Class</th>
                  <th class="py-2 px-3">Component / Module</th>
                  <th class="py-2 px-3 text-center">Type</th>
                  <th class="py-2 pl-3 text-right">Source</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-if="resolvedOutgoingReferences.length === 0">
                  <td colspan="4" class="text-center py-6 text-slate-400 italic select-none">No resolved internal imports declared in this file.</td>
                </tr>
                <tr 
                  v-else 
                  v-for="ref in resolvedOutgoingReferences" 
                  :key="ref.file" 
                  class="hover:bg-slate-50/50 transition-colors"
                >
                  <td class="py-2 font-mono font-bold text-slate-900">{{ ref.className }}</td>
                  <td class="py-2 px-3 font-semibold text-slate-500 truncate max-w-[160px]">{{ store.getComponentName(ref.component) }}</td>
                  <td class="py-2 px-3 text-center">
                    <span 
                      class="px-1.5 py-0.2 rounded font-mono text-[8px] font-bold uppercase select-none"
                      :class="ref.isInternal ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' : 'bg-purple-50 text-purple-700 border border-purple-150'"
                    >
                      {{ ref.isInternal ? 'Internal' : 'Cross-Module' }}
                    </span>
                  </td>
                  <td class="py-2 pl-3 text-right font-mono select-none">
                    <router-link :to="`/views/files/${ref.file}`" class="text-[9px] text-indigo-650 font-bold hover:underline">Inspect</router-link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Incoming References (Who imports this class) -->
        <div class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-3 select-none">
            <span class="text-xs">📥</span>
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incoming References ({{ resolvedIncomingReferences.length }})</h4>
          </div>

          <div class="overflow-x-auto max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
            <table class="w-full text-[10px] text-left text-slate-700">
              <thead>
                <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black select-none">
                  <th class="py-2 pr-3">Referencing Class</th>
                  <th class="py-2 px-3">Parent Component</th>
                  <th class="py-2 pl-3 text-right">Source</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-if="resolvedIncomingReferences.length === 0">
                  <td colspan="3" class="text-center py-6 text-slate-400 italic select-none">No files in the codebase import this class.</td>
                </tr>
                <tr 
                  v-else 
                  v-for="ref in resolvedIncomingReferences" 
                  :key="ref.file" 
                  class="hover:bg-slate-50/50 transition-colors"
                >
                  <td class="py-2 font-mono font-bold text-slate-900">{{ ref.className }}</td>
                  <td class="py-2 px-3 font-semibold text-slate-500 truncate max-w-[200px]">{{ store.getComponentName(ref.component) }}</td>
                  <td class="py-2 pl-3 text-right font-mono select-none">
                    <router-link :to="`/views/files/${ref.file}`" class="text-[9px] text-indigo-650 font-bold hover:underline">Inspect</router-link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- RIGHT COLUMN: Audits, Annotations & Guides (Span 1) -->
      <div class="flex flex-col gap-6">
        
        <!-- Architectural Mappings & Structure -->
        <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs flex flex-col gap-3.5">
          <div class="border-b border-slate-100 pb-2 select-none">
            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Structural Flags</h4>
            <p class="text-[8px] text-slate-450 mt-0.5">Key structural observations detected in file</p>
          </div>

          <!-- Clean state -->
          <div 
            v-if="fileViolations.length === 0"
            class="bg-indigo-50/20 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5 select-none"
          >
            <span class="text-indigo-500 text-xs font-bold mt-0.5">✓</span>
            <p class="text-[9.5px] leading-relaxed text-slate-600">
              <strong>Standard Layout:</strong> This file is aligned with common layering practices. No layering overrides or unlinked entities detected.
            </p>
          </div>

          <!-- Findings list -->
          <div v-else class="flex flex-col gap-3">
            <div 
              v-for="v in fileViolations" 
              :key="v.type"
              class="p-3.5 rounded-xl border flex flex-col gap-1 text-[10px] bg-slate-50/50 border-slate-200 text-slate-755"
            >
              <div class="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] text-slate-500 select-none">
                <span>ℹ️</span>
                <span>{{ v.type }}</span>
              </div>
              <p class="text-[9.5px] leading-relaxed mt-0.5 text-slate-600">
                {{ v.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Parsed Annotations & Declarations -->
        <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs flex flex-col gap-3">
          <div class="border-b border-slate-100 pb-2 select-none">
            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Declarations & Annotations</h4>
          </div>

          <div class="w-full overflow-x-auto max-h-[240px] overflow-y-auto pr-1 scrollbar-thin">
            <table class="w-full text-left text-[10px]">
              <thead>
                <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black sticky top-0 bg-white z-10 select-none">
                  <th class="py-1 text-center w-12">Line</th>
                  <th class="py-1 px-2">Type</th>
                  <th class="py-1 pl-2">Identifier</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 font-medium text-slate-700">
                <tr v-if="javaSnippets.length === 0">
                  <td colspan="3" class="text-center py-4 text-slate-400 italic select-none">No annotations parsed in snippets.</td>
                </tr>
                <tr 
                  v-else 
                  v-for="s in javaSnippets" 
                  :key="s.line + '-' + s.snippet_type"
                  class="hover:bg-slate-50/50 transition-colors"
                >
                  <td class="py-2 text-center font-mono text-slate-400 select-none">
                    <SnippetPopover :file="filePath" :lines="s.line">
                      <span class="underline decoration-dotted hover:text-indigo-650 transition-colors font-bold">{{ s.line }}</span>
                    </SnippetPopover>
                  </td>
                  <td class="py-2 px-2 select-none">
                    <span 
                      class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider border"
                      :class="snippetRoleColor(s.snippet_type)"
                    >
                      {{ cleanSnippetType(s.snippet_type) }}
                    </span>
                  </td>
                  <td class="py-2 pl-2 font-mono text-[9px] text-slate-900 truncate max-w-[120px]" :title="s.content">{{ s.content }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- HTTP Routing Breakdown (Conditional) -->
        <div 
          v-if="javaMetrics && javaMetrics.rest.total > 0"
          class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs flex flex-col gap-3"
        >
          <div class="border-b border-slate-100 pb-2 select-none">
            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest">HTTP Verb Breakdown</h4>
          </div>
          <div class="flex flex-col gap-2.5">
            <div class="flex flex-col gap-1" v-if="javaMetrics.rest.get > 0">
              <div class="flex justify-between items-center text-[9px] font-bold">
                <span class="text-slate-550">GET Mappings</span>
                <span class="text-emerald-600 font-mono">{{ javaMetrics.rest.get }}</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full bg-emerald-500" :style="{ width: (javaMetrics.rest.get / javaMetrics.rest.total) * 100 + '%' }"></div>
              </div>
            </div>
            <div class="flex flex-col gap-1" v-if="javaMetrics.rest.post > 0">
              <div class="flex justify-between items-center text-[9px] font-bold">
                <span class="text-slate-550">POST Mappings</span>
                <span class="text-blue-600 font-mono">{{ javaMetrics.rest.post }}</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full bg-blue-500" :style="{ width: (javaMetrics.rest.post / javaMetrics.rest.total) * 100 + '%' }"></div>
              </div>
            </div>
            <div class="flex flex-col gap-1" v-if="javaMetrics.rest.put > 0">
              <div class="flex justify-between items-center text-[9px] font-bold">
                <span class="text-slate-550">PUT Mappings</span>
                <span class="text-amber-600 font-mono">{{ javaMetrics.rest.put }}</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full bg-amber-500" :style="{ width: (javaMetrics.rest.put / javaMetrics.rest.total) * 100 + '%' }"></div>
              </div>
            </div>
            <div class="flex flex-col gap-1" v-if="javaMetrics.rest.delete > 0">
              <div class="flex justify-between items-center text-[9px] font-bold">
                <span class="text-slate-550">DELETE Mappings</span>
                <span class="text-rose-600 font-mono">{{ javaMetrics.rest.delete }}</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full bg-rose-500" :style="{ width: (javaMetrics.rest.delete / javaMetrics.rest.total) * 100 + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import { useRoute, useRouter } from "vue-router"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import { useJavaMetrics } from "~/composables/useJavaMetrics"

const route = useRoute()
const router = useRouter()
const store = useDataStore()
const { getJavaMetricsForFile } = useJavaMetrics()

// Neighborhood graph state
const neighborhoodSvgRef = ref<SVGSVGElement | null>(null)
let neighborhoodSimulation: d3.Simulation<any, any> | null = null
let neighborhoodZoom: any = null

// Resolving filePath from name parameter (supports nested layout routing)
const filePath = computed(() => {
  const parts = route.params.name
  let list = Array.isArray(parts) ? [...parts] : [parts as string]
  const last = list[list.length - 1]
  if (["git", "imports", "java"].includes(last)) {
    list.pop()
  }
  return list.join('/')
})

const escapedPath = computed(() => filePath.value.replace(/'/g, "''"))

const fileBasename = computed(() => {
  const parts = filePath.value.split('/')
  return parts[parts.length - 1] || filePath.value
})

const javaMetrics = computed(() => {
  if (!filePath.value) return null
  return getJavaMetricsForFile(filePath.value)
})

const javaSnippets = computed(() => {
  if (!store.hasData || !filePath.value) return []
  try {
    return store.query<any>(`
      SELECT line, snippet_type, content
      FROM snippets
      WHERE file = '${escapedPath.value}'
        AND snippet_type LIKE 'java__%'
      ORDER BY line ASC
    `)
  } catch {
    return []
  }
})

const classToFileMap = computed(() => {
  if (!store.hasData) return new Map<string, { file: string; component: string; roles: string[] }>()
  const m = new Map<string, { file: string; component: string; roles: string[] }>()
  try {
    const query = `
      SELECT file, component, content AS name, snippet_type
      FROM snippets
      WHERE snippet_type IN ('java__class__declaration', 'java__interface__declaration', 'java__record__declaration', 'java__spring__controller', 'java__spring__service', 'java__spring__repository', 'java__spring__component', 'java__spring__configuration', 'java__jpa__entity')
    `
    const rows = store.query<any>(query)
    rows.forEach(r => {
      let roles: string[] = []
      if (r.snippet_type === "java__spring__controller") roles.push("Controller")
      else if (r.snippet_type === "java__spring__service") roles.push("Service")
      else if (r.snippet_type === "java__spring__repository") roles.push("Repository")
      else if (r.snippet_type === "java__spring__component") roles.push("Component")
      else if (r.snippet_type === "java__spring__configuration") roles.push("Configuration")
      else if (r.snippet_type === "java__jpa__entity") roles.push("Entity")
      else if (r.snippet_type === "java__interface__declaration") roles.push("Interface")
      else if (r.snippet_type === "java__record__declaration") roles.push("Record")

      const existing = m.get(r.name)
      if (existing) {
        roles.forEach(role => {
          if (!existing.roles.includes(role)) existing.roles.push(role)
        })
      } else {
        m.set(r.name, { file: r.file, component: r.component, roles })
      }
    })
  } catch {}
  return m
})

const declaredClasses = computed(() => {
  const list: string[] = []
  classToFileMap.value.forEach((val, key) => {
    if (val.file === filePath.value) {
      list.push(key)
    }
  })
  return list
})

const resolvedOutgoingReferences = computed(() => {
  if (!filePath.value || !store.hasData) return []
  try {
    const imports = store.query<any>(`
      SELECT content FROM snippets 
      WHERE file = '${escapedPath.value}' AND snippet_type = 'java__import__declaration'
    `)
    const list: { className: string; file: string; component: string; roles: string[]; isInternal: boolean }[] = []
    
    imports.forEach(imp => {
      const className = getClassNameFromImport(imp.content)
      const dest = classToFileMap.value.get(className)
      if (dest) {
        const isInternal = dest.component === store.query<any>(`SELECT component FROM files WHERE name = '${escapedPath.value}' LIMIT 1`)[0]?.component
        list.push({
          className,
          file: dest.file,
          component: dest.component,
          roles: dest.roles,
          isInternal
        })
      }
    })
    return list
  } catch {
    return []
  }
})

const resolvedIncomingReferences = computed(() => {
  if (declaredClasses.value.length === 0 || !store.hasData) return []
  const list: { className: string; file: string; component: string; roles: string[] }[] = []
  try {
    declaredClasses.value.forEach(className => {
      const rows = store.query<any>(`
        SELECT file, component FROM snippets
        WHERE snippet_type = 'java__import__declaration'
          AND (content = '${className}' OR content LIKE '%.${className}')
          AND file != '${escapedPath.value}'
      `)
      rows.forEach(r => {
        let refClassName = getBasename(r.file).replace(".java", "")
        classToFileMap.value.forEach((val, key) => {
          if (val.file === r.file) {
            refClassName = key
          }
        })
        
        list.push({
          className: refClassName,
          file: r.file,
          component: r.component || "",
          roles: classToFileMap.value.get(refClassName)?.roles || []
        })
      })
    })
    return list
  } catch {
    return []
  }
})

const fileViolations = computed(() => {
  const list: { type: string; message: string; severity: "violation" | "smell" }[] = []
  if (!javaMetrics.value) return list

  const roles = javaMetrics.value.roles
  const isController = roles.includes("Spring Controller")
  const isService = roles.includes("Spring Service")
  const isRepository = roles.includes("Spring Repository")
  const isEntity = roles.includes("JPA Entity")

  resolvedOutgoingReferences.value.forEach(ref => {
    if (isRepository && (ref.roles.includes("Controller") || ref.roles.includes("Service"))) {
      list.push({
        type: "Reverse Layer Reference",
        message: `Repository imports ${ref.roles.join('/')} '${ref.className}', violating strict architectural layering guidelines.`,
        severity: "violation"
      })
    }
    if (isService && ref.roles.includes("Controller")) {
      list.push({
        type: "Reverse Layer Reference",
        message: `Service imports API Controller '${ref.className}', linking a core component to the boundary layer.`,
        severity: "violation"
      })
    }
  })

  if ((isController || isService) && javaMetrics.value.fields > 4) {
    list.push({
      type: "Multi-Field Singleton",
      message: `Singleton bean declares ${javaMetrics.value.fields} instance fields. Verify if these are immutable dependency bindings.`,
      severity: "smell"
    })
  }

  if (isEntity) {
    let hasRepo = false
    const className = fileBasename.value.replace(".java", "")
    classToFileMap.value.forEach((val, key) => {
      if (val.roles.includes("Repository")) {
        if (key.startsWith(className) || key.toLowerCase().includes(className.toLowerCase())) {
          hasRepo = true
        }
      }
    })
    if (!hasRepo) {
      list.push({
        type: "Unlinked JPA Entity",
        message: `JPA Entity '${className}' has no corresponding JpaRepository bean registered.`,
        severity: "smell"
      })
    }
  }

  return list
})

// ── Helpers ────────────────────────────────────────────────────
function getClassNameFromImport(imp: string): string {
  if (!imp) return ""
  const cleaned = imp.replace("import ", "").replace(";", "").trim()
  return cleaned.split(".").pop() || cleaned
}

function getBasename(path: string): string {
  return path?.split("/").pop() || path
}

function cleanSnippetType(type: string): string {
  if (type === "java__spring__controller") return "@RestController"
  if (type === "java__spring__service") return "@Service"
  if (type === "java__spring__repository") return "@Repository"
  if (type === "java__spring__component") return "@Component"
  if (type === "java__spring__configuration") return "@Configuration"
  if (type === "java__spring__bean") return "@Bean"
  if (type === "java__jpa__entity") return "@Entity"
  if (type.startsWith("java__spring__request_mapping")) return "@RequestMapping"
  if (type === "java__interface__declaration") return "Interface"
  if (type === "java__record__declaration") return "Record"
  if (type === "java__class__declaration") return "Class"
  return type.replace("java__", "").replace(/__/g, " › ")
}

function snippetRoleColor(type: string): string {
  if (type.includes("spring") || type.includes("bean")) return "bg-emerald-50 border-emerald-200 text-emerald-700"
  if (type.includes("jpa")) return "bg-amber-50 border-amber-200 text-amber-700"
  return "bg-slate-50 border-slate-200 text-slate-600"
}

// ═══════════════════════════════════════════════════════
// D3 LOCAL NEIGHBORHOOD GRAPH
// ═══════════════════════════════════════════════════════
function buildNeighborhoodGraphData() {
  const nodes = new Map<string, any>()
  const edges: { source: string; target: string }[] = []

  const centerClassName = fileBasename.value.replace(".java", "")
  
  // 1. Add Center Node
  let centerRole = "Other"
  if (javaMetrics.value?.roles.includes("Spring Controller")) centerRole = "Controller"
  else if (javaMetrics.value?.roles.includes("Spring Service")) centerRole = "Service"
  else if (javaMetrics.value?.roles.includes("Spring Repository")) centerRole = "Repository"
  else if (javaMetrics.value?.roles.includes("JPA Entity")) centerRole = "Entity"
  else if (javaMetrics.value?.roles.includes("Spring Configuration")) centerRole = "Configuration"

  nodes.set(centerClassName, {
    id: centerClassName,
    name: centerClassName,
    role: centerRole,
    isCenter: true,
    file: filePath.value
  })

  // 2. Add Outgoing Node mappings
  resolvedOutgoingReferences.value.forEach(ref => {
    let role = "Other"
    if (ref.roles.includes("Controller")) role = "Controller"
    else if (ref.roles.includes("Service")) role = "Service"
    else if (ref.roles.includes("Repository")) role = "Repository"
    else if (ref.roles.includes("Entity")) role = "Entity"
    else if (ref.roles.includes("Configuration")) role = "Configuration"

    nodes.set(ref.className, {
      id: ref.className,
      name: ref.className,
      role,
      isCenter: false,
      file: ref.file
    })

    edges.push({
      source: centerClassName,
      target: ref.className
    })
  })

  // 3. Add Incoming Node mappings
  resolvedIncomingReferences.value.forEach(ref => {
    const dest = classToFileMap.value.get(ref.className)
    let role = "Other"
    if (dest) {
      if (dest.roles.includes("Controller")) role = "Controller"
      else if (dest.roles.includes("Service")) role = "Service"
      else if (dest.roles.includes("Repository")) role = "Repository"
      else if (dest.roles.includes("Entity")) role = "Entity"
      else if (dest.roles.includes("Configuration")) role = "Configuration"
    }

    nodes.set(ref.className, {
      id: ref.className,
      name: ref.className,
      role,
      isCenter: false,
      file: ref.file
    })

    edges.push({
      source: ref.className,
      target: centerClassName
    })
  })

  return {
    nodes: Array.from(nodes.values()),
    edges
  }
}

function getNeighborhoodRoleColor(role: string): string {
  if (role === "Controller") return "#6366f1"
  if (role === "Service") return "#10b981"
  if (role === "Repository") return "#f59e0b"
  if (role === "Entity") return "#f97316"
  if (role === "Configuration") return "#a855f7"
  return "#64748b"
}

function getNeighborhoodTargetX(d: any, width: number): number {
  if (d.isCenter) return width * 0.5
  
  const isIncoming = resolvedIncomingReferences.value.some(r => r.className === d.id)
  if (isIncoming) return width * 0.18
  
  return width * 0.82
}

function renderNeighborhoodGraph() {
  const svg = neighborhoodSvgRef.value
  if (!svg) return

  const rect = svg.getBoundingClientRect()
  const width = rect.width || 600
  const height = rect.height || 260

  d3.select(svg).selectAll("*").remove()
  if (neighborhoodSimulation) neighborhoodSimulation.stop()

  const { nodes, edges } = buildNeighborhoodGraphData()
  if (nodes.length === 0) return

  const root = d3.select(svg)
  const g = root.append("g")

  // Zoom
  neighborhoodZoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on("zoom", (event) => {
      g.attr("transform", event.transform)
    })
  root.call(neighborhoodZoom)

  // Arrow markers
  root.append("defs")
    .append("marker")
    .attr("id", "neighborhood-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#475569")
    .attr("opacity", 0.6)

  // Render links
  const links = g.selectAll("line.neighborhood-link")
    .data(edges)
    .join("line")
    .attr("class", "neighborhood-link")
    .attr("stroke", "#334155")
    .attr("stroke-opacity", 0.35)
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#neighborhood-arrow)")

  // Render nodes
  const nodeSelection = g.selectAll("circle.neighborhood-node")
    .data(nodes, (d: any) => d.id)
    .join("circle")
    .attr("class", "neighborhood-node")
    .attr("r", (d: any) => d.isCenter ? 10 : 7)
    .attr("fill", (d: any) => d.isCenter ? "#ffffff" : getNeighborhoodRoleColor(d.role))
    .attr("stroke", (d: any) => d.isCenter ? getNeighborhoodRoleColor(d.role) : "#090d16")
    .attr("stroke-width", (d: any) => d.isCenter ? 3.5 : 1.5)
    .style("cursor", (d: any) => d.isCenter ? "default" : "pointer")
    .on("click", (event, d: any) => {
      if (d.isCenter) return
      router.push("/views/files/" + d.file)
    })

  // Labels
  const labels = g.selectAll("text.neighborhood-label")
    .data(nodes, (d: any) => d.id)
    .join("text")
    .attr("class", "neighborhood-label")
    .text((d: any) => d.name)
    .attr("font-size", (d: any) => d.isCenter ? 9 : 7.5)
    .attr("font-weight", "bold")
    .attr("fill", (d: any) => d.isCenter ? "#ffffff" : "#94a3b8")
    .attr("text-anchor", "middle")
    .attr("dy", (d: any) => d.isCenter ? -14 : -11)
    .style("pointer-events", "none")

  // Node drag
  const drag = d3.drag<SVGCircleElement, any>()
    .on("start", (event, d: any) => {
      if (!event.active) neighborhoodSimulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d: any) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event, d: any) => {
      if (!event.active) neighborhoodSimulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  nodeSelection.call(drag as any)

  // Tooltips
  nodeSelection.append("title")
    .text((d: any) => `${d.id}\nRole: ${d.role}\nFile: ${d.file}`)

  // Simulation
  neighborhoodSimulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("x", d3.forceX().x((d: any) => getNeighborhoodTargetX(d, width)).strength(1.5))
    .force("y", d3.forceY().y(height / 2).strength(0.4))
    .force("collision", d3.forceCollide().radius(25))
    .on("tick", () => {
      links
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y)
      nodeSelection.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
      labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
    })
}

function resetNeighborhoodZoom() {
  const svg = neighborhoodSvgRef.value
  if (svg && neighborhoodZoom) {
    d3.select(svg).transition().duration(500).call(
      neighborhoodZoom.transform,
      d3.zoomIdentity
    )
  }
}

// Watchers
watch([resolvedOutgoingReferences, resolvedIncomingReferences, filePath], () => {
  nextTick(() => renderNeighborhoodGraph())
})

// Lifecycle
onMounted(() => {
  nextTick(() => renderNeighborhoodGraph())
})

onBeforeUnmount(() => {
  if (neighborhoodSimulation) neighborhoodSimulation.stop()
})

// Resize
let neighborhoodResizeTimer: any = null
function handleNeighborhoodResize() {
  if (neighborhoodResizeTimer) clearTimeout(neighborhoodResizeTimer)
  neighborhoodResizeTimer = setTimeout(() => {
    renderNeighborhoodGraph()
  }, 200)
}

onMounted(() => window.addEventListener("resize", handleNeighborhoodResize))
onBeforeUnmount(() => window.removeEventListener("resize", handleNeighborhoodResize))
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
