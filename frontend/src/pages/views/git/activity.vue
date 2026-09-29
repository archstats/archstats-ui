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
        <button v-for="t in TABS" :key="t.id" type="button" :aria-pressed="tab === t.id" :title="t.title" @click="setTab(t.id)">{{ t.label }}</button>
      </div>
    </template>
    <template #visualizer>
      <EmptyState
        v-if="store.hasData && !store.hasView('git_commits')"
        title="No git history in this snapshot"
        text="Scan a git checkout to see commits by month and by author."
        icon="git-branch"
      />
      <WorkNow v-else-if="tab === 'now'"/>
      <ChangeBreadth v-else-if="tab === 'breadth'"/>
      <EffortShare v-else-if="tab === 'effort'"/>
      <CommitHistory v-else :where="where" monthly :empty-text="scoped ? 'No commits touch the files in scope.' : 'No git history in this snapshot.'"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { ageShares, useCodeAge } from "~/features/git/useCodeAge"
import { anchorLabel } from "~/features/git/history"
import { scopeWhere } from "~/features/groups/scopeSql"
import CommitHistory from "~/features/git/components/CommitHistory.vue"
import EffortShare from "~/features/git/components/EffortShare.vue"
import WorkNow from "~/features/git/components/WorkNow.vue"
import ChangeBreadth from "~/features/git/components/ChangeBreadth.vue"
import { useEffort } from "~/features/git/useEffort"
import { useRoute, useRouter } from "vue-router"
import EmptyState from "~/shared/ui/EmptyState.vue"

const store = useDataStore()
const route = useRoute()
const router = useRouter()
// Work now opens: where the changed lines are going, against before. Breadth
// asks whether changes are getting wider; Effort what kind of code they land
// on; Commits is the history itself.
const TABS = [
  { id: "now", label: "Work now", title: "Where the changed lines went recently, against the two years before" },
  { id: "breadth", label: "Breadth", title: "How many components a commit touches, and whether that is growing" },
  { id: "effort", label: "Effort", title: "Where changed lines went: low health, tangles, fix work" },
  { id: "commits", label: "Commits", title: "Every commit, by month" },
] as const
type TabId = (typeof TABS)[number]["id"]
const tab = computed<TabId>(() => (TABS.some(t => t.id === route.query.tab) ? route.query.tab as TabId : "now"))
function setTab(t: TabId) {
  const query: Record<string, any> = { ...route.query }
  if (t !== "now") query.tab = t; else delete query.tab
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
