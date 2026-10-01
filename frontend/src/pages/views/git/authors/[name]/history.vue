<template>
  <CommitHistory :where="authorNamesSql(authorsStore.aliases, name)" include-bots :empty-text="t('pages.gitAuthorsHistory.noCommitsRecordedAuthor')"/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { authorNamesSql } from "~/features/git/authors"
import { useAuthorsStore } from "~/features/git/authors.store"
import CommitHistory from "~/features/git/components/CommitHistory.vue"
import { t } from "~/shared/i18n"

const route = useRoute()
const name = computed(() => useAuthorsStore().resolve(String(route.params.name ?? "")))
const authorsStore = useAuthorsStore()
</script>
