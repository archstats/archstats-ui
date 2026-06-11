<template>
  <div class="w-full flex flex-col gap-6 select-none animate-in fade-in duration-300">
    <!-- Clean Horizontal Stats Strip -->
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold text-slate-500 border-b border-slate-100 pb-4 select-none">
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
      <div class="flex items-center gap-1.5" v-if="javaMetrics.springBeans > 0">
        <span class="text-slate-400 font-mono font-medium">Spring Beans:</span>
        <span class="text-indigo-650 font-black font-mono text-sm">{{ javaMetrics.springBeans }}</span>
      </div>
      <div class="flex items-center gap-1.5" v-if="javaMetrics.jpaEntities > 0">
        <span class="text-slate-400 font-mono font-medium">JPA Entities:</span>
        <span class="text-amber-600 font-black font-mono text-sm">{{ javaMetrics.jpaEntities }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 font-mono font-medium">Encapsulation:</span>
        <span class="text-slate-850 font-black font-mono text-sm">{{ encapsulationScore }}%</span>
      </div>
      <div 
        v-if="violationsCount > 0"
        class="flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200/60 font-mono text-[9px]"
      >
        <span>Structural Flags:</span>
        <strong>{{ violationsCount }}</strong>
      </div>
      <div class="ml-auto text-[8px] uppercase tracking-widest bg-slate-100 border border-slate-200/50 text-slate-500 px-2.5 py-0.5 rounded-lg font-mono">
        {{ moduleClassification }}
      </div>
    </div>

    <!-- Tab Bar for Java Insights -->
    <div class="flex items-center gap-1.5 border-b border-slate-100 pb-3 overflow-x-auto scrollbar-none shrink-0">
      <button 
        v-for="subTab in subTabs" 
        :key="subTab.id"
        @click="activeSubTab = subTab.id"
        class="text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all tracking-wider uppercase cursor-pointer"
        :class="activeSubTab === subTab.id
          ? 'bg-slate-800 text-white shadow-xs' 
          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
      >
        {{ subTab.label }}
        <span 
          v-if="subTab.id === 'audit' && violationsCount > 0"
          class="ml-1 bg-slate-500 text-white text-[8px] font-mono px-1 rounded-full"
        >
          {{ violationsCount }}
        </span>
      </button>
    </div>

    <!-- ═══════════════════════════════════════ -->
    <!-- TAB 1: ARCHITECTURAL STRUCTURE & LAYERS -->
    <!-- ═══════════════════════════════════════ -->
    <div v-if="activeSubTab === 'audit'" class="flex flex-col gap-6">
      
      <!-- Clear state when no flags detected -->
      <div 
        v-if="violationsCount === 0" 
        class="bg-indigo-50/20 border border-indigo-100 rounded-3xl p-8 text-center flex flex-col items-center gap-2"
      >
        <span class="text-3xl text-indigo-500">✓</span>
        <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">Layer Separation Aligned</h4>
        <p class="text-[10px] text-slate-500 max-w-md leading-relaxed mt-1">
          No layering overrides or unlinked entities detected. All controllers, services, and repositories follow typical layer segregation, and JPA entities are mapped to corresponding repositories.
        </p>
      </div>

      <!-- Audit Structure Catalog -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        <!-- Left Side: Structural Mappings & Findings -->
        <div class="flex flex-col gap-5">
          <!-- Finding 1: Direct Repository Access -->
          <div 
            v-if="directRepoViolations.length > 0"
            class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs flex flex-col gap-3.5"
          >
            <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span class="text-base">🗂️</span>
              <div>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Direct Repository References ({{ directRepoViolations.length }})</h5>
                <p class="text-[8px] text-slate-500 mt-0.5">Controllers that import or wire Repository endpoints directly</p>
              </div>
            </div>
            
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <div 
                v-for="v in directRepoViolations" 
                :key="v.file + '-' + v.repoFile"
                class="bg-slate-50/50 border border-slate-150/50 rounded-xl p-3 flex flex-col gap-1 text-[10px]"
              >
                <div class="flex justify-between items-start">
                  <span class="font-bold text-slate-800">{{ v.controllerName }}</span>
                  <span class="text-[8px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded font-mono font-bold uppercase">Direct Access</span>
                </div>
                <div class="text-[9.5px] text-slate-500 mt-0.5 leading-relaxed">
                  Imports repository class <code>{{ v.importedClass }}</code>.
                </div>
                <div class="flex justify-between text-[8px] font-mono mt-1.5 border-t border-slate-150/50 pt-1.5 text-slate-450">
                  <router-link :to="`/views/files/${v.file}`" class="text-indigo-650 hover:underline">Inspect Controller</router-link>
                  <router-link :to="`/views/files/${v.repoFile}`" class="text-indigo-650 hover:underline">Inspect Repository</router-link>
                </div>
              </div>
            </div>
          </div>

          <!-- Finding 2: Reverse Layer References -->
          <div 
            v-if="reverseLayerViolations.length > 0"
            class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs flex flex-col gap-3.5"
          >
            <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span class="text-base">🔄</span>
              <div>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Reverse Layer References ({{ reverseLayerViolations.length }})</h5>
                <p class="text-[8px] text-slate-500 mt-0.5">Service classes importing boundary Controller classes</p>
              </div>
            </div>
            
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <div 
                v-for="v in reverseLayerViolations" 
                :key="v.file + '-' + v.controllerFile"
                class="bg-slate-50/50 border border-slate-150/50 rounded-xl p-3 flex flex-col gap-1 text-[10px]"
              >
                <div class="flex justify-between items-start">
                  <span class="font-bold text-slate-800">{{ v.serviceName }}</span>
                  <span class="text-[8px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded font-mono font-bold uppercase">Reverse Layer</span>
                </div>
                <div class="text-[9.5px] text-slate-500 mt-0.5 leading-relaxed">
                  Imports controller class <code>{{ v.importedClass }}</code>.
                </div>
                <div class="flex justify-between text-[8px] font-mono mt-1.5 border-t border-slate-150/50 pt-1.5 text-slate-450">
                  <router-link :to="`/views/files/${v.file}`" class="text-indigo-650 hover:underline">Inspect Service</router-link>
                  <router-link :to="`/views/files/${v.controllerFile}`" class="text-indigo-650 hover:underline">Inspect Controller</router-link>
                </div>
              </div>
            </div>
          </div>

          <!-- Finding 3: Unlinked JPA Entities -->
          <div 
            v-if="orphanedEntities.length > 0"
            class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs flex flex-col gap-3.5"
          >
            <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span class="text-base">🔌</span>
              <div>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Unlinked JPA Entities ({{ orphanedEntities.length }})</h5>
                <p class="text-[8px] text-slate-500 mt-0.5">JPA database entity declared but no JpaRepository mapping detected</p>
              </div>
            </div>
            
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <div 
                v-for="e in orphanedEntities" 
                :key="e.name"
                class="bg-slate-50/50 border border-slate-150/50 rounded-xl p-3 flex flex-col gap-1 text-[10px]"
              >
                <div class="flex justify-between items-center">
                  <span class="font-bold text-slate-800 font-mono">{{ e.name }}</span>
                  <router-link :to="`/views/files/${e.file}`" class="text-[8px] text-indigo-650 font-bold hover:underline">Inspect Entity</router-link>
                </div>
                <p class="text-[9.5px] text-slate-500 leading-relaxed mt-0.5">
                  Entity has no matching repository bean (e.g. <code>{{ e.name }}Repository</code>) detected in the codebase wiring tree.
                </p>
              </div>
            </div>
          </div>

          <!-- Finding 4: Multi-Field Singleton Beans -->
          <div 
            v-if="highStateBeans.length > 0"
            class="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs flex flex-col gap-3.5"
          >
            <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span class="text-base">⏳</span>
              <div>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Multi-Field Singleton Beans ({{ highStateBeans.length }})</h5>
                <p class="text-[8px] text-slate-500 mt-0.5">Singleton beans declaring 5 or more instance fields</p>
              </div>
            </div>
            
            <div class="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              <div 
                v-for="b in highStateBeans" 
                :key="b.file"
                class="bg-slate-50/50 border border-slate-150/50 rounded-xl p-3 flex flex-col gap-1 text-[10px]"
              >
                <div class="flex justify-between items-center">
                  <span class="font-bold text-slate-800">{{ b.name }}</span>
                  <router-link :to="`/views/files/${b.file}`" class="text-[8px] text-indigo-650 font-bold hover:underline font-mono">Inspect Bean</router-link>
                </div>
                <p class="text-[9.5px] text-slate-500 leading-relaxed mt-0.5">
                  Declares <strong class="font-bold text-slate-800 font-mono">{{ b.fieldsCount }}</strong> fields. In Spring, singleton beans are shared concurrently. Verify if these fields represent immutable autowired dependencies or configuration constants.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Side: Design Considerations & Tradeoffs -->
        <div class="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
          <div>
            <h4 class="text-[10px] font-black text-slate-450 uppercase tracking-widest font-mono">Design Considerations</h4>
            <p class="text-[8px] text-slate-450 mt-0.5">Contextual design tradeoffs for Spring & JPA patterns</p>
          </div>

          <div class="text-[10px] leading-relaxed text-slate-600 flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <span class="font-extrabold text-indigo-700 text-[8px] uppercase tracking-wider">🍃 Layering & Coupling</span>
              <p class="text-[9.5px] text-slate-550">
                A classic layered architecture flows downward from <strong>Controller &rarr; Service &rarr; Repository</strong>.
              </p>
              <p class="text-[9.5px] text-slate-550">
                Direct repository access by controllers reduces boilerplate code for simple CRUD operations, but bypasses the service layer where business rules, transaction boundaries, and authorization are typically unified.
              </p>
            </div>

            <div class="border-t border-slate-200/60 pt-4 flex flex-col gap-1.5">
              <span class="font-extrabold text-emerald-700 text-[8px] uppercase tracking-wider">⚙️ Concurrency & State</span>
              <p class="text-[9.5px] text-slate-550">
                Spring beans are singletons by default and handle concurrent requests across multiple threads.
              </p>
              <p class="text-[9.5px] text-slate-550">
                Instance fields containing shared mutable states (e.g. counters, maps, session cache) can introduce concurrency issues. Fields that only represent stateless, read-only autowired dependencies are typical for thread-safe layouts.
              </p>
            </div>

            <div class="border-t border-slate-200/60 pt-4 flex flex-col gap-1.5">
              <span class="font-extrabold text-amber-700 text-[8px] uppercase tracking-wider">💾 JPA Repository Coverage</span>
              <p class="text-[9.5px] text-slate-550">
                JPA Entities map class models directly to database tables.
              </p>
              <p class="text-[9.5px] text-slate-550">
                Entities without matching repositories might be queried using custom <code>EntityManager</code> configurations, or represent read-only lookup structures. Declaring repositories provides access via standard Spring Data methods.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════ -->
    <!-- TAB 2: APIs & AUTOWIRED BEAN REGISTRY   -->
    <!-- ═══════════════════════════════════════ -->
    <div v-if="activeSubTab === 'api'" class="flex flex-col gap-6">
      
      <!-- Premium D3 Spring Wiring Dependency Graph Card (Full Width) -->
      <div class="bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-3xs flex flex-col gap-4 relative overflow-hidden h-[450px]">
        <div class="flex items-center justify-between border-b border-slate-900 pb-3 shrink-0 z-10">
          <div>
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Interactive Dependency Wiring Flow</h4>
            <p class="text-[8px] text-slate-500 mt-0.5">Left-to-right flow tracing from Controllers (Indigo) &rarr; Services (Emerald) &rarr; Repositories (Amber) &rarr; Entities (Orange)</p>
          </div>
          
          <div class="flex items-center gap-3">
            <button 
              @click="resetWiringZoom"
              class="text-[9px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 border border-slate-800 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
            >
              Reset View
            </button>
            <label class="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 cursor-pointer select-none">
              <input 
                type="checkbox" 
                v-model="includeExternalWiring" 
                class="rounded bg-slate-900 border-slate-800 text-indigo-650 focus:ring-0 focus:ring-offset-0 cursor-pointer" 
              />
              <span>External References</span>
            </label>
          </div>
        </div>
        
        <!-- Legend Overlay inside Graph -->
        <div class="absolute bottom-6 left-6 flex flex-wrap gap-x-4 gap-y-1.5 text-[8px] font-bold z-10 bg-slate-900/60 backdrop-blur-xs px-3 py-2 rounded-xl border border-slate-850">
          <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-indigo-500"></span><span class="text-slate-400">Controller</span></div>
          <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-slate-400">Service</span></div>
          <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-slate-400">Repository</span></div>
          <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-500"></span><span class="text-slate-400">Entity</span></div>
          <div class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-500"></span><span class="text-slate-400">Configuration</span></div>
          <div class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full border border-dashed border-slate-500"></span><span class="text-slate-400">External Class</span></div>
        </div>

        <div class="grow relative min-h-[300px]">
          <svg ref="wiringSvgRef" class="w-full h-full bg-slate-950 rounded-2xl"></svg>
        </div>
      </div>

      <!-- Split layout: Controller APIs list on left, Autowired bean wiring on right -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        <!-- Left: Exposed HTTP REST Controllers (Span 2) -->
        <div class="lg:col-span-2 flex flex-col gap-5">
          <!-- Controllers Endpoints List -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Spring REST Controllers ({{ componentControllers.length }})</h4>
              
              <!-- Simple HTTP Verb Legend -->
              <div class="flex items-center gap-2 text-[8px] font-bold">
                <span class="px-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded">GET</span>
                <span class="px-1 bg-blue-50 border border-blue-200 text-blue-700 rounded">POST</span>
                <span class="px-1 bg-amber-50 border border-amber-200 text-amber-700 rounded">PUT</span>
                <span class="px-1 bg-rose-50 border border-rose-200 text-rose-700 rounded">DELETE</span>
              </div>
            </div>

            <div class="w-full overflow-x-auto">
              <table class="w-full text-[10px] font-medium text-slate-700">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                    <th class="py-2 pr-3">Controller Class</th>
                    <th class="py-2 px-3 text-center">GET</th>
                    <th class="py-2 px-3 text-center">POST</th>
                    <th class="py-2 px-3 text-center">PUT</th>
                    <th class="py-2 px-3 text-center">DEL</th>
                    <th class="py-2 px-3 text-center">PATCH</th>
                    <th class="py-2 pl-3 text-right">Total Mapping</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  <tr v-if="componentControllers.length === 0">
                    <td colspan="7" class="text-center py-6 text-slate-400 italic">No request mapping controllers declared in this component.</td>
                  </tr>
                  <tr
                    v-else
                    v-for="c in componentControllers"
                    :key="c.name"
                    class="hover:bg-slate-50/50 transition-colors"
                  >
                    <td class="py-2.5 pr-3 font-mono font-bold text-indigo-650 truncate max-w-[280px]" :title="c.name">
                      <router-link :to="`/views/files/${c.name}`">{{ getBasename(c.name) }}</router-link>
                    </td>
                    <td class="py-2.5 px-3 font-mono font-bold text-center text-emerald-600">{{ c.get_count || 0 }}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-center text-blue-600">{{ c.post_count || 0 }}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-center text-amber-600">{{ c.put_count || 0 }}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-center text-rose-600">{{ c.delete_count || 0 }}</td>
                    <td class="py-2.5 px-3 font-mono font-bold text-center text-purple-650">{{ c.patch_count || 0 }}</td>
                    <td class="py-2.5 pl-3 font-mono font-black text-right text-slate-900">{{ c.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Spring Bean Registry Table -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
            <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Component Spring Beans Registry ({{ componentBeans.length }})</h4>
            </div>

            <div class="w-full overflow-x-auto max-h-[360px] overflow-y-auto">
              <table class="w-full text-[10px] font-medium text-slate-700">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black sticky top-0 bg-white z-10">
                    <th class="py-2 pr-3">Bean Name</th>
                    <th class="py-2 px-3">Type / Role</th>
                    <th class="py-2 pl-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  <tr v-if="componentBeans.length === 0">
                    <td colspan="3" class="text-center py-6 text-slate-400 italic">No Spring beans declared in this component.</td>
                  </tr>
                  <tr
                    v-else
                    v-for="b in componentBeans"
                    :key="b.name"
                    class="hover:bg-slate-50/50 transition-colors"
                    :class="selectedBean?.name === b.name ? 'bg-indigo-50/30' : ''"
                  >
                    <td class="py-2.5 pr-3 font-mono font-bold text-slate-900">{{ getBasename(b.name).replace(".java", "") }}</td>
                    <td class="py-2.5 px-3">
                      <span
                        v-for="role in b.roles"
                        :key="role"
                        class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mr-1"
                        :class="roleColor(role)"
                      >
                        {{ role }}
                      </span>
                    </td>
                    <td class="py-2.5 pl-3 text-right">
                      <button 
                        @click="selectedBean = b"
                        class="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Inspect Wiring
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Right: Bean Dependency Wiring details (Span 1) -->
        <div class="lg:col-span-1 flex flex-col gap-5">
          <!-- Wiring card -->
          <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4 min-h-[300px]">
            <div class="border-b border-slate-100 pb-3">
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dependency Wiring Profile</h4>
              <p class="text-[8px] text-slate-450 mt-0.5">Select a bean in the table to inspect autowired references</p>
            </div>

            <!-- Empty State -->
            <div 
              v-if="!selectedBeanWiring" 
              class="flex-1 flex flex-col items-center justify-center text-center text-slate-400 italic text-[10px] py-12"
            >
              <span>No bean selected.</span>
              <span class="text-[8px] text-slate-450 mt-1">Select a bean from the table to trace imports</span>
            </div>

            <!-- Wiring details -->
            <div v-else class="flex flex-col gap-4">
              <!-- Selected Bean info -->
              <div class="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-0.5">
                <span class="text-[8px] text-slate-400 font-bold uppercase">Wiring Root</span>
                <span class="text-xs font-black text-slate-800 font-mono">{{ selectedBeanWiring.name }}</span>
              </div>

              <!-- Outgoing Internal dependencies -->
              <div class="flex flex-col gap-1.5">
                <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider">Internal Dependencies ({{ selectedBeanWiring.internalDeps.length }})</span>
                <div v-if="selectedBeanWiring.internalDeps.length === 0" class="text-[9px] text-slate-400 italic">No internal component beans imported.</div>
                <div v-else class="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-1">
                  <div 
                    v-for="dep in selectedBeanWiring.internalDeps" 
                    :key="dep.file"
                    class="flex items-center justify-between text-[9.5px] border border-slate-100 hover:border-slate-200/60 bg-slate-50/20 hover:bg-slate-50 rounded-lg p-1.5 transition-colors font-mono"
                  >
                    <span class="font-bold text-slate-700 truncate mr-2">{{ dep.name }}</span>
                    <router-link :to="`/views/files/${dep.file}`" class="text-[8px] text-indigo-600 font-black hover:underline">File</router-link>
                  </div>
                </div>
              </div>

              <!-- Outgoing External dependencies -->
              <div class="flex flex-col gap-1.5 border-t border-slate-50 pt-3">
                <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider">Cross-Module Dependencies ({{ selectedBeanWiring.externalDeps.length }})</span>
                <div v-if="selectedBeanWiring.externalDeps.length === 0" class="text-[9px] text-slate-400 italic">No cross-component imports.</div>
                <div v-else class="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-1">
                  <div 
                    v-for="dep in selectedBeanWiring.externalDeps" 
                    :key="dep.file"
                    class="flex flex-col gap-0.5 text-[9px] border border-slate-100 hover:border-slate-200/60 bg-slate-50/20 hover:bg-slate-50 rounded-lg p-1.5 transition-colors font-mono"
                  >
                    <div class="flex justify-between items-center">
                      <span class="font-bold text-slate-700 truncate mr-2">{{ dep.name }}</span>
                      <router-link :to="`/views/files/${dep.file}`" class="text-[8px] text-indigo-650 font-bold hover:underline">File</router-link>
                    </div>
                    <span class="text-[7.5px] text-slate-450 tracking-tight leading-none truncate mt-0.5">Component: {{ store.getComponentName(dep.component) }}</span>
                  </div>
                </div>
              </div>

              <!-- Incoming references -->
              <div class="flex flex-col gap-1.5 border-t border-slate-50 pt-3">
                <span class="font-extrabold text-slate-400 text-[8px] uppercase tracking-wider">Incoming References ({{ selectedBeanWiring.incomingRefs.length }})</span>
                <div v-if="selectedBeanWiring.incomingRefs.length === 0" class="text-[9px] text-slate-400 italic">No files import this class name.</div>
                <div v-else class="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-1">
                  <div 
                    v-for="i in selectedBeanWiring.incomingRefs" 
                    :key="i.file"
                    class="flex flex-col gap-0.5 text-[9px] border border-slate-100 hover:border-slate-200/60 bg-slate-50/20 hover:bg-slate-50 rounded-lg p-1.5 transition-colors font-mono"
                  >
                    <div class="flex justify-between items-center">
                      <span class="font-bold text-slate-700 truncate mr-2">{{ getBasename(i.file) }}</span>
                      <router-link :to="`/views/files/${i.file}`" class="text-[8px] text-indigo-650 font-bold hover:underline">File</router-link>
                    </div>
                    <span class="text-[7.5px] text-slate-450 tracking-tight leading-none truncate mt-0.5">Module: {{ store.getComponentName(i.component) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════ -->
    <!-- TAB 3: JPA PERSISTENCE ENTITIES SCHEMA -->
    <!-- ═══════════════════════════════════════ -->
    <div v-if="activeSubTab === 'jpa'" class="flex flex-col gap-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        <!-- Mapped entities list (Span 2) -->
        <div class="lg:col-span-2 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
          <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
            <div class="w-1.5 h-3.5 bg-amber-500 rounded-full"></div>
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">JPA Database Mapped Entities ({{ componentJpaEntities.length }})</h4>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-[10px] font-medium text-slate-700">
              <thead>
                <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="py-2 pr-3">Entity Class</th>
                  <th class="py-2 px-3 text-center">Has Repository</th>
                  <th class="py-2 pl-3">Source File</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="componentJpaEntities.length === 0">
                  <td colspan="3" class="text-center py-6 text-slate-400 italic">No JPA tables or entity classes mapped in this component.</td>
                </tr>
                <tr
                  v-else
                  v-for="e in componentJpaEntities"
                  :key="e.entity_name"
                  class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td class="py-2.5 pr-3 font-mono font-bold text-slate-900 text-xs">{{ e.entity_name }}</td>
                  <td class="py-2.5 px-3 text-center">
                    <span 
                      v-if="!entityHasRepo(e.entity_name)"
                      class="bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded font-mono text-[8px] font-bold uppercase"
                    >
                      No Repository
                    </span>
                    <span 
                      v-else
                      class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.2 rounded font-mono text-[8px] font-bold uppercase"
                    >
                      Mapped
                    </span>
                  </td>
                  <td class="py-2.5 pl-3 font-mono text-indigo-650 truncate max-w-[360px]" :title="e.name">
                    <router-link :to="`/views/files/${e.name}`">{{ e.name }}</router-link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Entity Persistence Context Lifecycles guide (Span 1) -->
        <div class="lg:col-span-1 bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-250/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
          <div>
            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest">JPA Persistence Context Flow</h4>
            <p class="text-[8px] text-slate-450 mt-0.5">Lifecycle of entities in hibernate cache sessions</p>
          </div>

          <div class="flex flex-col gap-3 text-[10px] text-slate-650 leading-relaxed">
            <div class="flex flex-col gap-1 relative pl-6">
              <div class="absolute left-1.5 top-1 bottom-1 w-0.5 bg-slate-200"></div>
              <span class="font-extrabold text-slate-800 text-[9px] uppercase tracking-wider">1. Transient State</span>
              <p class="text-slate-500 text-[9px]">Instantiated with <code>new()</code>. Not bound to database records.</p>
            </div>
            
            <div class="flex flex-col gap-1 relative pl-6 border-t border-slate-200/50 pt-2">
              <div class="absolute left-1.5 top-3 bottom-1 w-0.5 bg-emerald-400"></div>
              <span class="font-extrabold text-emerald-700 text-[9px] uppercase tracking-wider">2. Managed State</span>
              <p class="text-slate-500 text-[9px]">Saved or loaded in transaction context. Field modifications are dirty-checked and flushed to database automatically.</p>
            </div>

            <div class="flex flex-col gap-1 relative pl-6 border-t border-slate-200/50 pt-2">
              <div class="absolute left-1.5 top-3 bottom-1 w-0.5 bg-amber-400"></div>
              <span class="font-extrabold text-amber-700 text-[9px] uppercase tracking-wider">3. Detached State</span>
              <p class="text-slate-500 text-[9px]">Transaction closed. Bean remains in memory with database ID but is un-tracked. Accessing lazy mappings throws exception errors.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════ -->
    <!-- TAB 4: COMPONENT FILE SOURCE CATALOG    -->
    <!-- ═══════════════════════════════════════ -->
    <div v-if="activeSubTab === 'catalog'" class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
      <!-- Search & Filters Toolbar -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-3">
        <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Java Source Files Catalog ({{ javaFiles.length }})</h4>
        
        <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <!-- Dropdown filter by role -->
          <select 
            v-model="roleFilter"
            class="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-slate-350"
          >
            <option value="All">All Roles</option>
            <option value="Controller">Controllers</option>
            <option value="Service">Services</option>
            <option value="Repository">Repositories</option>
            <option value="Entity">JPA Entities</option>
            <option value="Configuration">Configurations</option>
            <option value="Standard">Standard Classes</option>
          </select>

          <!-- Text Search -->
          <input
            v-model="fileSearch"
            type="text"
            placeholder="Search Java files..."
            class="w-full sm:w-48 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-[10px] font-bold text-slate-700 placeholder-slate-450 focus:outline-none focus:border-slate-350 transition-colors"
          />
        </div>
      </div>

      <!-- File metrics table -->
      <div class="w-full overflow-x-auto">
        <table class="w-full text-left text-[10px]">
          <thead>
            <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black">
              <th class="py-2 pr-3">File Name</th>
              <th class="py-2 px-3 text-center">Classes</th>
              <th class="py-2 px-3 text-center">Methods</th>
              <th class="py-2 px-3 text-center">Fields</th>
              <th class="py-2 px-3 text-right">LOC</th>
              <th class="py-2 px-3 text-center">Health</th>
              <th class="py-2 pl-3">Architecture Role</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50 font-medium text-slate-700">
            <tr v-if="paginatedFiles.length === 0">
              <td colspan="7" class="text-center py-8 text-slate-400 italic">No Java files found matching the search/filter parameters.</td>
            </tr>
            <tr
              v-else
              v-for="file in paginatedFiles"
              :key="file.name"
              class="hover:bg-slate-100/50 transition-colors"
            >
              <td class="py-2.5 pr-3 font-mono font-bold text-indigo-650 truncate max-w-[200px]" :title="file.name">
                <router-link :to="`/views/files/${file.name}`">{{ getBasename(file.name) }}</router-link>
              </td>
              <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-900">{{ file.classes }}</td>
              <td class="py-2.5 px-3 text-center font-mono text-slate-650">{{ file.methods }}</td>
              <td class="py-2.5 px-3 text-center font-mono text-slate-650">{{ file.fields }}</td>
              <td class="py-2.5 px-3 text-right font-mono text-slate-500">{{ file.lines.toLocaleString() }}</td>
              <td class="py-2.5 px-3 text-center">
                <span :class="healthBadgeClass(file.health)">
                  {{ file.health.toFixed(1) }}
                </span>
              </td>
              <td class="py-2.5 pl-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="role in file.roles"
                    :key="role"
                    class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider"
                    :class="roleColor(role)"
                  >
                    {{ role }}
                  </span>
                  <span v-if="file.roles.length === 0" class="text-slate-450 italic text-[8px]">Standard Class</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Bar -->
      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
        <span class="text-[9px] font-bold text-slate-450">
          Showing {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredFiles.length) }} of {{ filteredFiles.length }} files
        </span>
        <div class="flex items-center gap-1.5">
          <button
            @click="currentPage = Math.max(1, currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-2.5 py-1 rounded-lg border border-slate-200/60 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-650 transition-colors disabled:opacity-50 disabled:hover:bg-white cursor-pointer"
          >
            Previous
          </button>
          <button
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-2.5 py-1 rounded-lg border border-slate-200/60 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-650 transition-colors disabled:opacity-50 disabled:hover:bg-white cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import { useRoute } from "vue-router"
import * as d3 from "d3"
import { useDataStore } from "~/stores/data"
import { useJavaMetrics } from "~/composables/useJavaMetrics"

const route = useRoute()
const store = useDataStore()
const { getJavaMetricsForComponent, getSpringControllers, getJpaEntitiesList } = useJavaMetrics()

const nameInRoute = computed(() => route.params.name as string)

const javaMetrics = computed(() => {
  return getJavaMetricsForComponent(nameInRoute.value)
})

const encapsulationScore = computed(() => {
  const c = javaMetrics.value.classes
  const b = javaMetrics.value.springBeans
  return c ? Math.round((b / c) * 100) : 0
})

const subTabs = [
  { id: "audit", label: "Architectural Structure" },
  { id: "api", label: "REST APIs & Beans" },
  { id: "jpa", label: "JPA Entities" },
  { id: "catalog", label: "Source Catalog" }
]

const activeSubTab = ref("audit")
const roleFilter = ref("All")
const fileSearch = ref("")
const currentPage = ref(1)
const pageSize = 8

// Reset pagination when search or filters change
watch([fileSearch, roleFilter], () => {
  currentPage.value = 1
})

// Detailed list of Java files in this component
const javaFiles = computed(() => {
  if (!store.hasData) return []
  try {
    const escName = nameInRoute.value.replace(/'/g, "''")
    const query = `
      SELECT name, complexity__lines as lines, 
             COALESCE(codesmells__code_health, 10.0) as health,
             COALESCE(codesmells__hotspot_score, 0.0) as hotspot,
             COALESCE(java__class__declarations, 0) as classes,
             COALESCE(java__method_declarations, 0) as methods,
             COALESCE(java__field__declarations, 0) as fields
      FROM files
      WHERE component = '${escName}'
        AND (java__class__declarations > 0 OR java__method_declarations > 0 OR name LIKE '%.java')
      ORDER BY complexity__lines DESC
    `
    const list = store.query<any>(query)

    // Fetch annotations for files inside this component
    const snippetQuery = `
      SELECT file, snippet_type
      FROM snippets
      WHERE component = '${escName}' AND snippet_type LIKE 'java__%'
    `
    const snippets = store.query<any>(snippetQuery)
    const fileRoles: Record<string, string[]> = {}
    snippets.forEach((s: any) => {
      if (!fileRoles[s.file]) fileRoles[s.file] = []
      let role = ""
      if (s.snippet_type === "java__spring__controller") role = "Controller"
      else if (s.snippet_type === "java__spring__service") role = "Service"
      else if (s.snippet_type === "java__spring__repository") role = "Repository"
      else if (s.snippet_type === "java__spring__component") role = "Component"
      else if (s.snippet_type === "java__spring__configuration") role = "Configuration"
      else if (s.snippet_type === "java__jpa__entity") role = "Entity"
      else if (s.snippet_type === "java__interface__declaration") role = "Interface"
      else if (s.snippet_type === "java__record__declaration") role = "Record"

      if (role && !fileRoles[s.file].includes(role)) {
        fileRoles[s.file].push(role)
      }
    })

    return list.map((f: any) => ({
      ...f,
      roles: fileRoles[f.name] || []
    }))
  } catch {
    return []
  }
})

// Search & Pagination filtering
const filteredFiles = computed(() => {
  let list = javaFiles.value
  
  // Filter by role
  const role = roleFilter.value
  if (role !== "All") {
    if (role === "Standard") {
      list = list.filter((f: any) => f.roles.length === 0)
    } else {
      list = list.filter((f: any) => f.roles.includes(role))
    }
  }

  // Filter by search text
  const query = fileSearch.value.trim().toLowerCase()
  if (query) {
    list = list.filter((f: any) => f.name.toLowerCase().includes(query))
  }
  
  return list
})

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredFiles.value.slice(start, start + pageSize)
})

const totalPages = computed(() => {
  return Math.ceil(filteredFiles.value.length / pageSize)
})

// Spring Controllers & JPA list filtering
const componentControllers = computed(() => {
  return getSpringControllers().filter((c: any) => c.component === nameInRoute.value)
})

const componentJpaEntities = computed(() => {
  return getJpaEntitiesList().filter((e: any) => e.component === nameInRoute.value)
})

const componentBeans = computed(() => {
  return javaFiles.value.filter((f: any) => 
    f.roles.includes("Controller") || 
    f.roles.includes("Service") || 
    f.roles.includes("Repository") || 
    f.roles.includes("Component") || 
    f.roles.includes("Configuration")
  )
})

// Gather all local beans and entities for graph modeling
const allComponentBeansAndEntities = computed(() => {
  const list = [...componentBeans.value]
  javaFiles.value.forEach((f: any) => {
    if (f.roles.includes("Entity")) {
      const alreadyAdded = list.some((b: any) => b.name === f.name)
      if (!alreadyAdded) {
        list.push(f)
      }
    }
  })
  return list
})

// D3 Wiring Graph reactive states
const includeExternalWiring = ref(false)
const wiringSvgRef = ref<SVGSVGElement | null>(null)
let wiringSimulation: d3.Simulation<any, any> | null = null
let zoomBehavior: any = null
let svgContainerG: any = null

// Selected bean and its wiring tree
const selectedBean = ref<any>(null)

// Watch bean array to default select the first bean in the list if none selected
watch(componentBeans, (beans) => {
  if (beans.length > 0 && !selectedBean.value) {
    selectedBean.value = beans[0]
  }
}, { immediate: true })

// Simple class-to-file mapping registry
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
  } catch (e) {
    console.error(e)
  }
  return m
})

