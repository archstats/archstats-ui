<template>
  <ViewWorkspaceLayout
    :queryable="false"
    title="Evidence"
    :tabs="tabs"
    v-model:active-tab="tab"
    v-model:is-sidebar-open="paneOpen"
    sidebar-width="320px"
  >
    <template #stats>
      <span>Reports <span class="text-neutral-800">{{ reports.list.length }}</span></span>
      <span class="text-neutral-400">·</span>
      <span>Pins <span class="text-neutral-800">{{ pool.length }}</span></span>
      <span v-if="reports.saving" class="text-neutral-400">· Saving…</span>
    </template>

    <template #actions>
      <template v-if="reports.current">
        <label class="flex shrink-0 items-center whitespace-nowrap">
          <select class="ui-input ui-input-sm max-w-[240px]" :value="reports.doc.kernel" aria-label="Snapshot the cells run on" title="The snapshot this report's cells run on" @change="reports.setKernel(($event.target as HTMLSelectElement).value)">
            <option value="newest">Runs on newest · {{ newestLabel }}</option>
            <option v-for="s in completeScans" :key="s.id" :value="s.id">{{ scanLabel(s) }}</option>
          </select>
        </label>
        <button
          v-if="reports.stale.length"
          type="button"
          class="ui-btn ui-btn-sm ui-btn-primary"
          :disabled="reports.running.length > 0"
          :title="`${reports.stale.length} cells ran on another snapshot or never ran (⌘⇧↵)`"
          @click="reports.runAll()"
        >
          <Play :size="11" :stroke-width="2.4" fill="currentColor"/>
          <span>{{ reports.running.length ? "Running…" : `Run ${reports.stale.length} stale` }}</span>
        </button>
        <button
          v-if="reports.slots.length"
          type="button"
          class="ui-btn ui-btn-sm"
          :title="takeTitle"
          @click="takeAll"
        >
          <Icon icon="image" :size="13" class="text-neutral-500"/><span>{{ takeLabel }}</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="raw" :class="{ 'bg-neutral-100': raw }" title="The whole report as Markdown (⌘/)" @click="toggleRaw">
          <Icon icon="code" :size="13" class="text-neutral-500"/><span class="hidden min-[1400px]:inline">Markdown</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" title="Preview the report as a PDF, then save it (⌘⇧E)" @click="exportPdf">
          <Icon icon="file-down" :size="13" class="text-neutral-500"/><span>PDF</span>
        </button>
      </template>
    </template>

    <template #visualizer>
      <div class="flex min-h-0 grow">
        <ReportsPane
          :reports="reports.list"
          :current-id="reports.currentId"
          :outline="outline"
          :selected-id="selectedId ?? editingId"
          :counts="cellCounts"
          @open="openReport"
          @create="createReport()"
          @rename="(id, t) => reports.rename(id, t)"
          @duplicate="reports.duplicate($event)"
          @save-template="savingTemplate = reports.list.find(r => r.id === $event) ?? null"
          @remove="reports.remove($event)"
          @reorder="reports.reorder($event)"
          @jump="jump"
        />

        <div ref="scroller" class="relative min-h-0 flex-1 overflow-y-auto bg-surface" @dragover="onDragOver" @drop="onDrop" @dragleave="onDragLeave">
          <!-- No report yet. -->
          <div v-if="!reports.current" class="mx-auto flex h-full max-w-[520px] flex-col items-center justify-center px-8 text-center">
            <Icon icon="file-text" :size="22" class="text-neutral-300"/>
            <h2 class="mt-3 text-lg font-semibold text-neutral-900">Write the report as you go</h2>
            <p class="mt-2 text-sm leading-6 text-neutral-600">A report is prose and evidence together: pins from the pool, tables and queries run on a snapshot, each saying what it ran on and re-runnable when the code moves. Write several from the same pins.</p>
            <button type="button" class="ui-btn ui-btn-primary mt-5" @click="createReport()">Start a report</button>
            <p class="mt-3 text-xs leading-5 text-neutral-500">From a blank page, or a template written for this codebase: facts counted from the snapshot, the tables to run, the figures to add, and prompts for what they mean.</p>
          </div>

          <article v-else class="mx-auto w-full max-w-[880px] pb-[40vh] pl-[118px] pr-12 pt-12">
            <input
              :value="titleDraft"
              class="w-full bg-transparent text-[30px] font-semibold leading-tight tracking-[-0.02em] text-neutral-950 outline-none placeholder:text-neutral-300"
              placeholder="Untitled report"
              aria-label="Report title"
              @input="titleDraft = ($event.target as HTMLInputElement).value"
              @change="saveTitle"
              @keydown.enter.prevent="saveTitle(); editFirst()"
            >
            <p class="mt-2 font-mono text-[11.5px] text-neutral-500">
              {{ kernelLine }}
              <template v-if="reports.stale.length"> · <span class="text-accent-700">{{ reports.stale.length }} {{ reports.stale.length === 1 ? "cell ran" : "cells ran" }} elsewhere</span></template>
            </p>
            <p v-if="exportNote" class="mt-2 text-sm text-red-700" role="alert" @click="exportNote = ''">{{ exportNote }}</p>

            <!-- The whole report as Markdown; cells are fenced archstats blocks. -->
            <textarea
              v-if="raw"
              ref="rawEl"
              :value="rawText"
              spellcheck="false"
              class="mt-8 block min-h-[60vh] w-full resize-none rounded-lg bg-neutral-50 px-5 py-4 font-mono text-[13px] leading-6 text-neutral-800 outline-none hairline focus:shadow-[0_0_0_1px_rgb(var(--c-accent-400))]"
              aria-label="Report as Markdown"
              @input="onRawInput"
            ></textarea>

            <div v-else class="mt-8" role="document" aria-label="Report">
              <div
                v-for="(b, i) in reports.doc.blocks"
                :key="b.id"
                class="nb-row group/row relative"
                :data-id="b.id"
                :data-index="i"
              >
                <div v-if="dropIndex === i" class="nb-drop" aria-hidden="true"><span>{{ dropLabel }}</span></div>
                <!-- The row's handle: drag to move, + to insert below. -->
                <div class="absolute -left-[34px] top-1 flex flex-col items-center opacity-0 transition-opacity group-hover/row:opacity-100" :class="{ '!opacity-100': selectedId === b.id }">
                  <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" :aria-label="'Insert below'" title="Insert below (/)" @mousedown.prevent @click="openInsert(b.id, 'below')"><Icon icon="plus" :size="13"/></button>
                  <span class="flex h-5 w-5 cursor-grab items-center justify-center rounded text-neutral-300 hover:bg-neutral-100 hover:text-neutral-700 active:cursor-grabbing" draggable="true" title="Drag to move" @dragstart="onBlockDrag($event, b.id)" @dragend="dropIndex = null"><Icon icon="grip" :size="12"/></span>
                </div>
                <div :class="!isCell(b) && selectedId === b.id ? 'rounded shadow-[inset_2px_0_0_rgb(var(--c-accent-500))] bg-accent-50/40 -ml-3 pl-3' : ''">
                  <NotebookText
                    v-if="!isCell(b)"
                    :block="b"
                    :editing="editingId === b.id"
                    :caret="editingId === b.id ? caret : null"
                    :number="olNumbers.get(b.id)"
                    :is-last="i === reports.doc.blocks.length - 1"
                    @edit="c => edit(b.id, c)"
                    @text="t => reports.setText(b.id, t)"
                    @convert="(k, t, lang) => convert(b.id, k, t, lang)"
                    @split="(a, c) => split(b.id, a, c)"
                    @join="join(b.id)"
                    @move="d => moveCaret(b.id, d)"
                    @slash="openInsert(b.id, 'replace')"
                    @escape="toCommand(b.id)"
                    @blur="onBlur(b.id)"
                    @paste="(bs, a, c) => pasteBlocks(b.id, bs, a, c)"
                  />
                  <NotebookReading
                    v-else-if="b.cell.spec.type === 'reading'"
                    :cell="b.cell"
                    :selected="selectedId === b.id"
                    :running="reports.running.includes(b.id)"
                    :stale="isStale(b)"
                    :kernel-label="kernelShort"
                    @select="selectCell(b.id)"
                    @run="reports.run(b.id)"
                  />
                  <NotebookSlot
                    v-else-if="b.cell.spec.type === 'slot'"
                    :cell="b.cell"
                    :number="numbers.get(b.id) ?? ''"
                    :selected="selectedId === b.id"
                    :taking="reports.takeQueue?.ids[reports.takeQueue.at] === b.id"
                    @select="selectCell(b.id)"
                    @open="openSlot(b.id)"
                    @take="taking.start([b.id])"
                  />
                  <NotebookCell
                    v-else
                    :cell="b.cell"
                    :number="numbers.get(b.id) ?? ''"
                    :selected="selectedId === b.id"
                    :running="reports.running.includes(b.id)"
                    :stale="isStale(b)"
                    :kernel-label="kernelShort"
                    :figure="b.cell.output?.figure ? reports.figures[b.cell.output.figure] ?? null : null"
                    :figure-missing="!!b.cell.output?.figure && reports.missingFigures.includes(b.cell.output.figure)"
                    :workspace="workspaceName"
                    :label="label"
                    :scan-id="reports.kernel?.id ?? null"
                    @select="selectCell(b.id)"
                    @run="reports.run(b.id)"
                    @patch="p => reports.setCell(b.id, p)"
                    @spec="s => setSpec(b.id, s)"
                  />
                </div>
              </div>
              <div v-if="dropIndex === reports.doc.blocks.length" class="nb-drop" aria-hidden="true"><span>{{ dropLabel }}</span></div>
            </div>
          </article>
        </div>
      </div>

      <InsertMenu
        v-if="insertAt"
        :anchor="insertAt.anchor"
        :pins="pool"
        :usage="reports.pinUsage"
        :saved-queries="savedQueries"
        :figures="reports.figures"
        :run="reports.runContext()"
        :kernel-label="kernelShort"
        :label="label"
        :columns="columnSets"
        @choose="onChoose"
        @close="closeInsert"
      />
    </template>

    <template #visualizer-overlays>
      <PdfPreviewSheet v-model="pdfOpen" :blocked="blockedReason"/>
      <TemplateSheet @blank="createBlank" @created="afterTemplate"/>
      <SaveTemplateSheet v-model="savingTemplate"/>
    </template>

    <template #tab-pool>
      <PoolPane
        :pins="pool"
        :usage="reports.pinUsage"
        :status="evidence.statuses"
        :figures="reports.figures"
        @insert="insertPin"
        @drag="draggingPin = true"
        @dragend="draggingPin = false; dropIndex = null"
      />
    </template>
    <template #tab-cell>
      <CellPane
        :block="selectedCell"
        :number="selectedCell ? numbers.get(selectedCell.id) ?? '' : ''"
        :pin="selectedPin"
        :usage="selectedPinUsage"
        :running="!!selectedCell && reports.running.includes(selectedCell.id)"
        :stale="!!selectedCell && isStale(selectedCell)"
        :kernel-label="kernelShort"
        :columns="columnLists"
        :label="label"
        @spec="s => selectedCell && setSpec(selectedCell.id, s)"
        @run="selectedCell && reports.run(selectedCell.id)"
        @remove="selectedCell && removeSelected()"
        @adopt="adoptSelected"
        @fill="selectedCell && openSlot(selectedCell.id)"
        @take="selectedCell && taking.start([selectedCell.id])"
        @pin-note="setPinNote"
      />
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Play } from "lucide-vue-next";
import { Figure } from "wailsjs/go/app/EvidenceService";
import { QueryIn } from "wailsjs/go/app/QueryService";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import CellPane from "~/components/report/CellPane.vue";
import InsertMenu, { type InsertChoice } from "~/components/report/InsertMenu.vue";
import NotebookCell from "~/components/report/NotebookCell.vue";
import NotebookReading from "~/components/report/NotebookReading.vue";
import NotebookSlot from "~/components/report/NotebookSlot.vue";
import SaveTemplateSheet from "~/components/report/SaveTemplateSheet.vue";
import TemplateSheet from "~/components/report/TemplateSheet.vue";
import NotebookText from "~/components/report/NotebookText.vue";
import PoolPane from "~/components/report/PoolPane.vue";
import PdfPreviewSheet from "~/components/report/PdfPreviewSheet.vue";
import ReportsPane, { type OutlineItem } from "~/components/report/ReportsPane.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useEvidenceStore } from "~/stores/evidence";
import { useReportsStore, type ReportRecord } from "~/stores/reports";
import { useSlotTaking } from "~/composables/useSlotTaking";
import { useRouter } from "vue-router";
import { useAuthorsStore } from "~/stores/authors";
import { namesIn } from "~/utils/reportCells";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";
import { saveBundle } from "~/utils/files";
import { cellNumbers, isCell, newId, plainText, runnable, type Block, type CellBlock, type CellSpec, type TextKind } from "~/utils/reportDoc";
import { newestFirst } from "~/utils/scanOrder";
import { formatScanTime } from "~/utils/time";

