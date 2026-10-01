<template>
  <CommitHistory :where="`file = ${escapedPath}`" :empty-text="t('pages.filesHistory.fileHasNoCommits')"/>
</template>

<script setup lang="ts">
import CommitHistory from "~/features/git/components/CommitHistory.vue"
import { useFileRoute } from "~/features/files/useFileRoute"
import { t } from "~/shared/i18n"

const { escapedPath } = useFileRoute()
</script>
