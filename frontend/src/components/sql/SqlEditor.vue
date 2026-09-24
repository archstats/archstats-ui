<template>
  <!-- SQL with the schema at hand: a native textarea (so selection, undo and
       input methods stay the system's) over a layer that draws the same text
       with its meaning: tables, metrics, functions, strings, and problems
       underlined where they are. Suggestions follow the clause being
       written; the line under it says what the caret is on. -->
  <div class="sqle" :class="[{ 'sqle-focus': focused, 'sqle-compact': compact }]" @mousedown.self="focus()">
    <div class="sqle-body" :style="{ height: `${height}px` }">
      <div v-if="lineNumbers" class="sqle-gutter" aria-hidden="true">
        <div :style="{ transform: `translateY(${-scrollTop}px)` }">
          <div v-for="n in lineCount" :key="n" class="sqle-ln" :class="{ 'sqle-ln-on': n - 1 === caretLine && focused, 'sqle-ln-bad': badLines.has(n - 1) }">{{ n }}</div>
        </div>
      </div>
      <div class="sqle-main">
        <div v-if="focused" class="sqle-band" :style="{ transform: `translateY(${PAD + caretLine * LH - scrollTop}px)` }" aria-hidden="true"></div>
        <pre ref="layer" class="sqle-layer sqle-text" aria-hidden="true"><code v-html="html"></code></pre>
        <textarea
          ref="input"
          :value="modelValue"
          class="sqle-input sqle-text"
          spellcheck="false"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          wrap="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="popup.open"
          :aria-controls="popup.open ? listId : undefined"
          :aria-activedescendant="popup.open && popup.items.length ? `${listId}-${popup.active}` : undefined"
          :aria-label="ariaLabel"
          :placeholder="placeholder"
          @input="onInput"
          @keydown="onKey"
          @scroll="onScroll"
          @focus="focused = true; track()"
          @blur="onBlur"
          @click="track(); popup.open && refresh(false)"
          @keyup="onKeyUp"
        ></textarea>
      </div>
    </div>

    <!-- What the caret is on: the function's arguments, a problem, a metric's meaning. -->
    <div class="sqle-status" :class="{ 'sqle-status-bad': status.bad }" role="status">
      <template v-if="status.signature">
        <span class="sqle-sig"><span class="t-function">{{ status.signature.fn.name }}</span>(<template v-for="(a, i) in status.signature.fn.args" :key="i"><span :class="i === Math.min(status.signature.arg, status.signature.fn.args.length - 1) ? 'sqle-sig-on' : ''">{{ a }}</span><template v-if="i < status.signature.fn.args.length - 1">, </template></template>)</span>
        <span class="sqle-status-doc">{{ status.signature.fn.doc }}</span>
      </template>
      <template v-else-if="status.problem">
        <AlertTriangle :size="12" class="shrink-0"/>
        <button type="button" class="sqle-status-doc text-left hover:underline" @mousedown.prevent @click="jumpTo(status.problem.from)">{{ status.problem.message }}</button>
        <span v-if="problems.length > 1" class="shrink-0 text-neutral-500">and {{ problems.length - 1 }} more</span>
      </template>
      <template v-else-if="status.about">
        <span class="sqle-status-name">{{ status.about.title }}</span>
        <span v-if="status.about.body" class="sqle-status-doc">{{ status.about.body }}</span>
      </template>
      <span v-else class="sqle-status-doc text-neutral-400">{{ hint }}</span>
      <span class="sqle-pos">Ln {{ caretLine + 1 }}, Col {{ caretCol + 1 }}</span>
    </div>

    <!-- Suggestions, with what the chosen one is. -->
    <Teleport to="body">
      <div
        v-if="popup.open && (popup.items.length || popup.loading)"
        class="sqle-pop ui-popover"
        :style="{ left: `${popup.x}px`, top: `${popup.y}px` }"
        @mousedown.prevent
      >
        <ul :id="listId" ref="listEl" class="sqle-list" :class="{ 'sqle-list-wide': popup.value }" role="listbox" :aria-label="popup.value ? `Values of ${popup.value.column}` : 'Suggestions'">
          <li v-if="popup.value" class="sqle-list-head" role="presentation">
            Values of <span class="font-mono">{{ popup.value.column }}</span><template v-if="popup.value.table"> in <span class="font-mono">{{ popup.value.table }}</span></template>
          </li>
          <li
            v-for="(it, i) in popup.items"
            :id="`${listId}-${i}`"
            :key="`${it.kind}:${it.label}`"
            role="option"
            :aria-selected="i === popup.active"
            class="sqle-item"
            :class="{ 'sqle-item-on': i === popup.active }"
            @mousemove="popup.active = i"
            @click="accept(i)"
          >
            <component :is="ICONS[it.kind]" :size="13" class="sqle-item-icon" :class="`sqle-k-${it.kind}`"/>
            <span v-if="it.kind === 'value'" class="sqle-item-label" :title="it.label">{{ middle(it.label) }}</span>
            <span v-else class="sqle-item-label"><template v-for="(part, k) in parts(it)" :key="k"><b v-if="part.hit">{{ part.text }}</b><template v-else>{{ part.text }}</template></template></span>
            <span v-if="it.detail" class="sqle-item-detail">{{ it.detail }}</span>
          </li>
          <li v-if="popup.loading && !popup.items.length" class="sqle-list-head" role="presentation">Reading values…</li>
        </ul>
        <aside v-if="activeItem?.doc" class="sqle-doc">
          <p class="sqle-doc-title">{{ activeItem.doc.title }}</p>
          <p v-if="activeItem.doc.body" class="sqle-doc-body">{{ activeItem.doc.body }}</p>
          <p v-for="m in activeItem.doc.meta ?? []" :key="m" class="sqle-doc-meta">{{ m }}</p>
          <p class="sqle-doc-keys"><kbd>↵</kbd> or <kbd>Tab</kbd> to insert · <kbd>Esc</kbd> to close</p>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from "vue";
import { AlertTriangle, Columns, CornerDownLeft, Gauge, Layers, Quote, Sigma, Table2, Type } from "lucide-vue-next";
import { useSqlSchema } from "~/composables/useSqlSchema";
import {
  analyze, classify, complete, contextAt, lint, locateError, signatureAt,
  type Completion, type CompletionContext, type SqlDiagnostic,
} from "~/utils/sqlLang";

const props = withDefaults(defineProps<{
  modelValue: string
  /** The snapshot its schema and values come from. */
  scanId: string | null | undefined
  /** SQLite's message from the last run, placed on the token it names. */
  error?: string | null
  minRows?: number
  maxRows?: number
  lineNumbers?: boolean
  /** The notebook's cell: tighter, runs on ⇧↵ as well. */
  compact?: boolean
  placeholder?: string
  ariaLabel?: string
}>(), { error: null, minRows: 3, maxRows: 22, lineNumbers: false, compact: false, placeholder: "", ariaLabel: "SQL" });
const emit = defineEmits<{ (e: "update:modelValue", v: string): void; (e: "run"): void; (e: "blur"): void }>();

const ICONS = { table: Table2, column: Columns, metric: Gauge, function: Sigma, keyword: Type, value: Quote, source: Layers, snippet: CornerDownLeft } as const;
const LH = 20;
const PAD = 10;
const listId = `sqle-${Math.random().toString(36).slice(2, 8)}`;

const input = ref<HTMLTextAreaElement | null>(null);
const layer = ref<HTMLElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const focused = ref(false);
const scrollTop = ref(0);
const caret = ref(0);

const { schema: schemaOf, tables, values } = useSqlSchema(toRef(props, "scanId"));
const schema = computed(() => { void tables.value; return schemaOf(); });

// ── Reading the text ────────────────────────────────────────────────────
const analysis = computed(() => analyze(props.modelValue, schema.value));
const lineCount = computed(() => props.modelValue.split("\n").length);
const height = computed(() => Math.min(props.maxRows, Math.max(props.minRows, lineCount.value)) * LH + PAD * 2 + (props.compact ? 0 : 2));
const caretLine = computed(() => props.modelValue.slice(0, caret.value).split("\n").length - 1);
const caretCol = computed(() => caret.value - props.modelValue.lastIndexOf("\n", caret.value - 1) - 1);

// Problems: what can be told before running, and where the last run's error points.
const serverProblem = ref<SqlDiagnostic | null>(null);
watch(() => props.error, (e) => { serverProblem.value = e ? locateError(props.modelValue, e) ?? { from: 0, to: 0, message: e, severity: "error" } : null; }, { immediate: true });
const lintTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const linted = ref<SqlDiagnostic[]>([]);
watch([() => props.modelValue, schema], () => {
  if (lintTimer.value) clearTimeout(lintTimer.value);
  lintTimer.value = setTimeout(() => { linted.value = lint(props.modelValue, schema.value, analysis.value); }, 250);
}, { immediate: true });
// A word still being typed is not yet a problem: what touches the caret waits until the caret moves on.
const problems = computed(() => [
  ...(serverProblem.value ? [serverProblem.value] : []),
  ...linted.value.filter(p => !(caret.value >= p.from && caret.value <= p.to)),
]);
const badLines = computed(() => {
  const s = new Set<number>();
  for (const p of problems.value) if (p.to > p.from) s.add(props.modelValue.slice(0, p.from).split("\n").length - 1);
  return s;
});

// Brackets: the pair beside the caret.
const pairAt = computed<[number, number] | null>(() => {
  const s = props.modelValue, c = caret.value;
  for (const at of [c - 1, c]) {
    const ch = s[at];
    if (ch !== "(" && ch !== ")") continue;
    const tok = analysis.value.tokens.find(t => t.start === at && t.kind === "punct");
    if (!tok) continue;
    const sigIdx = analysis.value.sig.indexOf(tok);
    const other = analysis.value.pair.get(sigIdx);
    if (other !== undefined) return [at, analysis.value.sig[other].start];
  }
  return null;
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = computed(() => {
  const toks = classify(analysis.value, schema.value);
  const bad = problems.value.filter(p => p.to > p.from);
  const pair = pairAt.value;
  let out = "";
  for (const t of toks) {
    const cls = [`t-${t.role}`];
    if (bad.some(p => t.start < p.to && t.end > p.from)) cls.push("sqle-bad");
    if (pair && t.kind === "punct" && (t.start === pair[0] || t.start === pair[1])) cls.push("sqle-pair");
    out += t.kind === "space" ? esc(t.text) : `<span class="${cls.join(" ")}">${esc(t.text)}</span>`;
  }
  // A trailing newline needs a line to sit on.
  return out + "\n ";
});

// ── The line under it ───────────────────────────────────────────────────
const status = computed(() => {
  const s = props.modelValue;
  const signature = signatureAt(s, caret.value);
  const here = problems.value.find(p => caret.value >= p.from && caret.value <= p.to) ?? (serverProblem.value ?? null);
  const problem = here ?? problems.value[0] ?? null;
  let about: { title: string; body?: string } | null = null;
  const tok = analysis.value.tokens.find(t => t.start <= caret.value && caret.value <= t.end && (t.kind === "ident" || t.kind === "quoted"));
  if (tok) {
    const name = tok.kind === "quoted" ? tok.text.replace(/^["`[]|["`\]]$/g, "") : tok.text;
    const d = schema.value.describe?.(name);
    const table = schema.value.tables.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (d) about = { title: d.name !== name ? `${d.name} · ${name}` : name, body: d.short };
    else if (table) about = { title: `${table.name} · ${table.columns.length} columns`, body: table.columns.slice(0, 10).map(c => c.name).join(", ") + (table.columns.length > 10 ? ", …" : "") };
  }
  return { signature, problem, about, bad: !signature && !!problem };
});
const hint = computed(() => (tables.value.length ? `${tables.value.length} tables · ⌃Space suggests · ${props.compact ? "⇧↵" : "⌘↵"} runs · ⌘/ comments a line` : "Reading the schema…"));

// ── Editing ─────────────────────────────────────────────────────────────
function track() {
  const el = input.value;
  if (el) caret.value = el.selectionStart ?? 0;
}
function onScroll() {
  const el = input.value;
  if (!el || !layer.value) return;
  layer.value.scrollTop = el.scrollTop;
  layer.value.scrollLeft = el.scrollLeft;
  scrollTop.value = el.scrollTop;
  if (popup.open) place();
}
/** Replaces a range the way typing would, so ⌘Z takes it back. */
function replaceRange(from: number, to: number, text: string, caretAt = from + text.length) {
  const el = input.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(from, to);
  const ok = document.execCommand?.("insertText", false, text);
  if (!ok) { el.setRangeText(text, from, to, "end"); el.dispatchEvent(new Event("input", { bubbles: true })); }
  el.setSelectionRange(caretAt, caretAt);
  caret.value = caretAt;
  emit("update:modelValue", el.value);
}

let lastInput: InputEvent | null = null;
function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  emit("update:modelValue", el.value);
  caret.value = el.selectionStart ?? 0;
  serverProblem.value = null;
  lastInput = e as InputEvent;
  void nextTick(() => {
    const ie = lastInput;
    const typed = ie?.inputType === "insertText" ? ie.data ?? "" : "";
    const deleting = ie?.inputType?.startsWith("delete");
    const ctx = contextAt(props.modelValue, caret.value, schema.value, analysis.value);
    // Open on a word being typed, a dot, a table's place, or the inside of a quoted comparison; keep open while deleting.
    const wants = (/[A-Za-z_]/.test(typed) && ctx.prefix.length >= 1) || typed === "." || (typed === " " && ctx.wantsTable) || (!!ctx.value && (typed === "'" || /\S/.test(typed)));
    if (wants || (popup.open && (deleting || /[A-Za-z0-9_]/.test(typed)))) void refresh(true);
    else close();
    onScroll();
  });
}

function onKeyUp(e: KeyboardEvent) {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || (e.key.startsWith("Arrow") && !popup.open)) track();
}

const PAIRS: Record<string, string> = { "(": ")", "'": "'" };
function onKey(e: KeyboardEvent) {
  const el = input.value!;
  const mod = e.metaKey || e.ctrlKey;
  if (popup.open && popup.items.length) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); move(-1); return; }
    if (e.key === "PageDown") { e.preventDefault(); move(8); return; }
    if (e.key === "PageUp") { e.preventDefault(); move(-8); return; }
    // Enter on a word typed out in full is a new line; the suggestion has nothing to add.
    const typedOut = e.key === "Enter" && activeItem.value?.label.toLowerCase() === (popup.context?.prefix ?? "").toLowerCase();
    if (typedOut) close();
    else if ((e.key === "Enter" && !mod && !e.shiftKey) || e.key === "Tab") { e.preventDefault(); accept(popup.active); return; }
  }
  if (e.key === "Escape" && popup.open) { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (e.key === " " && e.ctrlKey) { e.preventDefault(); void refresh(true, true); return; }
  if (e.key === "Enter" && (mod || (props.compact && e.shiftKey))) { e.preventDefault(); close(); emit("run"); return; }
  if (mod && e.key === "/") { e.preventDefault(); toggleComment(); return; }
  const s = props.modelValue;
  const a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
  if (e.key === "Tab" && !mod) {
    e.preventDefault();
    if (a === b && !e.shiftKey) { replaceRange(a, b, "  "); return; }
    indentLines(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === "Enter" && !e.shiftKey && !mod) {
    // A new line keeps the indent, and goes one deeper after an opening bracket.
    e.preventDefault();
    const lineStart = s.lastIndexOf("\n", a - 1) + 1;
    const indent = /^[ \t]*/.exec(s.slice(lineStart, a))![0];
    const deeper = /\(\s*$/.test(s.slice(lineStart, a)) ? "  " : "";
    if (deeper && s[b] === ")") { replaceRange(a, b, `\n${indent}${deeper}\n${indent}`, a + 1 + indent.length + deeper.length); return; }
    replaceRange(a, b, `\n${indent}${deeper}`);
    return;
  }
  // Brackets and quotes close themselves, and typing the closer steps over it.
  const tok = analysis.value.tokens.find(t => t.start < a && a < t.end);
  const inString = tok?.kind === "string" || tok?.kind === "comment";
  if ((e.key === ")" || e.key === "'") && a === b && s[a] === e.key && !mod) {
    const closing = e.key === ")" || (tok?.kind === "string" && tok.end === a + 1 && !tok.open);
    if (closing) { e.preventDefault(); el.setSelectionRange(a + 1, a + 1); caret.value = a + 1; return; }
  }
  if (PAIRS[e.key] && !mod && !inString && a === b && (/[\s),;]/.test(s[a] ?? " ") || a === s.length) && !(e.key === "'" && /[A-Za-z0-9_]/.test(s[a - 1] ?? ""))) {
    e.preventDefault();
    replaceRange(a, b, e.key + PAIRS[e.key], a + 1);
    if (e.key === "'") void nextTick(() => { if (contextAt(props.modelValue, caret.value, schema.value).value) void refresh(true); });
    return;
  }
  if (e.key === "Backspace" && a === b && a > 0 && PAIRS[s[a - 1]] === s[a]) { e.preventDefault(); replaceRange(a - 1, a + 1, ""); return; }
}

function indentLines(dir: 1 | -1) {
  const el = input.value!;
  const s = props.modelValue;
  const a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
  const start = s.lastIndexOf("\n", a - 1) + 1;
  const end = b > a && s[b - 1] === "\n" ? b - 1 : (s.indexOf("\n", b) < 0 ? s.length : s.indexOf("\n", b));
  const lines = s.slice(start, end).split("\n");
  const next = lines.map(l => (dir > 0 ? `  ${l}` : l.replace(/^ {1,2}/, ""))).join("\n");
  replaceRange(start, end, next, start + next.length);
  el.setSelectionRange(start, start + next.length);
}
function toggleComment() {
  const el = input.value!;
  const s = props.modelValue;
  const a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
  const start = s.lastIndexOf("\n", a - 1) + 1;
  const end = s.indexOf("\n", Math.max(a, b - (b > a && s[b - 1] === "\n" ? 1 : 0))) < 0 ? s.length : s.indexOf("\n", Math.max(a, b - (b > a && s[b - 1] === "\n" ? 1 : 0)));
  const lines = s.slice(start, end).split("\n");
  const all = lines.filter(l => l.trim()).every(l => /^\s*--/.test(l));
  const next = lines.map(l => (all ? l.replace(/^(\s*)-- ?/, "$1") : l.trim() ? l.replace(/^(\s*)/, "$1-- ") : l)).join("\n");
  const shift = next.length - (end - start);
  replaceRange(start, end, next, Math.max(start, a + (lines.length === 1 ? shift : 0)));
}
function jumpTo(at: number) {
  const el = input.value;
  if (!el) return;
  el.focus();
  el.setSelectionRange(at, at);
  caret.value = at;
}

// ── Suggestions ─────────────────────────────────────────────────────────
const popup = reactive({ open: false, items: [] as Completion[], active: 0, x: 0, y: 0, loading: false, context: null as CompletionContext | null, value: null as { column: string; table: string | null } | null });
const activeItem = computed(() => popup.items[popup.active] ?? null);
let valueAsk = 0;
let valueTimer: ReturnType<typeof setTimeout> | null = null;

async function refresh(openIt: boolean, manual = false) {
  track();
  const { context, items } = complete(props.modelValue, caret.value, schema.value, analysis.value);
  popup.context = context;
  if (context.value) {
    popup.value = { column: context.value.column, table: context.value.table };
    if (!context.value.table) { close(); return; }
    popup.open = openIt || popup.open;
    popup.loading = true;
    const ask = ++valueAsk;
    if (valueTimer) clearTimeout(valueTimer);
    const { table, column } = context.value;
    const prefix = context.prefix;
    valueTimer = setTimeout(async () => {
      const hits = await values(table!, column, prefix);
      if (ask !== valueAsk) return;
      popup.loading = false;
      popup.items = hits.map(h => ({ kind: "value", label: h.value, detail: `${h.rows.toLocaleString("en-US")} ${h.rows === 1 ? "row" : "rows"}`, score: 0, matches: [] }));
      popup.active = 0;
      if (!popup.items.length && !manual) close();
      place();
    }, 90);
    place();
    return;
  }
  popup.value = null;
  popup.loading = false;
  // A word typed out in full, with nothing longer to offer, needs no list.
  const only = items.length === 1 && items[0].label.toLowerCase() === context.prefix.toLowerCase();
  if (!items.length || (only && !manual)) { close(); return; }
  const keep = popup.open ? activeItem.value?.label : null;
  popup.items = items;
  const again = keep ? items.findIndex(i => i.label === keep) : -1;
  popup.active = again >= 0 && context.prefix === (popup.context?.prefix ?? "") ? again : 0;
  popup.open = openIt || popup.open;
  place();
  void nextTick(scrollActive);
}
function close() {
  popup.open = false;
  popup.items = [];
  popup.loading = false;
  valueAsk++;
}
function move(d: number) {
  const n = popup.items.length;
  popup.active = Math.max(0, Math.min(n - 1, popup.active + d));
  void nextTick(scrollActive);
}
function scrollActive() {
  listEl.value?.querySelector(`#${listId}-${popup.active}`)?.scrollIntoView({ block: "nearest" });
}
function accept(i: number) {
  const it = popup.items[i];
  const ctx = popup.context;
  if (!it || !ctx) return;
  if (it.kind === "value" && ctx.value) {
    const text = it.label.replace(/'/g, "''");
    replaceRange(ctx.from, ctx.to, text + (ctx.value.closeQuote ? "'" : ""), ctx.from + text.length + 1);
    close();
    return;
  }
  const text = it.insert ?? it.label;
  // A keyword that ends a word needs no second space.
  const trimmed = text.endsWith(" ") && props.modelValue[ctx.to] === " " ? text.slice(0, -1) : text;
  replaceRange(ctx.from, ctx.to, trimmed, ctx.from + (it.caret ?? trimmed.length));
  close();
  // A table in FROM or a dot opens what comes next; a function shows its arguments below.
  if (text.endsWith(".")) void nextTick(() => refresh(true));
}
/** A long value keeps its start and its end, where values usually differ. */
function middle(v: string, max = 52) {
  return v.length <= max ? v : `${v.slice(0, 16)}…${v.slice(-(max - 17))}`;
}
function parts(it: Completion) {
  const hits = new Set(it.matches ?? []);
  const out: Array<{ text: string; hit: boolean }> = [];
  for (let k = 0; k < it.label.length; k++) {
    const hit = hits.has(k);
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += it.label[k];
    else out.push({ text: it.label[k], hit });
  }
  return out;
}

// Placed under the caret; above it when the window has no room below.
let charWidth = 7.8;
function measure() {
  const probe = document.createElement("span");
  probe.className = "sqle-text";
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  probe.textContent = "M".repeat(40);
  (input.value?.parentElement ?? document.body).appendChild(probe);
  charWidth = probe.getBoundingClientRect().width / 40 || charWidth;
  probe.remove();
}
function place() {
  const el = input.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = r.left + PAD + caretCol.value * charWidth - el.scrollLeft;
  const lineTop = r.top + PAD + caretLine.value * LH - el.scrollTop;
  const w = activeItem.value?.doc ? 620 : 360;
  const h = 300;
  popup.x = Math.max(8, Math.min(x - 22, window.innerWidth - w - 8));
  popup.y = lineTop + LH + 4 + h > window.innerHeight - 8 ? Math.max(8, lineTop - h - 4) : lineTop + LH + 4;
}

function onBlur() {
  focused.value = false;
  close();
  emit("blur");
}
function focus() { input.value?.focus(); }
/** Puts text at the caret, as if typed. */
function insert(text: string) {
  const el = input.value;
  const a = el?.selectionStart ?? props.modelValue.length, b = el?.selectionEnd ?? a;
  replaceRange(a, b, text);
}
defineExpose({ focus, insert });

onMounted(() => {
  measure();
  void (document as any).fonts?.ready?.then(measure);
  window.addEventListener("resize", onWindow);
});
function onWindow() { if (popup.open) place(); }
onBeforeUnmount(() => { window.removeEventListener("resize", onWindow); if (lintTimer.value) clearTimeout(lintTimer.value); });
</script>

<style scoped>
/* One type for both layers: they must lay out the same characters on the same pixels. */
.sqle-text { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; line-height: 20px; tab-size: 2; letter-spacing: 0; font-variant-ligatures: none; }
.sqle { display: flex; flex-direction: column; border-radius: 8px; background: rgb(var(--c-surface)); box-shadow: 0 0 0 1px rgb(var(--c-neutral-200)); transition: box-shadow 120ms ease-out; overflow: hidden; }
.sqle-focus { box-shadow: 0 0 0 1px rgb(var(--c-accent-400)), 0 0 0 4px rgb(var(--c-accent-200) / 0.35); }
.sqle-compact { background: rgb(var(--c-neutral-50)); box-shadow: none; border-radius: 6px; }
.sqle-compact.sqle-focus { box-shadow: 0 0 0 1px rgb(var(--c-accent-400)); }
.sqle-body { position: relative; display: flex; min-height: 0; }
.sqle-gutter { width: 40px; flex-shrink: 0; overflow: hidden; padding-top: 10px; background: rgb(var(--c-neutral-50)); box-shadow: inset -1px 0 0 rgb(var(--c-neutral-200)); }
.sqle-ln { height: 20px; padding-right: 10px; text-align: right; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; line-height: 20px; color: rgb(var(--c-neutral-400)); font-variant-numeric: tabular-nums; }
.sqle-ln-on { color: rgb(var(--c-neutral-800)); }
.sqle-ln-bad { color: rgb(var(--c-red-600)); }
.sqle-main { position: relative; flex: 1; min-width: 0; }
.sqle-band { position: absolute; left: 0; right: 0; top: 0; height: 20px; background: rgb(var(--c-neutral-100) / 0.7); pointer-events: none; }
.sqle-layer, .sqle-input { position: absolute; inset: 0; margin: 0; padding: 10px 14px; white-space: pre; overflow-wrap: normal; word-break: normal; border: 0; }
.sqle-layer { overflow: hidden; pointer-events: none; color: rgb(var(--c-neutral-800)); }
.sqle-input { resize: none; overflow: auto; background: transparent; color: transparent; caret-color: rgb(var(--c-accent-600)); outline: none; -webkit-text-fill-color: transparent; }
.sqle-input::placeholder { color: rgb(var(--c-neutral-400)); -webkit-text-fill-color: rgb(var(--c-neutral-400)); }
.sqle-input::selection { background: rgb(var(--c-accent-200) / 0.6); }
.sqle-input::-webkit-scrollbar { width: 8px; height: 8px; }
.sqle-input::-webkit-scrollbar-thumb { background: rgb(var(--c-neutral-300)); border-radius: 4px; }

/* The syntax: the snapshot's own words in ink, the language's in colour. */
.sqle-layer :deep(.t-keyword) { color: rgb(var(--c-violet-700)); font-weight: 500; }
.sqle-layer :deep(.t-function), .t-function { color: rgb(var(--c-blue-700)); }
.sqle-layer :deep(.t-string) { color: rgb(var(--c-green-700)); }
.sqle-layer :deep(.t-number), .sqle-layer :deep(.t-param) { color: rgb(var(--c-amber-800)); }
.sqle-layer :deep(.t-comment) { color: rgb(var(--c-neutral-400)); font-style: italic; }
.sqle-layer :deep(.t-table) { color: rgb(var(--c-neutral-950)); font-weight: 600; }
.sqle-layer :deep(.t-metric) { color: rgb(var(--c-neutral-900)); text-decoration: underline dotted rgb(var(--c-neutral-300)); text-underline-offset: 4px; }
.sqle-layer :deep(.t-column), .sqle-layer :deep(.t-quoted) { color: rgb(var(--c-neutral-800)); }
.sqle-layer :deep(.t-source) { color: rgb(var(--c-accent-700)); }
.sqle-layer :deep(.t-op), .sqle-layer :deep(.t-punct) { color: rgb(var(--c-neutral-500)); }
.sqle-layer :deep(.sqle-bad) { text-decoration: underline wavy rgb(var(--c-red-500)); text-decoration-skip-ink: none; text-underline-offset: 4px; }
.sqle-layer :deep(.sqle-pair) { background: rgb(var(--c-accent-200) / 0.7); border-radius: 2px; color: rgb(var(--c-neutral-950)); }

.sqle-status { display: flex; align-items: center; gap: 8px; min-height: 26px; padding: 3px 12px; font-size: 11.5px; line-height: 18px; color: rgb(var(--c-neutral-600)); background: rgb(var(--c-neutral-50)); box-shadow: inset 0 1px 0 rgb(var(--c-neutral-200)); }
.sqle-compact .sqle-status { background: transparent; box-shadow: none; padding: 0 12px 4px; min-height: 22px; }
.sqle-status-bad { color: rgb(var(--c-red-700)); }
.sqle-status-name { flex-shrink: 0; font-weight: 500; color: rgb(var(--c-neutral-900)); }
.sqle-status-doc { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sqle-sig { flex-shrink: 0; font-family: "JetBrains Mono", ui-monospace, monospace; color: rgb(var(--c-neutral-600)); }
.sqle-sig-on { color: rgb(var(--c-neutral-950)); font-weight: 600; text-decoration: underline; text-decoration-color: rgb(var(--c-accent-400)); text-underline-offset: 3px; }
.sqle-pos { margin-left: auto; flex-shrink: 0; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 10.5px; color: rgb(var(--c-neutral-400)); font-variant-numeric: tabular-nums; }
</style>

<style>
/* The suggestion list lives in the body, outside the editor's scope. */
.sqle-pop { position: fixed; z-index: 90; display: flex; max-height: 300px; overflow: hidden; animation: sqle-in 110ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes sqle-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sqle-pop { animation: none; } }
.sqle-list { width: 360px; max-height: 300px; overflow-y: auto; padding: 4px; margin: 0; list-style: none; }
.sqle-list-wide { width: 460px; }
.sqle-list-head { padding: 5px 8px 4px; font-size: 11px; color: rgb(var(--c-neutral-500)); }
.sqle-item { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px; border-radius: 4px; cursor: default; font-size: 12.5px; }
.sqle-item-on { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.sqle-item-icon { flex-shrink: 0; color: rgb(var(--c-neutral-400)); }
.sqle-k-table { color: rgb(var(--c-neutral-700)); }
.sqle-k-metric { color: rgb(var(--c-accent-600)); }
.sqle-k-function { color: rgb(var(--c-blue-600)); }
.sqle-k-keyword { color: rgb(var(--c-violet-600)); }
.sqle-k-value { color: rgb(var(--c-green-600)); }
.sqle-k-source { color: rgb(var(--c-accent-600)); }
.sqle-item-label { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: rgb(var(--c-neutral-800)); }
.sqle-item-label b { font-weight: 600; color: rgb(var(--c-neutral-950)); }
.sqle-item-on .sqle-item-label { color: rgb(var(--c-neutral-950)); }
.sqle-item-detail { flex-shrink: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: rgb(var(--c-neutral-500)); }
.sqle-doc { width: 260px; flex-shrink: 0; overflow-y: auto; padding: 10px 12px; background: rgb(var(--c-neutral-50)); box-shadow: inset 1px 0 0 rgb(var(--c-neutral-200)); }
.sqle-doc-title { font-size: 12.5px; font-weight: 600; color: rgb(var(--c-neutral-950)); line-height: 18px; }
.sqle-doc-body { margin-top: 4px; font-size: 12px; line-height: 18px; color: rgb(var(--c-neutral-700)); }
.sqle-doc-meta { margin-top: 6px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; line-height: 16px; color: rgb(var(--c-neutral-500)); overflow-wrap: anywhere; }
.sqle-doc-keys { margin-top: 10px; font-size: 10.5px; color: rgb(var(--c-neutral-400)); }
.sqle-doc-keys kbd { font-family: "JetBrains Mono", ui-monospace, monospace; }
</style>
