<template>
  <div class="flex min-h-0 grow flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <label class="flex items-center gap-2 text-sm text-neutral-600">
        Components with at least
        <input type="number" min="0" step="100" class="ui-input ui-input-sm w-20 font-mono" :value="floor" aria-label="Lines added floor" @change="setFloor(($event.target as HTMLInputElement).value)">
        lines added
      </label>
      <span class="ui-toolbar-meta ml-auto">
        <span class="font-mono text-neutral-800">{{ formatNumber(shown.length) }}</span> of {{ formatNumber(rows.length) }} components · lines added, not blame · bots {{ authors.showBots ? "shown" : "hidden" }} · aliases merged
      </span>
    </div>
    <LoadingState v-if="loading && !rows.length" text="Adding up who wrote what…"/>
    <EmptyState v-else-if="!rows.length" title="No git history per component" text="Scan a git checkout to see who added each component's lines." icon="users"/>
    <div v-else class="min-h-0 grow overflow-auto">
      <table class="ui-table">
        <thead>
          <tr>
            <th class="w-8"><Checkbox :model-value="allSelected" aria-label="Select all" @update:model-value="toggleAll"/></th>
            <th v-for="c in COLUMNS" :key="c.key" :class="[c.right ? 'text-right' : '', 'cursor-pointer select-none']" :title="c.title" :aria-sort="sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'" @click="sortBy(c.key)">
              {{ c.label }}<span v-if="sortKey === c.key" class="ml-1 text-neutral-400">{{ sortDir === 1 ? "↑" : "↓" }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visible" :key="r.component">
            <td><Checkbox :model-value="selected.has(r.component)" :aria-label="`Select ${r.component}`" @update:model-value="toggle(r.component)"/></td>
            <td class="max-w-[360px] truncate"><router-link :to="componentPath(r.component)" class="font-mono text-sm text-neutral-800 hover:underline" :title="r.component">{{ componentLabel(r.component, workspaces.active?.name) }}</router-link></td>
            <td class="is-num text-right">{{ formatNumber(r.authors) }}</td>
            <td class="is-num text-right">{{ r.cover50 }}</td>
            <td class="is-num text-right">{{ r.cover80 }}</td>
            <td class="max-w-[180px] truncate"><router-link :to="authors.authorPath(r.main)" class="text-neutral-800 hover:underline">{{ authors.display(r.main) }}</router-link></td>
            <td class="is-num text-right">{{ Math.round(r.mainShare * 100) }}%</td>
            <td class="is-num text-right" :title="r.mainLast">{{ formatDate(r.mainLast) }} <span class="text-neutral-400">· {{ daysBefore(r.mainLast) }}</span></td>
            <td class="is-num text-right">{{ r.hotspot === null ? "—" : r.hotspot.toFixed(1) }}</td>
            <td class="is-num text-right">{{ formatNumber(r.reachedBy) }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="shown.length > visible.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 my-3" @click="limit += 200">Show {{ Math.min(200, shown.length - visible.length) }} more</button>
    </div>
    <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" @clear="selected = new Set()" @created="selected = new Set()"/>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useExportables } from "~/composables/useExportables";
import { useAuthorsStore } from "~/stores/authors";
import { useDataStore } from "~/stores/data";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";
import { knowledgeSql } from "~/utils/authors";
import { formatNumber } from "~/utils/format";
import { historyAnchor } from "~/utils/history";
import { componentLabel, componentPath } from "~/utils/routes";
import { formatDate } from "~/utils/time";

// Knowledge per component: how few people added most of its lines, and when
// the main one last touched it. Ordered by concentration: the fewest authors
// covering 80% first. Always through the display name, so pseudonyms hold.

interface Row { component: string; authors: number; added: number; cover50: number; cover80: number; main: string; mainShare: number; mainLast: string; hotspot: number | null; reachedBy: number }

const props = defineProps<{ search?: string }>();
const data = useDataStore();
const authors = useAuthorsStore();
const state = useStateStore();
const workspaces = useWorkspacesStore();

const floor = computed(() => { const v = Number(state.get<number>("knowledge.floor", 500)); return Number.isFinite(v) && v >= 0 ? v : 500; });
function setFloor(v: string) { const n = Number(v); if (Number.isFinite(n) && n >= 0) state.set("knowledge.floor", n === 500 ? null : n); }

const { data: raw, loading } = useAsyncQuery<any[]>(
  () => (data.hasView("git_commits") ? data.query(`
    WITH k AS (${knowledgeSql(authors.aliases, authors.showBots)}),
    reach AS (SELECT "to" AS component, count(DISTINCT "from") AS n FROM component_connections_indirect WHERE "from" <> "to" GROUP BY 1)
    SELECT k.*, c.codesmells__hotspot_score AS hotspot, coalesce(reach.n, 0) AS reachedBy
    FROM k LEFT JOIN components c ON c.name = k.component LEFT JOIN reach ON reach.component = k.component`) : Promise.resolve([])),
  [() => data.datasetKey, () => authors.aliases, () => authors.showBots],
  { initial: [] },
);
const rows = computed<Row[]>(() => raw.value.map(r => ({ ...r, authors: Number(r.authors), added: Number(r.added), cover50: Number(r.cover50), cover80: Number(r.cover80), mainShare: Number(r.mainShare), hotspot: r.hotspot === null || r.hotspot === undefined ? null : Number(r.hotspot), reachedBy: Number(r.reachedBy) })));

const COLUMNS = [
  { key: "component", label: "Component" },
  { key: "authors", label: "Authors", right: true, title: "People who added lines to its current files" },
  { key: "cover50", label: "Cover 50%", right: true, title: "Fewest authors whose added lines reach half of the component's" },
  { key: "cover80", label: "Cover 80%", right: true, title: "Fewest authors whose added lines reach four fifths" },
  { key: "main", label: "Main author" },
  { key: "mainShare", label: "Share", right: true, title: "The main author's share of the lines added" },
  { key: "mainLast", label: "Main author's last commit", right: true, title: "Days counted back from the snapshot's anchor" },
  { key: "hotspot", label: "Hotspot", right: true },
  { key: "reachedBy", label: "Reached by", right: true, title: "Components that depend on it, directly or through others" },
] as const;
type Key = (typeof COLUMNS)[number]["key"];
const sortKey = ref<Key>("cover80");
const sortDir = ref<1 | -1>(1);
function sortBy(k: Key) { if (sortKey.value === k) sortDir.value = sortDir.value === 1 ? -1 : 1; else { sortKey.value = k; sortDir.value = k === "component" || k === "main" || k === "cover50" || k === "cover80" ? 1 : -1; } }

const shown = computed(() => {
  const q = (props.search ?? "").trim().toLowerCase();
  const list = rows.value.filter(r => r.added >= floor.value && (!q || r.component.toLowerCase().includes(q) || authors.display(r.main).toLowerCase().includes(q)));
  const k = sortKey.value, d = sortDir.value;
  const val = (r: Row): any => (k === "main" ? authors.display(r.main) : (r as any)[k]);
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "string" ? x.localeCompare(y) : (x ?? -Infinity) - (y ?? -Infinity);
    return c * d || b.added - a.added;
  });
});
const limit = ref(200);
const visible = computed(() => shown.value.slice(0, limit.value));
watch([floor, () => props.search, sortKey, sortDir], () => { limit.value = 200; });

