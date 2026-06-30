<template>
  <div class="flex flex-col gap-6">
    <!-- Group Identity Banner -->
    <section 
      class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100/70 rounded-3xl p-6 shadow-xs select-none"
    >
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Group Identity</div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-3">
          <span 
            class="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-200/50" 
            :style="{ backgroundColor: group?.color }"
          ></span>
          <h2 class="text-base font-bold text-slate-800 tracking-tight">{{ group?.name }}</h2>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400">
          <span>Type: <strong class="text-slate-600 uppercase">{{ group?.type }} Group</strong></span>
          <span class="text-slate-350">•</span>
          <span>Created: <strong class="text-slate-650">{{ createdDate }}</strong></span>
          <span class="text-slate-350">•</span>
          <span>Total Size: <strong class="text-slate-650 font-mono">{{ group?.members.length }} members</strong></span>
        </div>
      </div>
    </section>

    <!-- KPI Cards Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Members -->
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Members</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">
          {{ formatNum(group?.members.length || 0) }}
          <span class="text-[10px] text-slate-400 font-semibold lowercase">
            {{ group?.type === 'component' ? 'components' : 'files' }}
          </span>
        </div>
      </div>

      <!-- Lines of Code -->
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total LOC</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">
          {{ formatNum(totalLoc) }}
          <span class="text-[10px] text-slate-400 font-semibold">lines</span>
        </div>
      </div>

      <!-- Avg Code Health -->
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Avg Code Health</span>
        <div class="text-xl font-bold mt-1">
          <span v-if="avgHealth !== null" :class="healthBadgeClass(avgHealth)">
            {{ formatVal(avgHealth, 1) }} / 10
          </span>
          <span v-else class="text-slate-300 italic font-normal text-xs">N/A</span>
        </div>
      </div>

      <!-- Avg Hotspot Score -->
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs transition-all hover:shadow-2xs select-none">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Avg Hotspot Score</span>
        <div class="text-xl font-bold mt-1">
          <span v-if="avgHotspot !== null" :class="hotspotBadgeClass(avgHotspot)">
            {{ formatVal(avgHotspot, 3) }}
          </span>
          <span v-else class="text-slate-300 italic font-normal text-xs">N/A</span>
        </div>
      </div>
    </div>

    <!-- Members Table Section -->
    <section class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs flex flex-col gap-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
        <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Group Members Directory
        </div>
        
        <!-- Search bar -->
        <div class="relative w-full sm:w-64">
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Filter members..." 
            class="w-full bg-slate-50 border border-slate-200 focus:border-slate-350 focus:outline-none focus:ring-1 focus:ring-slate-350 text-[10.5px] font-semibold pl-8 pr-3 py-1.5 rounded-xl text-slate-700 placeholder-slate-400 transition-all shadow-3xs"
          />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
          </svg>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-slate-100 text-left text-[9px] font-black text-slate-400 uppercase tracking-wider select-none">
              <th class="pb-3 pl-2">Name</th>
              <th class="pb-3 text-right">LOC</th>
              <th class="pb-3 text-center">Health</th>
              <th class="pb-3 text-center">Hotspot</th>
              <th class="pb-3 pr-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr 
              v-for="m in filteredMembers" 
              :key="m.name"
              class="hover:bg-slate-50/30 transition-colors group"
            >
              <!-- Name & status -->
              <td class="py-3 pl-2">
                <div class="flex flex-col text-left">
                  <span class="text-[11px] font-bold text-slate-700 group-hover:text-slate-900 break-all font-mono leading-tight">
                    {{ m.displayName }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 truncate leading-tight font-mono mt-0.5" :title="m.name">
                    {{ m.name }}
                  </span>
                </div>
              </td>

              <!-- LOC -->
              <td class="py-3 text-right font-mono text-xs text-slate-700 font-semibold select-none">
                {{ m.found ? formatNum(m.loc) : '—' }}
              </td>

              <!-- Health -->
              <td class="py-3 text-center select-none">
                <span v-if="m.found && m.health !== null" :class="healthBadgeClass(m.health)" class="text-[9px] font-black">
                  {{ formatVal(m.health, 1) }}
                </span>
                <span v-else-if="!m.found" class="text-[8.5px] text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg select-none">
                  Missing
                </span>
                <span v-else class="text-slate-300 font-mono text-xs">—</span>
              </td>

              <!-- Hotspot -->
              <td class="py-3 text-center select-none">
                <span v-if="m.found && m.hotspot !== null" :class="hotspotBadgeClass(m.hotspot)" class="text-[9px] font-black">
                  {{ formatVal(m.hotspot, 3) }}
                </span>
                <span v-else class="text-slate-300 font-mono text-xs">—</span>
              </td>

              <!-- Action Link -->
              <td class="py-3 pr-2 text-right">
                <NuxtLink
                  v-if="m.found"
                  :to="m.link"
                  class="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600 hover:text-sky-800 transition-colors bg-sky-50 border border-sky-100/50 rounded-lg px-2.5 py-1 whitespace-nowrap"
                >
                  <span>Open</span>
                  <span>↗</span>
                </NuxtLink>
                <span v-else class="text-[9.5px] font-semibold text-slate-400 italic">Not found in dataset</span>
              </td>
            </tr>

            <tr v-if="filteredMembers.length === 0">
              <td colspan="5" class="py-8 text-center text-xs text-slate-400 italic">
                {{ group?.members.length === 0 ? 'No members in this group.' : 'No members match filter.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { useRoute } from "vue-router"
import { useGroupsStore } from "~/stores/groups"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const groupsStore = useGroupsStore()
const dataStore = useDataStore()

const id = computed(() => route.params.id as string)
const group = computed(() => groupsStore.getGroupById(id.value))

const searchQuery = ref('')

// Format creation date
const createdDate = computed(() => {
  if (!group.value?.createdAt) return '—'
  return new Date(group.value.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
})

// Retrieve detailed information and metrics for each member
const membersMetrics = computed(() => {
  if (!group.value || !dataStore.hasData) return []
  
  if (group.value.type === 'component') {
    return group.value.members.map(member => {
      const comp = dataStore.allComponentsIndex.get(member)
      return {
        name: member,
        displayName: dataStore.getComponentName(member),
        found: !!comp,
        loc: comp ? Number(comp.complexity__lines ?? comp.complexity__Lines ?? comp.Complexity__lines ?? comp.Complexity__Lines ?? 0) : 0,
        health: comp ? (comp.codesmells__code_health ?? comp.codesmells__Code_health ?? comp.Codesmells__code_health ?? null) : null,
        hotspot: comp ? (comp.codesmells__hotspot_score ?? comp.codesmells__Hotspot_score ?? comp.Codesmells__hotspot_score ?? null) : null,
        link: `/views/components/${member}`
      }
    })
  } else {
    // File group
    if (group.value.members.length === 0) return []
    const escapedNames = group.value.members.map(m => `'${m.replace(/'/g, "''")}'`).join(',')
    const filesList = dataStore.query<Record<string, any>>(
      `SELECT name, component, 
              COALESCE(complexity__lines, complexity__Lines, 0) as loc,
              COALESCE(codesmells__code_health, codesmells__Code_health, 0) as health,
              COALESCE(codesmells__hotspot_score, codesmells__Hotspot_score, 0) as hotspot
       FROM files WHERE name IN (${escapedNames})`
    )
    const fileMap = new Map(filesList.map(f => [f.name, f]))
    
    return group.value.members.map(member => {
      const file = fileMap.get(member)
      return {
        name: member,
        displayName: member.split('/').pop() || member,
        found: !!file,
        loc: file ? Number(file.loc) : 0,
        health: file ? Number(file.health) : null,
        hotspot: file ? Number(file.hotspot) : null,
        link: `/views/files/${member}`
      }
    })
  }
})

// Filter members by query
const filteredMembers = computed(() => {
  if (!searchQuery.value.trim()) return membersMetrics.value
  const q = searchQuery.value.trim().toLowerCase()
  return membersMetrics.value.filter(m => 
    m.name.toLowerCase().includes(q) || 
    m.displayName.toLowerCase().includes(q)
  )
})

// Aggregates computation
const totalLoc = computed(() => {
  return membersMetrics.value.reduce((acc, m) => acc + (m.loc || 0), 0)
})

const avgHealth = computed(() => {
  const valid = membersMetrics.value.filter(m => m.found && m.health !== null)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, m) => acc + Number(m.health), 0)
  return sum / valid.length
})

const avgHotspot = computed(() => {
  const valid = membersMetrics.value.filter(m => m.found && m.hotspot !== null)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, m) => acc + Number(m.hotspot), 0)
  return sum / valid.length
})

// Formatting Helpers
const formatNum = (val: number): string => {
  if (val === undefined || isNaN(val)) return '—'
  return val.toLocaleString()
}

const formatVal = (val: number, precision: number = 0): string => {
  if (val === undefined || isNaN(val) || val === null) return '—'
  return val.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
}

// Badge Classes
const healthBadgeClass = (val: number): string => {
  if (val >= 8) return 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/70 shadow-3xs'
  if (val >= 5) return 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100/70 shadow-3xs'
  return 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100/70 shadow-3xs'
}

const hotspotBadgeClass = (val: number): string => {
  if (val >= 0.7) return 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100/70 shadow-3xs'
  if (val >= 0.3) return 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100/70 shadow-3xs'
  return 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/70 shadow-3xs'
}
</script>
