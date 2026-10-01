<template>
  <div class="relative" :class="headless ? 'fixed right-4 top-12 z-50 h-0 w-0' : 'shrink-0'">
    <button
      v-if="!headless && items.length"
      ref="buttonEl"
      type="button"
      class="ui-btn ui-btn-sm"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="Export (⌘E)"
      @click="toggle"
    >
      <Icon :icon="status ? 'check' : 'download'" :size="13" :class="status ? 'text-green-600' : 'text-neutral-500'"/>
      <span>{{ status || "Export" }}</span>
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-40 cursor-default" @click="close"></div>
      <div
        ref="menuEl"
        class="ui-menu absolute right-0 z-50 mt-1 flex max-h-[70vh] w-72 flex-col overflow-y-auto animate-in"
        role="menu"
        aria-label="Export"
        @keydown.esc.stop="close"
      >
        <p v-if="items.length === 0" class="px-2 py-2 text-sm text-neutral-500">Figures and tables export from the button beside each one.</p>
        <template v-for="(item, i) in items" :key="i">
          <div v-if="i > 0" class="my-1 h-px bg-neutral-100" role="separator"></div>
          <p class="ui-menu-title truncate normal-case tracking-normal" :title="item.title">{{ item.title }}</p>

          <template v-if="item.kind === 'document'">
            <p v-if="item.disabledReason?.()" class="px-2 pb-1 text-sm text-neutral-500">{{ item.disabledReason?.() }}</p>
            <template v-else>
              <button type="button" class="ui-menu-item" role="menuitem" @click="copyDocument(item)">
                <Icon icon="file-text" :size="12" class="text-neutral-500"/><span>{{ item.label }}</span>
              </button>
              <button v-if="item.savable" type="button" class="ui-menu-item" role="menuitem" @click="saveDocument(item)">
                <Icon icon="download" :size="12" class="text-neutral-500"/><span>{{ item.saveLabel ?? "Save Markdown…" }}</span>
              </button>
            </template>
          </template>

          <button
            v-if="!isReportView && item.kind === 'document' && !item.disabledReason?.()"
            type="button"
            class="ui-menu-item"
            role="menuitem"
            title="Preview it in a report, write around it, then add it"
            @click="addToReport(item)"
          >
            <Icon icon="file-text" :size="12" class="text-neutral-500"/><span>Add to report…</span>
          </button>
        </template>

        <div class="my-1 h-px bg-neutral-100" role="separator"></div>
        <button type="button" class="ui-menu-item" role="menuitem" title="Keep this view, with a figure of it, on the evidence board" @click="pinView">
          <Icon icon="bookmark" :size="12" class="text-neutral-500"/><span>Pin this view</span>
        </button>
        <template v-if="lastExport">
          <div class="my-1 h-px bg-neutral-100" role="separator"></div>
          <button type="button" class="ui-menu-item" role="menuitem" @click="revealLast">
            <Icon icon="folder" :size="12" class="text-neutral-500"/><span>Reveal last export</span>
          </button>
        </template>
      </div>
    </template>

    <p v-if="headless && status && !open" class="ui-tooltip absolute right-0 z-50 w-max" role="status">{{ status }}</p>
    <p v-if="error" class="ui-popover absolute right-0 z-50 mt-1 w-72 p-2.5 text-sm text-red-700" role="alert" @click="error = ''">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { exportables, pickFor, type DocumentExportable, type Exportable, type FigureExportable, type TableExportable } from "~/features/export/useExportables";
import { registerCommand } from "~/platform/commands";
import { exportFileName } from "~/features/export/export";
import { FILTERS, copyText, lastExport, reveal, saveText } from "~/platform/files";
import { figurePng, provideExhibitHandoff, type FigureChoice } from "~/features/export/figureActions";
import { buildProvenance } from "~/features/export/provenance";
import { useEvidenceStore } from "~/features/reports/evidence.store";
import { useReportsStore } from "~/features/reports/reports.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import type { RanOn } from "~/features/reports/reportDoc";
import { formatScanTime } from "~/shared/time";
import { snapshotName } from "~/features/workspace/snapshotName";

// The Export menu for a view's documents (a methodology, a report's
// Markdown), and Pin this view. In a view's toolbar it is a button, shown
// when the view has a document; the shell mounts a headless one so ⌘E works
// everywhere. Figures and tables are not listed: each exports from the button
// on its own frame (ExhibitFrame), and the headless menu hands those buttons
// the report's two actions, Add to report and Pin. Every action ends the same way:
// "Saved" or "Copied" on the button for a moment, nothing when the dialog is
// cancelled, and the failure itself when one fails.

const props = withDefaults(defineProps<{ headless?: boolean }>(), { headless: false });

// Documents only: a figure or a table exports from the button on its own frame (ExhibitFrame).
const items = computed<Exportable[]>(() => exportables.value.filter(i => i.kind === "document"));
const open = ref(false);
const status = ref("");
const error = ref("");
let statusTimer: ReturnType<typeof setTimeout> | null = null;

function toggle() { open.value = !open.value; }
function close() { open.value = false; }

function done(word: string) {
  close();
  error.value = "";
  status.value = word;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.value = ""; }, 1600);
}

