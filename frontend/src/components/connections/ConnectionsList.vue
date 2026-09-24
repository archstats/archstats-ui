<template>
  <div class="flex h-full min-h-0 flex-col bg-surface">
    <div class="min-h-0 grow overflow-auto">
      <table class="ui-table">
        <thead class="sticky top-0 z-10 bg-surface">
          <tr>
            <th v-for="c in columns" :key="c.key" class="cursor-pointer select-none whitespace-nowrap hover:text-neutral-900" :class="c.num ? 'text-right' : ''" :title="c.title" @click="sortBy(c.key)">
              <span class="inline-flex items-center gap-1">{{ c.label }}<Icon v-if="sort.key === c.key" :icon="sort.asc ? 'chevron-up' : 'chevron-down'" :size="12"/></span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visible" :key="r.key" class="is-clickable" :class="{ 'is-selected': isSelected(r) }" @click="onRow($event, r)">
            <td class="max-w-[280px] truncate font-mono text-sm text-neutral-900" :title="r.fromLabel">{{ r.fromLabel }}</td>
            <td class="max-w-[280px] truncate font-mono text-sm text-neutral-900" :title="r.toLabel">{{ r.toLabel }}</td>
            <td class="is-num text-right">{{ fmt(r.references) }}<span v-if="r.dynamicRefs" class="ml-1 text-xs text-neutral-400" :title="`${r.dynamicRefs} by runtime lookup`">({{ r.dynamicRefs }})</span></td>
            <td class="is-num text-right">{{ fmt(r.shared) }}</td>
            <td class="is-num text-right">{{ r.rate === null ? "—" : `${Math.round(r.rate * 100)}%` }}</td>
            <td class="is-num text-right">{{ r.hops === null ? (showHops ? "none" : "—") : r.hops }}</td>
            <td class="is-num text-right">{{ Math.round(r.weight * 100) }}%</td>
            <td class="text-sm text-neutral-600">{{ r.kinds }}</td>
            <td><span v-if="r.inTangle" class="ui-tag text-red-700">tangle</span></td>
          </tr>
          <tr v-if="rows.length === 0"><td :colspan="columns.length" class="h-20 text-center text-neutral-500">{{ emptyText }}</td></tr>
        </tbody>
      </table>
      <div v-if="rows.length > limit" class="flex justify-center py-3">
        <button type="button" class="ui-btn ui-btn-sm" @click="limit += 200">Show more <span class="font-mono text-neutral-500">{{ fmt(rows.length - limit) }} left</span></button>
      </div>
    </div>
    <div class="flex h-9 shrink-0 items-center gap-3 px-4 text-sm text-neutral-500 hairline-t">
      <span><span class="font-mono text-neutral-700">{{ fmt(rows.length) }}</span> pairs</span>
      <span v-if="groupCounted" class="text-neutral-400">Shared commits between groups counted once per commit.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useGroupsStore } from "~/stores/groups";
import { edgeKey, type CEdge, type CNode } from "~/utils/connections";
import { sqlLiteral } from "~/utils/sql";

// Every pair the other reps draw, as a table with no cap: the quotable form
// of Connections, and the one hidden coupling is read in.

const props = withDefaults(defineProps<{
  nodes: CNode[]
  edges: CEdge[]
  directed: boolean
  selectedPair: [string, string] | null
  multi: Set<string>
  cycleKeys: Set<string>
  cycleNodes: Set<string>
  /** Include pairs by co-change: shared commits are counted (per commit at group grain). */
  withHistory?: boolean
  emptyText?: string
}>(), { withHistory: false, emptyText: "No pairs in view." });

const emit = defineEmits<{
  (e: "select-pair", from: string, to: string): void
  (e: "select", id: string | null, mods: { shift: boolean; meta: boolean }): void
}>();

const data = useDataStore();
const groups = useGroupsStore();
const labelOf = computed(() => new Map(props.nodes.map(n => [n.id, n.label])));
const kindOf = computed(() => new Map(props.nodes.map(n => [n.id, n.kind])));
const componentGrain = computed(() => props.nodes.length > 0 && props.nodes.every(n => n.kind === "component"));
const showHops = computed(() => componentGrain.value && data.hasView("component_connections_indirect"));
const groupCounted = computed(() => props.withHistory && props.nodes.some(n => n.kind === "group"));

