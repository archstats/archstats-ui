<template>
  <CommitHistory :where="`component = ${sqlLiteral(name)}`" empty-text="No commits touch this component in the snapshot."/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { sqlLiteral } from "~/shared/sql"
import CommitHistory from "~/features/git/components/CommitHistory.vue"

const route = useRoute()
const name = computed(() => String(route.params.name ?? ""))
</script>
