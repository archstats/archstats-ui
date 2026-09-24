<template>
  <ViewWorkspaceLayout :queryable="false" title="Activity">
    <template #stats>
      <span v-if="effort.lede.value" class="min-w-0 truncate" :title="effort.lede.value">{{ effort.lede.value }}</span>
      <span v-if="effort.lede.value && age.lines" class="text-neutral-400">·</span>
      <span v-if="age.lines" :title="`Lines in files unchanged for more than 5 years: ${pct(age.over5)}; more than 1 year: ${pct(age.over1)}. Counted back to ${anchor}.`">
        Unchanged &gt; 2 y <span class="text-neutral-800">{{ pct(age.over2) }} of lines</span>
      </span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="Show">
        <button type="button" :aria-pressed="tab === 'commits'" @click="setTab('commits')">Commits</button>
        <button type="button" :aria-pressed="tab === 'effort'" title="Where changed lines went: low health, tangles, fix work" @click="setTab('effort')">Effort</button>
      </div>
    </template>
    <template #visualizer>
      <EmptyState
        v-if="store.hasData && !store.hasView('git_commits')"
        title="No git history in this snapshot"
        text="Scan a git checkout to see commits by month and by author."
        icon="git-branch"
      />
      <EffortShare v-else-if="tab === 'effort'"/>
      <CommitHistory v-else :where="where" monthly :empty-text="scoped ? 'No commits touch the files in scope.' : 'No git history in this snapshot.'"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { ageShares, useCodeAge } from "~/composables/useCodeAge"
import { anchorLabel } from "~/utils/history"
import { scopeWhere } from "~/utils/scopeSql"
import CommitHistory from "~/components/git/CommitHistory.vue"
import EffortShare from "~/components/git/EffortShare.vue"
import { useEffort } from "~/composables/useEffort"
import { useRoute, useRouter } from "vue-router"
import EmptyState from "~/components/ui/common/EmptyState.vue"

const store = useDataStore()
const route = useRoute()
const router = useRouter()
const tab = computed(() => (route.query.tab === "effort" ? "effort" : "commits"))
function setTab(t: "commits" | "effort") {
  const query: Record<string, any> = { ...route.query }
  if (t === "effort") query.tab = "effort"; else delete query.tab
  delete query.commit
  void router.replace({ query })
}
// The summary line carries the effort sentence on both tabs.
const effort = useEffort()
// History of the files in scope, when a scope is set.
const scoped = computed(() => !!scopeWhere())
const where = computed(() => ["file IN (SELECT name FROM files)", scopeWhere()].filter(Boolean).join(" AND "))

// How much of the code has sat still: one number, file-grained, beside the history.
const codeAge = useCodeAge()
const { data: lines } = useAsyncQuery<Array<{ name: string; lines: number }>>(
  () => (codeAge.available.value ? store.query("SELECT name, coalesce(complexity__lines, 0) AS lines FROM files") : Promise.resolve([])),
  [() => store.datasetKey],
  { initial: [] },
)
const age = computed(() => ageShares(lines.value.map(f => ({ lines: f.lines, days: codeAge.byFile.value.get(f.name) }))))
const pct = (v: number) => `${Math.round(v * 100)}%`
const anchor = computed(() => anchorLabel(0).replace(/^Last 0 days to /, ""))
</script>
