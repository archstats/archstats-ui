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
import { authorNamesSql, authorStatsSql, periodStats } from "~/utils/authors"
import { useAuthorsStore } from "~/stores/authors"
import { useWorkspacesStore } from "~/stores/workspaces"
import { computed, watch } from "vue"
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
const authorsStore = useAuthorsStore()
const workspaces = useWorkspacesStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })

const { data: author, loading, error } = useAsyncQuery<Record<string, any> | null>(
  async () => {
    const rows = await store.query<Record<string, any>>(authorStatsSql(authorNamesSql(authorsStore.aliases, name.value), { aliases: authorsStore.aliases, includeBots: true }))
    return rows[0] ?? null
  },
  [name, () => authorsStore.aliases],
  { initial: null },
)

const total = computed(() => periodStats(author.value, "total"))

const stats = computed(() => {
  if (!author.value) return []
  return [
    { label: "Commits", value: formatNumber(total.value.commits) },
    { label: "Files", value: formatNumber(total.value.files) },
    { label: "Components", value: formatNumber(total.value.components) },
  ]
})

const tabs = computed<DetailTab[]>(() => {
  const base = `/views/git/authors/${encodeURIComponent(name.value)}`
  return [
    { id: "overview", label: "Overview", to: base, exact: true },
    { id: "components", label: "Components", to: `${base}/components`, count: total.value.components || undefined },
    { id: "files", label: "Files", to: `${base}/files`, count: total.value.files || undefined },
    { id: "history", label: "History", to: `${base}/history` },
  ]
})
</script>
