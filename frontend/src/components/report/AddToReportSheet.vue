<template>
  <!-- Add to report: what a view hands over, shown where it will land in the
       report, with the words around it written before it goes in. -->
  <Teleport to="body">
    <div v-if="draftSrc" class="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/25 p-6" @mousedown.self="close">
      <div
        class="ui-popover flex h-[min(780px,92vh)] w-[1160px] max-w-[96vw] flex-col overflow-hidden animate-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atr-title"
        @keydown="onKey"
      >
        <header class="flex shrink-0 items-baseline gap-3 px-5 pb-3 pt-4 hairline-b">
          <h2 id="atr-title" class="text-[15px] font-semibold text-neutral-900">Add to report</h2>
          <p class="min-w-0 truncate font-mono text-[11.5px] text-neutral-500" :title="sourceLine">{{ sourceLine }}</p>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" aria-label="Close" @click="close"><Icon icon="x" :size="13"/></button>
        </header>

        <div class="flex min-h-0 flex-1">
          <!-- Where it goes. -->
          <aside class="flex w-[252px] shrink-0 flex-col overflow-y-auto bg-ground hairline-r" aria-label="Where it lands">
            <h3 class="ui-label px-4 pb-1 pt-3.5">Report</h3>
            <ul class="px-2">
              <li v-for="r in reports.list" :key="r.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
                  :class="target === r.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-200/60'"
                  :aria-pressed="target === r.id"
                  @click="pickReport(r.id)"
                >
                  <Icon icon="file-text" :size="13" class="shrink-0" :class="target === r.id ? 'text-accent-600' : 'text-neutral-400'"/>
                  <span class="min-w-0 flex-1 truncate text-[13px] text-neutral-900">{{ r.title || "Untitled report" }}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
                  :class="target === NEW ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-200/60'"
                  :aria-pressed="target === NEW"
                  @click="pickReport(NEW)"
                >
                  <Icon icon="plus" :size="13" class="shrink-0 text-neutral-400"/>
                  <span class="text-[13px] text-neutral-700">New report</span>
                </button>
                <input
                  v-if="target === NEW"
                  ref="newTitleEl"
                  v-model="newTitle"
                  class="ui-input ui-input-sm mx-2 mb-1 mt-1 w-[calc(100%-16px)]"
                  placeholder="Report name"
                  aria-label="New report name"
                >
              </li>
            </ul>

            <template v-if="target !== NEW">
              <h3 class="ui-label px-4 pb-1 pt-4">Place</h3>
              <ol class="px-2 pb-4" aria-label="Where in the report">
                <li v-for="o in places" :key="o.key">
                  <button
                    type="button"
                    class="group/pl relative flex w-full items-center gap-2 rounded py-1 pr-2 text-left transition-colors"
                    :class="place === o.value ? 'text-neutral-950' : 'text-neutral-600 hover:bg-neutral-200/60'"
                    :style="{ paddingLeft: `${8 + o.indent * 12}px` }"
                    :aria-pressed="place === o.value"
                    @click="place = o.value"
                  >
                    <Icon v-if="o.icon" :icon="o.icon" :size="12" class="shrink-0" :class="o.slot ? 'text-accent-600' : 'text-neutral-400'"/>
                    <span class="truncate" :class="[o.heading ? 'text-[12.5px] font-medium' : 'text-[12px]', o.slot && place !== o.value ? 'text-accent-800' : '']">{{ o.label }}</span>
                  </button>
                  <!-- The landing spot sits after the row it follows. -->
                  <div v-if="place === o.value" class="relative my-1 ml-2 mr-2 h-[18px]" aria-hidden="true">
                    <span class="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-accent-500"></span>
                    <span class="absolute left-2 top-0 bg-ground px-1 text-[10.5px] font-medium leading-[18px] text-accent-700">{{ o.slot ? "Fills this slot" : "Lands here" }}</span>
                  </div>
                </li>
              </ol>
            </template>
          </aside>

          <!-- What it will read like, in place. -->
          <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto bg-surface">
            <div class="mx-auto max-w-[620px] px-10 pb-16 pt-8">
              <p v-if="target === NEW" class="text-[24px] font-semibold tracking-[-0.015em] text-neutral-950">{{ newTitle || "Untitled report" }}</p>
              <p v-else-if="!before.length" class="text-[24px] font-semibold tracking-[-0.015em] text-neutral-400">{{ targetTitle }}</p>

              <!-- The report before the spot, as it reads. -->
              <div v-if="beforeHidden" class="mb-1 text-[11px] text-neutral-400">⋯ {{ beforeHidden }} more above</div>
              <div class="pointer-events-none select-none opacity-55" aria-hidden="true">
                <template v-for="b in before" :key="b.id">
                  <NotebookText v-if="!isCell(b)" :block="b" :editing="false" :number="ctxNumbers.get(b.id)"/>
                  <NotebookReading v-else-if="b.cell.spec.type === 'reading'" :cell="b.cell" :selected="false" :running="false" :stale="false" kernel-label="" :gutter="false"/>
                  <NotebookSlot v-else-if="b.cell.spec.type === 'slot'" :cell="b.cell" :number="numbers.get(b.id) ?? ''" :selected="false" compact/>
                  <NotebookCell v-else :cell="b.cell" :number="numbers.get(b.id) ?? ''" :selected="false" :running="false" :stale="false" :kernel-label="''" :figure="figureOf(b)" :workspace="workspace" :label="label" :gutter="false"/>
                </template>
              </div>

              <!-- What is being added: editable, marked as new. -->
              <section class="relative my-4 -ml-5 rounded-md pb-1 pl-5 pr-1 pt-3 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]" aria-label="What is added">
                <span class="absolute -top-2 left-3 bg-surface px-1.5 text-[10.5px] font-medium text-accent-700">Adding</span>
                <button v-if="!hasProseAbove" type="button" class="nb-ghost" @click="writeAbove"><Icon icon="plus" :size="12"/> Write above</button>
                <template v-for="(b, i) in draft" :key="b.id">
                  <NotebookText
                    v-if="!isCell(b)"
                    :block="b"
                    :editing="editingId === b.id"
                    :caret="editingId === b.id ? caret : null"
                    :number="draftOl.get(b.id)"
                    @edit="c => edit(b.id, c)"
                    @text="t => setText(b.id, t)"
                    @convert="(k, t, lang) => convert(b.id, k, t, lang)"
                    @split="(a, c) => split(b.id, a, c)"
                    @join="join(i)"
                    @move="d => move(i, d)"
                    @slash="() => {}"
                    @escape="editingId = null"
                    @blur="onBlur(b.id)"
                    @paste="(bs, a, c) => paste(b.id, bs, a, c)"
                  />
                  <NotebookCell
                    v-else
                    :cell="b.cell"
                    :number="numbers.get(b.id) ?? ''"
                    :selected="false"
                    :running="false"
                    :stale="false"
                    :kernel-label="''"
                    :figure="figureData"
                    :workspace="workspace"
                    :label="label"
                    :gutter="false"
                    @patch="p => patchCell(b.id, p)"
                  />
                </template>
                <button v-if="!hasProseBelow" type="button" class="nb-ghost" @click="writeBelow"><Icon icon="plus" :size="12"/> Write below</button>
              </section>

              <!-- And what follows it. -->
              <div class="pointer-events-none select-none opacity-55" aria-hidden="true">
                <template v-for="b in after" :key="b.id">
                  <NotebookText v-if="!isCell(b)" :block="b" :editing="false" :number="ctxNumbers.get(b.id)"/>
                  <NotebookReading v-else-if="b.cell.spec.type === 'reading'" :cell="b.cell" :selected="false" :running="false" :stale="false" kernel-label="" :gutter="false"/>
                  <NotebookSlot v-else-if="b.cell.spec.type === 'slot'" :cell="b.cell" :number="numbers.get(b.id) ?? ''" :selected="false" compact/>
                  <NotebookCell v-else :cell="b.cell" :number="numbers.get(b.id) ?? ''" :selected="false" :running="false" :stale="false" :kernel-label="''" :figure="figureOf(b)" :workspace="workspace" :label="label" :gutter="false"/>
                </template>
              </div>
              <div v-if="afterHidden" class="mt-1 text-[11px] text-neutral-400">⋯ {{ afterHidden }} more below</div>
            </div>
          </div>

          <!-- What to keep of it. -->
          <aside class="flex w-[248px] shrink-0 flex-col gap-5 overflow-y-auto bg-ground px-4 py-3.5 hairline-l" aria-label="Trim">
            <template v-if="src.kind === 'table' && src.table">
              <section>
                <h3 class="ui-label mb-1.5">Rows</h3>
                <div class="ui-segmented" role="group" aria-label="Rows">
                  <button v-for="n in rowOptions" :key="n" type="button" :aria-pressed="rows === n" @click="rows = n">{{ n === src.table.rows.length ? "All" : n }}</button>
                </div>
                <p class="mt-1.5 text-[11px] leading-4 text-neutral-500">{{ rows.toLocaleString("en-US") }} of {{ src.table.total.toLocaleString("en-US") }} in the view's order<template v-if="src.table.total > src.table.rows.length">; the first {{ src.table.rows.length }} can be kept</template>.</p>
              </section>
              <section>
                <div class="mb-1.5 flex items-baseline">
                  <h3 class="ui-label flex-1">Columns</h3>
                  <span class="font-mono text-[11px] text-neutral-500">{{ columns.size }} of {{ src.table.columns.length }}</span>
                </div>
                <ul class="-mx-1 flex flex-col">
                  <li v-for="(c, i) in src.table.columns" :key="c.id">
                    <label class="flex cursor-default items-center gap-2 rounded px-1 py-1 hover:bg-neutral-200/60">
                      <Checkbox :model-value="columns.has(c.id)" :disabled="i === 0" :aria-label="c.label" @update:model-value="toggleColumn(c.id)"/>
                      <span class="min-w-0 flex-1 truncate text-[12.5px]" :class="columns.has(c.id) ? 'text-neutral-900' : 'text-neutral-500'">{{ c.label }}</span>
                      <span v-if="i === 0" class="text-[10.5px] text-neutral-400">names</span>
                    </label>
                  </li>
                </ul>
              </section>
            </template>
            <template v-else-if="src.kind === 'figure'">
              <section>
                <h3 class="ui-label mb-1.5">Appearance</h3>
                <div class="ui-segmented" role="group" aria-label="Appearance">
                  <button type="button" :aria-pressed="light" @click="setLight(true)">Light</button>
                  <button type="button" :aria-pressed="!light" @click="setLight(false)">As shown</button>
                </div>
                <p class="mt-1.5 text-[11px] leading-4 text-neutral-500">Light prints well and reads on paper; as shown keeps the app's current look.</p>
              </section>
            </template>
            <template v-else>
              <section>
                <h3 class="ui-label mb-1.5">Text</h3>
                <p class="text-[12px] leading-5 text-neutral-600">It comes in as prose you can edit here and in the report.</p>
              </section>
            </template>
            <section>
              <h3 class="ui-label mb-1.5">Kept with it</h3>
              <dl class="ui-kv text-[11.5px]">
                <dt>Snapshot</dt><dd>{{ src.ranOn.label }}</dd>
                <template v-if="src.ranOn.commit"><dt>Commit</dt><dd>{{ src.ranOn.commit.slice(0, 7) }}</dd></template>
                <template v-if="src.ranOn.lens"><dt>Lens</dt><dd>{{ src.ranOn.lens }}</dd></template>
                <template v-if="src.ranOn.scope"><dt>Scope</dt><dd class="!whitespace-normal">{{ src.ranOn.scope }}</dd></template>
              </dl>
              <p class="mt-1.5 text-[11px] leading-4 text-neutral-500">A capture keeps what {{ src.view }} showed; open the view again to bring it up to date.</p>
            </section>
          </aside>
        </div>

        <footer class="flex shrink-0 items-center gap-3 px-5 py-3 hairline-t">
          <p class="min-w-0 truncate text-[12.5px] text-neutral-600">{{ summary }}</p>
          <p v-if="error" class="text-[12.5px] text-red-700" role="alert">{{ error }}</p>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="close">Cancel</button>
          <template v-if="fillMode">
            <button type="button" class="ui-btn ui-btn-sm" :disabled="adding" @click="add(false)">Fill</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="adding" title="⌘↵" @click="add(true)">{{ adding ? "Filling…" : "Fill and return" }}</button>
          </template>
          <template v-else>
            <button type="button" class="ui-btn ui-btn-sm" :disabled="adding" @click="add(true)">Add and open</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="adding" title="⌘↵" @click="add(false)">{{ adding ? "Adding…" : slotPlace ? "Fill" : "Add" }}</button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Figure } from "wailsjs/go/app/EvidenceService";
