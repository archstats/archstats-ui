<template>
  <!-- One prose block. Rendered until it is clicked; then its Markdown, in
       the same type, where the caret is. Enter splits, Backspace at the start
       joins, arrows at the edges move to the next block. -->
  <div class="nb-text relative" :data-kind="block.kind">
    <textarea
      v-if="editing && block.kind !== 'hr'"
      ref="area"
      :value="block.text"
      rows="1"
      spellcheck="true"
      class="nb-input block w-full resize-none overflow-hidden bg-transparent outline-none"
      :class="[kindClass, block.kind === 'code' || block.kind === 'table' ? 'nb-source' : '']"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      @input="onInput"
      @keydown="onKey"
      @paste="onPaste"
      @blur="$emit('blur')"
    ></textarea>
    <hr v-else-if="block.kind === 'hr'" class="my-5 border-0 hairline-t" :class="editing ? 'shadow-[0_0_0_2px_rgb(var(--c-accent-400))]' : ''" tabindex="-1" ref="hrEl" @keydown="onHrKey">
    <div
      v-else
      class="nb-rendered cursor-text"
      :class="[kindClass, !block.text.trim() ? 'nb-empty' : '']"
      :data-placeholder="isLast ? 'Write, or press / to add evidence' : ''"
      @mousedown="onRenderedDown"
      @click="onRenderedClick"
      v-html="html"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { fromMarkdown, inlineHtml, shortcutFor, tableCells, type Block, type TextBlock, type TextKind } from "~/utils/reportDoc";

const props = defineProps<{
  block: TextBlock
  editing: boolean
  /** Where the caret goes when editing starts: an offset, or the start or end. */
  caret?: number | "start" | "end" | null
  number?: number
  isLast?: boolean
}>();
const emit = defineEmits<{
  (e: "edit", caret: number | "start" | "end"): void
  (e: "text", text: string): void
  (e: "convert", kind: TextKind, text: string, lang?: string): void
  (e: "split", before: string, after: string): void
  (e: "join"): void
  (e: "move", dir: -1 | 1): void
  (e: "slash"): void
  (e: "escape"): void
  (e: "blur"): void
  (e: "paste", blocks: Block[], before: string, after: string): void
}>();

const area = ref<HTMLTextAreaElement | null>(null);
const hrEl = ref<HTMLElement | null>(null);

