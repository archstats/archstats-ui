<template>
  <ViewWorkspaceLayout
    :queryable="false"
    :title="t('pages.evidence.evidence')"
    :tabs="tabs"
    v-model:active-tab="tab"
    v-model:is-sidebar-open="paneOpen"
    sidebar-width="320px"
  >
    <template #stats>
      <span>{{ t('pages.evidence.reports') }} <span class="text-neutral-800">{{ reports.list.length }}</span></span>
      <span class="text-neutral-400">·</span>
      <span>{{ t('pages.evidence.pins') }} <span class="text-neutral-800">{{ pool.length }}</span></span>
      <span v-if="reports.saving" class="text-neutral-400">{{ t('pages.evidence.saving') }}</span>
    </template>

    <template #actions>
      <template v-if="reports.current">
        <label class="flex shrink-0 items-center whitespace-nowrap">
          <select class="ui-input ui-input-sm max-w-[240px]" :value="reports.doc.kernel" :aria-label="t('pages.evidence.snapshotCellsRun')" :title="t('pages.evidence.snapshotReportSCells')" @change="reports.setKernel(($event.target as HTMLSelectElement).value)">
            <option value="newest">{{ t('pages.evidence.alwaysNewest', { newestLabel }) }}</option>
            <option v-for="s in completeScans" :key="s.id" :value="s.id">{{ scanLabel(s) }}</option>
          </select>
        </label>
        <button
          v-if="reports.stale.length"
          type="button"
          class="ui-btn ui-btn-sm ui-btn-primary"
          :disabled="reports.running.length > 0"
          :title="t('pages.evidence.cellsRanAnotherSnapshot', { staleLength: reports.stale.length })"
          @click="reports.runAll()"
        >
          <Play :size="11" :stroke-width="2.4" fill="currentColor"/>
          <span>{{ reports.running.length ? t('pages.evidence.running') : t('pages.evidence.runStale', { staleLength: reports.stale.length }) }}</span>
        </button>
        <button
          v-if="reports.slots.length && figuresHidden"
          type="button"
          class="ui-btn ui-btn-sm"
          :title="takeTitle"
          @click="takeAll"
        >
          <Icon icon="image" :size="13" class="text-neutral-500"/><span>{{ takeLabel }}</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" :aria-pressed="raw" :class="{ 'bg-neutral-100': raw }" :title="t('pages.evidence.wholeReportMarkdown')" @click="toggleRaw">
          <Icon icon="code" :size="13" class="text-neutral-500"/><span class="hidden min-[1400px]:inline">{{ t('pages.evidence.markdown') }}</span>
        </button>
        <button type="button" class="ui-btn ui-btn-sm" :title="t('pages.evidence.previewReportPdfThen')" @click="exportPdf">
          <Icon icon="file-down" :size="13" class="text-neutral-500"/><span>{{ t('pages.evidence.pdf') }}</span>
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
          @remove-many="reports.removeMany($event)"
          @merge="(ids, title, drop) => mergeReports(ids, title, drop)"
          @reorder="reports.reorder($event)"
          @jump="jump"
        />

        <div ref="scroller" class="relative min-h-0 flex-1 overflow-auto" :class="reports.current ? 'bg-ground' : 'bg-surface'" @dragover="onDragOver" @drop="onDrop" @dragleave="onDragLeave">
          <!-- No report yet. -->
          <div v-if="!reports.current" class="mx-auto flex h-full max-w-[520px] flex-col items-center justify-center px-8 text-center">
            <Icon icon="file-text" :size="22" class="text-neutral-300"/>
            <h2 class="mt-3 text-lg font-semibold text-neutral-900">{{ t('pages.evidence.writeReportYouGo') }}</h2>
            <p class="mt-2 text-sm leading-6 text-neutral-600">{{ t('pages.evidence.reportProseEvidenceTogether') }}</p>
            <button type="button" class="ui-btn ui-btn-primary mt-5" @click="createReport()">{{ t('pages.evidence.startReport') }}</button>
            <p class="mt-3 text-xs leading-5 text-neutral-500">{{ t('pages.evidence.blankPageTemplateWritten') }}</p>
          </div>

          <div v-else class="flex min-w-max flex-col items-center px-8 pb-[30vh] pt-5">
            <!-- The work around the page: what is still to do, on the ground above it, never printed. -->
            <div class="w-[210mm]">
              <p v-if="promptsLeft || reports.running.length || reports.stale.length" class="flex items-center gap-1.5 text-[12px] text-neutral-500" role="status">
                <template v-if="promptsLeft"><span :title="t('pages.evidence.greyItalicLinesSay')">{{ t('pages.evidence.write', { prompts: t('common.count.prompt', { count: promptsLeft }) }) }}</span></template>
                <template v-if="reports.running.length"><span v-if="promptsLeft" aria-hidden="true">·</span><span class="text-neutral-600">{{ t('pages.evidence.counting') }}</span></template>
                <template v-else-if="reports.stale.length"><span v-if="promptsLeft" aria-hidden="true">·</span><span class="text-accent-700">{{ t('pages.evidence.notRunSnapshotYet', { cells: t('common.count.cell', { count: reports.stale.length }) }) }}</span></template>
              </p>
              <p v-if="exportNote" class="mt-2 text-sm text-red-700" role="alert" @click="exportNote = ''">{{ exportNote }}</p>
            <FiguresToAdd
              v-if="!raw && !figuresHidden"
              :slots="reports.slots"
              :numbers="numbers"
              :log="reports.takeLog?.reportId === reports.currentId ? reports.takeLog : null"
              :paused="pausedHere"
              @take="taking.start([$event])"
              @take-all="takeAll"
              @jump="jump"
              @hide="hideFigures"
            />
            </div>

          <!-- The page: A4, white in either appearance, set as the PDF prints it. -->
          <article class="paper paper-sheet relative mt-4 shrink-0" :aria-label="t('pages.evidence.reportPage')">
            <!-- A long title wraps: a one-line textarea that grows with it. -->
            <textarea
              ref="titleEl"
              :value="titleDraft"
              rows="1"
              class="doc-title block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-neutral-300"
              :placeholder="t('pages.evidence.untitledReport')"
              :aria-label="t('pages.evidence.reportTitle')"
              @input="titleDraft = ($event.target as HTMLTextAreaElement).value.replace(/\n/g, ' '); fitTitle()"
              @change="saveTitle"
              @blur="saveTitle"
              @keydown.enter.prevent="saveTitle(); editFirst()"
            ></textarea>
            <div class="doc-rule" aria-hidden="true"></div>
            <p class="doc-meta">{{ kernelLine }}</p>

            <!-- The whole report as Markdown; cells are fenced archstats blocks. -->
            <textarea
              v-if="raw"
              ref="rawEl"
              :value="rawText"
              spellcheck="false"
              class="mt-8 block min-h-[60vh] w-full resize-none rounded-lg bg-neutral-50 px-5 py-4 font-mono text-[13px] leading-6 text-neutral-800 outline-none hairline focus:shadow-[0_0_0_1px_rgb(var(--c-accent-400))]"
              :aria-label="t('pages.evidence.reportMarkdown')"
              @input="onRawInput"
            ></textarea>

            <div v-else class="doc-body" role="document" :aria-label="t('pages.evidence.report')">
              <div
                v-for="(b, i) in reports.doc.blocks"
                :key="b.id"
                class="nb-row group/row relative"
                :data-id="b.id"
                :data-index="i"
                @mousedown.capture="onRowDown($event, b.id)"
                @click.capture="onRowClick"
              >
                <div v-if="dropIndex === i" class="nb-drop" aria-hidden="true"><span>{{ dropLabel }}</span></div>
                <!-- The row's handle: drag to move, + to insert below. -->
                <div class="absolute -left-[34px] top-1 flex flex-col items-center opacity-0 transition-opacity group-hover/row:opacity-100" :class="{ '!opacity-100': isSelected(b.id) }">
                  <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" :aria-label="t('pages.evidence.insertBelow')" :title="t('pages.evidence.insertBelow2')" @mousedown.prevent @click="openInsert(b.id, 'below')"><Icon icon="plus" :size="13"/></button>
                  <span class="flex h-5 w-5 cursor-grab items-center justify-center rounded text-neutral-300 hover:bg-neutral-100 hover:text-neutral-700 active:cursor-grabbing" draggable="true" :title="t('pages.evidence.dragMove')" @dragstart="onBlockDrag($event, b.id)" @dragend="dropIndex = null"><Icon icon="grip" :size="12"/></span>
                </div>
                <div :class="!isCell(b) && isSelected(b.id) ? 'rounded shadow-[inset_2px_0_0_rgb(var(--c-accent-500))] bg-accent-50/40 -ml-3 pl-3' : ''">
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
                    :selected="isSelected(b.id)"
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
                    :selected="isSelected(b.id)"
                    :taking="reports.takeQueue?.ids[reports.takeQueue.at] === b.id"
                    @select="selectCell(b.id)"
                    @open="openSlot(b.id)"
                    @take="taking.start([b.id])"
                  />
                  <NotebookCell
                    v-else
                    :cell="b.cell"
                    :number="numbers.get(b.id) ?? ''"
                    :selected="isSelected(b.id)"
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
                    @console="openInConsole(b)"
                  />
                </div>
              </div>
              <div v-if="dropIndex === reports.doc.blocks.length" class="nb-drop" aria-hidden="true"><span>{{ dropLabel }}</span></div>
            </div>
            <!-- Where a copy, cut or paste of whole blocks lands: focused for the moment of the shortcut. -->
            <textarea ref="clipEl" class="sr-only" aria-hidden="true" tabindex="-1" @copy="onClipCopy" @cut="onClipCut" @paste="onClipPaste" @blur="clipping = false"></textarea>
          </article>
          </div>
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
    <template #tab-notes>
      <NotesPane :head-commit="headCommit"/>
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
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import CellPane from "~/features/reports/components/CellPane.vue";
import InsertMenu, { type InsertChoice } from "~/features/reports/components/InsertMenu.vue";
import NotebookCell from "~/features/reports/components/NotebookCell.vue";
import NotebookReading from "~/features/reports/components/NotebookReading.vue";
import NotebookSlot from "~/features/reports/components/NotebookSlot.vue";
import FiguresToAdd from "~/features/reports/components/FiguresToAdd.vue";
import SaveTemplateSheet from "~/features/reports/components/SaveTemplateSheet.vue";
import TemplateSheet from "~/features/reports/components/TemplateSheet.vue";
import NotebookText from "~/features/reports/components/NotebookText.vue";
import PoolPane from "~/features/reports/components/PoolPane.vue";
import PdfPreviewSheet from "~/features/reports/components/PdfPreviewSheet.vue";
import ReportsPane, { type OutlineItem } from "~/features/reports/components/ReportsPane.vue";
import Icon from "~/shared/ui/Icon.vue";
import { useExportables } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { useEvidenceStore } from "~/features/reports/evidence.store";
import { useReportsStore, type ReportRecord } from "~/features/reports/reports.store";
import { useSlotTaking } from "~/features/reports/useSlotTaking";
import { useConsoleStore } from "~/features/sql/console.store";
import { useRouter } from "vue-router";
import { useAuthorsStore } from "~/features/git/authors.store";
import { namesIn } from "~/features/reports/reportCells";
import { useStateStore } from "~/platform/state.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useNotesStore } from "~/features/notes/notes.store";
import NotesPane from "~/features/notes/components/NotesPane.vue";
import { saveBundle } from "~/platform/files";
import { cellNumbers, fromMarkdown, isCell, newId, plainText, runnable, type Block, type CellBlock, type CellSpec, type TextKind } from "~/features/reports/reportDoc";
import { readBlocks, writeBlocks, type ClipboardContext } from "~/features/reports/blockClipboard";
import { newestFirst } from "~/features/workspace/scanOrder";
import { snapshotName } from "~/features/workspace/snapshotName";
import { t } from "~/shared/i18n";

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
// The document gets the room; the pane opens for a selected cell, or for the pool when there is no report.
const paneOpen = ref(false);
const tabs = computed(() => [{ id: "pool", label: t("pages.evidence.pool") }, { id: "cell", label: t("pages.evidence.cell") }, { id: "notes", label: t("notes.pane.tab") }]);
const notes = useNotesStore();
const headCommit = computed(() => String((data.snapshotInfo as Record<string, string>)?.git_head_commit ?? ""));