import NotebookCell from "~/components/report/NotebookCell.vue";
import NotebookReading from "~/components/report/NotebookReading.vue";
import NotebookSlot from "~/components/report/NotebookSlot.vue";
import NotebookText from "~/components/report/NotebookText.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useDataStore } from "~/stores/data";
import { useReportsStore, type ImportDraft } from "~/stores/reports";
import { useWorkspacesStore } from "~/stores/workspaces";
import { cellNumbers, fromMarkdown, isCell, newId, parseDoc, plainText, type Block, type Cell, type CellBlock, type TextKind } from "~/utils/reportDoc";

const reports = useReportsStore();
const data = useDataStore();
const workspaces = useWorkspacesStore();
const router = useRouter();
const label = (id: string) => data.statNiceName(id) || id;
const workspace = computed(() => workspaces.active?.name ?? "");

const NEW = "__new__";
const draftSrc = computed(() => reports.importing);
const src = computed(() => reports.importing as ImportDraft);

// ── The target and the spot ────────────────────────────────────────────
const target = ref<string>(NEW);
const newTitle = ref("");
const newTitleEl = ref<HTMLInputElement | null>(null);
const place = ref<string | null>("end");
function pickReport(id: string) {
  target.value = id;
  place.value = defaultPlace();
  if (id === NEW) void nextTick(() => newTitleEl.value?.focus());
}
const targetRecord = computed(() => reports.list.find(r => r.id === target.value) ?? null);
const targetTitle = computed(() => targetRecord.value?.title || "Untitled report");
const targetBlocks = computed<Block[]>(() => {
  const r = targetRecord.value;
  if (!r) return [];
  return r.id === reports.currentId ? reports.doc.blocks : parseDoc(r.body).blocks;
});

