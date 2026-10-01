<template>
  <!-- The console's explorer: what can be opened (saved queries, the
       reports' SQL cells) above what can be read (the snapshot's tables and
       views, with their rows and columns). A click selects and fills the
       details below; a double-click or Enter opens. -->
  <div class="flex h-full min-h-0 flex-col bg-ground">
    <div class="flex h-9 shrink-0 items-center gap-1 pl-2 pr-1 hairline-b">
      <label class="relative flex min-w-0 flex-1 items-center">
        <Search :size="12" class="pointer-events-none absolute left-2 text-neutral-400"/>
        <input
          ref="filterEl"
          v-model="filter"
          type="search"
          class="ui-input ui-input-sm w-full pl-6"
          :placeholder="t('sql.schemaExplorer.findTableColumnQuery')"
          :aria-label="t('sql.schemaExplorer.findTableColumnQuery')"
          @keydown.down.prevent="focusTree(0)"
          @keydown.esc="filter = ''"
        >
      </label>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :title="t('sql.schemaExplorer.collapseAll')" :aria-label="t('sql.schemaExplorer.collapseAll')" @click="collapseAll"><ChevronsDownUp :size="13"/></button>
    </div>

    <div
      ref="treeEl"
      class="sx-tree min-h-0 flex-1 overflow-y-auto py-1 outline-none"
      role="tree"
      :aria-label="t('sql.schemaExplorer.explorer')"
      tabindex="0"
      :aria-activedescendant="selectedKey ? rowId(selectedKey) : undefined"
      @keydown="onKey"
    >
      <template v-for="(n, i) in nodes" :key="n.key">
        <div
          :id="rowId(n.key)"
          class="sx-row"
          :class="[n.kind === 'section' ? 'sx-section' : '', { 'sx-sel': selectedKey === n.key, 'sx-current': isCurrent(n) }]"
          :style="{ paddingLeft: `${8 + n.depth * 14}px` }"
          role="treeitem"
          :aria-level="n.depth + 1"
          :aria-expanded="expandable(n) ? isOpen(n) : undefined"
          :aria-selected="selectedKey === n.key"
          @mousedown="n.kind !== 'hint' && select(i)"
          @dblclick="activate(n)"
        >
          <button v-if="expandable(n)" type="button" tabindex="-1" class="sx-chev" :aria-label="isOpen(n) ? t('sql.schemaExplorer.collapse') : t('sql.schemaExplorer.expand')" @mousedown.stop="select(i)" @click.stop="toggle(n)">
            <ChevronRight :size="11" class="transition-transform duration-100" :class="{ 'rotate-90': isOpen(n) }"/>
          </button>
          <span v-else class="sx-chev" aria-hidden="true"></span>

          <span v-if="n.kind === 'hint'" class="sx-hint">{{ n.text }}</span>
          <template v-else-if="n.kind === 'section'">
            <span class="ui-section-title min-w-0 flex-1 truncate">{{ n.label }}</span>
            <span class="sx-count">{{ n.count }}</span>
          </template>
          <template v-else>
            <component :is="iconOf(n)" :size="13" class="sx-icon" :class="`sx-i-${n.kind}`"/>
            <span class="sx-name" :class="{ 'font-mono': n.kind === 'table' || n.kind === 'column' }"><template v-for="(part, k) in highlight(labelOf(n))" :key="k"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
            <span v-if="n.kind === 'column' && n.metric" class="sx-sub">{{ n.metric.name }}</span>
            <span v-if="n.kind === 'cell' && n.cell.title" class="sx-sub font-mono">{{ n.cell.label }}</span>
            <span class="sx-count">{{ countOf(n) }}</span>
          </template>
        </div>
      </template>
      <p v-if="filter && !nodes.some(n => n.kind !== 'section')" class="px-3 py-3 text-xs text-neutral-500">{{ t('sql.schemaExplorer.nothingHereMatches', { filter }) }}</p>
      <p v-else-if="!tables.length && scanId" class="px-3 py-3 text-xs text-neutral-500">{{ t('sql.schemaExplorer.readingSnapshotSSchema') }}</p>
    </div>

    <!-- The selection, described; its actions sit here, not on hover. -->
    <section v-if="selected && selected.kind !== 'section' && selected.kind !== 'hint'" class="sx-detail hairline-t" :aria-label="t('sql.schemaExplorer.details')">
      <template v-if="selected.kind === 'table'">
        <p class="sx-d-title font-mono">{{ selected.t.name }}</p>
        <p class="sx-d-meta">{{ selected.t.view ? t('sql.schemaExplorer.view') : t('sql.schemaExplorer.table') }} · <template v-if="rowCount(selected.t.name) !== null">{{ t('sql.schemaExplorer.rows', { tName: fmt(rowCount(selected.t.name)!) }) + ' ' }} </template>{{ t('sql.schemaExplorer.columns', { columnsLength: selected.t.columns.length }) }}</p>
        <div class="sx-d-actions">
          <button type="button" class="ui-btn ui-btn-sm" :title="t('sql.schemaExplorer.newTabReadingFirst')" @click="$emit('open-table', selected.t.name)"><Play :size="10" fill="currentColor"/>{{ ' ' + t('sql.schemaExplorer.open') }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('sql.schemaExplorer.putNameCaret')" @click="$emit('insert', selected.t.name)">{{ t('sql.schemaExplorer.insertName') }}</button>
        </div>
      </template>
      <template v-else-if="selected.kind === 'column'">
        <p class="sx-d-title font-mono">{{ selected.t.name }}.{{ selected.c.name }}</p>
        <p class="sx-d-meta"><span class="font-mono">{{ (selected.c.type || "any").toLowerCase() }}</span><template v-if="selected.metric?.category"> · {{ selected.metric.category }}</template></p>
        <template v-if="selected.metric">
          <p class="sx-d-name">{{ selected.metric.name }}</p>
          <p v-if="selected.metric.short" class="sx-d-body">{{ selected.metric.short }}</p>
          <p v-if="selected.metric.long && selected.metric.long !== selected.metric.short" class="sx-d-long">{{ selected.metric.long }}</p>
        </template>
        <div class="sx-d-actions">
          <button type="button" class="ui-btn ui-btn-sm" :title="t('sql.schemaExplorer.putColumnCaretDouble')" @click="$emit('insert', selected.c.name)">{{ t('sql.schemaExplorer.insert') }}</button>
          <button v-if="selected.metric" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('sql.schemaExplorer.metricReferenceEveryOther')" @click="$emit('reference', selected.c.name)">{{ t('sql.schemaExplorer.reference') }}</button>
        </div>
      </template>
      <template v-else-if="selected.kind === 'saved'">
        <p class="sx-d-title">{{ selected.q.name }}</p>
        <p v-if="selected.q.lastRun" class="sx-d-meta">{{ t('sql.schemaExplorer.lastRunRows', { snapshot: selected.q.lastRun.snapshot, rows: fmt(selected.q.lastRun.rows) }) }}</p>
        <pre class="sx-d-sql">{{ selected.q.sql }}</pre>
        <div class="sx-d-actions">
          <button type="button" class="ui-btn ui-btn-sm" @click="$emit('open-saved', selected.q)">{{ t('sql.schemaExplorer.open') }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="$emit('remove-saved', selected.q.id)"><Trash2 :size="12"/>{{ ' ' + t('sql.schemaExplorer.remove') }}</button>
        </div>
      </template>
      <template v-else-if="selected.kind === 'report'">
        <p class="sx-d-title">{{ selected.report }}</p>
        <p class="sx-d-meta">{{ t('sql.schemaExplorer.sql', { selectedCount: selected.count, cells: t('common.noun.cell', { count: selected.count }) }) }}</p>
        <div class="sx-d-actions">
          <button type="button" class="ui-btn ui-btn-sm" @click="$emit('open-report', selected.reportId)"><FileText :size="12"/>{{ ' ' + t('sql.schemaExplorer.openReport') }}</button>
        </div>
      </template>
      <template v-else-if="selected.kind === 'cell'">
        <p class="sx-d-title">{{ selected.cell.title || selected.cell.label }}</p>
        <p class="sx-d-meta">{{ t('sql.schemaExplorer.in', { cellLabel: selected.cell.label, report: selected.report }) }}</p>
        <pre class="sx-d-sql">{{ selected.cell.sql }}</pre>
        <div class="sx-d-actions">
          <button type="button" class="ui-btn ui-btn-sm" :title="t('sql.schemaExplorer.opensLinkedCellUpdate')" @click="$emit('open-cell', selected.reportId, selected.report, selected.cell)">{{ t('sql.schemaExplorer.open') }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="$emit('open-report', selected.reportId)">{{ t('sql.schemaExplorer.openReport') }}</button>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from "vue";
import { Bookmark, ChevronRight, ChevronsDownUp, Columns, Eye, FileText, Gauge, Play, Search, TerminalSquare, Table2, Trash2 } from "lucide-vue-next";
import { QueryIn } from "wailsjs/go/app/QueryService";
import { useSqlSchema } from "~/features/sql/useSqlSchema";
import type { SqlColumn, SqlTable } from "~/features/sql/sqlLang";
import { t, intlLocale } from "~/shared/i18n";

export interface SavedQuery { id: string; name: string; sql: string; lastRun?: { snapshot: string; rows: number } }
export interface ReportSql { reportId: string; report: string; cells: CellSql[] }
export interface CellSql { cellId: string; label: string; title: string; sql: string }

const props = defineProps<{
  scanId: string
  saved: SavedQuery[]
  reports: ReportSql[]
  /** What the active tab came from, marked in the tree. */
  current?: { savedId?: string; cellId?: string } | null
  describe: (column: string) => { name: string; short: string; long?: string; category?: string } | null
}>();
const emit = defineEmits<{
  (e: "open-table", name: string): void
  (e: "insert", text: string): void
  (e: "open-saved", q: SavedQuery): void
  (e: "remove-saved", id: string): void
  (e: "open-cell", reportId: string, report: string, cell: CellSql): void
  (e: "open-report", reportId: string): void
  (e: "reference", id: string): void
}>();

const { tables } = useSqlSchema(toRef(props, "scanId"));
const filter = ref("");
const treeEl = ref<HTMLElement | null>(null);
const filterEl = ref<HTMLInputElement | null>(null);
const fmt = (n: number) => n.toLocaleString(intlLocale);

// ── Row counts, one query per snapshot ────────────────────────────────
const countCache = new Map<string, Promise<Map<string, number>>>();
const counts = ref(new Map<string, number>());
watch([() => props.scanId, tables], async ([id, ts]) => {
  counts.value = new Map();
  const real = (ts as SqlTable[]).filter(t => !t.view);
  if (!id || !real.length) return;
  let p = countCache.get(id);
  if (!p) {
    const q = real.map(t => `SELECT '${t.name.replace(/'/g, "''")}' AS t, count(*) AS n FROM "${t.name.replace(/"/g, '""')}"`).join(" UNION ALL ");
    p = (QueryIn(id, q) as Promise<any[]>).then(rows => new Map((rows ?? []).map(r => [String(r.t), Number(r.n) || 0])));
    p.catch(() => countCache.delete(id));
    countCache.set(id, p);
  }
  try { const m = await p; if (props.scanId === id) counts.value = m; } catch { /* counts are a courtesy */ }
}, { immediate: true });
const rowCount = (name: string) => counts.value.get(name) ?? null;
const compact = (n: number) => (n < 10_000 ? fmt(n) : n < 1_000_000 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`);

// ── The tree, flattened to what is visible ─────────────────────────────
type Metric = { name: string; short: string; long?: string; category?: string } | null;
type Node =
  | { key: string; depth: number; kind: "section"; id: string; label: string; count: number }
  | { key: string; depth: number; kind: "hint"; text: string }
  | { key: string; depth: number; kind: "saved"; q: SavedQuery }
  | { key: string; depth: number; kind: "report"; reportId: string; report: string; count: number }
  | { key: string; depth: number; kind: "cell"; reportId: string; report: string; cell: CellSql }
  | { key: string; depth: number; kind: "table"; t: SqlTable }
  | { key: string; depth: number; kind: "column"; t: SqlTable; c: SqlColumn; metric: Metric };

const open = ref(new Set<string>(["s:saved", "s:reports", "s:tables", "s:views"]));
const q = computed(() => filter.value.trim().toLowerCase());
const hit = (...texts: Array<string | null | undefined>) => !q.value || texts.some(t => !!t && t.toLowerCase().includes(q.value));

const nodes = computed<Node[]>(() => {
  const out: Node[] = [];
  const f = !!q.value;
  const section = (id: string, label: string, count: number, children: Node[]) => {
    if (f && !children.length) return;
    out.push({ key: `s:${id}`, depth: 0, kind: "section", id, label, count });
    if (open.value.has(`s:${id}`) || f) out.push(...children);
  };

  const savedNodes: Node[] = props.saved.filter(s => hit(s.name, s.sql)).map(s => ({ key: `q:${s.id}`, depth: 1, kind: "saved" as const, q: s }));
  section("saved", t("sql.schemaExplorer.savedQueries"), props.saved.length, savedNodes.length || f ? savedNodes : [{ key: "h:saved", depth: 1, kind: "hint", text: t("sql.schemaExplorer.saveQuerySKeep") }]);

  const rep: Node[] = [];
  for (const r of props.reports) {
    const cells = r.cells.filter(c => hit(r.report, c.title, c.label, c.sql));
    if (!cells.length) continue;
    rep.push({ key: `r:${r.reportId}`, depth: 1, kind: "report", reportId: r.reportId, report: r.report, count: r.cells.length });
    if (open.value.has(`r:${r.reportId}`) || f) for (const c of cells) rep.push({ key: `c:${r.reportId}:${c.cellId}`, depth: 2, kind: "cell", reportId: r.reportId, report: r.report, cell: c });
  }
  section("reports", t("sql.schemaExplorer.reports"), props.reports.reduce((n, r) => n + r.cells.length, 0), rep);

  const tableNodes = (views: boolean) => {
    const list: Node[] = [];
    for (const t of tables.value.filter(x => !!x.view === views)) {
      const cols = t.columns.map(c => ({ c, metric: props.describe(c.name) as Metric }));
      const colHits = f ? cols.filter(({ c, metric }) => hit(c.name, metric?.name, metric?.category)) : cols;
      const self = hit(t.name);
      if (!self && !colHits.length) continue;
      list.push({ key: `t:${t.name}`, depth: 1, kind: "table", t });
      // A table found by one of its columns opens on those columns; one found by name stays as it was.
      const expanded = open.value.has(`t:${t.name}`) || (f && !self);
      if (expanded) for (const { c, metric } of f && !self ? colHits : cols) list.push({ key: `k:${t.name}.${c.name}`, depth: 2, kind: "column", t, c, metric });
    }
    return list;
  };
  const tbl = tableNodes(false), vw = tableNodes(true);
  section("tables", "Tables", tables.value.filter(t => !t.view).length, tbl);
  if (tables.value.some(t => t.view)) section("views", "Views", tables.value.filter(t => t.view).length, vw);
  return out;
});

const expandable = (n: Node) => n.kind === "section" || n.kind === "report" || n.kind === "table";
const isOpen = (n: Node) => open.value.has(n.key) || (!!q.value && n.kind !== "table") || (n.kind === "table" && nodes.value.some(x => x.kind === "column" && x.t.name === n.t.name));
function toggle(n: Node, to?: boolean) {
  const next = new Set(open.value);
  const want = to ?? !next.has(n.key);
  if (want) next.add(n.key); else next.delete(n.key);
  open.value = next;
}
function collapseAll() {
  open.value = new Set(["s:saved", "s:reports", "s:tables", "s:views"].filter(k => k !== "s:views"));
}

const selectedKey = ref<string | null>(null);
const selected = computed(() => nodes.value.find(n => n.key === selectedKey.value) ?? null);
const rowId = (key: string) => `sx-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
function select(i: number) {
  const n = nodes.value[i];
  if (!n) return;
  selectedKey.value = n.key;
  void nextTick(() => document.getElementById(rowId(n.key))?.scrollIntoView({ block: "nearest" }));
}
function focusTree(i: number) {
  treeEl.value?.focus();
  if (!selectedKey.value) select(i);
}
function activate(n: Node) {
  if (n.kind === "section" || n.kind === "report") toggle(n);
  else if (n.kind === "table") emit("open-table", n.t.name);
  else if (n.kind === "column") emit("insert", n.c.name);
  else if (n.kind === "saved") emit("open-saved", n.q);
  else if (n.kind === "cell") emit("open-cell", n.reportId, n.report, n.cell);
}
function onKey(e: KeyboardEvent) {
  const i = nodes.value.findIndex(n => n.key === selectedKey.value);
  const n = nodes.value[i];
  if (e.key === "ArrowDown") { e.preventDefault(); select(Math.min(nodes.value.length - 1, i + 1)); }
  else if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0) filterEl.value?.focus(); else select(i - 1); }
  else if (e.key === "Home") { e.preventDefault(); select(0); }
  else if (e.key === "End") { e.preventDefault(); select(nodes.value.length - 1); }
  else if (e.key === "ArrowRight" && n) {
    e.preventDefault();
    if (expandable(n) && !isOpen(n)) toggle(n, true);
    else if (nodes.value[i + 1]?.depth > n.depth) select(i + 1);
  } else if (e.key === "ArrowLeft" && n) {
    e.preventDefault();
    if (expandable(n) && isOpen(n) && !q.value) toggle(n, false);
    else for (let j = i - 1; j >= 0; j--) if (nodes.value[j].depth < n.depth) { select(j); break; }
  } else if (e.key === "Enter" && n) { e.preventDefault(); activate(n); }
  else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && /\S/.test(e.key)) { filterEl.value?.focus(); }
}

// ── How a row reads ─────────────────────────────────────────────────────
const ICONS = { saved: Bookmark, report: FileText, cell: TerminalSquare, column: Columns } as const;
function iconOf(n: Node) {
  if (n.kind === "table") return n.t.view ? Eye : Table2;
  if (n.kind === "column" && n.metric) return Gauge;
  return ICONS[n.kind as keyof typeof ICONS] ?? Columns;
}
function labelOf(n: Node): string {
  switch (n.kind) {
    case "saved": return n.q.name;
    case "report": return n.report;
    case "cell": return n.cell.title || n.cell.label;
    case "table": return n.t.name;
    case "column": return n.c.name;
    default: return "";
  }
}
function countOf(n: Node): string {
  if (n.kind === "table") { const c = rowCount(n.t.name); return c === null ? "" : compact(c); }
  if (n.kind === "column") return (n.c.type || "").toLowerCase().replace("integer", "int");
  if (n.kind === "report") return String(n.count);
  return "";
}
function isCurrent(n: Node) {
  const c = props.current;
  if (!c) return false;
  return (n.kind === "saved" && n.q.id === c.savedId) || (n.kind === "cell" && n.cell.cellId === c.cellId);
}
function highlight(text: string) {
  const at = q.value ? text.toLowerCase().indexOf(q.value) : -1;
  if (at < 0) return [{ text, hit: false }];
  return [{ text: text.slice(0, at), hit: false }, { text: text.slice(at, at + q.value.length), hit: true }, { text: text.slice(at + q.value.length), hit: false }].filter(p => p.text);
}

defineExpose({ focusFilter: () => filterEl.value?.focus() });
</script>

<style scoped>
.sx-row { display: flex; align-items: center; gap: 5px; height: 24px; padding-right: 8px; font-size: 12.5px; color: rgb(var(--c-neutral-800)); cursor: default; user-select: none; }
.sx-row:hover { background: rgb(var(--c-neutral-100)); }
.sx-section { height: 26px; margin-top: 4px; }
.sx-section:first-child { margin-top: 0; }
.sx-sel, .sx-sel:hover { background: rgb(var(--c-neutral-200) / 0.7); }
.sx-tree:focus-visible .sx-sel, .sx-tree:focus .sx-sel { background: rgb(var(--c-accent-50)); box-shadow: inset 2px 0 0 rgb(var(--c-accent-500)); }
.sx-current .sx-name { font-weight: 500; color: rgb(var(--c-neutral-950)); }
.sx-chev { display: inline-flex; width: 14px; height: 16px; flex-shrink: 0; align-items: center; justify-content: center; color: rgb(var(--c-neutral-400)); border-radius: 3px; }
button.sx-chev:hover { color: rgb(var(--c-neutral-800)); }
.sx-icon { flex-shrink: 0; color: rgb(var(--c-neutral-400)); }
.sx-i-table { color: rgb(var(--c-neutral-500)); }
.sx-name { min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx-name.font-mono { font-size: 12px; }
.sx-name mark { background: rgb(var(--c-accent-200) / 0.7); color: inherit; border-radius: 2px; }
.sx-sub { min-width: 0; flex: 0 1000 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: rgb(var(--c-neutral-500)); }
.sx-row:has(.sx-hint) { height: auto; min-height: 24px; padding-top: 2px; padding-bottom: 4px; }
.sx-row:has(.sx-hint):hover { background: transparent; }
.sx-hint { white-space: normal; font-size: 11.5px; line-height: 16px; color: rgb(var(--c-neutral-500)); }
.sx-count { margin-left: auto; flex-shrink: 0; padding-left: 6px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; color: rgb(var(--c-neutral-400)); font-variant-numeric: tabular-nums; }
.sx-detail { flex-shrink: 0; max-height: 45%; overflow-y: auto; padding: 10px 12px 12px; background: rgb(var(--c-neutral-50)); }
.sx-d-title { font-size: 12.5px; font-weight: 600; color: rgb(var(--c-neutral-950)); overflow-wrap: anywhere; line-height: 18px; }
.sx-d-title.font-mono { font-size: 12px; }
.sx-d-meta { margin-top: 2px; font-size: 11.5px; line-height: 16px; color: rgb(var(--c-neutral-600)); }
.sx-d-name { margin-top: 8px; font-size: 12.5px; font-weight: 600; line-height: 17px; color: rgb(var(--c-neutral-950)); }
.sx-d-long { margin-top: 6px; font-size: 11.5px; line-height: 16px; color: rgb(var(--c-neutral-600)); white-space: pre-line; }
.sx-d-body { margin-top: 6px; font-size: 12px; line-height: 17px; color: rgb(var(--c-neutral-700)); }
.sx-d-sql { margin-top: 6px; max-height: 88px; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; line-height: 16px; color: rgb(var(--c-neutral-600)); mask-image: linear-gradient(to bottom, black 70%, transparent); }
.sx-d-actions { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
</style>