const KIND_CLASS: Record<TextKind, string> = {
  p: "nb-p", h1: "nb-h1", h2: "nb-h2", h3: "nb-h3", ul: "nb-li nb-ul", ol: "nb-li nb-ol", quote: "nb-quote", code: "nb-code", hr: "", table: "nb-table",
};
const kindClass = computed(() => KIND_CLASS[props.block.kind]);
const placeholder = computed(() => ({
  p: "Write, or press / to add evidence", h1: "Heading", h2: "Heading", h3: "Heading", ul: "List item", ol: "List item",
  quote: "Quote", code: "Code", hr: "", table: "| a | b |",
} as Record<TextKind, string>)[props.block.kind]);
const ariaLabel = computed(() => ({ p: "Paragraph", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", ul: "List item", ol: "Numbered item", quote: "Quote", code: "Code", hr: "Divider", table: "Table" } as Record<TextKind, string>)[props.block.kind]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = computed(() => {
  const b = props.block;
  if (b.kind === "code") return `<pre><code>${esc(b.text)}</code></pre>`;
  if (b.kind === "table") {
    const [head, ...rows] = tableCells(b.text);
    if (!head) return "";
    return `<table><thead><tr>${head.map(c => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  const inner = b.text.split("\n").map(inlineHtml).join("<br>");
  if (b.kind === "ol") return `<span class="nb-marker">${props.number ?? 1}.</span>${inner}`;
  if (b.kind === "ul") return `<span class="nb-marker">•</span>${inner}`;
  return inner || "";
});

// ── Entering edit mode where the click was ────────────────────────────────
let clickOffset: number | null = null;
function onRenderedDown(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest("a");
  if (a && (e.metaKey || e.ctrlKey)) return;
  clickOffset = sourceOffsetAt(e);
}
function onRenderedClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
  if (a) {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) { window.location.hash = a.getAttribute("href")?.replace(/^#/, "") ?? ""; return; }
  }
  if (window.getSelection()?.toString()) return;
  emit("edit", clickOffset ?? "end");
}
/** The source offset under the pointer: the plain-text offset, walked back through the Markdown. */
function sourceOffsetAt(e: MouseEvent): number | null {
  const doc = document as any;
  const range: Range | null = doc.caretRangeFromPoint?.(e.clientX, e.clientY) ?? null;
  const root = e.currentTarget as HTMLElement;
  if (!range || !root.contains(range.startContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  let plain = pre.toString();
  const marker = root.querySelector(".nb-marker")?.textContent ?? "";
  if (marker && plain.startsWith(marker)) plain = plain.slice(marker.length);
  return plainToSource(props.block.text, plain.length);
}
function plainToSource(src: string, plainLen: number): number {
  const plain = root(src);
  let si = 0, pi = 0;
  while (pi < plainLen && si < src.length) {
    if (src[si] === plain[pi]) { pi++; si++; } else si++;
  }
  return si;
}
const root = (src: string) => {
  const div = document.createElement("div");
  div.innerHTML = src.split("\n").map(inlineHtml).join("\n");
  return div.textContent ?? "";
};

watch(() => props.editing, async (on) => {
  if (!on) return;
  await nextTick();
  if (props.block.kind === "hr") { hrEl.value?.focus(); return; }
  const el = area.value;
  if (!el) return;
  autosize();
  el.focus({ preventScroll: false });
  const pos = props.caret === "start" ? 0 : props.caret === "end" || props.caret === null || props.caret === undefined ? el.value.length : Math.min(el.value.length, props.caret);
  el.setSelectionRange(pos, pos);
}, { immediate: true });
watch(() => props.caret, async (c) => {
  if (!props.editing || c === null || c === undefined) return;
  await nextTick();
  const el = area.value;
  if (!el) return;
  const pos = c === "start" ? 0 : c === "end" ? el.value.length : Math.min(el.value.length, c);
  el.focus();
  el.setSelectionRange(pos, pos);
});

function autosize() {
  const el = area.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
watch(() => props.block.text, () => nextTick(autosize));

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  const text = el.value;
  autosize();
  // Typora's shortcuts: a heading, list or quote marker typed at the start converts the block.
  if (props.block.kind === "p") {
    const s = shortcutFor(text);
    if (s && s.kind !== "code" && s.kind !== "hr") { emit("convert", s.kind, s.text); return; }
  }
  emit("text", text);
}

/** Which visual line the caret sits on, of how many: a hidden twin of the textarea measures it. */
function caretLine(el: HTMLTextAreaElement): { line: number; lines: number } {
  const style = getComputedStyle(el);
  const twin = document.createElement("div");
  for (const p of ["font", "letterSpacing", "lineHeight", "padding", "border", "width", "wordWrap", "whiteSpace", "boxSizing", "textIndent"] as const) (twin.style as any)[p] = (style as any)[p];
  twin.style.position = "absolute";
  twin.style.visibility = "hidden";
  twin.style.whiteSpace = "pre-wrap";
  twin.style.overflowWrap = "break-word";
  twin.style.width = `${el.clientWidth}px`;
  twin.textContent = el.value.slice(0, el.selectionStart);
  const mark = document.createElement("span");
  mark.textContent = "​";
  twin.appendChild(mark);
  document.body.appendChild(twin);
  const lh = parseFloat(style.lineHeight) || 20;
  const line = Math.round(mark.offsetTop / lh);
  const lines = Math.max(1, Math.round((el.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / lh));
  twin.remove();
  return { line, lines };
}

function wrap(el: HTMLTextAreaElement, before: string, after = before) {
  const { selectionStart: a, selectionEnd: b, value } = el;
  const sel = value.slice(a, b);
  const next = value.slice(0, a) + before + sel + after + value.slice(b);
  emit("text", next);
  void nextTick(() => { el.setSelectionRange(a + before.length, b + before.length); });
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLTextAreaElement;
  const kind = props.block.kind;
  const mod = e.metaKey || e.ctrlKey;
  const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
  if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); wrap(el, "**"); return; }
  if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); wrap(el, "*"); return; }
  if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); wrap(el, "`"); return; }
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); wrap(el, "[", "](https://)"); return; }
  if (e.key === "Escape") { e.preventDefault(); emit("escape"); return; }
  if (e.key === "/" && !el.value && !mod) { e.preventDefault(); emit("slash"); return; }
  if (e.key === "Enter" && !e.isComposing) {
    if (kind === "code" || kind === "table") {
      // Two Enters at the end of a code block leave it.
      if (el.selectionStart === el.value.length && el.value.endsWith("\n")) { e.preventDefault(); emit("split", el.value.slice(0, -1), ""); }
      return;
    }
    if (e.shiftKey && kind !== "h1" && kind !== "h2" && kind !== "h3") return;
    e.preventDefault();
    // A fence or a rule typed on its own line becomes one when the line is ended.
    if (kind === "p") {
      const s = shortcutFor(el.value.trim());
      if (s && (s.kind === "code" || s.kind === "hr")) { emit("convert", s.kind, "", s.lang); return; }
    }
    // Enter on an empty list item leaves the list.
    if ((kind === "ul" || kind === "ol" || kind === "quote") && !el.value) { emit("convert", "p", ""); return; }
    emit("split", el.value.slice(0, el.selectionStart), el.value.slice(el.selectionEnd));
    return;
  }
  if (e.key === "Backspace" && atStart) {
    e.preventDefault();
    if (kind !== "p") emit("convert", "p", el.value);
    else emit("join");
    return;
  }
  if (e.key === "ArrowUp" && !e.shiftKey && caretLine(el).line === 0) { e.preventDefault(); emit("move", -1); return; }
  if (e.key === "ArrowDown" && !e.shiftKey) {
    const c = caretLine(el);
    if (c.line >= c.lines - 1) { e.preventDefault(); emit("move", 1); }
  }
}

function onHrKey(e: KeyboardEvent) {
  if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); emit("convert", "p", ""); }
  else if (e.key === "ArrowUp") { e.preventDefault(); emit("move", -1); }
  else if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); emit("move", 1); }
  else if (e.key === "Escape") { e.preventDefault(); emit("escape"); }
}

