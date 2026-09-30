<template>
  <!-- Lines of a file, numbered, the matching or cited ones marked. -->
  <div class="xc">
    <p class="xc-path" :title="path">{{ path }}</p>
    <pre class="xc-pre"><code><span v-for="(l, i) in html" :key="i" class="xc-line" :class="{ 'xc-mark': marked.has(from + i) }"><span class="xc-n">{{ from + i }}</span><span v-html="l || ' '"/></span></code></pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import hljs from "highlight.js"

const props = withDefaults(defineProps<{
  path: string
  from: number
  lines: string[]
  /** Line numbers to mark (matches), plus `line:N` highlights. */
  marks?: number[]
  highlight?: string[]
}>(), { marks: () => [], highlight: () => [] })

const marked = computed(() => new Set([...props.marks, ...props.highlight.filter(h => h.startsWith("line:")).map(h => Number(h.slice(5)))]))
const lang = computed(() => { const ext = props.path.split(".").pop() ?? ""; return hljs.getLanguage(ext) ? ext : "" })
// Highlighted one line at a time: a block comment across lines loses its colour, the line numbers stay right.
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const html = computed(() => props.lines.map(l => (lang.value ? hljs.highlight(l, { language: lang.value, ignoreIllegals: true }).value : escape(l))))
</script>

<style scoped>
.xc-path { margin-bottom: 4px; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-neutral-500)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xc-pre { max-height: 360px; overflow: auto; margin: 0; padding: 6px 0; border-radius: 6px; background: rgb(var(--c-neutral-50)); font: 11.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
/* Long lines wrap under their own text, the number column kept clear: a clipped statement reads as broken code. */
.xc-line { display: grid; grid-template-columns: 54px minmax(0, 1fr); padding: 0 10px 0 0; }
.xc-line > span:last-child { white-space: pre-wrap; overflow-wrap: anywhere; }
.xc-mark { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.xc-n { padding-right: 10px; text-align: right; color: rgb(var(--c-neutral-400)); user-select: none; }
</style>