interface Place { key: string; value: string | null; label: string; indent: number; heading?: boolean; icon?: string; slot?: boolean }
const places = computed<Place[]>(() => {
  const out: Place[] = [{ key: "top", value: null, label: "At the top", indent: 0, icon: "arrow-up-right" }];
  const nums = cellNumbers(targetBlocks.value);
  let depth = 0;
  for (const b of targetBlocks.value) {
    if (isCell(b) && b.cell.spec.type === "slot") {
      out.push({ key: b.id, value: `slot:${b.id}`, label: `Fill ${nums.get(b.id)} · ${b.cell.title || b.cell.spec.view}`, indent: depth, icon: b.cell.spec.kind === "figure" ? "image" : "table", slot: true });
    } else if (isCell(b) && b.cell.spec.type === "reading") {
      continue;
    } else if (isCell(b)) {
      const t = b.cell.title || b.cell.output?.pin?.title || "";
      out.push({ key: b.id, value: b.id, label: `${nums.get(b.id)}${t ? ` · ${t}` : ""}`, indent: depth, icon: b.cell.spec.type === "capture" && b.cell.spec.kind === "figure" ? "image" : "table" });
    } else if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") {
      const level = Number(b.kind[1]) - 1;
      depth = level + 1;
      out.push({ key: b.id, value: b.id, label: plainText(b.text) || "Heading", indent: level, heading: true });
    }
  }
  out.push({ key: "end", value: "end", label: "At the end", indent: 0 });
  return out;
});

