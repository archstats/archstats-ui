<template>
  <!-- Where the code lives: every file by size in its folders, painted by one measure. -->
  <FolderMap
      class="h-full"
      :files="files"
      :lines="lineMap"
      :paint="paint"
      :describe="describe"
      :selected="selected"
      :aria-label="title"
      :figure="title"
      :legend="legend"
      @select="(f: string | null) => f && $emit('pick', `file:${f}`)"
  />
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { FigureLegend } from "~/features/export/figure"
import { chartTheme } from "~/shared/ui/useChartTheme"
import FolderMap from "./FolderMap.vue"

const props = withDefaults(defineProps<{
  files: string[]
  lines: number[]
  values: Array<number | string | null>
  colorBy: "role" | "health" | "churn" | "component"
  title: string
  highlight?: string[]
}>(), { highlight: () => [] })
defineEmits<{ (e: "pick", element: string): void }>()

const t = chartTheme()
const lineMap = computed(() => new Map(props.files.map((f, i) => [f, props.lines[i]])))
const valueOf = computed(() => new Map(props.files.map((f, i) => [f, props.values[i]])))
const ROLE: Record<string, string> = { production: t.blue, test: t.green, generated: t.violet, third_party: t.amber, non_code: t.hairlineStrong }
const categories = computed(() => {
  if (props.colorBy !== "component" && props.colorBy !== "role") return new Map<string, string>()
  const byLines = new Map<string, number>()
  props.files.forEach((_, i) => { const k = String(props.values[i] ?? "unknown"); byLines.set(k, (byLines.get(k) ?? 0) + props.lines[i]) })
  const palette = [t.blue, t.green, t.violet, t.amber, t.red, t.accent, t.blueSoft, t.greenSoft, t.violetSoft, t.amberSoft]
  const keys = [...byLines].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  return new Map(keys.map((k, i) => [k, props.colorBy === "role" ? ROLE[k] ?? t.hairline : i < palette.length ? palette[i] : t.hairline]))
})
const maxChurn = computed(() => (props.colorBy === "churn" ? Math.max(1, ...props.values.map(v => Number(v) || 0)) : 1))
const ramp = (colors: string[], x: number) => colors[Math.max(0, Math.min(colors.length - 1, Math.floor(x * colors.length)))]
const paint = (f: string) => {
  const v = valueOf.value.get(f)
  if (props.colorBy === "health") { const h = Number(v); return !h ? t.hairline : ramp([...t.heat].reverse(), (h - 1) / 9) }
  if (props.colorBy === "churn") return ramp(t.heat, Math.sqrt((Number(v) || 0) / maxChurn.value))
  return categories.value.get(String(v ?? "unknown")) ?? t.hairline
}
const describe = (f: string) => `${(lineMap.value.get(f) ?? 0).toLocaleString("en-US")} lines · ${props.colorBy} ${valueOf.value.get(f) ?? "–"}`
const legend = computed<FigureLegend>(() => {
  if (props.colorBy === "health") return { ramps: [{ label: "Code health", colors: [...t.heat].reverse(), low: "1 (worst)", high: "10 (best)" }], notes: ["Grey: not rated."] }
  if (props.colorBy === "churn") return { ramps: [{ label: "Commits", colors: t.heat, low: "few", high: "most" }] }
  return { items: [...categories.value].slice(0, 10).map(([label, color]) => ({ label, color })) }
})
const selected = computed(() => props.highlight.find(h => h.startsWith("file:") || h.startsWith("folder:"))?.replace(/^(file|folder):/, "") ?? null)
</script>