// Evidence as a notebook: reports on the left, the open report in the middle,
// the pool of pins and the selected cell on the right. Prose is Markdown that
// renders as you leave it; evidence is a cell that ran on one snapshot and
// runs again on a newer one.

const reports = useReportsStore();
const evidence = useEvidenceStore();
const workspaces = useWorkspacesStore();
const data = useDataStore();
const state = useStateStore();

const tab = ref("pool");
const paneOpen = ref(true);
const tabs = computed(() => [{ id: "pool", label: "Pool" }, { id: "cell", label: "Cell" }]);

watch(() => workspaces.active?.id, async (id) => {
  if (!id) return;
  await evidence.load(id);
  await reports.load(id);
}, { immediate: true });
onBeforeUnmount(() => reports.flushSave());

const label = (id: string) => data.statNiceName(id) || id;
const workspaceName = computed(() => workspaces.active?.name ?? "");
const pool = computed(() => evidence.pins.filter(p => p.kind !== "heading"));
const savedQueries = computed(() => state.get<Array<{ id: string; name: string; sql: string }>>("queries.saved", []) ?? []);

// Pin thumbnails share the report's figure cache.
watch(() => pool.value.map(p => p.figurePath).join(), async () => {
  for (const p of pool.value) {
    if (!p.figurePath || reports.figures[p.figurePath]) continue;
    const b64 = await Figure(p.figurePath).catch(() => "");
    if (b64) reports.figures = { ...reports.figures, [p.figurePath]: `data:image/png;base64,${b64}` };
  }
}, { immediate: true });

