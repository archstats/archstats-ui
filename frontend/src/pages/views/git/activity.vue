<template>
  <ViewWorkspaceLayout :queryable="false" title="Activity">
    <template #stats>
      <span v-if="age.lines" :title="`Lines in files unchanged for more than 5 years: ${pct(age.over5)}; more than 1 year: ${pct(age.over1)}. Counted back to ${anchor}.`">
        Unchanged &gt; 2 y <span class="text-neutral-800">{{ pct(age.over2) }} of lines</span>
      </span>
    </template>
    <template #visualizer>
      <EmptyState
        v-if="store.hasData && !store.hasView('git_commits')"
        title="No git history in this snapshot"
        text="Scan a git checkout to see commits by month and by author."
        icon="git-branch"
      />
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
import EmptyState from "~/components/ui/common/EmptyState.vue"

const store = useDataStore()
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