// Hops and import kinds, at component grain only.
const { data: extras } = useAsyncQuery<{ hops: Map<string, number>; kinds: Map<string, string> }>(
  async () => {
    const hops = new Map<string, number>(), kinds = new Map<string, string>();
    if (!componentGrain.value || props.edges.length === 0) return { hops, kinds };
    const ids = props.nodes.map(n => sqlLiteral(n.id)).join(", ");
    if (showHops.value) {
      for (const r of await data.query<{ f: string; t: string; h: number }>(`SELECT "from" AS f, "to" AS t, min(shortest_path_length) AS h FROM component_connections_indirect WHERE "from" IN (${ids}) AND "to" IN (${ids}) GROUP BY 1, 2`)) hops.set(`${r.f}>${r.t}`, Number(r.h));
    }
    if (data.hasColumn("component_connections_direct", "kind")) {
      for (const r of await data.query<{ f: string; t: string; k: string }>(`SELECT "from" AS f, "to" AS t, group_concat(DISTINCT kind) AS k FROM component_connections_direct WHERE "from" IN (${ids}) AND "to" IN (${ids}) GROUP BY 1, 2`)) kinds.set(`${r.f}>${r.t}`, String(r.k ?? ""));
    }
    return { hops, kinds };
  },
  [() => props.nodes, () => props.edges.length],
  { initial: { hops: new Map(), kinds: new Map() } },
);

// Commits per node, and at group grain shared commits counted once per commit
// (summing component pairs counts a commit once for every pair it touches).
const { data: history } = useAsyncQuery<{ perNode: Map<string, number>; shared: Map<string, number> } | null>(
  async () => {
    if (!props.withHistory || !data.hasView("git_commits")) return null;
    const perNode = new Map<string, number>(), shared = new Map<string, number>();
    const [lim] = await data.query<{ v: string | null }>(`SELECT (SELECT value FROM _snapshot WHERE key = 'git_max_changes_per_commit' LIMIT 1) AS v`).catch(() => [{ v: null }]);
    const max = Number(lim?.v) || 100;
    const nodeOfFile = new Map<string, string[]>();
    for (const n of props.nodes) {
      if (n.kind === "group") { const g = groups.getGroupById(n.id); if (g) for (const f of groups.filesOf(g)) nodeOfFile.set(f, [...(nodeOfFile.get(f) ?? []), n.id]); }
      else if (n.kind === "component") for (const f of data.componentFilesIndex.get(n.id) ?? []) nodeOfFile.set(f, [...(nodeOfFile.get(f) ?? []), n.id]);
      else nodeOfFile.set(n.id, [...(nodeOfFile.get(n.id) ?? []), n.id]);
    }
    const rows = await data.query<{ c: string; f: string }>(`SELECT commit_hash AS c, file AS f FROM git_commits WHERE commit_hash IN (SELECT commit_hash FROM git_commits GROUP BY commit_hash HAVING count(DISTINCT file) <= ${max})`);
    const touched = new Map<string, Set<string>>();
    for (const r of rows) {
      const ns = nodeOfFile.get(r.f);
      if (!ns) continue;
      const set = touched.get(r.c) ?? new Set<string>();
      for (const n of ns) set.add(n);
      touched.set(r.c, set);
    }
    for (const set of touched.values()) {
      const list = [...set].sort();
      for (const n of list) perNode.set(n, (perNode.get(n) ?? 0) + 1);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const k = `${list[i]}|${list[j]}`; shared.set(k, (shared.get(k) ?? 0) + 1); }
    }
    return { perNode, shared };
  },
  [() => props.nodes, () => props.withHistory],
  { initial: null },
);

// Undirected edges (co-change, combined) list a pair once in name order:
// the import may run either way, so both directions are read.
function hopsOf(a: string, b: string): number | null {
  const h = extras.value.hops
  const x = h.get(`${a}>${b}`), y = props.directed ? undefined : h.get(`${b}>${a}`)
  if (x === undefined && y === undefined) return null
  return Math.min(x ?? Infinity, y ?? Infinity)
}
function kindsOf(a: string, b: string): string {
  const k = extras.value.kinds
  const parts = [k.get(`${a}>${b}`), props.directed ? undefined : k.get(`${b}>${a}`)].filter(Boolean).join(",")
  return [...new Set(parts.split(",").filter(Boolean))].join(", ")
}

