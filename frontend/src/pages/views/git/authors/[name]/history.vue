<template>
  <CommitHistory :where="authorNamesSql(authorsStore.aliases, name)" include-bots empty-text="No commits recorded for this author."/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { authorNamesSql } from "~/utils/authors"
import { useAuthorsStore } from "~/stores/authors"
import CommitHistory from "~/components/git/CommitHistory.vue"

const route = useRoute()
const name = computed(() => String(route.params.name ?? ""))
const authorsStore = useAuthorsStore()
</script>
