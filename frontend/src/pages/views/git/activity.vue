<template>
  <ViewWorkspaceLayout :queryable="false" title="Activity">
    <template #visualizer>
      <EmptyState
        v-if="store.hasData && !store.hasView('git_commits')"
        title="No git history in this snapshot"
        text="Scan a git checkout to see commits by month and by author."
        icon="git-branch"
      />
      <CommitHistory v-else where="file IN (SELECT name FROM files)" monthly empty-text="No git history in this snapshot."/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { useDataStore } from "~/stores/data"
import CommitHistory from "~/components/git/CommitHistory.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"

const store = useDataStore()
</script>
