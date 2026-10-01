<template>
  <!-- The layers: the Units view's stack diagram. -->
  <div v-if="e.kind === 'layers'">
    <StackDiagram
        :floors="e.floors"
        :flows="e.flows"
        :selected="stackSel"
        :up-label="t('ask.evFigures.pointsBackUp')"
        :ariaLabel="e.title"
        @select="(s: any) => (stackSel = s)"
    />
    <p class="ev-note">{{ t('ask.evFigures.floorsBandsRunDownward', { grouping: e.grouping }) }}</p>
    <p v-if="stackSel?.kind === 'floor'" class="ev-note"><button type="button" class="ev-link" @click="$emit('ask', t('ask.evFigures.whatWhatDoesDepend', { stackSelId: stackSel.id }))">{{ t('ask.evFigures.askAbout', { stackSelId: stackSel.id }) }}</button></p>
  </div>

  <!-- Where the code lives: the folder map, painted by the chosen measure. -->
  <div v-else-if="e.kind === 'folders'" class="ev-fold">
    <FolderMap
        :files="e.files"
        :lines="lines"
        :paint="paint"
        :describe="describe"
        :ariaLabel="e.title"
        :legend="legend"
        @select="(f: string | null, kind: 'file' | 'folder') => f && $emit('ask', kind === 'file' ? t('ask.evFigures.outline', { f }) : t('ask.evFigures.whatFolder', { f }))"
    />
  </div>

  <!-- Who still knows it: the Authors view's knowledge map. -->
  <div v-else-if="e.kind === 'knowledge'">
    <KnowledgeMap
        v-model:at="at"
        :tree="tree"
        :selected="selectedSet"
        :focused="null"
        :only="null"
        :matching="null"
        :window-words="e.windowWords"
        @pick="(c: string) => $emit('ask', t('ask.evFigures.whoKnowsWhatHappens', { c }))"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import StackDiagram, { type StackSelection } from "~/features/checks/components/StackDiagram.vue"
import FolderMap from "~/features/checks/components/FolderMap.vue"
import KnowledgeMap from "~/features/git/components/KnowledgeMap.vue"
import { knowledgeTree, type KnowledgeRow } from "~/features/git/knowledgeLeft"
import type { FigureLegend } from "~/features/export/figure"
import { chartTheme } from "~/shared/ui/useChartTheme"
import type { Evidence } from "../engine/types"
import { t, intlLocale } from "~/shared/i18n"

const props = defineProps<{ e: Evidence }>()
defineEmits<{ (ev: "ask", q: string): void }>()

const stackSel = ref<StackSelection>(null)
const at = ref("")
const selectedSet = new Set<string>()

// ── Folder map ──
const lines = computed(() => new Map(props.e.kind === "folders" ? props.e.files.map((f, i) => [f, props.e.kind === "folders" ? props.e.lines[i] : 0]) : []))
const valueOf = computed(() => new Map(props.e.kind === "folders" ? props.e.files.map((f, i) => [f, props.e.kind === "folders" ? props.e.values[i] : null]) : []))
const theme = chartTheme()
const ROLE: Record<string, string> = { production: theme.blue, test: theme.green, generated: theme.violet, third_party: theme.amber, non_code: theme.hairlineStrong }
const categories = computed(() => {
  if (props.e.kind !== "folders" || (props.e.colorBy !== "component" && props.e.colorBy !== "role")) return new Map<string, string>()
  const byLines = new Map<string, number>()
  props.e.files.forEach((f, i) => { const k = String((props.e as any).values[i] ?? "unknown"); byLines.set(k, (byLines.get(k) ?? 0) + (props.e as any).lines[i]) })
  const palette = [theme.blue, theme.green, theme.violet, theme.amber, theme.red, theme.accent, theme.blueSoft, theme.greenSoft, theme.violetSoft, theme.amberSoft]
  const keys = [...byLines].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  return new Map(keys.map((k, i) => [k, props.e.kind === "folders" && props.e.colorBy === "role" ? ROLE[k] ?? theme.hairline : i < palette.length ? palette[i] : theme.hairline]))
})
const maxChurn = computed(() => (props.e.kind === "folders" && props.e.colorBy === "churn" ? Math.max(1, ...props.e.values.map(v => Number(v) || 0)) : 1))
function ramp(colors: string[], x: number) { return colors[Math.max(0, Math.min(colors.length - 1, Math.floor(x * colors.length)))] }
const paint = (f: string) => {
  if (props.e.kind !== "folders") return theme.hairline
  const v = valueOf.value.get(f)
  if (props.e.colorBy === "health") { const h = Number(v); return !h ? theme.hairline : ramp([...theme.heat].reverse(), (h - 1) / 9) }
  if (props.e.colorBy === "churn") return ramp(theme.heat, Math.sqrt((Number(v) || 0) / maxChurn.value))
  return categories.value.get(String(v ?? "unknown")) ?? theme.hairline
}
const describe = (f: string) => {
  if (props.e.kind !== "folders") return ""
  const v = valueOf.value.get(f)
  return t("ask.evFigures.lines", { value: (lines.value.get(f) ?? 0).toLocaleString(intlLocale), colorBy: props.e.colorBy, value2: v ?? "–" })
}
const legend = computed<FigureLegend>(() => {
  if (props.e.kind !== "folders") return {}
  if (props.e.colorBy === "health") return { ramps: [{ label: t("ask.evFigures.codeHealth"), colors: [...theme.heat].reverse(), low: "1 (worst)", high: "10 (best)" }], notes: [t("ask.evFigures.greyNotRated")] }
  if (props.e.colorBy === "churn") return { ramps: [{ label: t("ask.evFigures.commits"), colors: theme.heat, low: "few", high: "most" }] }
  return { items: [...categories.value].slice(0, 10).map(([label, color]) => ({ label, color })) }
})

// ── Knowledge map ──
const tree = computed(() => {
  if (props.e.kind !== "knowledge") return knowledgeTree([])
  const holder = (author: string | null) => (author ? { author, added: 0, share: 0, recent: 0, last: "", idle: 0, here: true } : null)
  const rows: KnowledgeRow[] = props.e.rows.map(r => ({ component: r.component, lines: r.lines, added: r.lines, state: r.state as KnowledgeRow["state"], hereShare: r.hereShare, hereCommits: r.hereCommits, ask: holder(r.ask), holders: [], main: holder(r.main) }))
  return knowledgeTree(rows)
})
</script>

<style scoped>
.ev-note { margin-top: 6px; font-size: 10.5px; color: rgb(var(--c-neutral-500)); }
.ev-link { color: rgb(var(--c-accent-700)); text-decoration: underline dotted; text-underline-offset: 2px; }
.ev-fold { height: 340px; }
</style>
