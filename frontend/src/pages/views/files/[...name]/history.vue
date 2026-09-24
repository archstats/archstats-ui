<template>
  <CommitHistory :where="`file = ${escapedPath}`" empty-text="This file has no commits in the snapshot."/>
</template>

<script setup lang="ts">
import CommitHistory from "~/features/git/components/CommitHistory.vue"
import { useFileRoute } from "~/features/files/useFileRoute"

const { escapedPath } = useFileRoute()
</script>
