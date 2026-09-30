<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="ask-prose" @click="onClick" v-html="rendered.html"/>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { Marked } from "marked"
import { markUnsourced } from "../engine/checks"

const props = defineProps<{
  text: string
  /** Evidence ids that exist in the conversation: citations to anything else read as broken. */
  ids: Set<string>
  /** Every source of the conversation: numbers not in it are underlined. Empty while streaming. */
  sources?: string
  /** Evidence titles, shown when a citation is hovered. */
  titles?: Map<string, string>
  /** How each citation held up against its facts: verified, partial, unsupported. */
  verdicts?: Map<string, { verdict: string; reasons: string[] }>
}>()
const emit = defineEmits<{ (e: "cite", id: string): void; (e: "unsourced", count: number): void }>()

const md = new Marked({ gfm: true, breaks: false })
// The model's text is data, never markup: raw HTML in it is shown as text.
md.use({ renderer: {
  html: (token: any) => escapeHtml(typeof token === "string" ? token : token.text ?? ""),
  // Pictures come only as exhibits the app draws; any other image the model writes is just its caption.
  image: (token: any) => `<span class="ask-img-alt">${escapeHtml(typeof token === "string" ? token : token.text ?? token.title ?? "figure")}</span>`,
} })
function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

const rendered = computed(() => {
  let html = md.parse(props.text) as string
  html = html.replace(/\[((?:E\d+(?:\.\d+)?)(?:\s*,\s*E\d+(?:\.\d+)?)*)\]/g, (_all, list: string) =>
    list.split(/\s*,\s*/).map(id => (props.ids.has(id)
      ? (() => {
          const v = props.verdicts?.get(id)
          const why = v?.reasons.length ? `\n${v.verdict === "verified" ? "" : "Check: "}${v.reasons.join("; ")}` : v?.verdict === "verified" ? "\nVerified: its numbers and names are in this fact." : ""
          return `<button type="button" class="ask-cite${v ? ` ask-cite-${v.verdict}` : ""}" data-cite="${id}" title="${escapeHtml(`${id} · ${props.titles?.get(id) ?? "evidence"}${why}\nClick to show`).replace(/"/g, "&quot;")}">${id}</button>`
        })()
      : `<span class="ask-cite ask-cite-broken" title="No evidence ${id} in this conversation">${id}</span>`)).join(""))
  if (props.sources === undefined) return { html, count: 0 }
  const out = markUnsourced(html, props.sources)
  return { html: out.html, count: out.count }
})

function onClick(ev: MouseEvent) {
  const el = (ev.target as HTMLElement).closest("[data-cite]") as HTMLElement | null
  if (el?.dataset.cite) emit("cite", el.dataset.cite)
}

defineExpose({ unsourced: computed(() => rendered.value.count) })
</script>

<style scoped>
.ask-prose { font-size: 13.5px; line-height: 1.65; color: rgb(var(--c-neutral-900)); }
.ask-prose :deep(p) { margin: 0 0 10px; }
.ask-prose :deep(p:last-child) { margin-bottom: 0; }
.ask-prose :deep(ul), .ask-prose :deep(ol) { margin: 0 0 10px; padding-left: 20px; }
.ask-prose :deep(ul) { list-style: disc; }
.ask-prose :deep(ol) { list-style: decimal; }
.ask-prose :deep(li) { margin: 3px 0; }
.ask-prose :deep(li::marker) { color: rgb(var(--c-neutral-400)); }
.ask-prose :deep(code) { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; background: rgb(var(--c-neutral-100)); padding: 1px 4px; border-radius: 4px; overflow-wrap: anywhere; }
.ask-prose :deep(pre) { background: rgb(var(--c-neutral-50)); padding: 8px 10px; border-radius: 6px; overflow-x: auto; margin: 0 0 10px; }
.ask-prose :deep(pre code) { background: none; padding: 0; }
.ask-prose :deep(strong) { font-weight: 600; }
.ask-prose :deep(h1), .ask-prose :deep(h2), .ask-prose :deep(h3), .ask-prose :deep(h4) { font-size: 13.5px; font-weight: 600; margin: 14px 0 4px; }
.ask-prose :deep(table) { font-size: 12px; margin: 4px 0 10px; border-collapse: collapse; }
.ask-prose :deep(th), .ask-prose :deep(td) { padding: 3px 12px 3px 0; border-bottom: 1px solid rgb(var(--c-neutral-100)); text-align: left; }
.ask-prose :deep(blockquote) { border-left: 2px solid rgb(var(--c-neutral-200)); padding-left: 10px; color: rgb(var(--c-neutral-600)); margin: 0 0 10px; }
.ask-prose :deep(.ask-cite) { display: inline-block; font: 500 9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: rgb(var(--c-accent-700)); background: rgb(var(--c-accent-50)); border: 1px solid rgb(var(--c-accent-200)); border-radius: 4px; padding: 2px 3px; margin: 0 1px; vertical-align: 1px; cursor: pointer; }
.ask-prose :deep(.ask-cite:hover) { background: rgb(var(--c-accent-100)); border-color: rgb(var(--c-accent-400)); }
.ask-prose :deep(.ask-cite-verified) { border-style: solid; box-shadow: inset 0 -1.5px 0 rgb(var(--c-accent-400)); }
.ask-prose :deep(.ask-cite-partial) { color: rgb(var(--c-amber-800)); background: rgb(var(--c-amber-50)); border-color: rgb(var(--c-amber-300)); }
.ask-prose :deep(.ask-cite-unsupported) { color: rgb(var(--c-red-700)); background: rgb(var(--c-red-50, 254 242 242)); border: 1px dashed rgb(var(--c-red-300, 252 165 165)); }
.ask-prose :deep(.ask-cite-broken) { color: rgb(var(--c-red-700)); background: transparent; border: 1px dashed rgb(var(--c-red-300, 252 165 165)); cursor: help; }
.ask-prose :deep(.ask-img-alt) { font-style: italic; color: rgb(var(--c-neutral-500)); }
.ask-prose :deep(.ask-unsourced) { text-decoration: underline dotted rgb(var(--c-amber-500)); text-decoration-thickness: 1.5px; text-underline-offset: 3px; cursor: help; }
</style>