/** A slot the new blocks take the place of, when one is chosen. */
const slotPlace = computed(() => (place.value?.startsWith("slot:") ? place.value.slice(5) : null));
const slotBlock = computed(() => (slotPlace.value ? (targetBlocks.value.find(b => b.id === slotPlace.value) as CellBlock | undefined) ?? null : null));
/** Arrived from a slot's Open button: filling it is the point, and returning to the report follows. */
const fillMode = computed(() => !!reports.filling && reports.filling.reportId === target.value && slotPlace.value === reports.filling.cellId);
/** Where a draft lands by default: the slot it was opened for, a slot for the same view, or the end. */
function defaultPlace(): string | null {
  const f = reports.filling;
  if (f && f.reportId === target.value && targetBlocks.value.some(b => b.id === f.cellId)) return `slot:${f.cellId}`;
  const s = src.value;
  const match = s && targetBlocks.value.find(b => isCell(b) && b.cell.spec.type === "slot" && b.cell.spec.view === s.view && (s.kind === "document" || b.cell.spec.kind === s.kind));
  return match ? `slot:${match.id}` : "end";
}

/** Where the new blocks go, as an index into the target's blocks. */
const insertIndex = computed(() => {
  const blocks = targetBlocks.value;
  if (place.value === null) return 0;
  if (slotPlace.value) { const i = blocks.findIndex(b => b.id === slotPlace.value); return i < 0 ? blocks.length : i; }
  if (place.value === "end") {
    let i = blocks.length;
    while (i > 0) { const b = blocks[i - 1]; if (!isCell(b) && b.kind === "p" && !b.text.trim()) i--; else break; }
    return i;
  }
  const i = blocks.findIndex(b => b.id === place.value);
  return i < 0 ? blocks.length : i + 1;
});
const meaningful = (b: Block) => isCell(b) || b.kind === "hr" || !!b.text.trim();
const CONTEXT = 3;
const beforeAll = computed(() => targetBlocks.value.slice(0, insertIndex.value).filter(meaningful));
const afterAll = computed(() => targetBlocks.value.slice(insertIndex.value + (slotBlock.value ? 1 : 0)).filter(meaningful));
const before = computed(() => beforeAll.value.slice(-CONTEXT));
const after = computed(() => afterAll.value.slice(0, 2));
const beforeHidden = computed(() => Math.max(0, beforeAll.value.length - CONTEXT));
const afterHidden = computed(() => Math.max(0, afterAll.value.length - 2));

