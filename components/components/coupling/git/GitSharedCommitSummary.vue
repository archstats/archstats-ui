<template>
  <div v-if="pairData" class="flex flex-col gap-5 text-slate-655">
    <!-- Summary Card -->
    <div class="bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-4 flex items-center gap-3.5 shadow-4xs">
      <div class="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0 select-none">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
      <div class="text-left text-[11px] leading-relaxed text-slate-500 font-semibold">
        Both components co-occur in <span class="font-black text-indigo-650">{{ pairData.shared_commits }} shared commit{{ pairData.shared_commits === 1 ? '' : 's' }}</span> across the observed git commit log history.
      </div>
    </div>

    <!-- Visual Coupling Progress bars -->
    <div v-if="pairData.shared_commits" class="flex flex-col gap-5">
      <h5 class="text-[8.5px] font-black text-slate-400 uppercase tracking-widest select-none border-b border-slate-100 pb-1.5 text-left">
        Co-change Probability Analysis
      </h5>
      
      <!-- Progress Bar 1: Pair 1 -->
      <div class="flex flex-col gap-2 text-left">
        <div class="flex justify-between items-center text-[10px] font-bold text-slate-655 flex-wrap gap-2">
          <span class="leading-relaxed">
            Of commits modifying <span class="font-mono font-black text-slate-800" :title="from">{{ diffNames.fromShort }}</span>:
          </span>
          <span class="font-mono font-black text-indigo-700 bg-indigo-50 border border-indigo-100/40 px-2 py-0.5 rounded text-[9px] shadow-4xs">
            {{ round(pairData.percentage_of_all_commits_pair_1 || 0, 2) }}% co-change rate
          </span>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/20">
          <div 
            class="bg-indigo-600 h-full rounded-full transition-all duration-500 shadow-3xs"
            :style="{ width: `${pairData.percentage_of_all_commits_pair_1}%` }"
          ></div>
        </div>
        <p class="text-[8.5px] text-slate-400 leading-normal break-words">
          Also include modifications to target: <span class="font-mono font-bold text-slate-600" :title="to">{{ diffNames.toShort }}</span>
          <span class="font-mono text-[8px] text-slate-355 ml-1">({{ to }})</span>
        </p>
      </div>

      <!-- Progress Bar 2: Pair 2 -->
      <div class="flex flex-col gap-2 text-left">
        <div class="flex justify-between items-center text-[10px] font-bold text-slate-655 flex-wrap gap-2">
          <span class="leading-relaxed">
            Of commits modifying <span class="font-mono font-black text-slate-800" :title="to">{{ diffNames.toShort }}</span>:
          </span>
          <span class="font-mono font-black text-sky-700 bg-sky-50 border border-sky-100/40 px-2 py-0.5 rounded text-[9px] shadow-4xs">
            {{ round(pairData.percentage_of_all_commits_pair_2 || 0, 2) }}% co-change rate
          </span>
        </div>
        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/20">
          <div 
            class="bg-sky-500 h-full rounded-full transition-all duration-500 shadow-3xs"
            :style="{ width: `${pairData.percentage_of_all_commits_pair_2}%` }"
          ></div>
        </div>
        <p class="text-[8.5px] text-slate-400 leading-normal break-words">
          Also include modifications to source: <span class="font-mono font-bold text-slate-600" :title="from">{{ diffNames.fromShort }}</span>
          <span class="font-mono text-[8px] text-slate-355 ml-1">({{ from }})</span>
        </p>
      </div>
    </div>

    <!-- Shared Commits List Section -->
    <div v-if="pairData.shared_commits" class="flex flex-col gap-2.5 mt-2">
      <h5 class="text-[8.5px] font-black text-slate-400 uppercase tracking-widest select-none border-b border-slate-100 pb-1.5 text-left">
        Shared Commits History
      </h5>
      <div class="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-3xs">
        <div class="max-h-48 overflow-y-auto scroll-container">
          <GitSharedCommits :from="from" :to="to" />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="text-slate-400 italic text-[10px] text-center py-6">
    No shared commit coupling data found for this pair.
  </div>
</template>

<script setup lang="ts">
import { useDataStore } from "~/stores/data"
import { computed, ref, watch } from "vue"
import { round } from "~/utils/text"
import GitSharedCommits from "~/components/components/coupling/git/GitSharedCommits.vue"

const props = defineProps<{
  from: string
  to: string
}>()

const store = useDataStore()

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
  return getDifferentiatedNames(props.from, props.to)
})

const pairData = ref<{
  pair_1: string,
  pair_2: string,
  shared_commits: number
  percentage_of_all_commits_pair_1: number
  percentage_of_all_commits_pair_2: number
  [key: string]: number | string
} | null>(null)
watch(
  () => [props.from, props.to] as const,
  async ([from, to]) => {
    if (!from || !to) {
      pairData.value = null
      return
    }
    try {
      const results = await store.query(`
        SELECT *
        FROM git_component_shared_commits
        WHERE "pair_1" = '${from.replace(/'/g, "''")}'
          AND "pair_2" = '${to.replace(/'/g, "''")}'
      `) as {
        pair_1: string,
        pair_2: string,
        shared_commits: number
        percentage_of_all_commits_pair_1: number
        percentage_of_all_commits_pair_2: number
        [key: string]: number | string
      }[]
      pairData.value = results.length > 0 ? results[0] : null
    } catch {
      pairData.value = null
    }
  },
  { immediate: true }
)
</script>