interface Row { key: string; from: string; to: string; fromLabel: string; toLabel: string; references: number; dynamicRefs: number; shared: number; rate: number | null; hops: number | null; weight: number; kinds: string; inTangle: boolean }
const rows = computed<Row[]>(() => props.edges.map(e => {
  const pairKey = [e.from, e.to].sort().join("|");
  const shared = history.value ? history.value.shared.get(pairKey) ?? 0 : e.sharedCommits;
  const nf = history.value?.perNode.get(e.from), nt = history.value?.perNode.get(e.to);
  const smaller = nf && nt ? Math.min(nf, nt) : null;
  return {
    key: `${e.from}>${e.to}`,
    from: e.from, to: e.to,
    fromLabel: labelOf.value.get(e.from) ?? e.from, toLabel: labelOf.value.get(e.to) ?? e.to,
    references: e.references, dynamicRefs: e.dynamicRefs ?? 0,
    shared,
    rate: smaller && shared ? shared / smaller : null,
    hops: hopsOf(e.from, e.to),
    weight: e.weight,
    kinds: kindsOf(e.from, e.to),
    inTangle: props.cycleKeys.has(edgeKey(e.from, e.to)),
  };
}).sort(compare));

const columns = computed(() => [
  { key: "fromLabel", label: props.directed ? "From" : "Between", title: "" },
  { key: "toLabel", label: props.directed ? "To" : "And", title: "" },
  { key: "references", label: "Refs", title: "Import references (runtime lookups in brackets)", num: true },
  { key: "shared", label: "Shared", title: "Commits that touched both, sweeping commits left out", num: true },
  { key: "rate", label: "Co-change", title: "Shared commits as a share of the smaller side's commits", num: true },
  { key: "hops", label: "Hops", title: "Shortest dependency path length; none when no import path exists", num: true },
  { key: "weight", label: "Weight", title: "The edge's weight in the other reps", num: true },
  { key: "kinds", label: "Kinds", title: "How the imports were found" },
  { key: "inTangle", label: "Tangle", title: "The pair sits in a dependency cycle" },
] as Array<{ key: keyof Row; label: string; title: string; num?: boolean }>);

const sort = ref<{ key: keyof Row; asc: boolean }>({ key: "weight", asc: false });
function sortBy(key: keyof Row) { sort.value = sort.value.key === key ? { key, asc: !sort.value.asc } : { key, asc: key === "fromLabel" || key === "toLabel" }; }
function compare(a: Row, b: Row): number {
  const k = sort.value.key, dir = sort.value.asc ? 1 : -1;
  const av = a[k] as any, bv = b[k] as any;
  if (av === bv) return a.key.localeCompare(b.key);
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  return (av < bv ? -1 : 1) * dir;
}
const limit = ref(200);
watch(() => props.edges, () => { limit.value = 200; });
const visible = computed(() => rows.value.slice(0, limit.value));
const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US");

function isSelected(r: Row): boolean {
  const p = props.selectedPair;
  return (!!p && ((p[0] === r.from && p[1] === r.to) || (p[0] === r.to && p[1] === r.from))) || (props.multi.has(r.from) && props.multi.has(r.to));
}
function onRow(ev: MouseEvent, r: Row) {
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
    emit("select", r.from, { shift: true, meta: false });
    emit("select", r.to, { shift: true, meta: false });
    return;
  }
  emit("select-pair", r.from, r.to);
}

useExportables().register({
  kind: "table",
  title: "Connections list",
  rows: () => rows.value.map(r => ({ from: r.fromLabel, to: r.toLabel, references: r.references, dynamic_references: r.dynamicRefs, shared_commits: r.shared, co_change: r.rate, hops: r.hops, weight: r.weight, kinds: r.kinds, in_tangle: r.inTangle })),
  columns: () => ["from", "to", "references", "dynamic_references", "shared_commits", "co_change", "hops", "weight", "kinds", "in_tangle"].map(id => ({ id, label: id.replace(/_/g, " ") })),
});
void kindOf;
</script>
