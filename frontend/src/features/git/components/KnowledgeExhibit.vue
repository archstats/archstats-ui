<template>
  <!-- Who still knows each part: the Authors view's knowledge map over given rows. -->
  <KnowledgeMap
      v-model:at="at"
      :tree="tree"
      :selected="selected"
      :focused="null"
      :only="null"
      :matching="null"
      :window-words="windowWords"
      @pick="(c: string) => $emit('pick', `component:${c}`)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { knowledgeTree, type KnowledgeRow } from "~/features/git/knowledgeLeft"
import KnowledgeMap from "./KnowledgeMap.vue"

const props = withDefaults(defineProps<{
  rows: Array<{ component: string; lines: number; state: string; hereShare: number; hereCommits: number; ask: string | null; main: string | null }>
  windowWords: string
  highlight?: string[]
}>(), { highlight: () => [] })
defineEmits<{ (e: "pick", element: string): void }>()

const at = ref("")
const selected = computed(() => new Set(props.highlight.filter(h => h.startsWith("component:")).map(h => h.slice(10))))
const tree = computed(() => {
  const holder = (author: string | null) => (author ? { author, added: 0, share: 0, recent: 0, last: "", idle: 0, here: true } : null)
  const rows: KnowledgeRow[] = props.rows.map(r => ({ component: r.component, lines: r.lines, added: r.lines, state: r.state as KnowledgeRow["state"], hereShare: r.hereShare, hereCommits: r.hereCommits, ask: holder(r.ask), holders: [], main: holder(r.main) }))
  return knowledgeTree(rows)
})
</script>