// ── What is added ───────────────────────────────────────────────────────
const draft = ref<Block[]>([]);
const rows = ref(10);
const columns = ref<Set<string>>(new Set());
const light = ref(true);
const figureB64 = ref("");
const figureData = computed(() => (figureB64.value ? `data:image/png;base64,${figureB64.value}` : null));
const rowOptions = computed(() => {
  const n = src.value?.table?.rows.length ?? 0;
  return [...new Set([5, 10, 25, 50].filter(x => x < n).concat(n))];
});

watch(draftSrc, (s) => {
  if (!s) return;
  error.value = "";
  adding.value = false;
  editingId.value = null;
  const f = reports.filling;
  target.value = f && reports.list.some(r => r.id === f.reportId) ? f.reportId : reports.currentId && reports.list.some(r => r.id === reports.currentId) ? reports.currentId : reports.list[0]?.id ?? NEW;
  newTitle.value = s.title;
  place.value = defaultPlace();
  light.value = true;
  figureB64.value = s.figure ?? "";
  if (s.table) {
    const n = s.table.rows.length;
    rows.value = n <= 25 ? n : 10;
    // A wide table keeps the name and four more columns; the rest are a click away.
    columns.value = new Set(s.table.columns.slice(0, 5).map(c => c.id));
  }
  draft.value = s.kind === "document"
    ? fromMarkdown(s.markdown ?? "")
    : [{ id: newId(), kind: "cell", cell: buildCell(s) }];
  void loadContextFigures();
}, { immediate: true });

