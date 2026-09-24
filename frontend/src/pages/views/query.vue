<template>
  <ViewWorkspaceLayout :queryable="false" title="SQL console">
    <template #stats>
      <span v-if="result" class="font-mono">{{ statusLine }}</span>
    </template>
    <template #switches>
      <SingleSelect :model-value="scanOption" :options="scanOptions" @update:model-value="(o: any) => (scanId = o?.id ?? scanId)"/>
    </template>
    <template #visualizer>
      <div class="flex min-h-0 grow">
        <!-- Schema and saved queries. -->
        <aside class="flex w-[260px] shrink-0 flex-col overflow-y-auto bg-ground py-2 hairline-r">
          <section v-if="saved.length" class="pb-2">
            <h3 class="ui-section-title px-3 pb-1 pt-1">Saved queries</h3>
            <ul>
              <li v-for="q in saved" :key="q.id" class="group flex items-center gap-1 px-3">
                <button type="button" class="min-w-0 flex-1 truncate py-1 text-left text-sm text-neutral-800 hover:text-neutral-900" :title="q.lastRun ? `Last run on ${q.lastRun.snapshot}: ${q.lastRun.rows} rows` : q.sql" @click="sql = q.sql">{{ q.name }}</button>
                <button type="button" class="text-xs text-neutral-400 opacity-0 hover:text-red-700 group-hover:opacity-100" :aria-label="`Remove ${q.name}`" @click="removeSaved(q.id)">×</button>
              </li>
            </ul>
          </section>
          <div class="flex items-baseline px-3 pb-1 pt-1">
            <h3 class="ui-section-title flex-1">Tables</h3>
            <span class="font-mono text-[11px] text-neutral-400">{{ schemaTables.length }}</span>
          </div>
          <div class="px-2 pb-1.5">
            <input v-model="schemaFilter" class="ui-input ui-input-sm w-full" placeholder="Find a table or column" aria-label="Find a table or column">
          </div>
          <ul>
            <li v-for="t in shownSchema" :key="t.name">
              <div class="group/t flex items-center pr-1.5 hover:bg-neutral-100">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 pl-3 text-left font-mono text-sm text-neutral-800" :aria-expanded="isOpen(t.name)" @click="openTable = openTable === t.name ? null : t.name">
                  <Icon icon="chevron-right" :size="11" class="shrink-0 text-neutral-400 transition-transform" :class="{ 'rotate-90': isOpen(t.name) }"/>
                  <span class="min-w-0 flex-1 truncate">{{ t.name }}</span>
                  <span class="shrink-0 text-[10.5px] text-neutral-400">{{ t.columns.length }}</span>
                </button>
                <button type="button" class="ml-1 shrink-0 rounded px-1 text-[11px] text-neutral-500 opacity-0 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:opacity-100 group-hover/t:opacity-100" :title="sql.trim() ? `Insert ${t.name}` : `Query ${t.name}`" @click="queryTable(t.name)">{{ sql.trim() ? "Insert" : "Query" }}</button>
              </div>
              <ul v-if="isOpen(t.name)" class="pb-1 pl-7 pr-2">
                <li v-for="c in t.shown" :key="c.name" class="flex items-baseline gap-2 text-xs leading-5" :title="data.statNiceName(c.name) !== c.name ? data.statNiceName(c.name) : ''">
                  <button type="button" class="min-w-0 flex-1 truncate text-left font-mono text-neutral-500 hover:text-neutral-900" @click="insert(c.name)">{{ c.name }}</button>
                  <span class="shrink-0 font-mono text-[10px] uppercase text-neutral-400">{{ c.type }}</span>
                </li>
              </ul>
            </li>
            <li v-if="schemaFilter && !shownSchema.length" class="px-3 py-2 text-xs text-neutral-500">Nothing called that.</li>
          </ul>
        </aside>

        <div class="flex min-w-0 grow flex-col">
          <div class="flex flex-col gap-2 p-3 hairline-b">
            <SqlEditor
              ref="editor"
              v-model="sql"
              :scan-id="scanId"
              :error="error"
              line-numbers
              :min-rows="8"
              :max-rows="20"
              placeholder="select name, complexity__lines from components order by 2 desc"
              aria-label="SQL query"
              @run="run"
            />
            <div class="flex items-center gap-2">
              <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="running || !sql.trim()" @click="run">{{ running ? "Running…" : "Run" }} <span class="font-mono text-xs opacity-70">⌘↵</span></button>
              <template v-if="savingName !== null">
                <input v-model="savingName" class="ui-input ui-input-sm w-56" placeholder="Name this query" @keydown.enter.prevent="saveQuery" @keydown.esc="savingName = null">
                <button type="button" class="ui-btn ui-btn-sm" :disabled="!savingName.trim()" @click="saveQuery">Save</button>
              </template>
              <button v-else type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!sql.trim()" @click="savingName = ''">Save query…</button>
              <span class="ml-auto text-xs text-neutral-500">Read-only · one statement · 5,000 rows · 10 s</span>
            </div>
          </div>

          <div v-if="!result && !error" class="p-6">
            <h3 class="ui-section-title">Examples</h3>
            <ul class="mt-2 flex flex-col gap-2">
              <li v-for="ex in EXAMPLES" :key="ex.sql"><button type="button" class="text-left" @click="sql = ex.sql"><span class="text-sm text-neutral-800">{{ ex.label }}</span><code class="block font-mono text-xs text-neutral-500">{{ ex.sql }}</code></button></li>
            </ul>
          </div>
          <div v-else-if="result" class="min-h-0 grow overflow-auto">
            <table class="ui-table">
              <thead class="sticky top-0 z-10 bg-surface">
                <tr>
                  <th v-if="unitColumn" class="w-8"></th>
                  <th v-for="c in result.columns" :key="c" class="whitespace-nowrap font-mono text-xs" :title="data.statNiceName(c) !== c ? data.statNiceName(c) : ''">{{ c }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in result.rows.slice(0, shown)" :key="i" :class="{ 'is-selected': selected.has(String(row[unitColumn?.index ?? 0])) && !!unitColumn }">
                  <td v-if="unitColumn"><Checkbox :model-value="selected.has(String(row[unitColumn.index]))" @update:model-value="toggle(String(row[unitColumn.index]))"/></td>
                  <td v-for="(cell, j) in row" :key="j" class="max-w-[420px] truncate font-mono text-xs" :class="typeof cell === 'number' ? 'text-right tabular-nums' : ''" :title="cell === null ? 'null' : String(cell)">{{ cell === null ? "null" : typeof cell === "number" ? fmt(cell) : cell }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="result.rows.length > shown" class="flex justify-center py-3"><button type="button" class="ui-btn ui-btn-sm" @click="shown += 500">Show more</button></div>
          </div>
        </div>
      </div>
      <GroupActionBar v-if="unitColumn && selected.size" :selected-items="[...selected]" :kind="unitColumn.kind" @clear="selected = new Set()" @created="onCreated"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Console } from "wailsjs/go/app/QueryService";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import SqlEditor from "~/components/sql/SqlEditor.vue";
import { useSqlSchema } from "~/composables/useSqlSchema";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import Icon from "~/components/ui/common/Icon.vue";
import SingleSelect from "~/components/ui/common/SingleSelect.vue";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useStateStore } from "~/stores/state";
import { useWorkspacesStore } from "~/stores/workspaces";
import { newestFirst } from "~/utils/scanOrder";
import { formatScanTime } from "~/utils/time";

