<template>
  <!-- How often the file changed, and who changed it, from the snapshot's git rows. -->
  <div class="flex flex-col gap-1 text-sm text-neutral-700">
    <p v-if="!available">{{ t('cicd.inspector.historyNone') }}</p>
    <template v-else-if="history">
      <p>{{ history.changes ? t('cicd.inspector.historyYear', { count: history.changes }) : t('cicd.inspector.historyNever') }}</p>
      <p v-if="history.last">{{ t('cicd.inspector.historyLast', { date: history.last.slice(0, 10) }) }}</p>
      <p v-if="history.authors.length">{{ t('cicd.inspector.historyBy', { names: listOf(history.authors.map(a => authors.display(a))) }) }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAuthorsStore } from "~/features/git/authors.store"
import { anchorSql } from "~/features/git/history"
import { historySql, readHistory, type FileHistory } from "../history"
import { listOf, t } from "~/shared/i18n"

const props = defineProps<{ file: string }>()
const data = useDataStore()
const authors = useAuthorsStore()
const history = ref<FileHistory | null>(null)
const available = computed(() => data.hasView("git_commits"))

watch(() => [props.file, data.datasetKey] as const, async () => {
  history.value = null
  if (!props.file || !available.value) return
  const rows = await data.query<{ changes: number; last: string | null; authors: string | null }>(historySql(props.file, anchorSql()))
  history.value = readHistory(rows[0])
}, { immediate: true })
</script>
