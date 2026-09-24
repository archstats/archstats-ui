<template>
  <Teleport to="body">
    <div v-if="lens" class="fixed inset-0 z-[65] flex items-start justify-center bg-neutral-900/20 pt-[6vh]" @click.self="close" @keydown.esc="close">
      <div class="ui-popover flex max-h-[86vh] w-[900px] max-w-[95vw] flex-col animate-in" role="dialog" aria-modal="true" aria-labelledby="declare-title">
        <header class="flex items-center gap-3 px-5 py-3 hairline-b">
          <h2 id="declare-title" class="text-base font-semibold text-neutral-900">Declared dependencies: {{ lens }}</h2>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-auto" aria-label="Close" @click="close"><Icon icon="x" :size="13"/></button>
        </header>

        <EmptyState v-if="groupList.length < 2" class="py-10" title="Declare needs two groups" text="A declaration says which groups of this lens may use which. Add a second group first." icon="layers"/>
        <div v-else class="grid min-h-0 grow gap-6 overflow-y-auto p-5 md:grid-cols-[260px_minmax(0,1fr)]">
          <!-- Layers: top may use anything below. -->
          <section>
            <h3 class="ui-section-title">Layers, top first</h3>
            <p class="mt-1 text-sm text-neutral-500">A layer may use any layer below it; an import upward crosses the order. Leave a group out to judge it by pairs only.</p>
            <ol class="mt-3 flex flex-col gap-1">
              <li v-for="(id, i) in layers" :key="id" class="flex h-8 items-center gap-2 rounded px-2 hairline">
                <span class="w-5 font-mono text-xs text-neutral-400">{{ i + 1 }}</span>
                <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: groupById.get(id)?.color }"></span>
                <span class="min-w-0 flex-1 truncate text-sm text-neutral-900">{{ groupById.get(id)?.name }}</span>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="i === 0" :aria-label="`Move ${groupById.get(id)?.name} up`" @click="move(i, -1)"><Icon icon="chevron-up" :size="12"/></button>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="i === layers.length - 1" :aria-label="`Move ${groupById.get(id)?.name} down`" @click="move(i, 1)"><Icon icon="chevron-down" :size="12"/></button>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="`Leave ${groupById.get(id)?.name} out of the layers`" @click="layers = layers.filter(x => x !== id)"><Icon icon="x" :size="12"/></button>
              </li>
            </ol>
            <div v-if="outOfLayers.length" class="mt-3 flex flex-wrap gap-1.5">
              <button v-for="g in outOfLayers" :key="g.id" type="button" class="ui-chip" :title="`Add ${g.name} at the bottom`" @click="layers = [...layers, g.id]">+ {{ g.name }}</button>
            </div>
            <fieldset class="mt-5">
              <legend class="ui-section-title">Anything not declared</legend>
              <label class="mt-2 flex items-center gap-2 text-sm text-neutral-700"><input v-model="unset" type="radio" value="unjudged"> Not judged</label>
              <label class="mt-1 flex items-center gap-2 text-sm text-neutral-700"><input v-model="unset" type="radio" value="forbidden"> Forbidden</label>
            </fieldset>
          </section>

          <!-- Pairs: click a cell to forbid or allow that direction outright. -->
          <section class="min-w-0">
            <h3 class="ui-section-title">Pairs</h3>
            <p class="mt-1 text-sm text-neutral-500">Each cell: row uses column, with the imports this snapshot has. Click to set it: forbidden, allowed, then back to the layers' say.</p>
            <div class="mt-3 overflow-auto">
              <table class="border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th></th>
                    <th v-for="c in ordered" :key="c.id" class="h-24 w-10 px-0 align-bottom font-normal text-neutral-500"><span class="inline-block max-w-[88px] -rotate-45 origin-bottom-left translate-x-4 truncate whitespace-nowrap" :title="c.name">{{ c.name }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in ordered" :key="r.id">
                    <th class="max-w-[160px] truncate pr-2 text-right font-normal text-neutral-700" :title="r.name">{{ r.name }}</th>
                    <td v-for="c in ordered" :key="c.id" class="h-8 w-10 p-0">
                      <button v-if="r.id !== c.id" type="button" class="h-8 w-10 font-mono tabular-nums hairline" :class="cellClass(r.id, c.id)" :title="cellTitle(r, c)" @click="cycle(r.id, c.id)">{{ refs(r.id, c.id) || "" }}</button>
                      <span v-else class="block h-8 w-10 bg-neutral-100"></span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-2 flex flex-wrap gap-4 text-xs text-neutral-500">
              <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-sm bg-red-100 ring-1 ring-red-500"></span>forbidden (set)</span>
              <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-sm bg-red-50"></span>forbidden by the layers</span>
              <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-sm bg-green-100 ring-1 ring-green-600"></span>allowed (set)</span>
            </p>
            <p class="mt-3 text-sm text-neutral-700">{{ preview }}</p>
          </section>
        </div>

        <footer class="flex items-center gap-2 px-5 py-3 hairline-t">
          <button v-if="existing" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="remove">Remove declaration</button>
          <span class="ml-auto"></span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="close">Cancel</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="groupList.length < 2" @click="save">Save</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import { lensGroups, resolveLensEdges } from "~/composables/useLensFindings";
import { useDataStore } from "~/stores/data";
import { useGroupsStore, type Declaration } from "~/stores/groups";
import { groupPairTotals, type GroupEdge } from "~/utils/groupEdges";
import { crossingCount, crossings, verdictOf } from "~/utils/lensRules";

// Writing down the agreed architecture of one lens: the layer order and the
// pairs that are allowed or forbidden whatever the layers say. The grid shows
// what the code does now, so every choice is made against the evidence.

const lens = defineModel<string | null>({ default: null });
const groups = useGroupsStore();
const data = useDataStore();

const groupList = computed(() => (lens.value ? groups.groups.filter(g => g.dimension === lens.value) : []));
const groupById = computed(() => new Map(groupList.value.map(g => [g.id, g])));
const record = computed(() => groups.dimensionRecords.find(d => d.name === lens.value));
const existing = computed(() => record.value?.declared ?? null);

const layers = ref<string[]>([]);
const pairs = ref<Declaration["pairs"]>([]);
const unset = ref<Declaration["unset"]>("unjudged");
const edges = ref<GroupEdge[]>([]);

watch(lens, async (l) => {
  if (!l) return;
  const d = existing.value;
  const ids = new Set(groupList.value.map(g => g.id));
  layers.value = d ? d.layers.filter(id => ids.has(id)) : record.value?.cut === "horizontal" ? groupList.value.map(g => g.id) : [];
  pairs.value = d ? d.pairs.filter(p => ids.has(p.from) && ids.has(p.to)).map(p => ({ ...p })) : [];
  unset.value = d?.unset ?? "unjudged";
  edges.value = [];
  const loaded = await resolveLensEdges(sql => data.query(sql), lensGroups(l));
  edges.value = (loaded?.result.edges ?? []).filter(e => e.kind !== "type_only");
}, { immediate: true });

const outOfLayers = computed(() => groupList.value.filter(g => !layers.value.includes(g.id)));
const ordered = computed(() => [...layers.value.map(id => groupById.value.get(id)!).filter(Boolean), ...outOfLayers.value]);
const totals = computed(() => groupPairTotals(edges.value));
const refs = (a: string, b: string) => totals.value.get(`${a}>${b}`)?.refs ?? 0;
const draft = computed<Declaration>(() => ({ layers: layers.value, pairs: pairs.value, unset: unset.value }));

function move(i: number, by: number) {
  const next = [...layers.value];
  const [x] = next.splice(i, 1);
  next.splice(i + by, 0, x);
  layers.value = next;
}
function cycle(from: string, to: string) {
  const i = pairs.value.findIndex(p => p.from === from && p.to === to);
  const cur = i >= 0 ? pairs.value[i].verdict : null;
  const next = cur === null ? "forbidden" : cur === "forbidden" ? "allowed" : null;
  const list = pairs.value.filter((_, j) => j !== i);
  pairs.value = next ? [...list, { from, to, verdict: next }] : list;
}
function cellClass(a: string, b: string): string {
  const set = pairs.value.find(p => p.from === a && p.to === b)?.verdict;
  if (set === "forbidden") return "bg-red-100 ring-1 ring-inset ring-red-500 text-red-800";
  if (set === "allowed") return "bg-green-100 ring-1 ring-inset ring-green-600 text-green-800";
  return verdictOf(a, b, draft.value) === "forbidden" ? "bg-red-50 text-red-800" : "text-neutral-700 hover:bg-neutral-50";
}
function cellTitle(r: { id: string; name: string }, c: { id: string; name: string }): string {
  const v = verdictOf(r.id, c.id, draft.value);
  return `${r.name} uses ${c.name}: ${refs(r.id, c.id)} imports · ${v === "unjudged" ? "not judged" : v}`;
}
const preview = computed(() => {
  const n = crossingCount(crossings(edges.value, draft.value));
  return n ? `${n.toLocaleString("en-US")} import${n === 1 ? "" : "s"} in this snapshot would cross this declaration.` : "Nothing in this snapshot crosses this declaration.";
});

function save() {
  if (!lens.value) return;
  groups.declare(lens.value, draft.value);
  close();
}
function remove() {
  if (!lens.value) return;
  groups.declare(lens.value, null);
  close();
}
function close() { lens.value = null; }
</script>