// Pasting several lines of Markdown makes several blocks.
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData("text/plain") ?? "";
  if (!text.includes("\n") || props.block.kind === "code" || props.block.kind === "table") return;
  e.preventDefault();
  const el = e.target as HTMLTextAreaElement;
  emit("paste", fromMarkdown(text), el.value.slice(0, el.selectionStart), el.value.slice(el.selectionEnd));
}
</script>

<style scoped>
/* The report's reading type: larger than the 13px chrome, so the page reads
   as a document and the panes around it as the tool. */
.nb-text { --nb-body: 15px; --nb-lh: 1.65; }
.nb-p, .nb-li, .nb-quote { font-size: var(--nb-body); line-height: var(--nb-lh); color: rgb(var(--c-neutral-800)); padding: 3px 0; }
.nb-h1 { font-size: 24px; line-height: 1.3; font-weight: 600; letter-spacing: -0.015em; color: rgb(var(--c-neutral-950)); padding: 22px 0 4px; }
.nb-h2 { font-size: 19px; line-height: 1.35; font-weight: 600; letter-spacing: -0.01em; color: rgb(var(--c-neutral-950)); padding: 18px 0 2px; }
.nb-h3 { font-size: 15.5px; line-height: 1.4; font-weight: 600; color: rgb(var(--c-neutral-900)); padding: 12px 0 0; }
.nb-li { position: relative; padding-left: 26px; }
.nb-li :deep(.nb-marker) { position: absolute; left: 6px; color: rgb(var(--c-neutral-400)); font-variant-numeric: tabular-nums; }
textarea.nb-li { padding-left: 26px; }
.nb-quote { padding-left: 18px; box-shadow: inset 2px 0 0 rgb(var(--c-neutral-300)); color: rgb(var(--c-neutral-600)); font-style: italic; }
.nb-code, .nb-source { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; line-height: 1.6; color: rgb(var(--c-neutral-800)); background: rgb(var(--c-neutral-50)); border-radius: 6px; padding: 12px 14px; margin: 6px 0; }
.nb-code :deep(pre) { margin: 0; white-space: pre-wrap; font: inherit; }
.nb-table :deep(table) { border-collapse: collapse; font-size: 13px; margin: 8px 0; }
.nb-table :deep(th) { text-align: left; font-weight: 600; color: rgb(var(--c-neutral-600)); padding: 4px 16px 4px 0; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-300)); }
.nb-table :deep(td) { padding: 4px 16px 4px 0; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-200)); }
.nb-rendered :deep(strong) { font-weight: 600; color: rgb(var(--c-neutral-950)); }
.nb-rendered :deep(code) { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.86em; background: rgb(var(--c-neutral-100)); border-radius: 4px; padding: 1px 5px; }
.nb-rendered :deep(a) { color: rgb(var(--c-accent-700)); text-decoration: underline; text-decoration-color: rgb(var(--c-accent-300)); text-underline-offset: 3px; }
.nb-rendered :deep(s) { color: rgb(var(--c-neutral-500)); }
.nb-empty { min-height: calc(var(--nb-body) * var(--nb-lh) + 6px); }
.nb-empty::before { content: attr(data-placeholder); color: rgb(var(--c-neutral-400)); pointer-events: none; }
.nb-input::placeholder { color: rgb(var(--c-neutral-400)); }
.nb-input::selection, .nb-rendered ::selection { background: rgb(var(--c-accent-200) / 0.7); }
.nb-input { caret-color: rgb(var(--c-accent-600)); }
</style>
