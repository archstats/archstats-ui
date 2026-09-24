<template>
  <div class="relative" :class="headless ? 'fixed right-4 top-12 z-50 h-0 w-0' : 'shrink-0'">
    <button
      v-if="!headless"
      ref="buttonEl"
      type="button"
      class="ui-btn ui-btn-sm"
      :disabled="items.length === 0"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="items.length ? 'Export (⌘E)' : 'Nothing on this view to export'"
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
        <p v-if="items.length === 0" class="px-2 py-2 text-sm text-neutral-500">Nothing on this view to export.</p>
        <template v-for="(item, i) in items" :key="i">
          <div v-if="i > 0" class="my-1 h-px bg-neutral-100" role="separator"></div>
          <p class="ui-menu-title truncate normal-case tracking-normal" :title="item.title">{{ item.title }}</p>

          <template v-if="item.kind === 'table'">
            <p v-if="tableReason(item)" class="px-2 pb-1 text-sm text-neutral-500">{{ tableReason(item) }}</p>
            <template v-else>
              <button type="button" class="ui-menu-item" role="menuitem" @click="copyMarkdown(item, i)">
                <Icon icon="copy" :size="12" class="text-neutral-500"/>
                <span class="min-w-0 flex-1 truncate">{{ confirmKey === `md${i}` ? `Copy ${rowCount(item).toLocaleString("en-US")} rows? Click again` : "Copy as Markdown" }}</span>
              </button>
              <button type="button" class="ui-menu-item" role="menuitem" @click="copyCsv(item)">
                <Icon icon="copy" :size="12" class="text-neutral-500"/><span>Copy as CSV</span>
              </button>
              <button type="button" class="ui-menu-item" role="menuitem" @click="saveCsv(item)">
                <Icon icon="table" :size="12" class="text-neutral-500"/><span class="flex-1">Save CSV…</span>
                <span class="font-mono text-xs text-neutral-400">{{ rowCount(item).toLocaleString("en-US") }} rows</span>
              </button>
            </template>
          </template>

          <template v-else-if="item.kind === 'figure'">
            <button type="button" class="ui-menu-item" role="menuitem" :disabled="!item.ready()" :class="{ 'opacity-50': !item.ready() }" :title="item.ready() ? '' : 'Still drawing'" @click="savePng(item)">
              <Icon icon="image" :size="12" class="text-neutral-500"/><span>Save PNG (2×)…</span>
            </button>
            <button v-if="item.svg !== false" type="button" class="ui-menu-item" role="menuitem" :disabled="!item.ready()" :class="{ 'opacity-50': !item.ready() }" @click="saveSvg(item)">
              <Icon icon="image" :size="12" class="text-neutral-500"/><span>Save SVG…</span>
            </button>
          </template>

          <template v-else>
            <p v-if="item.disabledReason?.()" class="px-2 pb-1 text-sm text-neutral-500">{{ item.disabledReason?.() }}</p>
            <template v-else>
              <button type="button" class="ui-menu-item" role="menuitem" @click="copyDocument(item)">
                <Icon icon="file-text" :size="12" class="text-neutral-500"/><span>{{ item.label }}</span>
              </button>
              <button v-if="item.savable" type="button" class="ui-menu-item" role="menuitem" @click="saveDocument(item)">
                <Icon icon="download" :size="12" class="text-neutral-500"/><span>Save Markdown…</span>
              </button>
            </template>
          </template>
        </template>

        <template v-if="dark && hasFigures">
          <div class="my-1 h-px bg-neutral-100" role="separator"></div>
          <button type="button" class="ui-menu-item" role="menuitemcheckbox" :aria-checked="asShown" @click="asShown = !asShown">
            <Icon :icon="asShown ? 'check' : 'minus'" :size="12" :class="asShown ? 'text-neutral-700' : 'text-transparent'"/>
            <span>Figures as shown (dark)</span>
          </button>
        </template>
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
import Icon from "~/components/ui/common/Icon.vue";
import { exportables, type DocumentExportable, type Exportable, type FigureExportable, type TableExportable } from "~/composables/useExportables";
import { registerCommand } from "~/utils/commands";
import { MARKDOWN_ROW_WARNING, exportFileName } from "~/utils/export";
import { copyTableCsv, copyTableMarkdown, saveTableCsv } from "~/utils/exportActions";
import { FILTERS, copyText, lastExport, reveal, saveBase64, saveText } from "~/utils/files";
import { isDarkAppearance, pngBase64, svgDocument } from "~/utils/figure";
import { buildProvenance, provenanceShort } from "~/utils/provenance";

