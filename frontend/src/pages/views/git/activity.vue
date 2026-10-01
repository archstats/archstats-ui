<template>
  <ViewWorkspaceLayout :queryable="false" :title="t('pages.gitActivity.activity')">
    <template #stats>
      <span v-if="effort.lede.value" class="min-w-0 truncate" :title="effort.lede.value">{{ effort.lede.value }}</span>
      <span v-if="effort.lede.value && age.lines" class="text-neutral-400">·</span>
      <span v-if="age.lines" :title="t('pages.gitActivity.linesFilesUnchangedMore', { over5: pct(age.over5), over1: pct(age.over1), anchor })">
{{ t('pages.gitActivity.unchanged2Y') }} <span class="text-neutral-800">{{ t('pages.gitActivity.lines', { over2: pct(age.over2) }) }}</span>
      </span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.gitActivity.show')">
        <button v-for="TABS in TABS" :key="TABS.id" type="button" :aria-pressed="tab === TABS.id" :title="TABS.title" @click="setTab(TABS.id)">{{ TABS.label }}</button>
      </div>
    </template>
    <template #visualizer>
      <EmptyState
        v-if="store.hasData && !store.hasView('git_commits')"
        :title="t('pages.gitActivity.noGitHistorySnapshot')"
        :text="t('pages.gitActivity.scanGitCheckoutSee')"
        icon="git-branch"
      />
      <WorkNow v-else-if="tab === 'now'"/>
      <ChangeBreadth v-else-if="tab === 'breadth'"/>
      <EffortShare v-else-if="tab === 'effort'"/>
      <CommitHistory v-else :where="where" monthly :empty-text="scoped ? t('pages.gitActivity.noCommitsTouchFiles') : t('pages.gitActivity.noGitHistorySnapshot2')"/>
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
import { t } from "~/shared/i18n"

const store = useDataStore()
const route = useRoute()
const router = useRouter()
// Work now opens: where the changed lines are going, against before. Breadth
// asks whether changes are getting wider; Effort what kind of code they land
// on; Commits is the history itself.
const TABS = [
  { id: "now", label: t("pages.gitActivity.workNow"), title: t("pages.gitActivity.whereChangedLinesWent") },
  { id: "breadth", label: t("pages.gitActivity.breadth"), title: t("pages.gitActivity.howManyComponentsCommit") },
  { id: "effort", label: t("pages.gitActivity.effort"), title: t("pages.gitActivity.whereChangedLinesWent2") },
  { id: "commits", label: t("pages.gitActivity.commits"), title: t("pages.gitActivity.everyCommitMonth") },
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
