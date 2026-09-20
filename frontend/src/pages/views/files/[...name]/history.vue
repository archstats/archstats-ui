<template>
  <CommitHistory :where="`file = ${escapedPath}`" empty-text="This file has no commits in the snapshot."/>
</template>

<script setup lang="ts">
import CommitHistory from "~/components/git/CommitHistory.vue"
import { useFileRoute } from "~/composables/useFileRoute"

const { escapedPath } = useFileRoute()
</script>
