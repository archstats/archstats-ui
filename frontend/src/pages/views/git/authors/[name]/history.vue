<template>
  <CommitHistory :where="`author_name = ${sqlLiteral(name)}`" empty-text="No commits recorded for this author."/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { sqlLiteral } from "~/utils/sql"
import CommitHistory from "~/components/git/CommitHistory.vue"

const route = useRoute()
const name = computed(() => String(route.params.name ?? ""))
</script>