function fail(what: string, e: unknown) {
  close();
  error.value = `${what} failed: ${e instanceof Error ? e.message : String(e)}`;
}

async function copyDocument(d: DocumentExportable) {
  try { await copyText(await d.markdown()); done("Copied"); } catch (e) { fail("Copy", e); }
}
async function saveDocument(d: DocumentExportable) {
  close();
  try {
    const path = d.save ? await d.save() : await saveText(exportFileName(d.title, "md"), await d.markdown(), [FILTERS.md], "Save Markdown");
    if (path) done("Saved");
  } catch (e) { fail("Save", e); }
}

// A view pin keeps the route and a figure of the view's first chart.
async function pinView() {
  close();
  try {
    const f = exportables.value.find((i): i is FigureExportable => i.kind === "figure" && i.ready());
    const title = (typeof document !== "undefined" ? document.querySelector(".ui-toolbar-title")?.textContent?.trim() : "") || "View";
    await pinWith(title, f ? await figurePng(f, { light: true, legend: true }) : null);
    done("Pinned");
  } catch (e) { fail("Pin", e); }
}

function pinWith(title: string, figure: string | null) {
  return useEvidenceStore().pin({ kind: "view", entityKey: location.hash.replace(/^#/, ""), title, figure });
}

// ── Add to report: what the view shows, previewed in the report first ───
const reportsStore = useReportsStore();
const workspacesStore = useWorkspacesStore();
const isReportView = computed(() => typeof location !== "undefined" && location.hash.startsWith("#/views/evidence"));
function ranOnNow(): RanOn {
  const p = buildProvenance();
  const scan: any = workspacesStore.scans.find((s: any) => s.id === workspacesStore.openScanId);
  return {
    scanId: workspacesStore.openScanId ?? "", label: scan ? snapshotName(scan) : p.snapshot, commit: p.commit, committed: scan?.headTime ? formatScanTime(scan.headTime) : undefined, revision: p.revision,
    at: new Date().toISOString(), lens: p.lens ?? undefined, scope: p.scope ?? undefined, role: p.role ?? undefined,
  };
}
async function addToReport(item: Exportable, choice: FigureChoice = { light: true, legend: true }) {
  close();
  try {
    const route = location.hash.replace(/^#/, "");
    const view = document.querySelector(".ui-toolbar-title")?.textContent?.trim() || item.title;
    const base = { title: item.title, view, route, ranOn: ranOnNow() };
    if (item.kind === "figure") {
      // The report prints provenance under every cell, so the figure carries only its legend.
      const renderFigure = (light: boolean) => figurePng(item, { ...choice, light }, false);
      await reportsStore.beginImport({ ...base, kind: "figure", figure: await renderFigure(choice.light), renderFigure });
    } else if (item.kind === "table" && item.addToReport) {
      await item.addToReport();
    } else if (item.kind === "table") {
      const cols = item.columns();
      const all = item.rows();
      const rows = all.slice(0, 500);
      const numeric = (id: string) => rows.some(r => typeof r[id] === "number") && rows.every(r => r[id] === null || r[id] === undefined || r[id] === "" || typeof r[id] === "number");
      await reportsStore.beginImport({ ...base, kind: "table", table: { columns: cols.map(c => ({ id: c.id, label: c.label, numeric: numeric(c.id) })), rows, total: all.length } });
    } else {
      await reportsStore.beginImport({ ...base, kind: "document", markdown: await item.markdown() });
    }
  } catch (e) { fail("Add to report", e); }
}

async function revealLast() {
  close();
  if (lastExport.value) { try { await reveal(lastExport.value); } catch (e) { fail("Reveal", e); } }
}

let off: (() => void) | null = null;
let offAdd: (() => void) | null = null;
let offHandoff: (() => void) | null = null;
onMounted(() => {
  off = registerCommand("export", () => { if (items.value.length || props.headless) open.value = !open.value; });
  // A figure's own button adds to a report and pins through the one menu the shell always mounts.
  if (props.headless) offHandoff = provideExhibitHandoff({
    addToReport: (f, choice) => addToReport(f, choice),
    pin: async (f, choice) => {
      const view = document.querySelector(".ui-toolbar-title")?.textContent?.trim();
      await pinWith(view && view !== f.title ? `${view}: ${f.title}` : f.title, await figurePng(f, choice));
    },
  });
  // Filling a report's slot: what this view shows of the slot's kind, straight into Add to report.
  if (props.headless) offAdd = registerCommand("add-to-report", async () => {
    // Never the report into itself: a late take landing on the report page would pick
    // the report's own Markdown and fill the slot with the whole report (P1-13).
    if (isReportView.value || !reportsStore.filling) return;
    // The slot's own pick first; "Take what is shown" on a view set otherwise takes what it shows, of the slot's kind.
    const kind = reportsStore.filling.kind;
    const item = pickFor(kind, reportsStore.filling.take) ?? pickFor(kind);
    if (!item || item.kind !== kind) { fail("Add to report", new Error(`this view shows no ${kind} to add yet`)); return; }
    await addToReport(item);
  });
});
onBeforeUnmount(() => { off?.(); offAdd?.(); offHandoff?.(); if (statusTimer) clearTimeout(statusTimer); });
</script>
