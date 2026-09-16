<template>
  <div v-if="commitsInCommon.length === 0" class="text-center py-6 text-slate-400 italic text-[10px]">
    No shared commits found.
  </div>
  <div v-else class="flex flex-col divide-y divide-slate-100/60 bg-white">
    <div 
      v-for="(commit, idx) in commitsInCommon" 
      :key="commit.commit_hash"
      class="p-2.5 hover:bg-slate-50/45 transition-all flex items-start gap-3 text-left min-w-0"
    >
      <!-- Commit Icon (Git node) -->
      <div class="text-slate-400 shrink-0 mt-0.5 select-none">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m0 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </svg>
      </div>

      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <!-- Message -->
        <span class="text-[10px] font-semibold text-slate-755 leading-normal break-words">
          {{ commit.commit_message }}
        </span>
        <!-- Hash & Meta -->
        <div class="flex items-center gap-2 mt-0.5">
          <span class="font-mono text-[8.5px] text-slate-500 bg-slate-100 border border-slate-200/40 px-1.5 py-0.2 rounded shadow-4xs select-all">
            {{ commit.commit_hash.substring(0, 8) }}
          </span>
          <span class="text-[8px] font-medium text-slate-400 select-none">
            • {{ relativeTimes[idx] }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDataStore } from "~/stores/data"
import { timeFromNow } from "~/utils/date"
import { computed, ref, watch } from "vue"

const store = useDataStore()
const props = defineProps<{
  from: string
  to: string
}>()

type Commit = {
  commit_hash: string
  commit_message: string
  commit_time: string
}

const commitsInCommon = ref<Commit[]>([])
watch(
  () => [props.from, props.to] as const,
  async ([from, to]) => {
    if (!from || !to) {
      commitsInCommon.value = []
      return
    }
    try {
      commitsInCommon.value = await store.query(`
        WITH commits_in_common AS (
          SELECT commit_hash, commit_message, commit_time
          FROM git_commits
          WHERE component = '${from.replace(/'/g, "''")}'
          INTERSECT
          SELECT commit_hash, commit_message, commit_time
          FROM git_commits
          WHERE component = '${to.replace(/'/g, "''")}'
        )
        SELECT *
        FROM commits_in_common
        ORDER BY commit_time DESC;
      `) as Commit[]
    } catch (e) {
      console.error("Failed to query shared commits in GitSharedCommits:", e)
      commitsInCommon.value = []
    }
  },
  { immediate: true }
)

const relativeTimes = computed(() => {
  return commitsInCommon.value.map(commit => timeFromNow(commit.commit_time))
})
</script>