// Every figure the report holds is loaded, however it arrived: added, undone, pasted as Markdown.
watch(() => reports.cells.map(c => c.cell.output?.figure ?? "").join(), () => void reports.loadFigures(), { immediate: true });

// ── Kernel ──────────────────────────────────────────────────────────────
const completeScans = computed(() => newestFirst(workspaces.scans.filter((s: any) => s.status === "complete")) as any[]);
const scanLabel = (s: any) => `${s.label || formatScanTime(s.headTime ?? s.startedAt)}${s.headCommit ? ` · ${String(s.headCommit).slice(0, 7)}` : ""}`;
const newestLabel = computed(() => (completeScans.value[0] ? scanLabel(completeScans.value[0]) : "none"));
const kernelShort = computed(() => reports.kernel?.label ?? "no snapshot");
const kernelLine = computed(() => {
  const k = reports.kernel;
  if (!k) return "No complete snapshot to run on yet.";
  const cells = reports.cells.length;
  return `Runs on ${k.label}${k.headCommit ? ` · ${k.headCommit.slice(0, 7)}` : ""} · analysis r${k.revision} · ${cells} ${cells === 1 ? "cell" : "cells"}`;
});
const isStale = (b: CellBlock) => runnable(b.cell.spec) && (!b.cell.ranOn || b.cell.ranOn.scanId !== reports.kernel?.id);

