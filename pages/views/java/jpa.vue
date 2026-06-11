<template>
  <ViewWorkspaceLayout
    title="JPA Persistence"
    :badge-text="badgeText"
    badge-color-class="bg-amber-50 border-amber-100 text-amber-700"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="[{ id: 'jpa', label: 'JPA Persistence' }]"
    sidebar-width="380px"
    :show-config="false"
  >
    <!-- Visualizer Slot -->
    <template #visualizer>
      <div class="w-full h-full flex flex-col gap-6 p-6 overflow-y-auto scroll-container select-none">
        
        <!-- Interactive Lifecycle States -->
        <div class="flex flex-col xl:flex-row gap-6 items-stretch">
          
          <!-- State Transition Grid -->
          <div class="flex-1 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col justify-between gap-5">
            <div>
              <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">JPA Entity Persistence Lifecycle</h4>
              <p class="text-[9px] text-slate-455 mt-0.5">Click a state block to explore transitions and cache management rules</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
              <!-- Transient -->
              <div 
                @click="selectedJpaState = 'transient'"
                class="cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-1.5"
                :class="selectedJpaState === 'transient'
                  ? 'bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-300 text-indigo-950 shadow-xs scale-[1.01]'
                  : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-250'"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider">Transient</span>
                  <span class="text-[8px] font-bold font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-150">new Object()</span>
                </div>
                <p class="text-[9.5px] text-slate-455 leading-relaxed">Instantiated in-memory. Not mapped to a database row and has no persistent identity context.</p>
              </div>

              <!-- Managed -->
              <div 
                @click="selectedJpaState = 'managed'"
                class="cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-1.5"
                :class="selectedJpaState === 'managed'
                  ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300 text-emerald-950 shadow-xs scale-[1.01]'
                  : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-250'"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider">Managed</span>
                  <span class="text-[8px] font-bold font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-150">EntityManager</span>
                </div>
                <p class="text-[9.5px] text-slate-455 leading-relaxed">Bound to current session. Hibernate tracks field changes dynamically and flushes them automatically.</p>
              </div>

              <!-- Detached -->
              <div 
                @click="selectedJpaState = 'detached'"
                class="cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-1.5"
                :class="selectedJpaState === 'detached'
                  ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300 text-amber-950 shadow-xs scale-[1.01]'
                  : 'bg-white border-slate-200 text-slate-800 hover:border-amber-250'"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider">Detached</span>
                  <span class="text-[8px] font-bold font-mono bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-150">Session Closed</span>
                </div>
                <p class="text-[9.5px] text-slate-455 leading-relaxed">Possesses database ID but is disconnected. Modifying fields won't sync to the DB.</p>
              </div>

              <!-- Removed -->
              <div 
                @click="selectedJpaState = 'removed'"
                class="cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-1.5"
                :class="selectedJpaState === 'removed'
                  ? 'bg-gradient-to-br from-rose-50 to-rose-100 border-rose-300 text-rose-950 shadow-xs scale-[1.01]'
                  : 'bg-white border-slate-200 text-slate-800 hover:border-rose-250'"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider">Removed</span>
                  <span class="text-[8px] font-bold font-mono bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-150">DELETE Pending</span>
                </div>
                <p class="text-[9.5px] text-slate-455 leading-relaxed">Scheduled for removal. Deletion statement is transmitted on transactional context commit.</p>
              </div>
            </div>
          </div>

          <!-- Dynamic JPA State Guide -->
          <div class="w-full xl:w-[360px] bg-slate-50/50 border border-slate-200/60 rounded-3xl p-6 shadow-3xs flex flex-col justify-between min-h-[300px]">
            <div v-if="selectedJpaState === 'transient'" class="flex flex-col gap-4">
              <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span class="text-xs">⚪</span>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Transient State Details</h5>
              </div>
              <div class="text-[10px] text-slate-650 leading-relaxed flex flex-col gap-2.5">
                <p>
                  Objects created with <code>new MyEntity()</code> have no presence in database tables or active session caches.
                </p>
                <span class="font-extrabold text-indigo-700 text-[8px] uppercase tracking-wider mt-1">Lifecycle Operations:</span>
                <p>
                  Persisting a transient object via <code>entityManager.persist(entity)</code> binds it, generating an identifier and elevating it to the **Managed** state.
                </p>
              </div>
            </div>

            <div v-else-if="selectedJpaState === 'managed'" class="flex flex-col gap-4">
              <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span class="text-xs text-emerald-500">🟢</span>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Managed State Details</h5>
              </div>
              <div class="text-[10px] text-slate-650 leading-relaxed flex flex-col gap-2.5">
                <p>
                  Entities retrieved from database queries or persisted in the current session are actively **Managed**.
                </p>
                <p>
                  Hibernate dirty-checks these beans. Changing any property value triggers an automatic update statement during flush. Calling <code>save()</code> is unnecessary.
                </p>
              </div>
            </div>

            <div v-else-if="selectedJpaState === 'detached'" class="flex flex-col gap-4">
              <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span class="text-xs text-amber-500">🟡</span>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Detached State Details</h5>
              </div>
              <div class="text-[10px] text-slate-650 leading-relaxed flex flex-col gap-2.5">
                <p>
                  Entities become **Detached** once their transaction finishes or after calling <code>entityManager.clear()</code>.
                </p>
                <p>
                  Modifications are ignored by the context. Accessing uninitialized lazy associations throws a <code>LazyInitializationException</code>.
                </p>
                <span class="font-extrabold text-amber-700 text-[8px] uppercase tracking-wider mt-1">Re-binding:</span>
                <p>
                  Call <code>entityManager.merge(entity)</code> to re-attach the object, copying its detached modifications into a new managed bean.
                </p>
              </div>
            </div>

            <div v-else class="flex flex-col gap-4">
              <div class="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span class="text-xs text-rose-500">🔴</span>
                <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Removed State Details</h5>
              </div>
              <div class="text-[10px] text-slate-650 leading-relaxed flex flex-col gap-2.5">
                <p>
                  Calling <code>entityManager.remove(entity)</code> marks the record for database erasure.
                </p>
                <p>
                  When the session flushes, Hibernate executes an SQL <code>DELETE</code>. The bean returns to a **Transient** state afterward.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- The JPA N+1 Query Problem Alert -->
        <div class="bg-amber-50/50 border border-amber-200/80 rounded-3xl p-6 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base">⚠️</span>
            <h4 class="text-xs font-black text-amber-800 uppercase tracking-wider">Common JPA Pitfall: The N+1 Query Problem</h4>
          </div>
          
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 text-[10.5px] leading-relaxed text-amber-900/90">
            <div class="flex flex-col gap-2">
              <p>
                When reading a parent entity (e.g. <code>Order</code>) that holds a list of children (e.g. <code>OrderItem</code>), lazy loading triggers individual sub-queries for each parent:
              </p>
              <div class="bg-white/80 p-3 rounded-xl border border-amber-100 font-mono text-[9px] text-rose-750 leading-snug">
                List&lt;Order&gt; orders = repo.findAll(); <span class="text-slate-400">// 1 query</span><br/>
                <span class="text-slate-400">// Triggers N additional database queries in loop:</span><br/>
                orders.forEach(o -> System.out.println(o.getItems().size()));
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <p>
                <strong>The Solution:</strong> Use JPQL <strong>JOIN FETCH</strong> or Spring's <strong>@EntityGraph</strong> to retrieve parents and children in a single SQL operation:
              </p>
              <div class="bg-white/80 p-3 rounded-xl border border-amber-100 font-mono text-[9px] text-emerald-750 leading-snug">
                <span class="text-emerald-655">@Query</span>(<span class="text-rose-600">"SELECT o FROM Order o JOIN FETCH o.items"</span>)<br/>
                List&lt;Order&gt; findAllWithItems();<br/>
                <span class="text-slate-400">// OR</span><br/>
                <span class="text-emerald-655">@EntityGraph</span>(attributePaths = {<span class="text-rose-600">"items"</span>})<br/>
                List&lt;Order&gt; findAll();
              </div>
            </div>
          </div>
        </div>

        <!-- JPA Entities Table -->
        <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
          <div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">JPA Database Entities ({{ filteredJpaEntities.length }})</h4>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-[10px] font-medium text-slate-700">
              <thead>
                <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="text-left px-3 py-2">Entity Class</th>
                  <th class="text-left px-3 py-2">Component</th>
                  <th class="text-left px-3 py-2">Source File</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredJpaEntities.length === 0">
                  <td colspan="3" class="text-center py-8 text-slate-400 italic">No JPA entities found matching search query.</td>
                </tr>
                <tr
                  v-else
                  v-for="e in filteredJpaEntities"
                  :key="e.entity_name"
                  class="border-b border-slate-55 hover:bg-slate-100/50 transition-colors"
                >
                  <td class="px-3 py-2.5 font-mono font-bold text-slate-900 text-xs">{{ e.entity_name }}</td>
                  <td class="px-3 py-2.5 font-semibold text-slate-500">{{ store.getComponentName(e.component) }}</td>
                  <td class="px-3 py-2.5 font-mono text-indigo-650 truncate max-w-[320px]" :title="e.name">
                    <router-link :to="`/views/files/${e.name}`">{{ e.name }}</router-link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </template>

    <!-- Sidebar Info Tab -->
    <template #tab-jpa>
      <div class="flex flex-col gap-5 select-none">
        <div class="flex flex-col gap-1">
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Persistence Context</h3>
          <p class="text-[10px] text-slate-500 leading-relaxed mt-1">
            JPA annotations map object structures to database schemas. Track entities and their persistence lifecycles within Hibernate sessions.
          </p>
        </div>

        <div class="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex flex-col gap-2">
          <h5 class="text-[9px] font-black text-amber-700 uppercase tracking-wider">JPA Entities Count</h5>
          <p class="text-[10px] text-amber-900/80 leading-relaxed">
            There are <strong class="font-bold font-mono">{{ summary.jpaEntities }}</strong> entity classes representing database tables.
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
const { getJavaSummary, getJpaEntitiesList } = useJavaMetrics()

useSeoMeta({ title: "JPA Persistence Insights" })

definePageMeta({
  layout: "has-data-layout",
  middleware: ["redirect-if-no-data"]
})

const searchQuery = ref("")
const isSidebarOpen = ref(true)
const activeTab = ref("jpa")
const selectedJpaState = ref("managed")

const summary = computed(() => getJavaSummary())
const jpaEntities = computed(() => getJpaEntitiesList())
const badgeText = computed(() => `${summary.value.jpaEntities} Entities`)

// Filtered JPA List
const filteredJpaEntities = computed(() => {
  const list = jpaEntities.value
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((e: any) => 
    e.entity_name.toLowerCase().includes(q) || 
    e.name.toLowerCase().includes(q) || 
    e.component.toLowerCase().includes(q)
  )
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
