<template>
  <div class="flex flex-col gap-4">
    <div>
      <div class="flex items-baseline gap-2">
        <h3 class="ui-section-title">What if</h3>
        <span class="ml-auto flex gap-1">
          <PinButton v-if="sandbox.edits.length" icon kind="view" :entity-key="`sandbox|${pinKey}`" :title="`What-if: ${sandbox.edits.length} edit${sandbox.edits.length === 1 ? '' : 's'}`" :values="pinValues" figure/>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="!sandbox.canUndo" aria-label="Undo" title="Undo" @click="sandbox.stepBack()"><Icon icon="undo" :size="12"/></button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="!sandbox.canRedo" aria-label="Redo" title="Redo" @click="sandbox.stepForward()"><Icon icon="redo" :size="12"/></button>
        </span>
      </div>
      <p class="mt-1 text-xs leading-4 text-neutral-500">Projected from this snapshot's resolved imports. Nothing is scanned or saved; rules are not re-checked. The plan lasts for this session; for a whole target structure, use the <router-link to="/views/restructure" class="underline">Restructure planner</router-link>.</p>
    </div>

    <LoadingState v-if="sandbox.loading" text="Reading imports…"/>
    <template v-else-if="before && after">
      <!-- Before and after. -->
      <dl class="ui-kv">
        <template v-for="row in summary" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd class="font-mono">{{ row.before }} <span class="text-neutral-400">→</span> <span :class="row.before !== row.after ? 'text-neutral-950' : 'text-neutral-500'">{{ row.after }}</span></dd>
        </template>
      </dl>
      <ul v-if="tangleChange.gone.length || tangleChange.split.length || tangleChange.formed.length" class="flex flex-col gap-1 text-sm leading-5 text-neutral-700">
        <li v-if="tangleChange.gone.length">{{ tangleChange.gone.length }} tangle{{ tangleChange.gone.length === 1 ? "" : "s" }} gone: {{ tangleChange.gone.map(t => `${t.length} components`).join(", ") }}.</li>
        <li v-for="s in tangleChange.split" :key="s.was.join()">A tangle of {{ s.was.length }} {{ s.now.length === 1 ? `shrinks to ${s.now[0].length}` : `breaks into ${s.now.map(t => t.length).join(" and ")}` }}; {{ s.was.length - s.now.reduce((n, t) => n + t.length, 0) }} of its components leave every tangle.</li>
        <li v-if="tangleChange.formed.length" class="text-neutral-950">{{ tangleChange.formed.length }} tangle{{ tangleChange.formed.length === 1 ? "" : "s" }} formed that did not exist: {{ tangleChange.formed.map(t => t.slice(0, 3).join(", ") + (t.length > 3 ? " …" : "")).join("; ") }}.</li>
      </ul>

      <div class="ui-segmented self-start" role="group" aria-label="Light in the graph">
        <button type="button" :aria-pressed="light === 'changed'" title="Light the components the plan changes" @click="light = 'changed'">Light changes</button>
        <button type="button" :aria-pressed="light === 'tangled'" title="Light the components still in a tangle after the plan" @click="light = 'tangled'">Light tangles</button>
      </div>

      <section v-if="after.tangles.length">
        <h4 class="ui-label mb-1">Why still tangled</h4>
        <p class="mb-2 text-xs leading-4 text-neutral-500">The dependencies holding each remaining tangle, thinnest first: the files named are the imports to move or cut.</p>
        <div v-for="(t, ti) in after.tangles.slice(0, 3)" :key="t.join()" class="mb-3">
          <div class="text-sm text-neutral-800">{{ t.length }} components: <span class="font-mono text-xs">{{ t.slice(0, 4).map(n => data.getComponentName(n)).join(", ") }}{{ t.length > 4 ? ` +${t.length - 4}` : "" }}</span></div>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="l in linksOf(ti).slice(0, openTangle === ti ? 30 : 4)" :key="l.from + l.to" class="rounded px-2 py-1 text-xs hairline">
              <div class="flex items-baseline gap-2">
                <span class="min-w-0 truncate font-mono" :title="`${l.from} → ${l.to}`">{{ data.getComponentName(l.from) }} → {{ data.getComponentName(l.to) }}</span>
                <span class="shrink-0 text-neutral-500">{{ l.files.length }} file{{ l.files.length === 1 ? "" : "s" }}</span>
                <button type="button" class="ml-auto shrink-0 text-neutral-500 hover:text-neutral-900" :title="`Cut the imports from ${l.from} to ${l.to}`" @click="sandbox.add({ kind: 'cut', from: l.from, to: l.to })">Cut</button>
              </div>
              <div v-for="f in l.files.slice(0, 3)" :key="f.file" class="truncate font-mono text-[11px] text-neutral-500" :title="f.file">{{ f.file }}</div>
              <div v-if="l.files.length > 3" class="text-[11px] text-neutral-400">+{{ l.files.length - 3 }} more</div>
            </li>
          </ul>
          <button v-if="linksOf(ti).length > 4" type="button" class="mt-1 text-xs text-neutral-500 underline" @click="openTangle = openTangle === ti ? null : ti">{{ openTangle === ti ? "Fewer" : `All ${linksOf(ti).length} links` }}</button>
        </div>
      </section>

      <section v-if="changed.length">
        <h4 class="ui-label mb-1">Components that change</h4>
        <div class="overflow-x-auto">
        <table class="ui-table w-full table-fixed text-xs">
          <colgroup><col><col class="w-[64px]"><col class="w-[52px]"><col class="w-[72px]"><col class="w-[72px]"></colgroup>
          <thead><tr><th>Component</th><th class="text-right">Ca</th><th class="text-right">Ce</th><th class="text-right">I</th><th class="text-right">D</th></tr></thead>
          <tbody>
            <tr v-for="c in changed.slice(0, 40)" :key="c.name">
              <td class="truncate font-mono" :title="c.name">{{ data.getComponentName(c.name) }}</td>
              <td class="is-num text-right" :title="`${c.b?.ca ?? '—'} → ${c.a?.ca ?? '—'}`">{{ fmtPair(c.b?.ca, c.a?.ca, 0) }}</td>
              <td class="is-num text-right" :title="`${c.b?.ce ?? '—'} → ${c.a?.ce ?? '—'}`">{{ fmtPair(c.b?.ce, c.a?.ce, 0) }}</td>
              <td class="is-num text-right">{{ fmtPair(c.b?.i, c.a?.i, 2) }}</td>
              <td class="is-num text-right">{{ fmtPair(c.b?.d, c.a?.d, 2) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <p v-if="changed.length > 40" class="mt-1 text-xs text-neutral-500">And {{ changed.length - 40 }} more.</p>
      </section>
      <!-- Adding an edit. -->
      <div class="flex flex-col gap-2 rounded-md p-2.5 hairline">
        <div class="ui-segmented" role="group" aria-label="Edit">
          <button type="button" :aria-pressed="kind === 'move'" @click="kind = 'move'">Move files</button>
          <button type="button" :aria-pressed="kind === 'merge'" @click="kind = 'merge'">Merge</button>
          <button type="button" :aria-pressed="kind === 'cut'" @click="kind = 'cut'">Cut</button>
        </div>
        <template v-if="kind === 'move'">
          <input v-model="fileIn" list="sandbox-files" class="ui-input ui-input-sm font-mono" placeholder="A path, a glob (src/report/**) or words" aria-label="Files to move" spellcheck="false">
          <p class="-mt-1 text-xs text-neutral-500" :title="matched.slice(0, 20).join('\n')">{{ fileIn.trim() ? `${matched.length} file${matched.length === 1 ? "" : "s"}` : "One file, or many at once" }}<template v-if="matched.length === 1 && fileIn.trim() !== matched[0]">: {{ matched[0] }}</template></p>
          <input v-model="toIn" list="sandbox-components" class="ui-input ui-input-sm font-mono" placeholder="Into a component, or a new name" aria-label="Component to move them into" spellcheck="false">
        </template>
        <template v-else>
          <input v-model="fromIn" list="sandbox-components" class="ui-input ui-input-sm font-mono" :placeholder="kind === 'merge' ? 'Merge this component' : 'Imports from'" :aria-label="kind === 'merge' ? 'Component to merge' : 'Importing component'" spellcheck="false">
          <input v-model="toIn" list="sandbox-components" class="ui-input ui-input-sm font-mono" :placeholder="kind === 'merge' ? 'into this one' : 'to'" :aria-label="kind === 'merge' ? 'Component to merge into' : 'Imported component'" spellcheck="false">
        </template>
        <p v-if="toIn.trim() && kind !== 'cut' && !known(toIn.trim()) && !newNames.has(toIn.trim())" class="text-xs text-neutral-500">{{ toIn.trim() }} is new: the plan creates it.</p>
        <p v-if="formError" class="text-xs text-red-700">{{ formError }}</p>
        <button type="button" class="ui-btn ui-btn-sm self-start" :disabled="!canAdd" @click="add">Add to the plan</button>
        <datalist id="sandbox-files"><option v-for="f in fileOptions" :key="f" :value="f"/></datalist>
        <datalist id="sandbox-components"><option v-for="c in componentNames" :key="c" :value="c"/></datalist>
      </div>

      <h4 v-if="sandbox.edits.length" class="ui-label -mb-2">The plan · {{ sandbox.edits.length }} {{ sandbox.edits.length === 1 ? "edit" : "edits" }}</h4>
      <ol v-if="sandbox.edits.length" class="flex flex-col gap-1">
        <li v-for="(e, i) in sandbox.edits" :key="i" class="group flex items-start gap-2 text-sm">
          <span class="w-4 shrink-0 font-mono text-xs text-neutral-400">{{ i + 1 }}</span>
          <span class="min-w-0 flex-1 break-words text-neutral-800">{{ describeEdit(e) }}</span>
          <button type="button" class="shrink-0 text-neutral-400 opacity-0 hover:text-neutral-900 group-hover:opacity-100" :aria-label="`Remove edit ${i + 1}`" @click="sandbox.remove(i)"><Icon icon="x" :size="12"/></button>
        </li>
      </ol>
      <p v-else class="text-sm text-neutral-500">No edits yet: the numbers below are the snapshot's own.</p>

    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useExportables } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { useSandboxStore } from "~/features/sandbox/sandbox.store";
import { buildProvenance, provenanceMarkdown } from "~/features/export/provenance";
import { compareTangles, describeEdit, matchFiles, tangleLinks, type Metrics } from "~/features/sandbox/sandbox";
import PinButton from "~/features/reports/components/PinButton.vue";

// The Plan window: edits on the left of the arrow, their consequence on the
// right, and every component whose coupling moves.

const props = defineProps<{ pair?: { from: string; to: string } | null }>();
const emit = defineEmits<{ (e: "changed", names: string[]): void }>();

const sandbox = useSandboxStore();
const data = useDataStore();
onMounted(() => { void sandbox.load(); });
watch(() => data.datasetKey, () => { void sandbox.load(); });

const before = computed(() => sandbox.before);
const after = computed(() => sandbox.after);

const kind = ref<"move" | "merge" | "cut">("move");
const fileIn = ref("");
const fromIn = ref("");
const toIn = ref("");
const formError = ref("");
// A pair picked in the graph or matrix is the obvious cut.
watch(() => props.pair, p => { if (p) { kind.value = "cut"; fromIn.value = p.from; toIn.value = p.to; } }, { immediate: true });

const componentNames = computed(() => [...new Set([...data.allComponents.map((c: { name: string }) => c.name), ...(sandbox.after?.metrics.keys() ?? [])])].sort());
const fileOptions = computed(() => {
  const q = fileIn.value.trim().toLowerCase();
  const all = [...(sandbox.base?.compOf.keys() ?? [])];
  return (q ? all.filter(f => f.toLowerCase().includes(q)) : all).slice(0, 200);
});
// Components the plan has made count as known once made.
const newNames = computed(() => new Set([...(sandbox.after?.metrics.keys() ?? [])].filter(n => !data.allComponents.some((c: { name: string }) => c.name === n))));
const known = (c: string) => componentNames.value.includes(c) || newNames.value.has(c);
const matched = computed(() => matchFiles(fileIn.value, sandbox.base?.compOf.keys() ?? []));
const canAdd = computed(() => (kind.value === "move" ? !!fileIn.value.trim() && !!toIn.value.trim() : !!fromIn.value.trim() && !!toIn.value.trim()));
function add() {
  formError.value = "";
  const to = toIn.value.trim();
  if (kind.value === "move") {
    const files = matched.value.filter(f => sandbox.after?.compOf.get(f) !== to);
    if (!matched.value.length) { formError.value = "No file matches. Type part of a path, or a glob such as src/report/**."; return; }
    if (!files.length) { formError.value = "Those files are already there."; return; }
    sandbox.addMany(files.map(file => ({ kind: "move" as const, file, to })));
    fileIn.value = "";
  } else {
    const from = fromIn.value.trim();
    if (!known(from)) { formError.value = `${from} is not a component here. Pick one from the list.`; return; }
    if (kind.value === "cut" && !known(to)) { formError.value = `${to} is not a component here. Pick one from the list.`; return; }
    if (from === to) { formError.value = "Pick two different components."; return; }
    // Merging into a name that does not exist yet carves out a new component.
    sandbox.add(kind.value === "merge" ? { kind: "merge", from, into: to } : { kind: "cut", from, to });
  }
}

const cycleStats = (p: { tangles: string[][] }) => ({ count: p.tangles.length, members: p.tangles.reduce((n, t) => n + t.length, 0), largest: p.tangles[0]?.length ?? 0 });
const summary = computed(() => {
  if (!before.value || !after.value) return [];
  const b = cycleStats(before.value), a = cycleStats(after.value);
  return [
    { label: "Tangles", before: b.count, after: a.count },
    { label: "Components in tangles", before: b.members, after: a.members },
    { label: "Largest tangle", before: b.largest, after: a.largest },
    { label: "Component dependencies", before: before.value.pairs.size, after: after.value.pairs.size },
    { label: "Import lines to change", before: 0, after: after.value.importSites.sites },
    { label: "Files holding them", before: 0, after: after.value.importSites.files },
  ];
});
const tangleChange = computed(() => (before.value && after.value ? compareTangles(before.value.tangles, after.value.tangles) : { gone: [], split: [], formed: [] }));
const same = (x?: Metrics, y?: Metrics) => !!x && !!y && ["ca", "ce", "i", "a", "d"].every(k => Math.abs((x as any)[k] - (y as any)[k]) < 1e-9);
const changed = computed(() => {
  if (!before.value || !after.value) return [];
  const names = new Set([...before.value.metrics.keys(), ...after.value.metrics.keys()]);
  const out: Array<{ name: string; b?: Metrics; a?: Metrics }> = [];
  for (const n of names) {
    const b = before.value.metrics.get(n), a = after.value.metrics.get(n);
    if (!same(b, a)) out.push({ name: n, b, a });
  }
  return out.sort((x, y) => Math.abs((y.a?.ca ?? 0) + (y.a?.ce ?? 0) - (y.b?.ca ?? 0) - (y.b?.ce ?? 0)) - Math.abs((x.a?.ca ?? 0) + (x.a?.ce ?? 0) - (x.b?.ca ?? 0) - (x.b?.ce ?? 0)) || x.name.localeCompare(y.name));
});
// The graph lights either what the plan changes or what it leaves tangled.
const light = ref<"changed" | "tangled">("changed");
const openTangle = ref<number | null>(null);
const linksOf = (i: number) => (after.value ? tangleLinks(after.value.tangles[i], after.value) : []);
watch([changed, light, after], () => emit("changed", light.value === "tangled" ? (after.value?.tangles.flat() ?? []) : changed.value.map(x => x.name)), { immediate: true });
const pinKey = computed(() => sandbox.edits.map(describeEdit).join("|"));
const pinValues = () => { const a = after.value ? cycleStats(after.value) : { count: 0, members: 0, largest: 0 }; return { tangles: a.count, tangled: a.members, largest: a.largest }; };

function fmtPair(b: number | undefined, a: number | undefined, d: number): string {
  const f = (x: number | undefined) => (x === undefined ? "—" : d ? x.toFixed(d) : String(x));
  return f(b) === f(a) ? f(a) : `${f(b)}→${f(a)}`;
}

useExportables().register({
  kind: "document",
  title: "What-if plan",
  label: "Copy plan as Markdown",
  savable: true,
  disabledReason: () => (!sandbox.edits.length ? "The plan has no edits yet." : null),
  markdown: () => {
    const lines = ["# What-if plan", "", "Projected from this snapshot's resolved imports. Nothing was re-scanned; module rules were not re-checked.", "", "## Edits", ""];
    sandbox.edits.forEach((e, i) => lines.push(`${i + 1}. ${describeEdit(e)}`));
    lines.push("", "## Before and after", "", "| | Before | After |", "| --- | ---: | ---: |");
    for (const r of summary.value) lines.push(`| ${r.label} | ${r.before} | ${r.after} |`);
    const tc = tangleChange.value;
    if (tc.gone.length || tc.split.length || tc.formed.length) {
      lines.push("");
      if (tc.gone.length) lines.push(`- ${tc.gone.length} tangle(s) gone: ${tc.gone.map(t => `${t.length} components`).join(", ")}.`);
      for (const s of tc.split) lines.push(`- A tangle of ${s.was.length} becomes ${s.now.map(t => t.length).join(" and ")}.`);
      if (tc.formed.length) lines.push(`- New tangle(s): ${tc.formed.map(t => t.join(", ")).join("; ")}.`);
    }
    if (changed.value.length) {
      lines.push("", "## Components that change", "", "| Component | Ca | Ce | I | D |", "| --- | ---: | ---: | ---: | ---: |");
      for (const c of changed.value) lines.push(`| ${c.name} | ${fmtPair(c.b?.ca, c.a?.ca, 0)} | ${fmtPair(c.b?.ce, c.a?.ce, 0)} | ${fmtPair(c.b?.i, c.a?.i, 2)} | ${fmtPair(c.b?.d, c.a?.d, 2)} |`);
    }
    lines.push("", provenanceMarkdown(buildProvenance()));
    return lines.join("\n") + "\n";
  },
});
</script>
