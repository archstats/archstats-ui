<template>
  <DetailFrame
    :title="authorsStore.display(name)"
    kind="Author"
    :crumbs="[{ label: t('pages.gitAuthors.authors'), to: '/views/git/authors' }]"
    :stats="stats"
    :tabs="tabs"
    fallback="/views/git/authors"
  >
    <template #actions>
      <span v-if="authorsStore.displayEmail(author?.author_email)" class="ui-toolbar-meta hidden max-w-[260px] truncate xl:inline" :title="author?.author_email">{{ author?.author_email }}</span>
    </template>
    <LoadingState v-if="loading" :text="t('pages.gitAuthors.readingAuthor')"/>
    <EmptyState v-else-if="error" :title="t('pages.gitAuthors.couldNotReadAuthor')" :text="error" icon="alert"/>
    <EmptyState v-else-if="store.hasData && !author" :title="t('pages.gitAuthors.authorNotSnapshot')" :text="t('pages.gitAuthors.hasNoCommitsOpen', { name: authorsStore.display(name) })" icon="user">
      <router-link to="/views/git/authors" class="ui-btn ui-btn-sm">{{ t('pages.gitAuthors.allAuthors') }}</router-link>
    </EmptyState>
    <NuxtPage v-else/>
  </DetailFrame>
</template>

<script setup lang="ts">
import { anchorSql } from "~/features/git/history"
import { authorNamesSql, authorStatsSql, periodStats } from "~/features/git/authors"
import { useAuthorsStore } from "~/features/git/authors.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { computed, watch } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { sqlLiteral } from "~/shared/sql"
import { formatNumber } from "~/shared/format"
import DetailFrame, { type DetailTab } from "~/features/shell/components/DetailFrame.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"

const route = useRoute()
const store = useDataStore()

// Callers encode the name; vue-router hands it back decoded. Pseudonymised,
// the route carries "Author N" and the store turns it back into the author.
const authorsStore = useAuthorsStore()
const name = computed(() => authorsStore.resolve(String(route.params.name ?? "")))
const workspaces = useWorkspacesStore()
watch(() => workspaces.active?.id, (id) => { if (id) authorsStore.load(id) }, { immediate: true })

const { data: author, loading, error } = useAsyncQuery<Record<string, any> | null>(
  async () => {
    const rows = await store.query<Record<string, any>>(authorStatsSql(authorNamesSql(authorsStore.aliases, name.value), { aliases: authorsStore.aliases, includeBots: true, anchor: anchorSql() }))
    return rows[0] ?? null
  },
  [name, () => authorsStore.aliases],
  { initial: null },
)

const total = computed(() => periodStats(author.value, "total"))

const stats = computed(() => {
  if (!author.value) return []
  return [
    { label: t("pages.gitAuthors.commits"), value: formatNumber(total.value.commits) },
    { label: t("pages.gitAuthors.files"), value: formatNumber(total.value.files) },
    { label: t("pages.gitAuthors.components"), value: formatNumber(total.value.components) },
  ]
})

const tabs = computed<DetailTab[]>(() => {
  const base = authorsStore.authorPath(name.value)
  return [
    { id: "overview", label: t("pages.gitAuthors.overview"), to: base, exact: true },
    { id: "components", label: t("pages.gitAuthors.components"), to: `${base}/components`, count: total.value.components || undefined },
    { id: "files", label: t("pages.gitAuthors.files"), to: `${base}/files`, count: total.value.files || undefined },
    { id: "history", label: t("pages.gitAuthors.history"), to: `${base}/history` },
  ]
})
</script>