// Columns each table can show, read from the kernel snapshot.
const columnLists = ref<Record<"components" | "files", string[]>>({ components: [], files: [] });
const columnSets = computed(() => ({ components: new Set(columnLists.value.components), files: new Set(columnLists.value.files) }));
watch(() => reports.kernel?.id, async (id) => {
  if (!id) return;
  const read = async (t: string) => ((await QueryIn(id, `SELECT name FROM pragma_table_info('${t}')`).catch(() => [])) as any[]).map(r => String(r.name)).filter(n => n.includes("__"));
  columnLists.value = { components: await read("components"), files: await read("files") };
}, { immediate: true });

// ── Title ───────────────────────────────────────────────────────────────
const titleDraft = ref("");
watch(() => reports.current?.title, t => { titleDraft.value = t && t !== "Untitled report" ? t : ""; }, { immediate: true });
function saveTitle() {
  if (reports.current && (titleDraft.value || "Untitled report") !== reports.current.title) void reports.rename(reports.current.id, titleDraft.value || "Untitled report");
}

// ── Numbering and outline ───────────────────────────────────────────────
const numbers = computed(() => cellNumbers(reports.doc.blocks));
const olNumbers = computed(() => {
  const out = new Map<string, number>();
  let n = 0;
  reports.doc.blocks.forEach((b, i) => {
    if (b.kind !== "ol") { n = 0; return; }
    n = reports.doc.blocks[i - 1]?.kind === "ol" ? n + 1 : 1;
    out.set(b.id, n);
  });
  return out;
});
const outline = computed<OutlineItem[]>(() => {
  const out: OutlineItem[] = [];
  let depth = 0;
  for (const b of reports.doc.blocks) {
    if (isCell(b) && b.cell.spec.type === "reading") continue;
    if (isCell(b)) {
      const s = b.cell.spec;
      const t = b.cell.title || b.cell.output?.pin?.title || "";
      out.push({ id: b.id, label: `${numbers.value.get(b.id)}${t ? ` · ${t}` : ""}${s.type === "slot" ? " (to add)" : ""}`, indent: depth, heading: false, icon: (s.type === "capture" || s.type === "slot") && s.kind === "figure" ? "image" : s.type === "pin" ? "bookmark" : "table", stale: isStale(b) });
    } else if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") {
      const level = Number(b.kind[1]) - 1;
      depth = level + 1;
      out.push({ id: b.id, label: plainText(b.text) || "Heading", indent: level, heading: true });
    }
  }
  return out;
});
const cellCounts = computed(() => {
  const out: Record<string, number> = {};
  for (const r of reports.list) out[r.id] = r.id === reports.currentId ? reports.cells.length : (r.body.match(/"kind":"cell"/g) ?? []).length;
  return out;
});

