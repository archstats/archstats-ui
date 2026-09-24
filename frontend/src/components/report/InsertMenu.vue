<template>
  <!-- The one way in: prose, pins, tables and queries in one searchable
       palette, each previewed before it lands where the caret was. -->
  <Teleport to="body">
    <div class="fixed inset-0 z-[70]" @mousedown.self="$emit('close')">
      <div
        class="ui-popover absolute flex h-[392px] w-[640px] max-w-[calc(100vw-24px)] overflow-hidden animate-in"
        :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
        role="dialog"
        aria-label="Insert"
      >
        <div class="flex w-[300px] shrink-0 flex-col hairline-r">
          <div class="flex items-center gap-2 px-3 hairline-b">
            <Icon icon="search" :size="13" class="shrink-0 text-neutral-400"/>
            <input
              ref="inputEl"
              v-model="query"
              class="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
              placeholder="Insert a pin, table, query or block"
              role="combobox"
              aria-controls="insert-list"
              :aria-activedescendant="rows.length ? `ins-${active}` : undefined"
              @keydown.down.prevent="step(1)"
              @keydown.up.prevent="step(-1)"
              @keydown.enter.prevent="choose(rows[active])"
              @keydown.esc.prevent="$emit('close')"
              @keydown.tab.prevent="step(1)"
            >
          </div>
          <ul id="insert-list" class="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
            <template v-for="(r, i) in rows" :key="r.key">
              <li v-if="r.heading" class="ui-label px-3 pb-1 pt-2.5" role="presentation">{{ r.heading }}</li>
              <li
                :id="`ins-${i}`"
                role="option"
                :aria-selected="i === active"
                class="mx-1 flex cursor-default items-center gap-2.5 rounded px-2 py-1.5"
                :class="i === active ? 'bg-accent-50' : ''"
                @mousemove="active = i"
                @click="choose(r)"
              >
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-500"><Icon :icon="r.icon" :size="13"/></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] text-neutral-900">{{ r.label }}</span>
                  <span v-if="r.hint" class="block truncate text-[11.5px] leading-4 text-neutral-500">{{ r.hint }}</span>
                </span>
                <kbd v-if="r.shortcut" class="shrink-0 font-mono text-[11px] text-neutral-400">{{ r.shortcut }}</kbd>
              </li>
            </template>
            <li v-if="!rows.length" class="px-3 py-6 text-center text-sm text-neutral-500" role="presentation">Nothing called that. Pin it from a view first, or write a query.</li>
          </ul>
        </div>

        <!-- What the chosen row would put in the report. -->
        <div class="flex min-w-0 flex-1 flex-col bg-ground">
          <template v-if="current">
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <p class="text-[13px] font-semibold text-neutral-900">{{ current.label }}</p>
              <p v-if="current.detail" class="mt-1 text-xs leading-5 text-neutral-600">{{ current.detail }}</p>

              <!-- A prose block shows how it is typed. -->
              <div v-if="current.kind === 'text'" class="mt-3 rounded-md bg-surface px-3 py-2.5 hairline">
                <p class="text-xs text-neutral-500">Or type at the start of a line</p>
                <p class="mt-1 font-mono text-sm text-neutral-800">{{ current.shortcut }}<span class="text-neutral-400">{{ current.example }}</span></p>
              </div>

              <!-- A pin as it will appear. -->
              <template v-else-if="current.kind === 'pin' && current.pin">
                <img v-if="pinFigure" :src="pinFigure" alt="" class="mt-3 max-h-[120px] w-full rounded object-contain object-left hairline">
                <dl v-if="Object.keys(pinValues).length" class="ui-kv mt-3">
                  <template v-for="(v, k) in pinValues" :key="k"><dt>{{ label(String(k)) }}</dt><dd>{{ fmtValue(v) }}</dd></template>
                </dl>
                <p v-if="current.pin.note" class="mt-3 text-xs leading-5 text-neutral-700">{{ current.pin.note }}</p>
                <p class="mt-3 text-[11px] text-neutral-500">
                  <template v-if="usage.length">Already in {{ usage.join(", ") }}.</template>
                  <template v-else>Not in any report yet.</template>
                </p>
              </template>

              <!-- A table previewed on the report's snapshot. -->
              <template v-else-if="current.kind === 'table'">
                <div class="mt-3 flex items-center gap-2">
                  <span class="text-xs text-neutral-500">Rows</span>
                  <div class="ui-segmented" role="group" aria-label="Rows">
                    <button v-for="n in [5, 10, 25, 50]" :key="n" type="button" :aria-pressed="limit === n" @click="limit = n; focusInput()">{{ n }}</button>
                  </div>
                </div>
                <p v-if="previewError" class="mt-3 font-mono text-xs text-red-700">{{ previewError }}</p>
                <p v-else-if="!preview" class="mt-3 text-xs text-neutral-500">Reading {{ kernelLabel }}…</p>
                <table v-else class="mt-3 w-full text-[11.5px]">
                  <thead><tr><th v-for="(c, i) in preview.columns" :key="i" class="pb-1 font-medium text-neutral-500" :class="preview.align[i] === 'r' ? 'text-right' : 'text-left'">{{ c }}</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, i) in preview.rows.slice(0, 6)" :key="i" class="hairline-t">
                      <td v-for="(v, j) in row" :key="j" class="py-1 pr-2" :class="[preview.align[j] === 'r' ? 'text-right font-mono tabular-nums' : '', j === 0 ? 'max-w-[120px] truncate font-mono' : '']">{{ v }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>

              <!-- A computed paragraph, counted on the report's snapshot. -->
              <template v-else-if="current.kind === 'reading'">
                <p v-if="!readingPreview" class="mt-3 text-xs text-neutral-500">Counting on {{ kernelLabel }}…</p>
                <p v-else class="ins-reading mt-3 rounded-md bg-surface px-3 py-2.5 text-[13px] leading-[1.6] hairline" :class="readingPreview.absent ? 'italic text-neutral-500' : 'text-neutral-800'" v-html="inlineHtml(readingPreview.text)"></p>
                <p class="mt-2 text-[11px] leading-4 text-neutral-500">Facts only, counted as the views count them; what they mean stays yours to write.</p>
              </template>

              <pre v-else-if="current.kind === 'sql' && current.sql" class="mt-3 whitespace-pre-wrap rounded-md bg-surface px-3 py-2 font-mono text-[11.5px] leading-5 text-neutral-700 hairline">{{ current.sql }}</pre>
            </div>
            <div class="flex items-center gap-3 px-4 py-2 text-[11px] text-neutral-500 hairline-t">
              <span><kbd class="font-mono">↑↓</kbd> choose</span>
              <span><kbd class="font-mono">↵</kbd> insert</span>
              <span class="ml-auto">Or drag a pin in from the pool</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { fuzzyScore } from "~/utils/fuzzy";
import { displayTable, fmtValue, runCell, TABLE_PRESETS, type RunContext } from "~/utils/reportCells";
import { inlineHtml, type CellSpec, type ReadingOutput, type TableSource, type TextKind } from "~/utils/reportDoc";
import { READINGS, runReading } from "~/utils/readings";

export type InsertChoice =
  | { type: "text"; kind: TextKind; lang?: string }
  | { type: "cell"; spec: CellSpec; title?: string };

interface PinLike { id: string; kind: string; title: string; note: string; values: Record<string, number>; figurePath: string }

const props = defineProps<{
  anchor: { left: number; top: number }
  pins: PinLike[]
  usage: Map<string, string[]>
  savedQueries: Array<{ id: string; name: string; sql: string }>
  figures: Record<string, string>
  run: RunContext | null
  kernelLabel: string
  label: (id: string) => string
  /** Columns each table can show, for which presets apply. */
  columns: Record<TableSource, Set<string>>
  /** Text typed after the slash. */
  initial?: string
}>();
const emit = defineEmits<{ (e: "choose", c: InsertChoice): void; (e: "close"): void }>();

interface Row {
  key: string
  kind: "text" | "pin" | "table" | "sql" | "reading"
  label: string
  hint?: string
  detail?: string
  icon: string
  shortcut?: string
  example?: string
  heading?: string
  group: string
  textKind?: TextKind
  lang?: string
  pin?: PinLike
  preset?: (typeof TABLE_PRESETS)[number]
  sql?: string
  reading?: string
}

const TEXT: Array<Omit<Row, "group" | "kind" | "key">> = [
  { label: "Heading 1", icon: "heading", textKind: "h1", shortcut: "#", example: " Findings", detail: "A section of the report." },
  { label: "Heading 2", icon: "heading", textKind: "h2", shortcut: "##", example: " Coupling", detail: "A part of a section." },
  { label: "Heading 3", icon: "heading", textKind: "h3", shortcut: "###", example: " In detail" },
  { label: "Bulleted list", icon: "list", textKind: "ul", shortcut: "-", example: " a finding" },
  { label: "Numbered list", icon: "list-ordered", textKind: "ol", shortcut: "1.", example: " first step" },
  { label: "Quote", icon: "quote", textKind: "quote", shortcut: ">", example: " what someone said" },
  { label: "Code", icon: "code", textKind: "code", shortcut: "```", example: " then Enter" },
  { label: "Table", icon: "table", textKind: "table", shortcut: "|", example: " a | b |", detail: "A table you type, in Markdown." },
  { label: "Divider", icon: "minus", textKind: "hr", shortcut: "---", example: " then Enter" },
];

const all = computed<Row[]>(() => {
  const out: Row[] = [];
  for (const p of props.pins) {
    out.push({ key: `pin:${p.id}`, kind: "pin", group: "Pins", label: p.title || "Untitled pin", hint: `${p.kind}${props.usage.get(p.id)?.length ? ` · in ${props.usage.get(p.id)!.length} report${props.usage.get(p.id)!.length === 1 ? "" : "s"}` : ""}`, icon: p.kind === "view" ? "image" : p.kind === "cycle" ? "refresh-cw" : "bookmark", pin: p, detail: "Its values as pinned and as they are now, with the note." });
  }
  for (const r of READINGS) {
    out.push({ key: `reading:${r.id}`, kind: "reading", group: "Facts, written out", label: r.label, hint: "A paragraph counted from the snapshot", icon: "file-text", reading: r.id, detail: r.describe });
  }
  for (const t of TABLE_PRESETS) {
    const has = props.columns[t.source];
    if (has.size && !has.has(t.sort)) continue;
    out.push({ key: `table:${t.id}`, kind: "table", group: "Tables", label: t.label, hint: t.hint, icon: "table", preset: t, detail: `From the ${t.source} of ${props.kernelLabel}. Re-run it on a newer snapshot to see what moved.` });
  }
  out.push({ key: "sql:new", kind: "sql", group: "Query", label: "SQL query", hint: "Write SQL and run it on the snapshot", icon: "terminal", detail: "A cell holding a read-only query; ⇧↵ runs it, like a notebook." });
  for (const q of props.savedQueries) out.push({ key: `sql:${q.id}`, kind: "sql", group: "Query", label: q.name, hint: "Saved in the SQL console", icon: "terminal", sql: q.sql });
  for (const t of TEXT) out.push({ ...t, key: `text:${t.textKind}`, kind: "text", group: "Text" });
  return out;
});

const query = ref(props.initial ?? "");
const active = ref(0);
const limit = ref(10);
const inputEl = ref<HTMLInputElement | null>(null);

const rows = computed<Row[]>(() => {
  const q = query.value.trim();
  const list = q
    ? all.value
      .map(r => ({ r, s: fuzzyScore(q, `${r.label} ${r.hint ?? ""}`, -1) }))
      .filter(x => x.s !== null)
      .sort((a, b) => (b.s as number) - (a.s as number))
      .map(x => x.r)
      .slice(0, 40)
    : all.value;
  // Headings only while browsing: search results rank across groups.
  return list.map((r, i) => ({ ...r, heading: !q && (i === 0 || list[i - 1].group !== r.group) ? r.group : undefined }));
});
watch(query, () => { active.value = 0; });
const current = computed(() => rows.value[active.value] ?? null);

function step(d: number) {
  const n = rows.value.length;
  if (!n) return;
  active.value = (active.value + d + n) % n;
  void nextTick(() => document.getElementById(`ins-${active.value}`)?.scrollIntoView({ block: "nearest" }));
}
function focusInput() { inputEl.value?.focus(); }

function choose(r: Row | undefined) {
  if (!r) return;
  if (r.kind === "text") emit("choose", { type: "text", kind: r.textKind!, lang: r.lang });
  else if (r.kind === "reading") emit("choose", { type: "cell", spec: { type: "reading", reading: r.reading! } });
  else if (r.kind === "pin") emit("choose", { type: "cell", spec: { type: "pin", pinId: r.pin!.id } });
  else if (r.kind === "table") emit("choose", { type: "cell", spec: { type: "table", source: r.preset!.source, columns: r.preset!.columns, sort: r.preset!.sort, desc: r.preset!.desc, limit: limit.value }, title: r.preset!.label });
  else emit("choose", { type: "cell", spec: { type: "sql", sql: r.sql ?? "SELECT name, complexity__lines\nFROM components\nORDER BY complexity__lines DESC", limit: 50 }, title: r.sql ? r.label : "" });
}

// ── Previews ──────────────────────────────────────────────────────────────
const pinValues = computed(() => current.value?.pin?.values ?? {});
const pinFigure = computed(() => (current.value?.pin?.figurePath ? props.figures[current.value.pin.figurePath] ?? null : null));
const usage = computed(() => (current.value?.pin ? props.usage.get(current.value.pin.id) ?? [] : []));

const preview = ref<{ columns: string[]; align: string[]; rows: string[][] } | null>(null);
const previewError = ref("");
let asked = 0;
watch([current, limit], async () => {
  const r = current.value;
  preview.value = null;
  previewError.value = "";
  if (!r || r.kind !== "table" || !props.run) return;
  const mine = ++asked;
  const t = r.preset!;
  // Previews read six rows; the cell reads what the limit says when it lands.
  const cell = await runCell({ spec: { type: "table", source: t.source, columns: t.columns, sort: t.sort, desc: t.desc, limit: 6 }, title: "", caption: "", output: null, ranOn: null }, props.run);
  if (mine !== asked) return;
  if (cell.output?.error) previewError.value = cell.output.error;
  else preview.value = displayTable(cell, props.label);
}, { immediate: true });

const readingPreview = ref<ReadingOutput | null>(null);
let askedReading = 0;
watch(current, async (r) => {
  readingPreview.value = null;
  if (!r || r.kind !== "reading" || !props.run) return;
  const mine = ++askedReading;
  let out: ReadingOutput;
  try { out = await runReading(r.reading!, undefined, props.run.readings); } catch (e) { out = { text: e instanceof Error ? e.message : String(e), values: {}, absent: true }; }
  if (mine === askedReading) readingPreview.value = out;
}, { immediate: true });

// Placed under the caret's block, kept inside the window.
const pos = computed(() => {
  const w = Math.min(640, window.innerWidth - 24);
  const left = Math.max(12, Math.min(props.anchor.left, window.innerWidth - w - 12));
  const below = props.anchor.top + 6;
  const top = below + 392 > window.innerHeight - 12 ? Math.max(12, props.anchor.top - 392 - 30) : below;
  return { left, top };
});

onMounted(() => nextTick(focusInput));
</script>

<style scoped>
.ins-reading :deep(strong) { font-weight: 600; color: rgb(var(--c-neutral-950)); }
.ins-reading :deep(code) { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.86em; background: rgb(var(--c-neutral-100)); border-radius: 4px; padding: 1px 4px; }
</style>