// For the question no view asks: read-only SQL against any snapshot of the
// workspace, with the schema at hand. Results export like any table; a
// column of component or file names can become a group.

const data = useDataStore();
const state = useStateStore();
const workspaces = useWorkspacesStore();

const EXAMPLES = [
  { label: "Largest components", sql: "select name, complexity__lines, codesmells__code_health from components order by 2 desc limit 20" },
  { label: "Files changed most in the last 90 days", sql: "select name, git__commits__last_90_days from files order by 2 desc limit 20" },
  { label: "Who touched a component, by commits", sql: "select author_name, count(distinct commit_hash) as commits from git_commits where component = 'CHANGE_ME' group by 1 order by 2 desc" },
];

const complete = computed(() => newestFirst(workspaces.scans.filter((s: any) => s.status === "complete")) as any[]);
const scanOptions = computed(() => complete.value.map(s => ({ id: s.id, name: `${s.label ? s.label + " · " : ""}${formatScanTime(s.headTime ?? s.startedAt)}` })));
const scanId = ref<string>(workspaces.openScanId ?? "");
watch(() => workspaces.openScanId, id => { if (id && !scanId.value) scanId.value = id; });
const scanOption = computed(() => scanOptions.value.find(o => o.id === scanId.value) ?? null);

const sql = ref("");
const running = ref(false);
const error = ref("");
const result = ref<{ columns: string[]; rows: any[][]; truncated: boolean; elapsedMs: number } | null>(null);
const shown = ref(500);
const editor = ref<InstanceType<typeof SqlEditor> | null>(null);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const statusLine = computed(() => result.value ? `${fmt(result.value.rows.length)}${result.value.truncated ? "+" : ""} rows · ${result.value.elapsedMs} ms${result.value.truncated ? " · truncated" : ""}` : "");