// ── Editing ─────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const caret = ref<number | "start" | "end" | null>(null);

function edit(id: string, c: number | "start" | "end") {
  selectedId.value = null;
  editingId.value = id;
  caret.value = c;
}
function onBlur(id: string) {
  // Leaving to the insert menu or another block keeps the place; leaving to nothing ends editing.
  setTimeout(() => {
    if (editingId.value === id && !insertAt.value && !(document.activeElement as HTMLElement)?.closest?.(".nb-row")) editingId.value = null;
  }, 0);
}
function toCommand(id: string) {
  editingId.value = null;
  selectedId.value = id;
  (document.activeElement as HTMLElement)?.blur?.();
}
function selectCell(id: string) {
  editingId.value = null;
  selectedId.value = id;
  tab.value = "cell";
  paneOpen.value = true;
}
function editFirst() {
  const first = reports.doc.blocks.find(b => !isCell(b));
  if (first) edit(first.id, "start");
}
function indexOf(id: string) { return reports.doc.blocks.findIndex(b => b.id === id); }

function convert(id: string, kind: TextKind, text: string, lang?: string) {
  if (kind === "hr") {
    reports.replaceBlock(id, { id, kind: "hr", text: "" });
    const next = reports.doc.blocks[indexOf(id) + 1];
    if (next && !isCell(next) && next.kind === "p" && !next.text) edit(next.id, "start");
    else { const nid = newId(); reports.insert(id, [{ id: nid, kind: "p", text: "" }]); edit(nid, "start"); }
    return;
  }
  reports.replaceBlock(id, { id, kind, text, lang });
  edit(id, "end");
}
function split(id: string, before: string, after: string) {
  const b = reports.doc.blocks.find(x => x.id === id);
  if (!b || isCell(b)) return;
  reports.setText(id, before);
  // A list continues; a heading, quote or code block is followed by a paragraph.
  const kind: TextKind = b.kind === "ul" || b.kind === "ol" ? b.kind : "p";
  const nid = newId();
  reports.insert(id, [{ id: nid, kind, text: after }]);
  edit(nid, "start");
}
function join(id: string) {
  const i = indexOf(id);
  const b = reports.doc.blocks[i];
  const prev = reports.doc.blocks[i - 1];
  if (!b || isCell(b)) return;
  if (!prev) return;
  if (isCell(prev)) {
    if (!b.text) { reports.removeBlock(id); }
    toCommand(prev.id);
    return;
  }
  if (prev.kind === "hr") { reports.removeBlock(prev.id); edit(id, "start"); return; }
  const at = prev.text.length;
  reports.checkpoint();
  prev.text = prev.text + b.text;
  reports.removeBlock(id);
  edit(prev.id, at);
}
function moveCaret(id: string, dir: -1 | 1) {
  const blocks = reports.doc.blocks;
  const target = blocks[indexOf(id) + dir];
  if (!target) return;
  if (isCell(target)) { toCommand(target.id); return; }
  edit(target.id, dir < 0 ? "end" : "start");
}
function pasteBlocks(id: string, blocks: Block[], before: string, after: string) {
  if (!blocks.length) return;
  reports.setText(id, before);
  const tail: Block[] = after ? [{ id: newId(), kind: "p", text: after }] : [];
  reports.insert(id, [...blocks, ...tail]);
  const b = reports.doc.blocks.find(x => x.id === id);
  if (b && !isCell(b) && !b.text.trim()) reports.removeBlock(id);
  const last = blocks[blocks.length - 1];
  if (!isCell(last)) edit(last.id, "end");
}
function setSpec(id: string, spec: CellSpec) {
  reports.setCell(id, { spec });
}
function removeSelected() {
  const id = selectedId.value;
  if (!id) return;
  const i = indexOf(id);
  reports.removeBlock(id);
  const next = reports.doc.blocks[Math.min(i, reports.doc.blocks.length - 1)];
  selectedId.value = next?.id ?? null;
}
const selectedCell = computed(() => (reports.doc.blocks.find(b => b.id === selectedId.value && isCell(b)) as CellBlock | undefined) ?? null);
const selectedPin = computed(() => {
  const s = selectedCell.value?.cell.spec;
  return s?.type === "pin" ? evidence.pins.find(p => p.id === s.pinId) ?? null : null;
});
const selectedPinUsage = computed(() => (selectedPin.value ? reports.pinUsage.get(selectedPin.value.id) ?? [] : []));
function setPinNote(note: string) {
  if (selectedPin.value) void evidence.update(selectedPin.value.id, { note });
}

