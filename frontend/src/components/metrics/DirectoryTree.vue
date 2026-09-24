<template>
  <div class="flex min-h-0 grow">
    <div class="flex min-w-0 grow flex-col">
      <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
        <span class="text-sm text-neutral-500">Commits in</span>
        <div class="ui-segmented" role="group" aria-label="Commit period">
          <button v-for="p in HISTORY_PERIODS" :key="p.id" type="button" :aria-pressed="period === p.id" :title="anchorLabel(p.days)" @click="period = p.id">{{ p.label }}</button>
        </div>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="expandAll">Expand {{ expandDepth === 0 ? "one level" : "another level" }}</button>
        <button v-if="expanded.size" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="expanded = new Set(); expandDepth = 0">Collapse all</button>
      </div>
      <LoadingState v-if="loading" text="Reading files…"/>
      <EmptyState v-else-if="!root.children.length" title="No files" text="Nothing in scope." icon="folder"/>
      <div v-else class="min-h-0 grow overflow-auto">
        <table class="ui-table">
          <thead>
            <tr>
              <th class="w-8"></th>
              <th>Directory</th>
              <th v-for="c in NUM_COLUMNS" :key="c.id" class="text-right" :title="`${c.label}: ${rule(c.id)}`">{{ c.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in rows" :key="n.path" :class="{ 'is-selected': inspected === n.path }" class="cursor-default" @click="inspected = inspected === n.path ? null : n.path">
              <td @click.stop><Checkbox :model-value="selected.has(n.path)" :aria-label="`Select ${n.path}`" @update:model-value="toggle(n.path)"/></td>
              <td class="max-w-[520px]">
                <div class="flex min-w-0 items-center gap-1" :style="{ paddingLeft: `${(n.depth - 1) * 16}px` }">
                  <button v-if="n.children.length" type="button" class="shrink-0 text-neutral-400 hover:text-neutral-800" :aria-label="expanded.has(n.path) ? `Collapse ${n.path}` : `Expand ${n.path}`" :aria-expanded="expanded.has(n.path)" @click.stop="toggleExpand(n.path)">
                    <Icon :icon="expanded.has(n.path) ? 'chevron-down' : 'chevron-right'" :size="13"/>
                  </button>
                  <span v-else class="w-[13px] shrink-0"></span>
                  <span class="truncate font-mono text-sm text-neutral-800" :title="n.path">{{ n.label }}</span>
                </div>
              </td>
              <td class="is-num text-right">{{ formatNumber(n.files.length) }}</td>
              <td class="is-num text-right">{{ formatNumber(n.lines) }}</td>
              <td class="is-num text-right">{{ formatNumber(n.components.size) }}</td>
              <td class="is-num text-right">{{ commits ? formatNumber(commits.get(n.path) ?? 0) : "…" }}</td>
              <td class="is-num text-right">{{ n.maxHotspot === null ? "—" : n.maxHotspot.toFixed(1) }}</td>
              <td class="is-num text-right">{{ n.minHealth === null ? "—" : n.minHealth.toFixed(2) }}</td>
              <td class="is-num text-right">{{ formatNumber(edgesOf(n).length) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="selected.size" class="flex shrink-0 items-center gap-3 px-4 py-2 hairline-t">
        <span class="text-sm text-neutral-700">{{ selected.size }} {{ selected.size === 1 ? "directory" : "directories" }}</span>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :title="`A live group of ${[...selected].map(p => `${p}/**`).join(', ')}`" @click="keepLive">Keep as live group</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="selected = new Set()">Clear</button>
      </div>
    </div>

    <aside v-if="node" class="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto bg-ground p-4 hairline-l">
      <div>
        <h3 class="break-all font-mono text-sm font-medium text-neutral-900">{{ node.path }}</h3>
        <p class="mt-1 text-sm text-neutral-500">{{ formatNumber(node.files.length) }} files · {{ formatNumber(node.lines) }} lines</p>
      </div>
      <section>
        <h4 class="ui-label mb-1">Hottest files</h4>
        <ul class="flex flex-col">
          <li v-for="f in topFiles" :key="f.name" class="flex h-7 items-center gap-2">
            <router-link :to="filePath(f.name)" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="f.name">{{ f.name.slice(node.path.length + 1) }}</router-link>
            <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ f.hotspot === null ? formatNumber(f.lines) : f.hotspot.toFixed(1) }}</span>
          </li>
        </ul>
      </section>
      <section>
        <h4 class="ui-label mb-1" :title="rule('edges_out')">Reaches outside it</h4>
        <p v-if="!reached.length" class="text-sm text-neutral-500">No component outside this directory is depended on.</p>
        <ul v-else class="flex flex-col">
          <li v-for="r in reached" :key="r.to" class="flex h-7 items-center gap-2">
            <router-link :to="componentPath(r.to)" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="r.to">{{ r.to }}</router-link>
            <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500" :title="`from ${r.from} component${r.from === 1 ? '' : 's'} inside`">{{ r.from }}</span>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { fileHealthSql } from "~/composables/useHealth";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { DEFAULT_DIMENSION, useGroupsStore } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";
import { useScopeStore } from "~/stores/scope";
import { NOT_BOT_SQL } from "~/utils/authors";
import { buildDirTree, commitsByDir, edgesOut, ROLLUP_RULES, visibleRows, type DirFile, type DirNode } from "~/utils/dirTree";
import { formatNumber } from "~/utils/format";
import { HISTORY_PERIODS, anchorLabel, anchorSql, type HistoryPeriodId } from "~/utils/history";
import { componentPath, filePath } from "~/utils/routes";

// An outline of the codebase by directory: every number rolled up by a rule
// the header states, chains of single directories as one row, and the
// components a directory reaches outside itself.

const props = defineProps<{ search?: string }>();
const data = useDataStore();
const scope = useScopeStore();
const groups = useGroupsStore();
const lens = useLensStore();

const col = (c: string, as: string) => (data.hasColumn("files", c) ? `${c} AS ${as}` : `NULL AS ${as}`);
const { data: raw, loading } = useAsyncQuery<DirFile[]>(
  () => data.query(`SELECT name, component, coalesce(complexity__lines, 0) AS lines, ${col("codesmells__hotspot_score", "hotspot")}, ${data.hasColumn("files", "codesmells__code_health") ? `${fileHealthSql()} AS health` : "NULL AS health"} FROM files`),
  [() => data.datasetKey],
  { initial: [] },
);
const { data: edges } = useAsyncQuery<Array<{ from: string; to: string }>>(
  () => (data.hasView("component_connections_direct") ? data.query(`SELECT DISTINCT "from", "to" FROM component_connections_direct WHERE "from" <> "to"`) : Promise.resolve([])),
  [() => data.datasetKey],
  { initial: [] },
);

const inScope = computed(() => raw.value
  .filter(f => scope.fileInScope(f.name, f.component))
  .map(f => ({ ...f, lines: Number(f.lines) || 0, hotspot: f.hotspot === null ? null : Number(f.hotspot), health: f.health === null ? null : Number(f.health) })));
const root = computed(() => buildDirTree(inScope.value));

// Commits in the period, counted per directory from (file, commit) pairs.
const period = ref<HistoryPeriodId>("1y");
const commits = ref<Map<string, number> | null>(null);
watch([period, () => data.datasetKey, inScope], async () => {
  commits.value = null;
  if (!data.hasView("git_commits")) { commits.value = new Map(); return; }
  const days = HISTORY_PERIODS.find(p => p.id === period.value)?.days ?? null;
  const since = days === null ? "" : ` AND julianday(commit_time) >= ${anchorSql()} - ${days}`;
  const keep = new Set(inScope.value.map(f => f.name));
  const pairs = await data.query<{ file: string; hash: string }>(`SELECT file, commit_hash AS hash FROM git_commits WHERE ${NOT_BOT_SQL}${since} AND julianday(commit_time) <= ${anchorSql()}`);
  commits.value = commitsByDir(pairs.filter(p => keep.has(p.file)));
}, { immediate: true });

// Expansion, and a search that opens the way to every match.
const expanded = ref<Set<string>>(new Set());
const expandDepth = ref(0);
function toggleExpand(path: string) { const s = new Set(expanded.value); s.has(path) ? s.delete(path) : s.add(path); expanded.value = s; }
function expandAll() {
  expandDepth.value++;
  const s = new Set(expanded.value);
  const walk = (n: DirNode, d: number) => { for (const c of n.children) { if (d < expandDepth.value && c.children.length) { s.add(c.path); walk(c, d + 1); } } };
  walk(root.value, 0);
  expanded.value = s;
}
const rows = computed(() => {
  const q = (props.search ?? "").trim().toLowerCase();
  if (!q) return visibleRows(root.value, expanded.value);
  const keep = new Set<string>();
  const open = new Set<string>();
  const walk = (n: DirNode, trail: string[]): boolean => {
    let hit = n.path.toLowerCase().includes(q);
    for (const c of n.children) if (walk(c, [...trail, n.path])) { hit = true; open.add(n.path); }
    if (hit) keep.add(n.path);
    return hit;
  };
  walk(root.value, []);
  return visibleRows(root.value, open).filter(n => keep.has(n.path));
});

const edgeCache = new WeakMap<DirNode, Array<{ from: string; to: string }>>();
function edgesOf(n: DirNode) {
  let e = edgeCache.get(n);
  if (!e) { e = edgesOut(n, edges.value); edgeCache.set(n, e); }
  return e;
}
watch(edges, () => { /* new edges: nodes are rebuilt with the snapshot, so the cache follows */ });

const NUM_COLUMNS = [
  { id: "files", label: "Files" }, { id: "lines", label: "Lines" }, { id: "components", label: "Components" },
  { id: "commits", label: "Commits" }, { id: "max_hotspot", label: "Max hotspot" }, { id: "lowest_health", label: "Lowest health" }, { id: "edges_out", label: "Edges out" },
] as const;
const rule = (id: string) => ROLLUP_RULES.find(([k]) => k === id)?.[1] ?? "";

// Inspector.
const inspected = ref<string | null>(null);
const node = computed(() => {
  const find = (n: DirNode): DirNode | null => { if (n.path === inspected.value) return n; for (const c of n.children) { const r = find(c); if (r) return r; } return null; };
  return inspected.value === null ? null : find(root.value);
});
const topFiles = computed(() => [...(node.value?.files ?? [])].sort((a, b) => (b.hotspot ?? -1) - (a.hotspot ?? -1) || b.lines - a.lines).slice(0, 8));
const reached = computed(() => {
  if (!node.value) return [];
  const by = new Map<string, Set<string>>();
  for (const e of edgesOf(node.value)) { const s = by.get(e.to) ?? new Set(); s.add(e.from); by.set(e.to, s); }
  return [...by].map(([to, s]) => ({ to, from: s.size })).sort((a, b) => b.from - a.from || a.to.localeCompare(b.to)).slice(0, 12);
});
watch(root, () => { if (inspected.value !== null && !node.value) inspected.value = null; });

// Selection becomes a live group of globs.
const selected = ref<Set<string>>(new Set());
function toggle(p: string) { const s = new Set(selected.value); s.has(p) ? s.delete(p) : s.add(p); selected.value = s; }
function keepLive() {
  const paths = [...selected.value];
  const name = paths.length === 1 ? paths[0].split("/").pop() || paths[0] : `${paths.length} directories`;
  const g = groups.createGroup(name, [], lens.active ?? DEFAULT_DIMENSION);
  groups.setQuery(g.id, paths.map(p => `${p}/**`).join("\n"), "live");
  selected.value = new Set();
}

useExportables().register({
  kind: "table",
  title: "Metrics: directories",
  rows: () => rows.value.map(n => ({ directory: n.path, files: n.files.length, lines: n.lines, components: n.components.size, commits: commits.value?.get(n.path) ?? null, max_hotspot: n.maxHotspot, lowest_health: n.minHealth, edges_out: edgesOf(n).length })),
  columns: () => [{ id: "directory", label: "Directory" }, ...NUM_COLUMNS.map(c => ({ id: c.id, label: c.label }))],
  notes: () => [
    ["commit period", anchorLabel(HISTORY_PERIODS.find(p => p.id === period.value)?.days ?? null)],
    ...ROLLUP_RULES.map(([k, v]) => [`rollup ${k}`, v] as [string, string]),
  ],
  disabledReason: () => (!rows.value.length ? "No directories in scope." : null),
});
</script>