async function run() {
  if (!sql.value.trim() || !scanId.value) return;
  running.value = true; error.value = ""; shown.value = 500; selected.value = new Set();
  try {
    result.value = (await Console(scanId.value, sql.value)) as any;
    const hit = saved.value.find(q => q.sql.trim() === sql.value.trim());
    if (hit && result.value) setSaved(saved.value.map(q => q.id === hit.id ? { ...q, lastRun: { snapshot: scanOption.value?.name ?? "", rows: result.value!.rows.length } } : q));
  } catch (e) {
    result.value = null;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    running.value = false;
  }
}

// ── Schema ─────────────────────────────────────────────────────────────
const { tables: schemaTables } = useSqlSchema(scanId);
const openTable = ref<string | null>(null);
const schemaFilter = ref("");
/** Tables and columns matching the filter, by id or by a metric's name; a match inside a table opens it. */
const shownSchema = computed(() => {
  const q = schemaFilter.value.trim().toLowerCase();
  return schemaTables.value.map(t => {
    if (!q) return { ...t, shown: t.columns, hit: false };
    const cols = t.columns.filter(c => c.name.toLowerCase().includes(q) || data.statNiceName(c.name).toLowerCase().includes(q));
    const self = t.name.toLowerCase().includes(q);
    return self || cols.length ? { ...t, shown: self && !cols.length ? t.columns : cols, hit: cols.length > 0 } : null;
  }).filter(Boolean) as Array<{ name: string; columns: Array<{ name: string; type: string }>; shown: Array<{ name: string; type: string }>; hit: boolean }>;
});
const isOpen = (name: string) => openTable.value === name || (!!schemaFilter.value.trim() && !!shownSchema.value.find(t => t.name === name)?.hit);
function insert(text: string) {
  if (editor.value) editor.value.insert(text);
  else sql.value += text;
}
function queryTable(name: string) {
  if (sql.value.trim()) { insert(name); return; }
  sql.value = `select *\nfrom ${name}\nlimit 100`;
  void nextTick(() => editor.value?.focus());
}

// ── Saved queries (workspace state; they run only when asked) ───────────
interface Saved { id: string; name: string; sql: string; lastRun?: { snapshot: string; rows: number } }
const saved = computed<Saved[]>(() => state.get<Saved[]>("queries.saved", []) ?? []);
const savingName = ref<string | null>(null);
function setSaved(list: Saved[]) { state.set("queries.saved", list.length ? list : null); }
function saveQuery() {
  const name = (savingName.value ?? "").trim();
  if (!name) return;
  setSaved([...saved.value, { id: `${Date.now().toString(36)}`, name, sql: sql.value.trim() }]);
  savingName.value = null;
}
function removeSaved(id: string) { setSaved(saved.value.filter(q => q.id !== id)); }

// ── A column of names becomes a group ──────────────────────────────────
const unitColumn = computed<{ index: number; kind: "component" | "file" } | null>(() => {
  const r = result.value;
  if (!r || !r.rows.length) return null;
  const comps = data.allComponentsIndex, files = data.fileComponentIndex;
  for (let i = 0; i < r.columns.length; i++) {
    const vals = r.rows.slice(0, 200).map(row => row[i]).filter(v => typeof v === "string") as string[];
    if (vals.length < Math.min(r.rows.length, 200) * 0.8) continue;
    if (vals.filter(v => comps.has(v)).length >= vals.length * 0.8) return { index: i, kind: "component" };
    if (vals.filter(v => files.has(v)).length >= vals.length * 0.8) return { index: i, kind: "file" };
  }
  return null;
});
const selected = ref(new Set<string>());
function toggle(v: string) { const n = new Set(selected.value); if (n.has(v)) n.delete(v); else n.add(v); selected.value = n; }
function onCreated() { selected.value = new Set(); }

useExportables().register({
  kind: "table",
  title: "SQL console result",
  rows: () => (result.value ? result.value.rows.map(row => Object.fromEntries(result.value!.columns.map((c, i) => [c, row[i]]))) : []),
  columns: () => (result.value?.columns ?? []).map(c => ({ id: c, label: c })),
  disabledReason: () => (result.value ? null : "Run a query first."),
});
</script>