function jump(id: string) {
  const el = scroller.value?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
  const b = reports.doc.blocks.find(x => x.id === id);
  if (b && isCell(b)) selectCell(id);
  else toCommand(id);
}

// ── Inserting ───────────────────────────────────────────────────────────
const insertAt = ref<{ id: string | null; mode: "below" | "above" | "replace"; anchor: { left: number; top: number } } | null>(null);
const scroller = ref<HTMLElement | null>(null);

function openInsert(id: string | null, mode: "below" | "above" | "replace") {
  const row = id ? scroller.value?.querySelector(`[data-id="${id}"]`) as HTMLElement | null : null;
  const col = scroller.value?.querySelector("article") as HTMLElement | null;
  const r = row?.getBoundingClientRect();
  const left = (col?.getBoundingClientRect().left ?? 200) + 118;
  insertAt.value = { id, mode, anchor: { left, top: r ? (mode === "above" ? r.top : r.bottom) : 200 } };
}
function closeInsert() {
  const at = insertAt.value;
  insertAt.value = null;
  if (at?.mode === "replace" && at.id) edit(at.id, "end");
}
function onChoose(c: InsertChoice) {
  const at = insertAt.value;
  insertAt.value = null;
  if (!at) return;
  const host = at.id ? reports.doc.blocks.find(b => b.id === at.id) : null;
  const after = at.mode === "above" ? reports.doc.blocks[indexOf(at.id!) - 1]?.id ?? null : at.id;
  if (c.type === "text") {
    if (at.mode === "replace" && host && !isCell(host)) {
      convert(host.id, c.kind, "", c.lang);
      return;
    }
    const nid = newId();
    reports.insert(after, [{ id: nid, kind: c.kind, text: "", lang: c.lang }]);
    if (c.kind === "hr") { const p = newId(); reports.insert(nid, [{ id: p, kind: "p", text: "" }]); edit(p, "start"); }
    else edit(nid, "start");
    return;
  }
  addCell(after, c.spec, c.title ?? "");
}
function addCell(after: string | null, spec: CellSpec, title = "") {
  const id = newId();
  reports.insert(after, [{ id, kind: "cell", cell: { spec, title, caption: "", output: null, ranOn: null } }]);
  editingId.value = null;
  selectCell(id);
  // A cell lands with its evidence: it runs as it arrives.
  void reports.run(id);
  void nextTick(() => (scroller.value?.querySelector(`[data-id="${id}"]`) as HTMLElement | null)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
}
function insertPin(pinId: string) {
  const after = editingId.value ?? selectedId.value ?? reports.doc.blocks[reports.doc.blocks.length - 1]?.id ?? null;
  addCell(after, { type: "pin", pinId });
}

// ── Dragging ────────────────────────────────────────────────────────────
const dropIndex = ref<number | null>(null);
const draggingPin = ref(false);
const draggingBlock = ref<string | null>(null);
const dropLabel = computed(() => (draggingBlock.value ? "Move here" : "Insert pin here"));
function onBlockDrag(e: DragEvent, id: string) {
  draggingBlock.value = id;
  e.dataTransfer?.setData("application/x-archstats-block", id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  const row = (e.target as HTMLElement).closest(".nb-row") as HTMLElement | null;
  if (row && e.dataTransfer) e.dataTransfer.setDragImage(row, 24, 12);
}
function onDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types ?? [];
  if (!types.includes("application/x-archstats-pin") && !types.includes("application/x-archstats-block")) return;
  e.preventDefault();
  const rows = [...(scroller.value?.querySelectorAll(".nb-row") ?? [])] as HTMLElement[];
  let idx = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { idx = i; break; }
  }
  dropIndex.value = idx;
}
function onDragLeave(e: DragEvent) {
  if (!scroller.value?.contains(e.relatedTarget as Node)) dropIndex.value = null;
}
function onDrop(e: DragEvent) {
  const idx = dropIndex.value;
  dropIndex.value = null;
  const pin = e.dataTransfer?.getData("application/x-archstats-pin");
  const block = e.dataTransfer?.getData("application/x-archstats-block");
  draggingBlock.value = null;
  draggingPin.value = false;
  if (idx === null) return;
  e.preventDefault();
  if (block) { reports.move(block, idx); return; }
  if (pin) addCell(reports.doc.blocks[idx - 1]?.id ?? null, { type: "pin", pinId: pin });
}

