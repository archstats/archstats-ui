<template>
  <div class="flex flex-col gap-6">
    <!-- Summary Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 select-none">
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Outgoing Imports</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">{{ outgoingImports.length }}</div>
      </div>
      <div class="bg-white border border-slate-150 rounded-3xl p-5 shadow-3xs">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Incoming References</span>
        <div class="text-xl font-bold text-slate-800 mt-1 font-mono">{{ incomingRefs.length }}</div>
      </div>
    </div>

    <!-- Outgoing Imports Table -->
    <section class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs">
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 select-none">
        What this file imports
      </div>
      <div v-if="outgoingImports.length === 0" class="text-slate-400 italic text-sm py-8 text-center select-none">
        No outgoing imports found.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-slate-700 text-xs">
          <thead>
            <tr class="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-wider select-none">
              <th class="pb-2 pr-4">Target</th>
              <th class="pb-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="imp in outgoingImports" 
              :key="imp.target" 
              class="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
            >
              <td class="py-2.5 pr-4">
                <span class="text-[10.5px] font-bold text-slate-700 font-mono break-all">{{ imp.target }}</span>
              </td>
              <td class="py-2.5 text-right font-mono font-bold text-slate-800 select-none">
                {{ imp.count }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Incoming References Table -->
    <section class="bg-white border border-slate-150 rounded-3xl p-6 shadow-3xs">
      <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 select-none">
        Who references this file
      </div>
      <div v-if="incomingRefs.length === 0" class="text-slate-400 italic text-sm py-8 text-center select-none">
        No incoming references found.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-slate-700 text-xs">
          <thead>
            <tr class="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-wider select-none">
              <th class="pb-2 pr-4">Source File</th>
              <th class="pb-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="ref in incomingRefs" 
              :key="ref.source" 
              class="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
            >
              <td class="py-2.5 pr-4">
                <NuxtLink 
                  :to="`/views/files/${ref.source}`"
                  class="text-[10.5px] font-bold text-violet-600 hover:text-violet-850 font-mono break-all transition-colors"
                >
                  {{ ref.source }}
                </NuxtLink>
              </td>
              <td class="py-2.5 text-right font-mono font-bold text-slate-800 select-none">
                {{ ref.count }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const store = useDataStore()

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

// ── Imports Data ───────────────────────────────────────────────
const outgoingImports = computed(() => {
  if (!store.hasData) return []
  return store.query<{ target: string; count: number }>(
    `SELECT content as target, count(*) as count FROM snippets WHERE file = '${escapedPath.value}' AND snippet_type LIKE '%import%' GROUP BY content ORDER BY count DESC`
  )
})

const incomingRefs = computed(() => {
  if (!store.hasData) return []
  const basename = fileBasename.value.replace(/'/g, "''")
  return store.query<{ source: string; count: number }>(
    `SELECT file as source, count(*) as count FROM snippets WHERE content LIKE '%${basename}%' AND snippet_type LIKE '%import%' AND file != '${escapedPath.value}' GROUP BY file ORDER BY count DESC`
  )
})
</script>