function buildCell(s: ImportDraft): Cell {
  return {
    spec: { type: "capture", kind: s.kind === "figure" ? "figure" : "table", route: s.route, view: s.view },
    title: s.title,
    caption: "",
    output: s.kind === "figure" ? { figure: "pending" } : { table: trimmed(s) },
    ranOn: s.ranOn,
  };
}
function trimmed(s: ImportDraft) {
  const t = s.table!;
  const keep = t.columns.filter((c, i) => i === 0 || columns.value.has(c.id));
  const rowsKept = t.rows.slice(0, rows.value).map(r => Object.fromEntries(keep.map(c => [c.id, r[c.id]])));
  return { columns: keep, rows: rowsKept, total: t.total };
}
// Filling a slot takes the slot's title; leaving it gives the view's back, unless it was retitled.
watch(slotBlock, (slot, was) => {
  const s = src.value;
  if (!s) return;
  for (const b of draft.value) {
    if (!isCell(b)) continue;
    const from = was?.cell.title || s.title;
    if (b.cell.title === from || !b.cell.title) b.cell = { ...b.cell, title: slot?.cell.title || s.title };
  }
});
// Trimming rebuilds the table in place, keeping the words written around it.
watch([rows, columns], () => {
  const s = src.value;
  if (!s?.table) return;
  for (const b of draft.value) if (isCell(b)) b.cell = { ...b.cell, output: { table: trimmed(s) } };
});
function toggleColumn(id: string) {
  const next = new Set(columns.value);
  next.has(id) ? next.delete(id) : next.add(id);
  columns.value = next;
}
async function setLight(on: boolean) {
  light.value = on;
  const s = src.value;
  if (!s?.renderFigure) return;
  try { figureB64.value = await s.renderFigure(on); } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
function patchCell(id: string, patch: Partial<Cell>) {
  const b = draft.value.find(x => x.id === id);
  if (b && isCell(b)) b.cell = { ...b.cell, ...patch };
}

// Figures of the report around the spot.
const ctxFigures = ref<Record<string, string>>({});
async function loadContextFigures() {
  for (const b of targetBlocks.value) {
    const path = isCell(b) ? b.cell.output?.figure : null;
    if (!path || ctxFigures.value[path] || reports.figures[path]) continue;
    const b64 = await Figure(path).catch(() => "");
    if (b64) ctxFigures.value = { ...ctxFigures.value, [path]: `data:image/png;base64,${b64}` };
  }
}
watch(target, () => void loadContextFigures());
const figureOf = (b: CellBlock) => { const p = b.cell.output?.figure; return p ? reports.figures[p] ?? ctxFigures.value[p] ?? null : null; };

// Numbered as they will be once added.
const numbers = computed(() => {
  const all = [...targetBlocks.value.slice(0, insertIndex.value), ...draft.value, ...targetBlocks.value.slice(insertIndex.value + (slotBlock.value ? 1 : 0))];
  return cellNumbers(target.value === NEW ? draft.value : all);
});
const olOf = (list: Block[]) => {
  const out = new Map<string, number>();
  let n = 0;
  list.forEach((b, i) => { if (b.kind !== "ol") { n = 0; return; } n = list[i - 1]?.kind === "ol" ? n + 1 : 1; out.set(b.id, n); });
  return out;
};
const ctxNumbers = computed(() => olOf(targetBlocks.value));
const draftOl = computed(() => olOf(draft.value));

// ── Writing around it: the notebook's text editing, on the draft ────────
const editingId = ref<string | null>(null);
const caret = ref<number | "start" | "end" | null>(null);
const hasProseAbove = computed(() => draft.value.length > 0 && !isCell(draft.value[0]) && src.value?.kind !== "document");
const hasProseBelow = computed(() => draft.value.length > 0 && !isCell(draft.value[draft.value.length - 1]) && src.value?.kind !== "document");
function edit(id: string, c: number | "start" | "end") { editingId.value = id; caret.value = c; }
function onBlur(id: string) { setTimeout(() => { if (editingId.value === id && !(document.activeElement as HTMLElement)?.closest?.("[aria-label='What is added']")) editingId.value = null; }, 0); }
function writeAbove() { const id = newId(); draft.value.unshift({ id, kind: "p", text: "" }); edit(id, "start"); }
function writeBelow() { const id = newId(); draft.value.push({ id, kind: "p", text: "" }); edit(id, "start"); }
function setText(id: string, text: string) { const b = draft.value.find(x => x.id === id); if (b && !isCell(b)) b.text = text; }
function convert(id: string, kind: TextKind, text: string, lang?: string) {
  const i = draft.value.findIndex(x => x.id === id);
  if (i < 0) return;
  draft.value.splice(i, 1, { id, kind, text, lang });
  if (kind === "hr") { const p = newId(); draft.value.splice(i + 1, 0, { id: p, kind: "p", text: "" }); edit(p, "start"); } else edit(id, "end");
}
function split(id: string, a: string, c: string) {
  const i = draft.value.findIndex(x => x.id === id);
  const b = draft.value[i];
  if (!b || isCell(b)) return;
  b.text = a;
  const nid = newId();
  draft.value.splice(i + 1, 0, { id: nid, kind: b.kind === "ul" || b.kind === "ol" ? b.kind : "p", text: c });
  edit(nid, "start");
}
function join(i: number) {
  const b = draft.value[i], prev = draft.value[i - 1];
  if (!b || isCell(b)) return;
  // An empty line at the edge of the new material goes away on Backspace.
  if (!prev || isCell(prev)) { if (!b.text) { draft.value.splice(i, 1); editingId.value = null; } return; }
  const at = prev.text.length;
  prev.text += b.text;
  draft.value.splice(i, 1);
  edit(prev.id, at);
}
function move(i: number, d: -1 | 1) {
  const t = draft.value[i + d];
  if (t && !isCell(t)) edit(t.id, d < 0 ? "end" : "start");
}
function paste(id: string, blocks: Block[], a: string, c: string) {
  const i = draft.value.findIndex(x => x.id === id);
  if (i < 0) return;
  const b = draft.value[i];
  if (!isCell(b)) b.text = a;
  draft.value.splice(i + 1, 0, ...blocks, ...(c ? [{ id: newId(), kind: "p" as TextKind, text: c }] : []));
}

// ── Adding ──────────────────────────────────────────────────────────────
const adding = ref(false);
const error = ref("");
const newNumber = computed(() => { const c = draft.value.find(isCell); return c ? numbers.value.get(c.id) : null; });
const placeLabel = computed(() => {
  if (target.value === NEW) return "";
  if (slotBlock.value) return "";
  if (place.value === null) return " at the top";
  if (place.value === "end") return " at the end";
  const p = places.value.find(o => o.value === place.value);
  return p?.heading ? ` under “${p.label}”` : ` after ${p?.label.split(" · ")[0] ?? "it"}`;
});
const summary = computed(() => {
  const what = newNumber.value ?? (src.value?.kind === "document" ? "The text" : "It");
  const where = target.value === NEW ? `a new report, “${newTitle.value || "Untitled report"}”` : `“${targetTitle.value}”`;
  const words = draft.value.filter(b => !isCell(b) && b.text.trim()).length;
  if (slotBlock.value) return `Fills ${newNumber.value ?? "the slot"}${slotBlock.value.cell.title ? `, “${slotBlock.value.cell.title}”,` : ""} in ${where}${words && src.value?.kind !== "document" ? `, with ${words} ${words === 1 ? "paragraph" : "paragraphs"} of yours` : ""}.`;
  return `Adds ${what}${placeLabel.value} in ${where}${words && src.value?.kind !== "document" ? `, with ${words} ${words === 1 ? "paragraph" : "paragraphs"} of yours` : ""}.`;
});
const sourceLine = computed(() => (src.value ? [src.value.view, src.value.title !== src.value.view ? src.value.title : "", `snapshot ${src.value.ranOn.label}`, src.value.ranOn.commit ? src.value.ranOn.commit.slice(0, 7) : "", `analysis r${src.value.ranOn.revision}`].filter(Boolean).join(" · ") : ""));

async function add(open: boolean) {
  if (adding.value || !src.value) return;
  adding.value = true;
  error.value = "";
  try {
    const blocks: Block[] = [];
    for (const b of draft.value) {
      if (!isCell(b)) { if (meaningful(b)) blocks.push({ ...b }); continue; }
      let output = b.cell.output;
      if (src.value.kind === "figure") output = { figure: await reports.keepFigure(figureB64.value) };
      blocks.push({ id: newId(), kind: "cell", cell: { ...b.cell, output } });
    }
    if (!blocks.length) { error.value = "Nothing to add."; adding.value = false; return; }
    if (slotBlock.value && target.value !== NEW) {
      await reports.fillSlot(target.value, slotBlock.value.id, blocks);
    } else {
      await reports.insertInto(target.value === NEW ? null : target.value, target.value === NEW ? "end" : place.value, blocks, newTitle.value.trim() || "Untitled report");
    }
    reports.importing = null;
    if (open) void router.push("/views/evidence");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    adding.value = false;
  }
}
function close() { reports.importing = null; }
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void add(e.shiftKey); return; }
  if (e.key === "Escape" && !editingId.value) { e.preventDefault(); close(); }
}
</script>

<style scoped>
.nb-ghost { display: flex; align-items: center; gap: 6px; margin: 2px 0; padding: 3px 6px 3px 0; font-size: 12.5px; color: rgb(var(--c-neutral-400)); border-radius: 4px; transition: color 120ms ease-out; }
.nb-ghost:hover, .nb-ghost:focus-visible { color: rgb(var(--c-neutral-800)); outline: none; }
</style>