// Trace imports and dependencies
const selectedBeanWiring = computed(() => {
  if (!selectedBean.value) return null
  const b = selectedBean.value
  try {
    const escName = b.name.replace(/'/g, "''")
    const imports = store.query<any>(`
      SELECT content FROM snippets 
      WHERE file = '${escName}' AND snippet_type = 'java__import__declaration'
    `)
    
    const internalDeps: { name: string; file: string }[] = []
    const externalDeps: { name: string; file: string; component: string }[] = []
    
    imports.forEach((imp: any) => {
      const className = getClassNameFromImport(imp.content)
      const dest = classToFileMap.value.get(className)
      if (dest) {
        if (dest.component === nameInRoute.value) {
          internalDeps.push({ name: className, file: dest.file })
        } else {
          externalDeps.push({ name: className, file: dest.file, component: dest.component })
        }
      }
    })

    const beanClassName = getBasename(b.name).replace(".java", "")
    const incoming = store.query<any>(`
      SELECT DISTINCT file, component 
      FROM snippets 
      WHERE snippet_type = 'java__import__declaration' 
        AND (content LIKE '%.${beanClassName}' OR content LIKE '%.${beanClassName};')
    `)

    return {
      name: beanClassName,
      internalDeps,
      externalDeps,
      incomingRefs: incoming.map((i: any) => ({ file: i.file, component: i.component }))
    }
  } catch {
    return null
  }
})

// Architectural Audits
const directRepoViolations = computed(() => {
  const violations: { file: string; controllerName: string; importedClass: string; repoFile: string }[] = []
  javaFiles.value.forEach(f => {
    if (f.roles.includes("Controller")) {
      try {
        const escName = f.name.replace(/'/g, "''")
        const imports = store.query<any>(`
          SELECT content FROM snippets 
          WHERE file = '${escName}' AND snippet_type = 'java__import__declaration'
        `)
        imports.forEach((imp: any) => {
          const className = getClassNameFromImport(imp.content)
          const dest = classToFileMap.value.get(className)
          if (dest && dest.roles.includes("Repository")) {
            violations.push({
              file: f.name,
              controllerName: getBasename(f.name).replace(".java", ""),
              importedClass: className,
              repoFile: dest.file
            })
          }
        })
      } catch {}
    }
  })
  return violations
})

const reverseLayerViolations = computed(() => {
  const violations: { file: string; serviceName: string; importedClass: string; controllerFile: string }[] = []
  javaFiles.value.forEach(f => {
    if (f.roles.includes("Service")) {
      try {
        const escName = f.name.replace(/'/g, "''")
        const imports = store.query<any>(`
          SELECT content FROM snippets 
          WHERE file = '${escName}' AND snippet_type = 'java__import__declaration'
        `)
        imports.forEach((imp: any) => {
          const className = getClassNameFromImport(imp.content)
          const dest = classToFileMap.value.get(className)
          if (dest && dest.roles.includes("Controller")) {
            violations.push({
              file: f.name,
              serviceName: getBasename(f.name).replace(".java", ""),
              importedClass: className,
              controllerFile: dest.file
            })
          }
        })
      } catch {}
    }
  })
  return violations
})

const orphanedEntities = computed(() => {
  const entities: { name: string; file: string }[] = []
  componentJpaEntities.value.forEach(e => {
    let hasRepo = false
    classToFileMap.value.forEach((val, key) => {
      if (val.roles.includes("Repository")) {
        if (key.startsWith(e.entity_name) || key.toLowerCase().includes(e.entity_name.toLowerCase())) {
          hasRepo = true
        }
      }
    })
    if (!hasRepo) {
      entities.push({
        name: e.entity_name,
        file: e.name
      })
    }
  })
  return entities
})

const highStateBeans = computed(() => {
  const beans: { file: string; name: string; fieldsCount: number }[] = []
  javaFiles.value.forEach(f => {
    const isBean = f.roles.includes("Service") || f.roles.includes("Controller") || f.roles.includes("Component")
    if (isBean && f.fields > 4) {
      beans.push({
        file: f.name,
        name: getBasename(f.name).replace(".java", ""),
        fieldsCount: f.fields
      })
    }
  })
  return beans
})

const violationsCount = computed(() => {
  return directRepoViolations.value.length + 
         reverseLayerViolations.value.length + 
         orphanedEntities.value.length + 
         highStateBeans.value.length
})

// Classification based on architecture roles
const moduleClassification = computed(() => {
  if (componentControllers.value.length > 0) return "Web API boundary"
  if (componentJpaEntities.value.length > 0) return "Data & Persistence core"
  if (javaMetrics.value.springServices > 0) return "Domain service layer"
  return "Library / Utility module"
})

// Helpers
function getBasename(path: string): string {
  return path?.split("/").pop() || path
}

function getClassNameFromImport(imp: string): string {
  if (!imp) return ""
  const cleaned = imp.replace("import ", "").replace(";", "").trim()
  return cleaned.split(".").pop() || cleaned
}

function entityHasRepo(entityName: string): boolean {
  return !orphanedEntities.value.some(e => e.name === entityName)
}

function roleColor(role: string): string {
  if (role.includes("Controller")) return "bg-indigo-50 border border-indigo-150 text-indigo-700"
  if (role.includes("Service")) return "bg-emerald-50 text-emerald-700 border border-emerald-150"
  if (role.includes("Repository") || role.includes("Entity")) return "bg-amber-50 text-amber-700 border border-amber-150"
  if (role.includes("Interface")) return "bg-slate-50 text-slate-650 border border-slate-200"
  return "bg-slate-100 text-slate-700 border border-slate-200"
}

function healthBadgeClass(val: number): string {
  if (val >= 8) return "text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100"
  if (val >= 5) return "text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100"
  return "text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100"
}

// ═══════════════════════════════════════════════════════
// D3 WIRING DEPENDENCY GRAPH
// ═══════════════════════════════════════════════════════

function buildWiringGraphData() {
  const nodes = new Map<string, any>()
  const edges: { source: string; target: string; isExternal: boolean }[] = []

  // 1. Gather all local source classes (Beans + Entities)
  const localClasses = allComponentBeansAndEntities.value
  
  localClasses.forEach((f: any) => {
    const className = getBasename(f.name).replace(".java", "")
    let role = "Other"
    if (f.roles.includes("Controller")) role = "Controller"
    else if (f.roles.includes("Service")) role = "Service"
    else if (f.roles.includes("Repository")) role = "Repository"
    else if (f.roles.includes("Entity")) role = "Entity"
    else if (f.roles.includes("Configuration")) role = "Configuration"

    nodes.set(className, {
      id: className,
      name: className,
      role,
      isExternal: false,
      file: f.name
    })
  })

  // 2. Scan imports for each local class to build edges
  localClasses.forEach((f: any) => {
    const className = getBasename(f.name).replace(".java", "")
    try {
      const escName = f.name.replace(/'/g, "''")
      const imports = store.query<any>(`
        SELECT content FROM snippets 
        WHERE file = '${escName}' AND snippet_type = 'java__import__declaration'
      `)
      
      imports.forEach((imp: any) => {
        const importedClass = getClassNameFromImport(imp.content)
        const dest = classToFileMap.value.get(importedClass)
        
        if (dest) {
          const isInternal = dest.component === nameInRoute.value
          
          if (isInternal) {
            // Target is an internal class (might be a bean or standard class)
            if (!nodes.has(importedClass)) {
              let targetRole = "Other"
              if (dest.roles.includes("Controller")) targetRole = "Controller"
              else if (dest.roles.includes("Service")) targetRole = "Service"
              else if (dest.roles.includes("Repository")) targetRole = "Repository"
              else if (dest.roles.includes("Entity")) targetRole = "Entity"
              else if (dest.roles.includes("Configuration")) targetRole = "Configuration"

              nodes.set(importedClass, {
                id: importedClass,
                name: importedClass,
                role: targetRole,
                isExternal: false,
                file: dest.file
              })
            }
            edges.push({
              source: className,
              target: importedClass,
              isExternal: false
            })
          } else if (includeExternalWiring.value) {
            // Target is external
            if (!nodes.has(importedClass)) {
              let targetRole = "Other"
              if (dest.roles.includes("Controller")) targetRole = "Controller"
              else if (dest.roles.includes("Service")) targetRole = "Service"
              else if (dest.roles.includes("Repository")) targetRole = "Repository"
              else if (dest.roles.includes("Entity")) targetRole = "Entity"
              else if (dest.roles.includes("Configuration")) targetRole = "Configuration"

              nodes.set(importedClass, {
                id: importedClass,
                name: importedClass,
                role: targetRole,
                isExternal: true,
                file: dest.file,
                component: dest.component
              })
            }
            edges.push({
              source: className,
              target: importedClass,
              isExternal: true
            })
          }
        }
      })
    } catch (e) {
      console.error(e)
    }
  })

  return {
    nodes: Array.from(nodes.values()),
    edges
  }
}

function getRoleTargetX(role: string, width: number): number {
  if (role === "Controller") return width * 0.15
  if (role === "Service") return width * 0.45
  if (role === "Repository") return width * 0.72
  if (role === "Entity") return width * 0.9
  if (role === "Configuration") return width * 0.3
  return width * 0.45
}

function getRoleColor(role: string): string {
  if (role === "Controller") return "#6366f1"
  if (role === "Service") return "#10b981"
  if (role === "Repository") return "#f59e0b"
  if (role === "Entity") return "#f97316"
  if (role === "Configuration") return "#a855f7"
  return "#64748b"
}

function renderWiringGraph() {
  const svg = wiringSvgRef.value
  if (!svg) return

  const rect = svg.getBoundingClientRect()
  const width = rect.width || 800
  const height = rect.height || 400

  // Clear
  d3.select(svg).selectAll("*").remove()
  if (wiringSimulation) wiringSimulation.stop()

  const { nodes, edges } = buildWiringGraphData()
  if (nodes.length === 0) return

  const root = d3.select(svg)
  const g = root.append("g")
  svgContainerG = g

  // Zoom
  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform)
    })
  root.call(zoomBehavior)

  // Arrow marker definition
  root.append("defs")
    .append("marker")
    .attr("id", "wiring-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#475569")
    .attr("opacity", 0.6)

  // Render edges
  const links = g.selectAll("line.wiring-link")
    .data(edges)
    .join("line")
    .attr("class", "wiring-link")
    .attr("stroke", "#334155")
    .attr("stroke-opacity", 0.25)
    .attr("stroke-width", 1)
    .attr("marker-end", "url(#wiring-arrow)")

  // Render nodes
  const nodeSelection = g.selectAll("circle.wiring-node")
    .data(nodes, (d: any) => d.id)
    .join("circle")
    .attr("class", "wiring-node")
    .attr("r", 8)
    .attr("fill", (d: any) => getRoleColor(d.role))
    .attr("stroke", "#090d16")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", (d: any) => d.isExternal ? "3,3" : "none")
    .style("cursor", "pointer")
    .on("click", (event, d: any) => {
      if (d.isExternal) return
      // Find bean in local class mappings
      const match = allComponentBeansAndEntities.value.find(
        (b: any) => getBasename(b.name).replace(".java", "") === d.id
      )
      if (match) {
        selectedBean.value = match
      }
    })

  // Node Labels
  const labels = g.selectAll("text.wiring-label")
    .data(nodes, (d: any) => d.id)
    .join("text")
    .attr("class", "wiring-label")
    .text((d: any) => d.name)
    .attr("font-size", 8)
    .attr("font-weight", "bold")
    .attr("fill", "#94a3b8")
    .attr("text-anchor", "middle")
    .attr("dy", -12)
    .style("pointer-events", "none")

  // Node dragging
  const drag = d3.drag<SVGCircleElement, any>()
    .on("start", (event, d: any) => {
      if (!event.active) wiringSimulation?.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event, d: any) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event, d: any) => {
      if (!event.active) wiringSimulation?.alphaTarget(0)
      d.fx = null
      d.fy = null
    })
  nodeSelection.call(drag as any)

  // Tooltips
  nodeSelection.append("title")
    .text((d: any) => {
      if (d.isExternal) {
        return `${d.id} (External)\nComponent: ${store.getComponentName(d.component) || '—'}`
      }
      return `${d.id}\nRole: ${d.role}\nFile: ${d.file}`
    })

  // Simulation setup
  wiringSimulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(85))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("x", d3.forceX().x((d: any) => getRoleTargetX(d.role, width)).strength(1.2))
    .force("y", d3.forceY().y(height / 2).strength(0.35))
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

  // Apply initial selection highlight
  updateGraphSelection()
}