// ── Raw Markdown ────────────────────────────────────────────────────────
const raw = ref(false);
const rawText = ref("");
const rawEl = ref<HTMLTextAreaElement | null>(null);
let rawTimer: ReturnType<typeof setTimeout> | null = null;
function toggleRaw() {
  if (raw.value) { if (rawTimer) { clearTimeout(rawTimer); reports.setMarkdown(rawText.value); } raw.value = false; return; }
  rawText.value = reports.markdown();
  raw.value = true;
  editingId.value = null;
  selectedId.value = null;
  void nextTick(() => rawEl.value?.focus());
}
function onRawInput(e: Event) {
  rawText.value = (e.target as HTMLTextAreaElement).value;
  const el = e.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
  if (rawTimer) clearTimeout(rawTimer);
  rawTimer = setTimeout(() => { rawTimer = null; reports.setMarkdown(rawText.value); }, 500);
}

// ── Report switching ────────────────────────────────────────────────────
function openReport(id: string) {
  raw.value = false;
  editingId.value = null;
  selectedId.value = null;
  reports.open(id);
}
/** New report: the template gallery, a blank page among its choices. */
function createReport() {
  reports.choosingTemplate = true;
}
async function createBlank() {
  raw.value = false;
  selectedId.value = null;
  await reports.create();
  await nextTick();
  editFirst();
}
function afterTemplate() {
  raw.value = false;
  editingId.value = null;
  selectedId.value = null;
  scroller.value?.scrollTo({ top: 0 });
}
const savingTemplate = ref<ReportRecord | null>(null);

// ── Slots and computed paragraphs ───────────────────────────────────────
const router = useRouter();
const taking = useSlotTaking();
/** A run paused on this report picks up where it stopped; otherwise every slot, in reading order. */
const pausedHere = computed(() => !!reports.takeQueue && reports.takeQueue.reportId === reports.currentId);
const takeLabel = computed(() => {
  const n = reports.slots.length;
  if (pausedHere.value) return `Resume taking · ${n} left`;
  const tables = reports.slots.filter(s => s.cell.spec.type === "slot" && s.cell.spec.kind === "table").length;
  return `Take ${n} ${tables === 0 ? (n === 1 ? "figure" : "figures") : tables === n ? (n === 1 ? "table" : "tables") : "figures and tables"}`;
});
const takeTitle = computed(() => "Opens each view the template names, set as it asks, and shows what it took before it goes in");
function takeAll() {
  const ids = reports.slots.map(s => s.id);
  if (pausedHere.value) { reports.takeQueue = { ...reports.takeQueue!, ids, at: 0 }; void taking.retake(); return; }
  void taking.start(ids);
}
/** A slot's view, set the way the template asks; Add to report there fills it. */
function openSlot(id: string) {
  const route = reports.beginFill(id, numbers.value.get(id) ?? "");
  if (route) void router.push(route);
}
/** A computed paragraph made the writer's own: plain text that no longer re-runs. */
function adoptSelected() {
  const id = selectedId.value;
  if (!id) return;
  reports.adoptReading(id);
  selectedId.value = null;
  edit(id, "end");
}

