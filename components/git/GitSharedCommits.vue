<template>
  <ul>
    <li v-for="(commit, idx) in commitsInCommon">
      <div class="inline-flex gap-3 whitespace-nowrap">
        <span class="font-mono text-archstats-400 text-xs ">{{ commit.commit_hash }}</span>
        <span class="text-archstats-900">{{ commit.commit_message }}</span>

        <span class="text-archstats-400">{{ relativeTimes[idx] }}</span>
      </div>
    </li>
  </ul>

</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import {timeFromNow} from "~/utils/date";

const store = useDataStore();
const props = defineProps<{
  from: string,
  to: string,
}>()

type Commit = {
  commit_hash: string,
  commit_message: string,
  commit_time: string
}
const commitsInCommon = computed(() => {
  return store.query(`
    with commits_in_common as (select commit_hash, commit_message, commit_time
                               from git_commits
                               where component = '${props.from}'
                               intersect
                               select commit_hash, commit_message, commit_time
                               from git_commits
                               where component = '${props.to}')
    select *
    from commits_in_common
    order by commit_time desc;
  `) as Commit[]
})

const relativeTimes = computed(()=>{
  return commitsInCommon.value.map(commit => timeFromNow(commit.commit_time));
})
</script>