watch(() => workspaces.active?.id, async (id) => {
  if (!id) return;
  await evidence.load(id);
  await reports.load(id);
  await notes.load(id);
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
const scanLabel = (s: any) => t("pages.evidence.snapshot", { s: snapshotName(s), value: s.headCommit ? ` · ${String(s.headCommit).slice(0, 7)}` : "" });
const newestLabel = computed(() => (completeScans.value[0] ? scanLabel(completeScans.value[0]) : "none"));
const kernelShort = computed(() => reports.kernel?.label ?? t("pages.evidence.noSnapshot"));
const kernelLine = computed(() => {
  const k = reports.kernel;
  if (!k) return t("pages.evidence.noCompleteSnapshotRun");
  const cells = reports.cells.length;
  return t("pages.evidence.snapshotAnalysisR", { kLabel: k.label, value: k.headCommit ? t("pages.evidence.commit2", { headCommit: k.headCommit.slice(0, 7), value: k.committed ? ` of ${k.committed}` : "" }) : "", revision: k.revision, cells: t("common.count.cell", { count: cells }) });
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
const titleEl = ref<HTMLTextAreaElement | null>(null);
function fitTitle() {
  const el = titleEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
const untitled = t("reports.reportsStore.untitledReport");
watch(() => reports.current?.title, title => { titleDraft.value = title && title !== "Untitled report" && title !== untitled ? title : ""; void nextTick(fitTitle); }, { immediate: true });
onMounted(() => { window.addEventListener("resize", fitTitle); void nextTick(fitTitle); });
onBeforeUnmount(() => window.removeEventListener("resize", fitTitle));
watch(() => !!reports.current, has => { if (!has) tab.value = "pool"; paneOpen.value = !has; }, { immediate: true });
function saveTitle() {
  if (reports.current && (titleDraft.value || untitled) !== reports.current.title) void reports.rename(reports.current.id, titleDraft.value || t("pages.evidence.untitledReport"));
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
      const ratio = b.cell.title || b.cell.output?.pin?.title || "";
      out.push({ id: b.id, label: `${numbers.value.get(b.id)}${ratio ? ` · ${ratio}` : ""}${s.type === "slot" ? t("pages.evidence.add") : ""}`, indent: depth, heading: false, icon: (s.type === "capture" || s.type === "slot") && s.kind === "figure" ? "image" : s.type === "pin" ? "bookmark" : "table", stale: isStale(b) });
    } else if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") {
      const level = Number(b.kind[1]) - 1;
      depth = level + 1;
      out.push({ id: b.id, label: plainText(b.text) || t("pages.evidence.heading"), indent: level, heading: true });
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
/** The other end of a run of selected blocks; null when one block is selected. */
const anchorId = ref<string | null>(null);
const caret = ref<number | "start" | "end" | null>(null);

function edit(id: string, c: number | "start" | "end") {
  selectedId.value = null;
  anchorId.value = null;
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
  anchorId.value = null;
  selectedId.value = id;
  (document.activeElement as HTMLElement)?.blur?.();
}
function selectCell(id: string) {
  editingId.value = null;
  anchorId.value = null;
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
  else selectRange(blocks[0].id, last.id);
}
function setSpec(id: string, spec: CellSpec) {
  reports.setCell(id, { spec });
}
function removeSelected() {
  const id = selectedId.value;
  if (!id) return;
  const ids = rangeIds.value;
  const i = ids.length > 1 ? reports.removeBlocks(ids) : indexOf(id);
  if (ids.length <= 1) reports.removeBlock(id);
  anchorId.value = null;
  const next = reports.doc.blocks[Math.min(Math.max(0, i), reports.doc.blocks.length - 1)];
  selectedId.value = next?.id ?? null;
}

// ── Several blocks at once ──────────────────────────────────────────────
// Shift-click, Shift-arrows, a drag across rows or ⌘A select a run of
// blocks; it copies, cuts, pastes and deletes as one, cells with their output.
const rangeIds = computed<string[]>(() => {
  const focus = selectedId.value;
  if (!focus) return [];
  const a = anchorId.value ? indexOf(anchorId.value) : -1, b = indexOf(focus);
  if (a < 0 || b < 0 || a === b) return [focus];
  return reports.doc.blocks.slice(Math.min(a, b), Math.max(a, b) + 1).map(x => x.id);
});
const rangeSet = computed(() => new Set(rangeIds.value));
const isSelected = (id: string) => rangeSet.value.has(id);
function selectRange(from: string, to: string) {
  editingId.value = null;
  if ((document.activeElement as HTMLElement | null)?.closest?.(".nb-row")) (document.activeElement as HTMLElement).blur();
  anchorId.value = from;
  selectedId.value = to;
}
function selectAll() {
  const bs = reports.doc.blocks;
  if (!bs.length) return;
  window.getSelection()?.removeAllRanges();
  selectRange(bs[0].id, bs[bs.length - 1].id);
}

// Pressing on one row and moving onto another selects the rows between, not the text.
let pressed: { id: string } | null = null;
let rowDrag = false;
let swallowClick = false;
function onRowDown(e: MouseEvent, id: string) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest('[draggable="true"], button, select, a')) return;
  if (e.shiftKey) {
    const from = anchorId.value ?? selectedId.value ?? editingId.value;
    if (from && from !== id) {
      e.preventDefault();
      e.stopPropagation();
      selectRange(from, id);
      swallowClick = true;
      return;
    }
  }
  pressed = { id };
  rowDrag = false;
}
function onPointerMove(e: MouseEvent) {
  if (!pressed || !(e.buttons & 1)) return;
  const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.(".nb-row") as HTMLElement | null;
  const over = row?.dataset.id;
  if (!over || (over === pressed.id && !rowDrag)) return;
  if (!rowDrag) { rowDrag = true; document.body.classList.add("select-none"); }
  window.getSelection()?.removeAllRanges();
  if (anchorId.value !== pressed.id || selectedId.value !== over) selectRange(pressed.id, over);
}
function onPointerUp() {
  if (rowDrag) { swallowClick = true; document.body.classList.remove("select-none"); }
  if (swallowClick) setTimeout(() => { swallowClick = false; }, 0);
  pressed = null;
  rowDrag = false;
}
function onRowClick(e: MouseEvent) {
  if (!swallowClick) return;
  e.preventDefault();
  e.stopPropagation();
  swallowClick = false;
}
onMounted(() => { window.addEventListener("mousemove", onPointerMove); window.addEventListener("mouseup", onPointerUp); });
onBeforeUnmount(() => { window.removeEventListener("mousemove", onPointerMove); window.removeEventListener("mouseup", onPointerUp); document.body.classList.remove("select-none"); });

// The clipboard. A shortcut in command mode focuses a hidden field for its
// moment, so the native copy, cut or paste fires there (WebKit only fires
// them where something is selected or editable) and lands in these handlers.
const clipEl = ref<HTMLTextAreaElement | null>(null);
const clipping = ref(false);
function clipCtx(): ClipboardContext {
  return { workspace: workspaceName.value, label, figure: p => reports.figures[p] ?? null };
}
function armClipboard() {
  const el = clipEl.value;
  if (!el) return;
  el.value = " ";
  clipping.value = true;
  el.focus({ preventScroll: true });
  el.select();
  setTimeout(() => { if (document.activeElement === el) el.blur(); }, 0);
}
function onClipCopy(e: ClipboardEvent) {
  if (!e.clipboardData || !rangeIds.value.length) return;
  e.preventDefault();
  writeBlocks(e.clipboardData, reports.doc.blocks.filter(b => rangeSet.value.has(b.id)), clipCtx());
}
function onClipCut(e: ClipboardEvent) {
  onClipCopy(e);
  if (rangeIds.value.length) removeSelected();
}
function onClipPaste(e: ClipboardEvent) {
  const data = e.clipboardData;
  if (!data) return;
  e.preventDefault();
  const text = data.getData("text/plain");
  const blocks = readBlocks(data) ?? (text.trim() ? fromMarkdown(text) : []);
  if (!blocks.length) return;
  const ids = rangeIds.value;
  const after = ids.length ? ids[ids.length - 1] : reports.doc.blocks[reports.doc.blocks.length - 1]?.id ?? null;
  reports.paste(ids.length > 1 ? null : after, blocks, ids.length > 1 ? ids : []);
  selectRange(blocks[0].id, blocks[blocks.length - 1].id);
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

// Arriving from Add and open: land on the block just added once it has drawn
// (the report may still be opening, and its figures load after it).
function landOnAdded() {
  const id = reports.landOn;
  if (!id || !reports.doc.blocks.some(b => b.id === id)) return;
  void nextTick(() => {
    if (!scroller.value?.querySelector(`[data-id="${id}"]`)) return;
    reports.landOn = null;
    jump(id);
  });
}
watch(() => [reports.landOn, reports.doc.blocks.length, scroller.value], landOnAdded, { immediate: true });

function openInsert(id: string | null, mode: "below" | "above" | "replace") {
  const row = id ? scroller.value?.querySelector(`[data-id="${id}"]`) as HTMLElement | null : null;
  const col = scroller.value?.querySelector("article") as HTMLElement | null;
  const r = row?.getBoundingClientRect();
  // The text column starts 27 mm into the page.
  const left = (col?.getBoundingClientRect().left ?? 200) + 27 * 96 / 25.4;
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
const dropLabel = computed(() => (draggingBlock.value ? t("pages.evidence.moveHere") : t("pages.evidence.insertPinHere")));
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
async function mergeReports(ids: string[], title: string, removeOriginals: boolean) {
  raw.value = false;
  editingId.value = null;
  selectedId.value = null;
  await reports.merge(ids, { title, removeOriginals });
  scroller.value?.scrollTo({ top: 0 });
}

// ── Slots and computed paragraphs ───────────────────────────────────────
const router = useRouter();

// A SQL cell opened in the console stays linked to it: Update cell there writes the SQL back here.
const sqlConsole = useConsoleStore();
function openInConsole(b: CellBlock) {
  if (b.cell.spec.type !== "sql" || !reports.currentId) return;
  sqlConsole.openCell({ reportId: reports.currentId, cellId: b.id, report: reports.current?.title || t("pages.evidence.untitledReport"), label: numbers.value.get(b.id) ?? t("pages.evidence.table"), sql: b.cell.spec.sql }, b.cell.title);
  void router.push("/views/query");
}
const taking = useSlotTaking();
/** A run paused on this report picks up where it stopped; otherwise every slot, in reading order. */
const pausedHere = computed(() => !!reports.takeQueue && reports.takeQueue.reportId === reports.currentId);
const takeLabel = computed(() => {
  const n = reports.slots.length;
  if (pausedHere.value) return t("pages.evidence.resumeTakingLeft", { n });
  const tables = reports.slots.filter(s => s.cell.spec.type === "slot" && s.cell.spec.kind === "table").length;
  return t("pages.evidence.take", { n, value: tables === 0 ? t("common.noun.figure", { count: n }) : tables === n ? t("common.noun.table", { count: n }) : t("pages.evidence.figuresTables") });
});
const takeTitle = computed(() => t("pages.evidence.opensEachViewTemplate"));
/** Paragraphs a template left for the writer, still empty. */
const promptsLeft = computed(() => reports.doc.blocks.filter(b => !isCell(b) && !b.text.trim() && !!b.prompt).length);
/** Reports whose "Figures to add" list was hidden, this session. */
const hiddenFigures = ref(new Set<string>());
const figuresHidden = computed(() => !!reports.currentId && hiddenFigures.value.has(reports.currentId));
// A run that ends shows its summary, even where the list was hidden.
watch(() => reports.takeLog?.done, done => {
  const id = reports.takeLog?.reportId;
  if (!done || !id || !hiddenFigures.value.has(id)) return;
  const next = new Set(hiddenFigures.value);
  next.delete(id);
  hiddenFigures.value = next;
});
function hideFigures() {
  if (!reports.currentId) return;
  hiddenFigures.value = new Set(hiddenFigures.value).add(reports.currentId);
  if (reports.takeLog?.reportId === reports.currentId && reports.takeLog.done) reports.takeLog = null;
}
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
  // ⌘A: the block's own text first; pressed again (or with nothing being typed), every block.
  if (mod && !e.shiftKey && e.key.toLowerCase() === "a" && !raw.value && !insertAt.value) {
    const area = t?.tagName === "TEXTAREA" && t.closest(".nb-row") ? t as HTMLTextAreaElement : null;
    if (!typing || (area && area.selectionStart === 0 && area.selectionEnd === area.value.length)) { e.preventDefault(); selectAll(); return; }
  }
  // ⌘C, ⌘X and ⌘V on selected blocks; a selection of text inside one block copies as text.
  if (mod && !e.shiftKey && ["c", "x", "v"].includes(e.key.toLowerCase()) && !typing && !raw.value) {
    const textSelected = !!window.getSelection()?.toString() && rangeIds.value.length <= 1;
    if (e.key.toLowerCase() === "v" || (rangeIds.value.length && !textSelected)) armClipboard();
    return;
  }
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
    anchorId.value = null;
    if (isCell(b)) selectCell(b.id); else selectedId.value = b.id;
    (scroller.value?.querySelector(`[data-id="${b.id}"]`) as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  };
  if (!sel) return;
  if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    const to = blocks[Math.max(0, Math.min(blocks.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    selectRange(anchorId.value ?? sel.id, to.id);
    (scroller.value?.querySelector(`[data-id="${to.id}"]`) as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
    return;
  }
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
    case "Escape": selectedId.value = null; anchorId.value = null; break;
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
const blockedReason = computed(() => (blockedBy.value.length ? t("pages.evidence.reportNamesAuthorsPseudonymised", { value: blockedBy.value[0] }) : null));
// The PDF opens in a preview first; it is saved from there as the bytes you saw.
const pdfOpen = ref(false);
function exportPdf() {
  if (!reports.current) return;
  exportNote.value = "";
  pdfOpen.value = true;
}
useExportables().register({
  kind: "document",
  get title() { return reports.current?.title || t("pages.evidence.report"); },
  label: t("pages.evidence.copyReportMarkdown"),
  savable: true,
  saveLabel: t("pages.evidence.reportMarkdownFigures"),
  disabledReason: () => (!reports.current ? t("pages.evidence.noReportOpen") : blockedReason.value),
  markdown: () => reports.exportMarkdown(null),
  save: async () => {
    const title = reports.current?.title || t("pages.evidence.report");
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
    return saveBundle(t("pages.evidence.chooseFolderReport"), files);
  },
});
</script>

<style scoped>
.nb-drop { position: relative; height: 0; }
.nb-drop::before { content: ""; position: absolute; left: -8px; right: 0; top: -2px; height: 2px; border-radius: 1px; background: rgb(var(--c-accent-500)); }
.nb-drop span { position: absolute; left: -8px; top: -20px; font-size: 11px; font-weight: 500; color: rgb(var(--c-accent-700)); background: rgb(var(--c-surface)); padding: 0 4px; }
</style>