// ── Keyboard: command mode, as in a notebook ─────────────────────────────
let lastD = 0;
function onKey(e: KeyboardEvent) {
  if (insertAt.value) return;
  const mod = e.metaKey || e.ctrlKey;
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  const inNotebook = !!t?.closest?.("[role=document]") || !typing;
  if (!reports.current) return;
  if (mod && e.key === "/") { e.preventDefault(); toggleRaw(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); exportPdf(); return; }
  if (mod && e.key === "Enter" && e.shiftKey) { e.preventDefault(); void reports.runAll(); return; }
  if (mod && e.key.toLowerCase() === "z" && inNotebook && !raw.value) {
    e.preventDefault();
    if (e.shiftKey) reports.redo(); else reports.undo();
    return;
  }
  if (typing || raw.value) return;
  const blocks = reports.doc.blocks;
  const i = selectedId.value ? indexOf(selectedId.value) : -1;
  const sel = i >= 0 ? blocks[i] : null;
  const select = (j: number) => {
    const b = blocks[Math.max(0, Math.min(blocks.length - 1, j))];
    if (!b) return;
    if (isCell(b)) selectCell(b.id); else selectedId.value = b.id;
    (scroller.value?.querySelector(`[data-id="${b.id}"]`) as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  };
  if (!sel) return;
  switch (e.key) {
    case "ArrowDown": case "j": e.preventDefault(); select(i + 1); break;
    case "ArrowUp": case "k": e.preventDefault(); select(i - 1); break;
    case "Enter":
      e.preventDefault();
      if (e.shiftKey && isCell(sel)) { void reports.run(sel.id); break; }
      if (!isCell(sel)) edit(sel.id, "end");
      break;
    case "a": e.preventDefault(); openInsert(sel.id, "above"); break;
    case "b": case "/": e.preventDefault(); openInsert(sel.id, "below"); break;
    case "Backspace": case "Delete": e.preventDefault(); removeSelected(); break;
    case "d":
      if (Date.now() - lastD < 600) { e.preventDefault(); removeSelected(); lastD = 0; } else lastD = Date.now();
      break;
    case "Escape": selectedId.value = null; break;
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

// ── Export ──────────────────────────────────────────────────────────────
const exportNote = ref("");
// With authors pseudonymised, a report whose text names a real author stays in the app.
const authors = useAuthorsStore();
const blockedBy = computed(() => {
  if (!state.get("authors.pseudonymise", false)) return [];
  const text = [reports.current?.title ?? "", ...reports.doc.blocks.map(b => (isCell(b) ? `${b.cell.title} ${b.cell.caption} ${b.cell.output?.pin?.note ?? ""}` : b.text))].join("\n");
  return namesIn(text, Object.keys(authors.labels));
});
const blockedReason = computed(() => (blockedBy.value.length ? `The report names ${blockedBy.value[0]}; authors are pseudonymised, so edit it first.` : null));
// The PDF opens in a preview first; it is saved from there as the bytes you saw.
const pdfOpen = ref(false);
function exportPdf() {
  if (!reports.current) return;
  exportNote.value = "";
  pdfOpen.value = true;
}
useExportables().register({
  kind: "document",
  get title() { return reports.current?.title || "Report"; },
  label: "Copy report as Markdown",
  savable: true,
  saveLabel: "Report as Markdown with figures…",
  disabledReason: () => (!reports.current ? "No report is open." : blockedReason.value),
  markdown: () => reports.exportMarkdown(null),
  save: async () => {
    const title = reports.current?.title || "Report";
    const dir = `${title}-figures`;
    const files: Array<{ name: string; text?: string; base64?: string }> = [{ name: `${title}.md`, text: reports.exportMarkdown(dir) }];
    let n = 0;
    for (const c of reports.cells) {
      const path = c.cell.output?.figure;
      if (!path) continue;
      n++;
      const src = reports.figures[path] ?? `data:image/png;base64,${await Figure(path).catch(() => "")}`;
      files.push({ name: `${dir}/figure-${String(n).padStart(2, "0")}.png`, base64: src.replace(/^data:image\/png;base64,/, "") });
    }
    return saveBundle("Choose a folder for the report", files);
  },
});
</script>

<style scoped>
.nb-drop { position: relative; height: 0; }
.nb-drop::before { content: ""; position: absolute; left: -8px; right: 0; top: -2px; height: 2px; border-radius: 1px; background: rgb(var(--c-accent-500)); }
.nb-drop span { position: absolute; left: -8px; top: -20px; font-size: 11px; font-weight: 500; color: rgb(var(--c-accent-700)); background: rgb(var(--c-surface)); padding: 0 4px; }
</style>