function resetWiringZoom() {
  const svg = wiringSvgRef.value
  if (svg && zoomBehavior) {
    d3.select(svg).transition().duration(500).call(
      zoomBehavior.transform,
      d3.zoomIdentity
    )
  }
}

function updateGraphSelection() {
  const svg = wiringSvgRef.value
  if (!svg) return
  const selectedId = selectedBean.value ? getBasename(selectedBean.value.name).replace(".java", "") : null
  
  const g = d3.select(svg).select("g")
  const nodes = g.selectAll("circle.wiring-node")
  const textLabels = g.selectAll("text.wiring-label")
  const links = g.selectAll("line.wiring-link")
  
  if (!selectedId) {
    nodes.attr("opacity", (d: any) => d.isExternal ? 0.7 : 1)
      .attr("stroke", "#090d16")
      .attr("stroke-width", 1.5)
    textLabels.attr("opacity", 1)
    links.attr("stroke-opacity", 0.25)
      .attr("stroke", "#334155")
      .attr("stroke-width", 1)
    return
  }

  // Find connected nodes
  const connectedNodeIds = new Set<string>([selectedId])
  const { edges } = buildWiringGraphData()
  
  edges.forEach(e => {
    const srcId = typeof e.source === "string" ? e.source : e.source.id
    const tgtId = typeof e.target === "string" ? e.target : e.target.id
    if (srcId === selectedId) connectedNodeIds.add(tgtId)
    if (tgtId === selectedId) connectedNodeIds.add(srcId)
  })

  nodes
    .attr("opacity", (d: any) => connectedNodeIds.has(d.id) ? 1 : 0.15)
    .attr("stroke", (d: any) => d.id === selectedId ? "#ffffff" : "#090d16")
    .attr("stroke-width", (d: any) => d.id === selectedId ? 2.5 : 1.5)

  textLabels.attr("opacity", (d: any) => connectedNodeIds.has(d.id) ? 1 : 0.1)

  links
    .attr("stroke-opacity", (d: any) => {
      const srcId = typeof d.source === "string" ? d.source : d.source.id
      const tgtId = typeof d.target === "string" ? d.target : d.target.id
      return srcId === selectedId || tgtId === selectedId ? 0.75 : 0.05
    })
    .attr("stroke", (d: any) => {
      const srcId = typeof d.source === "string" ? d.source : d.source.id
      const tgtId = typeof d.target === "string" ? d.target : d.target.id
      return srcId === selectedId || tgtId === selectedId ? "#818cf8" : "#334155"
    })
    .attr("stroke-width", (d: any) => {
      const srcId = typeof d.source === "string" ? d.source : d.source.id
      const tgtId = typeof d.target === "string" ? d.target : d.target.id
      return srcId === selectedId || tgtId === selectedId ? 1.5 : 1
    })
}

// Watchers for D3
watch([includeExternalWiring, allComponentBeansAndEntities], () => {
  nextTick(() => renderWiringGraph())
})

watch(selectedBean, () => {
  updateGraphSelection()
})

// Lifecycle hooks
onMounted(() => {
  nextTick(() => renderWiringGraph())
})

onBeforeUnmount(() => {
  if (wiringSimulation) wiringSimulation.stop()
})

// Resize handler
let resizeTimer: any = null
function handleWiringResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    renderWiringGraph()
  }, 200)
}

onMounted(() => window.addEventListener("resize", handleWiringResize))
onBeforeUnmount(() => window.removeEventListener("resize", handleWiringResize))
</script>

<style scoped>
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s infinite ease-in-out;
}
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.82; }
}
</style>
