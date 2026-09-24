<template>
  <!-- New report: a template written for this codebase before it is made.
       The page on the right is the report as it will open: the facts already
       counted from the snapshot, the tables that will run, the figures to
       add, and the prompts where the reading goes. -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/25 p-6" @mousedown.self="close">
      <div
        class="ui-popover flex h-[min(820px,92vh)] w-[1120px] max-w-[96vw] flex-col overflow-hidden animate-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-title"
        tabindex="-1"
        style="outline: none"
        @keydown="onKey"
      >
        <header class="flex shrink-0 items-baseline gap-3 px-5 pb-3 pt-4 hairline-b">
          <h2 id="tpl-title" class="text-[15px] font-semibold text-neutral-900">New report</h2>
          <p class="min-w-0 truncate font-mono text-[11.5px] text-neutral-500">{{ sourceLine }}</p>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" aria-label="Close" @click="close"><Icon icon="x" :size="13"/></button>
        </header>

        <div class="flex min-h-0 flex-1">
          <!-- The templates, this codebase's first. -->
          <nav class="flex w-[284px] shrink-0 flex-col overflow-y-auto bg-ground pb-4 hairline-r" aria-label="Templates">
            <ul class="px-2 pt-2" role="listbox" aria-label="Templates" :aria-activedescendant="`tpl-${selected}`">
              <li v-for="row in rows" :key="row.key" :role="row.heading ? 'presentation' : undefined">
                <h3 v-if="row.heading" class="ui-label flex items-center gap-1.5 px-2 pb-1" :class="row.first ? 'pt-1.5' : 'pt-4'">
                  <button v-if="row.toggle" type="button" class="flex items-center gap-1 hover:text-neutral-900" :aria-expanded="showOthers" @click="showOthers = !showOthers">
                    <Icon :icon="showOthers ? 'chevron-down' : 'chevron-right'" :size="11"/>{{ row.heading }}
                  </button>
                  <template v-else>{{ row.heading }}</template>
                </h3>
                <div
                  v-else
                  :id="`tpl-${row.key}`"
                  role="option"
                  :aria-selected="selected === row.key"
                  class="group/t relative flex w-full cursor-default items-start gap-2.5 rounded px-2 py-2 text-left transition-colors"
                  :class="selected === row.key ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-200/60'"
                  @click="select(row.key)"
                  @dblclick="create"
                >
                  <Icon :icon="row.icon" :size="14" class="mt-[2px] shrink-0" :class="selected === row.key ? 'text-accent-600' : 'text-neutral-400'"/>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] text-neutral-900">{{ row.name }}</span>
                    <span class="block truncate text-[11.5px] leading-4" :class="row.why ? 'text-accent-700' : 'text-neutral-500'" :title="row.why || row.audience">{{ row.why || row.audience }}</span>
                  </span>
                  <button
                    v-if="row.saved"
                    type="button"
                    class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet -mr-1 h-6 w-6 shrink-0 opacity-0 focus-visible:opacity-100 group-hover/t:opacity-100"
                    :class="{ '!opacity-100 text-red-700': confirmRemove === row.key }"
                    :aria-label="confirmRemove === row.key ? `Delete ${row.name} for good` : `Delete ${row.name}`"
                    :title="confirmRemove === row.key ? 'Click again to delete this template' : 'Delete this template'"
                    @click.stop="removeSaved(row.key)"
                  ><Icon icon="trash" :size="12"/></button>
                </div>
              </li>
            </ul>
          </nav>

          <!-- The report it writes, as it will open. -->
          <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto bg-surface">
            <div v-if="!kernel" class="flex h-full items-center justify-center px-10 text-center text-sm text-neutral-500">Templates are written from a snapshot; scan the workspace first.</div>
            <template v-else>
              <section class="border-b border-neutral-200/70 bg-ground/60 px-10 pb-4 pt-5">
                <div class="mx-auto max-w-[620px]">
                  <p class="text-[13px] font-semibold text-neutral-900">{{ chosen.name }} <span class="font-normal text-neutral-500">· {{ chosen.audience }}</span></p>
                  <p class="mt-1 text-[12.5px] leading-5 text-neutral-600">{{ chosen.summary }}</p>
                  <p v-if="selected !== 'blank'" class="mt-2.5 text-[12.5px] leading-5 text-neutral-800">
                    <template v-if="!facts">Reading the snapshot…</template>
                    <template v-else>{{ tallyLine }}</template>
                  </p>
                  <p v-if="built.skipped.length" class="mt-1 text-[12px] leading-5 text-neutral-500">
                    Leaves out {{ skippedLine }}.
                  </p>
                  <label v-for="p in chosen.params ?? []" :key="p.id" class="mt-3 flex items-center gap-3 text-[12.5px] text-neutral-700">
                    <span class="w-20 shrink-0">{{ p.label }}</span>
                    <input
                      :value="params[p.id] ?? ''"
                      class="ui-input ui-input-sm min-w-0 flex-1 font-mono"
                      :list="`tpl-${p.id}-list`"
                      :aria-label="p.label"
                      placeholder="A component"
                      @change="setParam(p.id, ($event.target as HTMLInputElement).value)"
                    >
                    <datalist :id="`tpl-${p.id}-list`"><option v-for="c in componentNames" :key="c" :value="c"/></datalist>
                  </label>
                </div>
              </section>

              <article class="mx-auto max-w-[620px] px-10 pb-20 pt-8" aria-label="Preview">
                <p class="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-neutral-950">{{ name || "Untitled report" }}</p>
                <p class="mt-1.5 font-mono text-[11px] text-neutral-500">{{ kernelLine }}</p>
                <div class="pointer-events-none mt-6 select-none" aria-hidden="true">
                  <p v-if="selected === 'blank'" class="py-2 text-[15px] text-neutral-400">An empty page. Write, or press / to add evidence.</p>
                  <template v-for="b in built.blocks" :key="b.id">
                    <NotebookText v-if="!isCell(b)" :block="b" :editing="false" :number="olNumbers.get(b.id)"/>
                    <NotebookReading v-else-if="b.cell.spec.type === 'reading'" :cell="readingCell(b)" :selected="false" :running="false" :stale="false" kernel-label="" :gutter="false"/>
                    <NotebookSlot v-else-if="b.cell.spec.type === 'slot'" :cell="b.cell" :number="numbers.get(b.id) ?? ''" :selected="false" compact/>
                    <div v-else class="my-3 flex items-center gap-3 rounded-lg px-4 py-3 hairline">
                      <Icon icon="table" :size="14" class="shrink-0 text-neutral-400"/>
                      <span class="min-w-0 flex-1 truncate text-[13px]"><span class="text-xs font-medium text-neutral-500">{{ numbers.get(b.id) }}</span> <span class="font-semibold text-neutral-800">{{ b.cell.title || "Query" }}</span></span>
                      <span class="shrink-0 text-[11.5px] text-neutral-500">{{ tableHint(b) }}</span>
                    </div>
                  </template>
                </div>
              </article>
            </template>
          </div>
        </div>

        <footer class="flex shrink-0 items-center gap-3 px-5 py-3 hairline-t">
          <label class="flex min-w-0 flex-1 items-center gap-2.5">
            <span class="shrink-0 text-[12.5px] text-neutral-600">Name</span>
            <input ref="nameEl" v-model="name" class="ui-input ui-input-sm w-full max-w-[380px]" aria-label="Report name" @input="nameTouched = true" @keydown.enter.prevent="create">
          </label>
          <label v-if="slotCount" class="flex shrink-0 cursor-default items-center gap-2 text-[12.5px] text-neutral-700" :title="`Opens each view the template names, set as it asks, and shows what it took before it goes in`">
            <Checkbox v-model="takeAfter" :aria-label="takeText"/>{{ takeText }}
          </label>
          <p v-if="error" class="text-[12.5px] text-red-700" role="alert">{{ error }}</p>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="creating || (selected !== 'blank' && !kernel)" title="⌘↵" @click="create">{{ creating ? "Writing…" : "Create report" }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import NotebookReading from "~/components/report/NotebookReading.vue";
import NotebookSlot from "~/components/report/NotebookSlot.vue";
import NotebookText from "~/components/report/NotebookText.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useSlotTaking } from "~/composables/useSlotTaking";
import { useDataStore } from "~/stores/data";
import { useReportsStore } from "~/stores/reports";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";
import { ecosystems, probe, runReading, type Ecosystem, type SnapshotFacts } from "~/utils/readings";
import { cellNumbers, isCell, type Block, type Cell, type CellBlock, type RanOn, type ReadingOutput } from "~/utils/reportDoc";
import { buildTemplate, ECOSYSTEM_TEMPLATES, fromSaved, GENERAL_TEMPLATES, tally, type BuiltTemplate, type ReportTemplate, type SavedTemplate } from "~/utils/reportTemplates";

const emit = defineEmits<{ (e: "blank"): void; (e: "created"): void }>();

const reports = useReportsStore();
const workspaces = useWorkspacesStore();
const data = useDataStore();
const state = useStateStore();
const open = computed(() => reports.choosingTemplate);
const workspace = computed(() => workspaces.active?.name ?? "this workspace");
const kernel = computed(() => reports.kernel);
const kernelLine = computed(() => (kernel.value ? `Runs on ${kernel.value.label}${kernel.value.headCommit ? ` · ${kernel.value.headCommit.slice(0, 7)}` : ""} · analysis r${kernel.value.revision}` : ""));
const sourceLine = computed(() => (kernel.value ? `Written for ${workspace.value} from the snapshot of ${kernel.value.label}` : ""));

// ── What the snapshot holds ─────────────────────────────────────────────
const facts = ref<SnapshotFacts | null>(null);
const ecos = ref<Ecosystem[]>([]);
const hottest = ref("");
watch([open, () => kernel.value?.id], async ([o]) => {
  if (!o) return;
  const ctx = reports.readingContext();
  if (!ctx) return;
  await state.loadSettings();
  const f = await probe(ctx);
  facts.value = f;
  ecos.value = ecosystems(f);
  try {
    const col = f.componentColumns.has("codesmells__hotspot_score") ? "codesmells__hotspot_score" : "complexity__lines";
    const [r] = await ctx.query(`SELECT name FROM components WHERE name <> '.' ORDER BY ${col} DESC NULLS LAST, name LIMIT 1`);
    hottest.value = r ? String(r.name) : "";
  } catch { hottest.value = ""; }
  if (!params.value.component && hottest.value) params.value = { ...params.value, component: hottest.value };
  if (!chosenOnce.value) select(ecoTemplates.value[0]?.id ?? "architecture-review");
}, { immediate: true });
const componentNames = computed(() => (data.allComponents ?? []).map((c: any) => String(c.name)).filter((n: string) => n !== ".").sort());

// ── The list ────────────────────────────────────────────────────────────
const BLANK = { id: "blank", name: "Blank report", audience: "An empty page", summary: "Start from nothing; add facts, tables, queries and pins as you write." };
const saved = computed<SavedTemplate[]>(() => reports.savedTemplates());
const detected = computed(() => new Map(ecos.value.map(e => [e.id, e])));
const ecoTemplates = computed(() => ECOSYSTEM_TEMPLATES.filter(t => t.ecosystem && detected.value.has(t.ecosystem)));
const otherTemplates = computed(() => ECOSYSTEM_TEMPLATES.filter(t => !t.ecosystem || !detected.value.has(t.ecosystem)));
const showOthers = ref(false);

interface Row { key: string; heading?: string; first?: boolean; toggle?: boolean; name?: string; audience?: string; why?: string; icon?: string; saved?: boolean }
const rows = computed<Row[]>(() => {
  const out: Row[] = [{ key: "h:start", heading: "Start", first: true }, { key: "blank", name: BLANK.name, audience: BLANK.audience, icon: "file-text" }];
  if (ecoTemplates.value.length) {
    out.push({ key: "h:eco", heading: `For ${workspace.value}` });
    for (const t of ecoTemplates.value) out.push({ key: t.id, name: t.name, audience: t.audience, why: `Found: ${detected.value.get(t.ecosystem!)!.why}`, icon: "scan-line" });
  }
  out.push({ key: "h:general", heading: "General" });
  for (const t of GENERAL_TEMPLATES) out.push({ key: t.id, name: t.name, audience: t.audience, icon: "layout-list" });
  if (saved.value.length) {
    out.push({ key: "h:saved", heading: "Yours" });
    for (const t of saved.value) out.push({ key: `saved:${t.id}`, name: t.name, audience: t.summary || `Saved from ${t.from}`, icon: "bookmark", saved: true });
  }
  out.push({ key: "h:others", heading: `Other ecosystems (${otherTemplates.value.length})`, toggle: true });
  if (showOthers.value) for (const t of otherTemplates.value) out.push({ key: t.id, name: t.name, audience: `${t.audience}; not found here`, icon: "layout-list" });
  return out;
});
const choices = computed(() => rows.value.filter(r => !r.heading).map(r => r.key));

const selected = ref("blank");
const chosenOnce = ref(false);
const template = computed<ReportTemplate | null>(() => [...GENERAL_TEMPLATES, ...ECOSYSTEM_TEMPLATES].find(t => t.id === selected.value) ?? null);
const savedChosen = computed(() => (selected.value.startsWith("saved:") ? saved.value.find(t => `saved:${t.id}` === selected.value) ?? null : null));
const chosen = computed(() => template.value ?? (savedChosen.value ? { id: selected.value, name: savedChosen.value.name, audience: `Yours, saved from ${savedChosen.value.from}`, summary: savedChosen.value.summary || "Your structure, cells and prompts; nothing it found before comes with it.", params: undefined } : BLANK) as { name: string; audience: string; summary: string; params?: ReportTemplate["params"] });

function select(key: string) {
  selected.value = key;
  chosenOnce.value = true;
  confirmRemove.value = null;
  if (!nameTouched.value) name.value = defaultName();
  scroller.value?.scrollTo({ top: 0 });
}
const params = ref<Record<string, string>>({});
function setParam(id: string, v: string) {
  params.value = { ...params.value, [id]: v.trim() };
  if (!nameTouched.value) name.value = defaultName();
}

// ── The report it writes ────────────────────────────────────────────────
const built = computed<BuiltTemplate>(() => {
  if (!facts.value || selected.value === "blank") return { blocks: [], skipped: [] };
  if (savedChosen.value) return { blocks: fromSaved(savedChosen.value), skipped: [] };
  if (!template.value) return { blocks: [], skipped: [] };
  return buildTemplate(template.value, { facts: facts.value, ecosystems: ecos.value, params: params.value });
});
const numbers = computed(() => cellNumbers(built.value.blocks));
const olNumbers = computed(() => {
  const out = new Map<string, number>();
  let n = 0;
  built.value.blocks.forEach((b, i) => { if (b.kind !== "ol") { n = 0; return; } n = built.value.blocks[i - 1]?.kind === "ol" ? n + 1 : 1; out.set(b.id, n); });
  return out;
});
const count = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const tallyLine = computed(() => {
  const t = tally(built.value.blocks);
  const parts = [
    t.readings ? count(t.readings, "paragraph") + " counted from the snapshot" : "",
    t.tables ? count(t.tables, "table") : "",
    t.figures ? `${count(t.figures, "figure")} to add from the views` : "",
    t.prompts ? count(t.prompts, "prompt") + " for your reading" : "",
  ].filter(Boolean);
  const last = parts.pop();
  return `Writes ${count(t.sections, "section")}: ${parts.length ? `${parts.join(", ")} and ${last}` : last ?? "nothing yet"}.`;
});
const skippedLine = computed(() => built.value.skipped.map(s => `${s.section} (${s.why})`).join(", "));
function tableHint(b: CellBlock) {
  const s = b.cell.spec;
  if (s.type === "table") return `${s.limit} ${s.source} · runs when created`;
  return "query · runs when created";
}

// Readings are counted as the preview shows them, and the report opens with them.
const counted = ref<Record<string, ReadingOutput>>({});
const readingKey = (b: CellBlock) => (b.cell.spec.type === "reading" ? `${kernel.value?.id}:${b.cell.spec.reading}:${JSON.stringify(b.cell.spec.params ?? {})}` : "");
function readingCell(b: CellBlock): Cell {
  const out = counted.value[readingKey(b)];
  return { ...b.cell, output: out ? { reading: out } : null };
}
let counting = 0;
watch(built, async (next) => {
  const ctx = reports.readingContext();
  if (!ctx) return;
  const mine = ++counting;
  for (const b of next.blocks) {
    if (!isCell(b) || b.cell.spec.type !== "reading") continue;
    const key = readingKey(b);
    if (counted.value[key]) continue;
    let out: ReadingOutput;
    try { out = await runReading(b.cell.spec.reading, b.cell.spec.params, ctx); } catch (e) { out = { text: e instanceof Error ? e.message : String(e), values: {}, absent: true }; }
    counted.value = { ...counted.value, [key]: out };
    if (mine !== counting) return;
  }
});

// ── Making it ───────────────────────────────────────────────────────────
const name = ref("");
const nameTouched = ref(false);
const nameEl = ref<HTMLInputElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
const creating = ref(false);
const error = ref("");
function defaultName() {
  if (selected.value === "blank") return "";
  if (savedChosen.value) return `${savedChosen.value.name}: ${workspace.value}`;
  return template.value?.title(workspace.value, params.value) ?? "";
}

async function create() {
  if (creating.value) return;
  if (selected.value === "blank") { reports.choosingTemplate = false; emit("blank"); return; }
  const rc = reports.runContext();
  if (!rc) return;
  creating.value = true;
  error.value = "";
  try {
    const ranOn: RanOn = { scanId: rc.scan.id, label: rc.scan.label, commit: rc.scan.headCommit, revision: rc.scan.revision, at: new Date().toISOString(), ...rc.context() };
    const blocks: Block[] = built.value.blocks.map(b => {
      if (!isCell(b) || b.cell.spec.type !== "reading") return b;
      const out = counted.value[readingKey(b)];
      return out ? { ...b, cell: { ...b.cell, output: { reading: out }, ranOn } } : b;
    });
    reports.choosingTemplate = false;
    const take = takeAfter.value && slotCount.value > 0;
    await reports.createFrom(name.value.trim() || defaultName() || "Untitled report", blocks);
    emit("created");
    if (take) void taking.start(reports.slots.map(s => s.id));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    reports.choosingTemplate = true;
  } finally {
    creating.value = false;
  }
}

// Figures the template asks for can be taken from their views as soon as the report exists.
const taking = useSlotTaking();
const takeAfter = ref(true);
const slotCount = computed(() => tally(built.value.blocks).figures);
const takeText = computed(() => `Then take the ${slotCount.value === 1 ? "figure" : `${slotCount.value} figures`} from ${slotCount.value === 1 ? "its view" : "their views"}`);

const confirmRemove = ref<string | null>(null);
async function removeSaved(key: string) {
  if (confirmRemove.value !== key) { confirmRemove.value = key; return; }
  confirmRemove.value = null;
  await reports.removeTemplate(key.slice("saved:".length));
  if (selected.value === key) select("blank");
}

function close() { reports.choosingTemplate = false; }
function onKey(e: KeyboardEvent) {
  const typing = (e.target as HTMLElement)?.tagName === "INPUT";
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void create(); return; }
  if (e.key === "Escape") { e.preventDefault(); close(); return; }
  if (typing) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const list = choices.value;
    const i = list.indexOf(selected.value);
    const next = list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length];
    if (next) { select(next); void nextTick(() => document.getElementById(`tpl-${next}`)?.scrollIntoView({ block: "nearest" })); }
  } else if (e.key === "Enter") { e.preventDefault(); void create(); }
}

watch(open, (o) => {
  if (!o) return;
  error.value = "";
  creating.value = false;
  nameTouched.value = false;
  chosenOnce.value = false;
  showOthers.value = false;
  confirmRemove.value = null;
  if (facts.value) select(ecoTemplates.value[0]?.id ?? "architecture-review");
  void nextTick(() => (document.querySelector("[aria-labelledby='tpl-title']") as HTMLElement | null)?.focus());
});
</script>
