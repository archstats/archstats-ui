<template>
  <DetailFrame
    :title="name"
    kind="Author"
    :crumbs="[{ label: 'Authors', to: '/views/git/authors' }]"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/git/authors"
  >
    <template #actions>
      <span v-if="author?.author_email" class="ui-toolbar-meta hidden max-w-[260px] truncate xl:inline" :title="author.author_email">{{ author.author_email }}</span>
    </template>
    <LoadingState v-if="loading" text="Reading author…"/>
    <EmptyState v-else-if="error" title="Could not read author" :text="error" icon="alert"/>
    <EmptyState v-else-if="store.hasData && !author" title="Author not in this snapshot" :text="`${name} has no commits in the open scan.`" icon="user">
      <router-link to="/views/git/authors" class="ui-btn ui-btn-sm">All authors</router-link>
    </EmptyState>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { sqlLiteral } from "~/utils/sql"
import { formatNumber } from "~/utils/format"
import DetailFrame, { type DetailTab } from "~/components/detail/DetailFrame.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"

const route = useRoute()
const store = useDataStore()

// Callers encode the name; vue-router hands it back decoded.
const name = computed(() => String(route.params.name ?? ""))

const { data: author, loading, error } = useAsyncQuery<Record<string, any> | null>(
  async () => {
    const rows = await store.query<Record<string, any>>(
      `SELECT * FROM git_authors WHERE author_name = ${sqlLiteral(name.value)} LIMIT 1`,
    )
    return rows[0] ?? null
  },
  [name],
  { initial: null },
)

function metric(key: string): number {
  return Number(author.value?.[key]) || 0
}

const stats = computed(() => {
  if (!author.value) return []
  return [
    { label: "Commits", value: formatNumber(metric("git__commits__total")) },
    { label: "Files", value: formatNumber(metric("git__unique_file_changes__total")) },
    { label: "Components", value: formatNumber(metric("git__unique_component_changes__total")) },
  ]
})

const tabs = computed<DetailTab[]>(() => {
  const base = `/views/git/authors/${encodeURIComponent(name.value)}`
  return [
    { id: "overview", label: "Overview", to: base, exact: true },
    { id: "components", label: "Components", to: `${base}/components`, count: metric("git__unique_component_changes__total") || undefined },
    { id: "files", label: "Files", to: `${base}/files`, count: metric("git__unique_file_changes__total") || undefined },
    { id: "history", label: "History", to: `${base}/history` },
  ]
})
</script>
