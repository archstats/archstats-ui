<template>
  <!-- The PDF as it will be saved: laid out once, shown by the system's own
       PDF view, and saved as exactly those bytes. -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[70] bg-neutral-950/30 p-4" @mousedown.self="close">
      <div class="ui-popover flex h-full w-full flex-col overflow-hidden animate-in" role="dialog" aria-modal="true" aria-labelledby="pdf-title" @keydown="onKey">
        <header class="flex h-12 shrink-0 items-center gap-3 px-4 hairline-b">
          <Icon icon="file-down" :size="15" class="shrink-0 text-neutral-500"/>
          <h2 id="pdf-title" class="min-w-0 truncate text-[14px] font-semibold text-neutral-900">{{ title }}</h2>
          <p class="shrink-0 font-mono text-[11.5px] text-neutral-500">
            <template v-if="state === 'ready'">{{ pages }} {{ pages === 1 ? "page" : "pages" }} · {{ pageSize }} · {{ sizeText }}</template>
            <template v-else-if="state === 'rendering'">Laying out {{ cellCount }} {{ cellCount === 1 ? "cell" : "cells" }}…</template>
          </p>
          <span v-if="slots" class="ui-tag shrink-0" :title="`${slots === 1 ? 'A figure or table the template asks for is' : `${slots} figures or tables the template asks for are`} not added yet; the PDF leaves ${slots === 1 ? 'it' : 'them'} out`">{{ slots }} to add, left out</span>
          <span v-if="stale" class="ui-tag shrink-0" :title="`${stale} cells ran on another snapshot than the report runs on; the PDF shows them as they ran`">{{ stale }} ran elsewhere</span>

          <div class="ml-auto flex shrink-0 items-center gap-2">
            <div class="ui-segmented" role="group" aria-label="Page size">
              <button type="button" :aria-pressed="pageSize === 'A4'" @click="setSize('A4')">A4</button>
              <button type="button" :aria-pressed="pageSize === 'Letter'" @click="setSize('Letter')">Letter</button>
            </div>
            <span class="mx-1 h-5 w-px bg-neutral-200" aria-hidden="true"></span>
            <button type="button" class="ui-btn ui-btn-sm" :disabled="state !== 'ready'" title="Open this PDF in the system's viewer" @click="openOutside">
              <Icon icon="external-link" :size="13" class="text-neutral-500"/><span>Open in {{ viewerName }}</span>
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="state !== 'ready' || saving" title="Save this PDF (⌘S)" @click="save">
              {{ saving ? "Saving…" : "Save PDF…" }}
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Close" title="Close (Esc)" @click="close"><Icon icon="x" :size="14"/></button>
          </div>
        </header>

        <p v-if="savedPath" class="flex shrink-0 items-center gap-2 bg-accent-50 px-4 py-1.5 text-[12.5px] text-neutral-800 hairline-b" role="status">
          <Icon icon="check" :size="13" class="text-accent-700"/>
          <span class="min-w-0 truncate">Saved to <span class="font-mono">{{ savedPath }}</span></span>
          <button type="button" class="ml-auto shrink-0 font-medium text-accent-700 hover:underline" @click="reveal(savedPath)">Reveal</button>
        </p>

        <div class="relative min-h-0 flex-1 bg-neutral-200/70">
          <!-- The system's PDF view: the file itself, not a rendering of it. -->
          <iframe v-if="url" :key="url" :src="url" class="absolute inset-0 h-full w-full border-0" :title="`${title}, PDF`"></iframe>

          <!-- A page taking shape while Go lays it out. -->
          <div v-if="state === 'rendering'" class="absolute inset-0 flex items-start justify-center overflow-hidden pt-10" aria-hidden="true">
            <div class="pdf-page rounded-sm bg-white shadow-[0_2px_12px_rgb(0_0_0/0.12)]" :style="{ aspectRatio: pageSize === 'A4' ? '210 / 297' : '215.9 / 279.4' }">
              <div class="h-5 w-3/5 rounded-sm bg-neutral-200"></div>
              <div class="mt-3 h-[3px] w-10 rounded-full bg-accent-400"></div>
              <div class="mt-3 h-2 w-2/5 rounded-sm bg-neutral-100"></div>
              <div v-for="n in 5" :key="n" class="mt-2.5 h-2 rounded-sm bg-neutral-100" :style="{ width: `${92 - (n % 3) * 9}%` }"></div>
              <div class="mt-6 h-3 w-1/3 rounded-sm bg-neutral-200"></div>
              <div v-for="n in 6" :key="`t${n}`" class="mt-2 flex gap-3"><div class="h-2 flex-1 rounded-sm bg-neutral-100"></div><div class="h-2 w-10 rounded-sm bg-neutral-100"></div><div class="h-2 w-10 rounded-sm bg-neutral-100"></div></div>
            </div>
          </div>

          <div v-if="state === 'error'" class="absolute inset-0 flex items-center justify-center">
            <div class="max-w-[440px] rounded-lg bg-surface px-5 py-4 text-center hairline">
              <p class="text-sm font-medium text-neutral-900">The PDF could not be laid out</p>
              <p class="mt-1 font-mono text-xs text-red-700">{{ error }}</p>
              <button type="button" class="ui-btn ui-btn-sm mt-3" @click="render">Try again</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { OpenPDF } from "wailsjs/go/app/EvidenceService";