// The one Export menu. In a view's toolbar it is a button; the shell mounts a
// headless one so ⌘E works on views without a toolbar. Every action ends the
// same way: "Saved" or "Copied" on the button for a moment, nothing when the
// dialog is cancelled, and the failure itself when one fails.

const props = withDefaults(defineProps<{ headless?: boolean }>(), { headless: false });

const items = computed<Exportable[]>(() => exportables.value);
const hasFigures = computed(() => items.value.some(i => i.kind === "figure"));
const open = ref(false);
const status = ref("");
const error = ref("");
const confirmKey = ref("");
const asShown = ref(false);
const dark = ref(isDarkAppearance());
let statusTimer: ReturnType<typeof setTimeout> | null = null;

function toggle() { dark.value = isDarkAppearance(); open.value = !open.value; }
function close() { open.value = false; confirmKey.value = ""; }

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

const caption = () => provenanceShort(buildProvenance());
const rowCount = (t: TableExportable) => t.rows().length;
function tableReason(t: TableExportable): string {
  const r = t.disabledReason?.();
  if (r) return r;
  return rowCount(t) === 0 ? "No rows in scope." : "";
}

async function copyMarkdown(t: TableExportable, i: number) {
  const n = rowCount(t);
  if (n > MARKDOWN_ROW_WARNING && confirmKey.value !== `md${i}`) { confirmKey.value = `md${i}`; return; }
  try { done(await copyTableMarkdown(t)); } catch (e) { fail("Copy", e); }
}
async function copyCsv(t: TableExportable) {
  try { done(await copyTableCsv(t)); } catch (e) { fail("Copy", e); }
}
async function saveCsv(t: TableExportable) {
  close();
  try { const word = await saveTableCsv(t); if (word) done(word); } catch (e) { fail("Save", e); }
}

async function renderFigure(f: FigureExportable) {
  const out = await f.render({ light: !asShown.value });
  if (!out) throw new Error("the chart has nothing drawn yet");
  return out;
}
async function savePng(f: FigureExportable) {
  if (!f.ready()) return;
  close();
  try {
    const out = await renderFigure(f);
    const b64 = await pngBase64(out, caption(), { light: !asShown.value });
    const path = await saveBase64(exportFileName(f.title, "png"), b64, [FILTERS.png], "Save PNG");
    if (path) done("Saved");
  } catch (e) { fail("Save PNG", e); }
}
async function saveSvg(f: FigureExportable) {
  if (!f.ready()) return;
  close();
  try {
    const out = await renderFigure(f);
    if (out.kind !== "svg") throw new Error("this chart is drawn on a canvas; save it as PNG");
    const path = await saveText(exportFileName(f.title, "svg"), svgDocument(out, caption(), { light: !asShown.value }), [FILTERS.svg], "Save SVG");
    if (path) done("Saved");
  } catch (e) { fail("Save SVG", e); }
}

async function copyDocument(d: DocumentExportable) {
  try { await copyText(await d.markdown()); done("Copied"); } catch (e) { fail("Copy", e); }
}
async function saveDocument(d: DocumentExportable) {
  close();
  try {
    const path = await saveText(exportFileName(d.title, "md"), await d.markdown(), [FILTERS.md], "Save Markdown");
    if (path) done("Saved");
  } catch (e) { fail("Save", e); }
}

async function revealLast() {
  close();
  if (lastExport.value) { try { await reveal(lastExport.value); } catch (e) { fail("Reveal", e); } }
}

let off: (() => void) | null = null;
onMounted(() => {
  off = registerCommand("export", () => { dark.value = isDarkAppearance(); if (items.value.length || props.headless) open.value = !open.value; });
});
onBeforeUnmount(() => { off?.(); if (statusTimer) clearTimeout(statusTimer); });
</script>
