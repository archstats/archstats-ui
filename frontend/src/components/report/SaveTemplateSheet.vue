<template>
  <!-- A report kept as a template: what comes with it is said before it is
       saved, because what it found belongs to this codebase and stays here. -->
  <Teleport to="body">
    <div v-if="report" class="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/25 p-6" @mousedown.self="close">
      <form
        class="ui-popover w-[480px] max-w-[94vw] animate-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st-title"
        @submit.prevent="save"
        @keydown.esc.prevent="close"
      >
        <header class="px-5 pb-2 pt-4">
          <h2 id="st-title" class="text-[15px] font-semibold text-neutral-900">Save as template</h2>
          <p class="mt-1 text-[12.5px] leading-5 text-neutral-600">For any workspace: it opens under Yours when you start a new report.</p>
        </header>
        <div class="flex flex-col gap-3 px-5 py-3">
          <label class="flex flex-col gap-1 text-[12.5px] text-neutral-700">
            Name
            <input ref="nameEl" v-model="name" class="ui-input ui-input-sm" aria-label="Template name" required>
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] text-neutral-700">
            What it is for <span class="sr-only">(optional)</span>
            <input v-model="summary" class="ui-input ui-input-sm" placeholder="Optional, shown under its name" aria-label="What it is for">
          </label>
          <label class="flex items-start gap-2.5 rounded-md bg-neutral-50 px-3 py-2.5 hairline">
            <Checkbox v-model="prompts" aria-label="Turn paragraphs into prompts" class="mt-[2px]"/>
            <span class="text-[12.5px] leading-5 text-neutral-800">
              Turn my paragraphs into prompts
              <span class="block text-neutral-500">Your words stay as guidance in the empty page; headings, lists and cells come as they are.</span>
            </span>
          </label>
          <div>
            <h3 class="ui-label mb-1">Comes with it</h3>
            <ul class="flex flex-col gap-0.5 text-[12.5px] leading-5 text-neutral-700">
              <li v-for="line in keeps" :key="line" class="flex gap-2"><Icon icon="check" :size="13" class="mt-[3px] shrink-0 text-accent-600"/>{{ line }}</li>
              <li class="flex gap-2 text-neutral-500"><Icon icon="minus" :size="13" class="mt-[3px] shrink-0"/>Not what it found: every cell runs again on the snapshot it is used with.</li>
              <li v-if="dropped" class="flex gap-2 text-neutral-500"><Icon icon="minus" :size="13" class="mt-[3px] shrink-0"/>{{ dropped === 1 ? "1 pin" : `${dropped} pins` }} without a view to open, left out.</li>
            </ul>
          </div>
        </div>
        <footer class="flex items-center gap-2 px-5 pb-4 pt-2">
          <p v-if="error" class="text-[12.5px] text-red-700" role="alert">{{ error }}</p>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="close">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="saving || !name.trim()">{{ saving ? "Saving…" : "Save template" }}</button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useEvidenceStore } from "~/stores/evidence";
import { useReportsStore, type ReportRecord } from "~/stores/reports";
import { useWorkspacesStore } from "~/stores/workspaces";
import { isCell, newId, parseDoc, type Block } from "~/utils/reportDoc";
import { toTemplate } from "~/utils/reportTemplates";

const report = defineModel<ReportRecord | null>({ default: null });
const reports = useReportsStore();
const evidence = useEvidenceStore();
const workspaces = useWorkspacesStore();

const name = ref("");
const summary = ref("");
const prompts = ref(true);
const saving = ref(false);
const error = ref("");
const nameEl = ref<HTMLInputElement | null>(null);

watch(report, (r) => {
  if (!r) return;
  name.value = r.title.replace(/:\s.*$/, "") || "My template";
  summary.value = "";
  prompts.value = true;
  error.value = "";
  void nextTick(() => { nameEl.value?.focus(); nameEl.value?.select(); });
});

const source = computed<Block[]>(() => (report.value ? (report.value.id === reports.currentId ? reports.doc.blocks : parseDoc(report.value.body).blocks) : []));
const pinRoute = (id: string) => {
  const p = evidence.pins.find(x => x.id === id);
  if (!p?.route) return null;
  const view = p.route.split("?")[0].split("/").filter(Boolean).pop() ?? "the view";
  return { title: p.title, route: p.route, view: view.charAt(0).toUpperCase() + view.slice(1) };
};
const blocks = computed(() => toTemplate(source.value, { promptParagraphs: prompts.value, pinRoute }));

const count = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const keeps = computed(() => {
  let headings = 0, cells = 0, slots = 0, readings = 0, promptsN = 0, text = 0;
  for (const b of blocks.value) {
    if (isCell(b)) {
      if (b.cell.spec.type === "slot") slots++;
      else if (b.cell.spec.type === "reading") readings++;
      else cells++;
    } else if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") headings++;
    else if (!b.text && b.prompt) promptsN++;
    else text++;
  }
  return [
    headings ? count(headings, "heading") : "",
    readings ? `${count(readings, "counted paragraph")}, counted afresh` : "",
    cells ? `${count(cells, "table or query", "tables and queries")}, run afresh` : "",
    slots ? `${count(slots, "figure")} as slots to add from the same views` : "",
    promptsN ? count(promptsN, "prompt") : "",
    text ? `${count(text, "block")} of your text as written` : "",
  ].filter(Boolean);
});

const dropped = computed(() => source.value.filter(b => isCell(b) && b.cell.spec.type === "pin" && !pinRoute(b.cell.spec.pinId)).length);

async function save() {
  const r = report.value;
  if (!r || !name.value.trim()) return;
  saving.value = true;
  error.value = "";
  try {
    await reports.saveTemplate({ id: newId(), name: name.value.trim(), summary: summary.value.trim(), from: workspaces.active?.name ?? "", savedAt: new Date().toISOString(), blocks: blocks.value });
    report.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
function close() { report.value = null; }
</script>