import Icon from "~/components/ui/common/Icon.vue";
import { usePlatform } from "~/composables/usePlatform";
import { useReportsStore } from "~/stores/reports";
import { useStateStore } from "~/stores/state";
import { FILTERS, reveal, saveBase64 } from "~/utils/files";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{ blocked?: string | null }>();

const reports = useReportsStore();
const state_ = useStateStore();
const { isMac, isWindows } = usePlatform();

const state = ref<"idle" | "rendering" | "ready" | "error">("idle");
const b64 = ref("");
const url = ref("");
const error = ref("");
const pages = ref(0);
const bytes = ref(0);
const saving = ref(false);
const savedPath = ref("");
const title = computed(() => reports.current?.title || "Report");
const cellCount = computed(() => reports.cells.length);
const stale = computed(() => reports.stale.length);
const slots = computed(() => reports.cells.filter(c => c.cell.spec.type === "slot").length);
const viewerName = computed(() => (isMac.value ? "Preview" : isWindows.value ? "your PDF viewer" : "the PDF viewer"));
const sizeText = computed(() => (bytes.value < 1024 * 1024 ? `${Math.max(1, Math.round(bytes.value / 1024))} KB` : `${(bytes.value / 1024 / 1024).toFixed(1)} MB`));

// The page size is a way of working, kept with the workspace.
const pageSize = computed<"A4" | "Letter">(() => (state_.get<string>("reports.pageSize", "A4") === "Letter" ? "Letter" : "A4"));
function setSize(s: "A4" | "Letter") {
  if (s === pageSize.value) return;
  state_.set("reports.pageSize", s === "A4" ? null : s);
  void render();
}

let asked = 0;
async function render() {
  const mine = ++asked;
  state.value = "rendering";
  error.value = "";
  savedPath.value = "";
  try {
    reports.flushSave();
    const out = await reports.pdfBase64({ pageSize: pageSize.value });
    if (mine !== asked) return;
    const raw = atob(out);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    // Page objects, not the page tree: "/Type /Page" not followed by "s".
    pages.value = (raw.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
    bytes.value = arr.length;
    setUrl(URL.createObjectURL(new Blob([arr], { type: "application/pdf" })));
    b64.value = out;
    state.value = "ready";
  } catch (e) {
    if (mine !== asked) return;
    error.value = e instanceof Error ? e.message : String(e);
    state.value = "error";
  }
}
function setUrl(next: string) {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = next;
}

watch(open, (o) => {
  if (o) {
    if (props.blocked) { state.value = "error"; error.value = props.blocked; return; }
    void render();
  } else {
    asked++;
    setUrl("");
    b64.value = "";
    state.value = "idle";
  }
});
onBeforeUnmount(() => setUrl(""));

async function save() {
  if (!b64.value) return;
  saving.value = true;
  try {
    const path = await saveBase64(`${title.value}.pdf`, b64.value, [FILTERS.pdf], "Save the report as PDF");
    if (path) savedPath.value = path;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
async function openOutside() {
  if (!b64.value) return;
  try { await OpenPDF(b64.value, title.value); } catch (e) { error.value = e instanceof Error ? e.message : String(e); state.value = "error"; }
}
function close() { open.value = false; }
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
}
</script>

<style scoped>
.pdf-page { width: min(620px, 70%); padding: 7% 8%; animation: breathe 1.6s ease-in-out infinite; }
@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
@media (prefers-reduced-motion: reduce) { .pdf-page { animation: none; } }
</style>