const anchor = computed(() => { void data.datasetKey; return historyAnchor().date; });
const daysBefore = (t: string) => { const d = Math.round((anchor.value.getTime() - new Date(t).getTime()) / 86400000); return d <= 0 ? "0 d" : `${d.toLocaleString("en-US")} d`; };

const selected = ref<Set<string>>(new Set());
const allSelected = computed(() => shown.value.length > 0 && shown.value.every(r => selected.value.has(r.component)));
function toggle(k: string) { const s = new Set(selected.value); s.has(k) ? s.delete(k) : s.add(k); selected.value = s; }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(shown.value.map(r => r.component)); }

useExportables().register({
  kind: "table",
  title: "Knowledge by component",
  rows: () => shown.value.map(r => ({ component: r.component, authors: r.authors, lines_added: r.added, cover50: r.cover50, cover80: r.cover80, main_author: authors.display(r.main), main_share: r.mainShare, main_last_commit: r.mainLast, hotspot: r.hotspot, reached_by: r.reachedBy })),
  columns: () => [
    { id: "component", label: "Component" }, { id: "authors", label: "Authors" }, { id: "lines_added", label: "Lines added" },
    { id: "cover50", label: "Authors covering 50%" }, { id: "cover80", label: "Authors covering 80%" },
    { id: "main_author", label: "Main author" }, { id: "main_share", label: "Main author's share" }, { id: "main_last_commit", label: "Main author's last commit" },
    { id: "hotspot", label: "Hotspot" }, { id: "reached_by", label: "Reached by" },
  ],
  disabledReason: () => (!shown.value.length ? "No components above the floor." : null),
});
</script>
