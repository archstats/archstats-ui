<template>
  <div class="text-archstats-400">
    <div class="whitespace-nowrap inline">
      Both components share <LongHover class="inline" ><span class="text-archstats-900 cursor-pointer underline underline-offset-3">{{
        pairData.shared_commits
      }}</span>
      <template #hovered-content>
        <div class="absolute bg-gray-100 border border-archstats-100 p-4  z-30 rounded shadow">
          <div class="max-h-40 overflow-y-scroll">
            <GitSharedCommits :from="from" :to="to"></GitSharedCommits>
          </div>
        </div>
      </template>
    </LongHover> commits across the
      observed git log.
    </div>

    <ul class="mt-2 list-disc ml-4" v-if="pairData.shared_commits">
      <li class="whitespace-nowrap"><span
          class="text-archstats-900">{{ round(pairData.percentage_of_all_commits_pair_1, 2) }}%</span> of all commits
        including
        <span class="font-mono text-archstats-900">{{ from }}</span> also include <span
            class="font-mono text-archstats-900">{{ to }}</span>.
      </li>
      <li class="whitespace-nowrap"><span
          class="text-archstats-900">{{ round(pairData.percentage_of_all_commits_pair_2, 2) }}%</span> of all commits
        including
        <span class="font-mono text-archstats-900">{{ to }}</span> also include <span
            class="font-mono text-archstats-900">{{ from }}</span>.
      </li>
    </ul>

  </div>
</template>

<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import {computed} from "vue";
import {round} from "~/utils/text";
import GitSharedCommits from "~/components/components/coupling/git/GitSharedCommits.vue";
import LongHover from "~/components/ui/common/LongHover.vue";

const props = defineProps<{
  from: string,
  to: string
}>()

const store = useDataStore();

const pairData = computed(() => {
  const results = store.query(`
    SELECT *
    FROM git_component_shared_commits
    WHERE "pair_1" = '${props.from}'
      AND "pair_2" = '${props.to}'
  `) as {
    pair_1: string,
    pair_2: string,
    shared_commits: number
    percentage_of_all_commits_pair_1: number
    percentage_of_all_commits_pair_2: number
    [key: string]: number | string
  }[]
  return results[0]
})

const dayBuckets = computed(() => {
  // shared_commits:last_x_days
  Object.keys(pairData.value)
      .filter(k => k.startsWith("shared_commits:last_"))
      .map(k => {
        const days = parseInt(k.split(":")[1])
        return {
          days,
          commits: pairData.value[k]
        }
      })
      .reduce((acc, curr) => {
        acc[curr.days] = curr.commits
        return acc
      }, {} as { [key: number]: number })

})
</script>