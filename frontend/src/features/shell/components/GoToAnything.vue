<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] flex items-start justify-center bg-neutral-900/20 pt-[10vh]" @click.self="close">
      <div class="ui-popover flex max-h-[76vh] w-[760px] max-w-[94vw] flex-col overflow-hidden animate-in" role="dialog" aria-modal="true" :aria-label="t('shell.goToAnything.goAnything')">
        <div class="flex items-center gap-2 px-3 hairline-b">
          <Icon icon="search" :size="14" class="shrink-0 text-neutral-400"/>
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            spellcheck="false"
            autocomplete="off"
            class="h-11 min-w-0 flex-1 bg-transparent font-mono text-base text-neutral-900 outline-none placeholder:font-sans placeholder:text-neutral-400"
            :placeholder="placeholder"
            role="combobox"
            aria-controls="goto-results"
            :aria-activedescendant="rows.length ? `goto-${active}` : undefined"
            aria-autocomplete="list"
            :aria-expanded="true"
            @keydown="onInputKey"
          >
          <span v-if="!ready" class="flex shrink-0 items-center gap-1.5 text-sm text-neutral-400"><Icon icon="refresh-cw" :size="12" class="animate-spin"/>{{ t('shell.goToAnything.indexing') }}</span>
        </div>

        <div class="flex items-center gap-2 px-3 py-1.5 hairline-b" role="tablist" :aria-label="t('shell.goToAnything.categories')">
          <div class="ui-segmented">
            <button
              v-for="tb in TABS"
              :key="tb"
              type="button"
              role="tab"
              :aria-selected="tb === effectiveTab"
              :aria-pressed="tb === effectiveTab"
              tabindex="-1"
              @mousedown.prevent
              @click="setTab(tb)"
            >{{ TAB_LABEL[tb] }}<span v-if="parsed.text && tb !== 'all'" class="ml-1 tabular-nums" :class="result.counts[tb] ? 'text-neutral-400' : 'text-neutral-300'">{{ fmt(result.counts[tb]) }}</span></button>
          </div>
          <span class="ml-auto shrink-0 text-xs text-neutral-400"><kbd class="font-mono">Tab</kbd>{{ ' ' + t('shell.goToAnything.nextCategory') }}</span>
        </div>

        <ul id="goto-results" ref="listEl" class="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
          <template v-for="(row, i) in rows" :key="rowKey(row)">
            <li v-if="row.heading" class="ui-label flex items-baseline gap-2 px-3 pb-1 pt-3" role="presentation">{{ row.heading }}</li>
            <li
              :id="`goto-${i}`"
              role="option"
              :aria-selected="i === active"
              class="mx-1 flex cursor-default items-center gap-2.5 rounded px-2 py-1.5"
              :class="i === active ? 'bg-accent-50 text-neutral-900' : 'text-neutral-800'"
              @mousemove="active = i"
              @click="choose(row, $event.metaKey || $event.ctrlKey)"
            >
              <template v-if="row.type === 'find'">
                <Icon icon="search-code" :size="13" class="shrink-0 text-neutral-400"/>
                <span class="min-w-0 flex-1 truncate"><I18nT k="shell.goToAnything.findCode"><template #query><span class="font-mono">“{{ row.text }}”</span></template></I18nT></span>
              </template>
              <template v-else-if="row.type === 'more'">
                <Icon icon="more-horizontal" :size="13" class="shrink-0 text-neutral-400"/>
                <span class="min-w-0 flex-1 truncate text-sm text-neutral-500">{{ t('shell.goToAnything.moreIn', { count: fmt(row.count), tab: TAB_LABEL[row.tab] }) }}</span>
                <kbd v-if="i === active" class="shrink-0 font-mono text-xs text-neutral-400">↵</kbd>
              </template>
              <template v-else-if="row.type === 'hint'">
                <span class="min-w-0 flex-1 px-1 text-sm text-neutral-500">{{ row.text }}</span>
              </template>
              <template v-else>
                <Icon :icon="KIND_ICON[row.item.kind]" :size="13" class="shrink-0" :class="i === active ? 'text-accent-600' : 'text-neutral-400'"/>
                <span class="min-w-0 shrink truncate" :class="MONO.has(row.item.kind) ? 'font-mono text-sm' : ''"><template v-for="(r, k) in row.label" :key="k"><mark v-if="r.hit" class="goto-hit">{{ r.text }}</mark><template v-else>{{ r.text }}</template></template></span>
                <span v-if="row.detail.length" class="min-w-0 flex-1 truncate text-sm text-neutral-400" :class="row.item.kind === 'file' ? 'font-mono text-xs' : ''"><template v-for="(r, k) in row.detail" :key="k"><mark v-if="r.hit" class="goto-hit">{{ r.text }}</mark><template v-else>{{ r.text }}</template></template></span>
                <span v-else class="flex-1"></span>
                <template v-if="row.item.kind === 'component' && i === active">
                  <button
                    v-for="ct in COMPONENT_TABS"
                    :key="ct.tab"
                    type="button"
                    class="ui-chip !h-5 shrink-0 !px-1.5 !text-xs"
                    tabindex="-1"
                    @mousedown.prevent
                    @click.stop="openComponentTab(row.item, ct.tab)"
                  >{{ ct.label }}</button>
                </template>
                <span v-if="row.line" class="ui-tag shrink-0">:{{ row.line }}</span>
                <span v-if="row.item.keys" class="flex shrink-0 gap-0.5">
                  <kbd v-for="(k, ki) in row.item.keys" :key="ki" class="rounded border border-neutral-200 bg-neutral-50 px-1 font-mono text-xs text-neutral-600">{{ keyLabel(k, isMac) }}</kbd>
                </span>
                <span class="ui-tag shrink-0">{{ KIND_LABEL[row.item.kind] }}</span>
              </template>
            </li>
          </template>
          <li v-if="parsed.text && !result.hits.length && ready" class="px-3 pb-2 pt-1 text-sm text-neutral-500" role="presentation">{{ t('shell.goToAnything.nothingNameTextMay') }}</li>
        </ul>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-neutral-400 hairline-t">
          <span><kbd class="font-mono">↑↓</kbd>{{ ' ' + t('shell.goToAnything.move') }}</span>
          <span><kbd class="font-mono">↵</kbd>{{ ' ' + t('shell.goToAnything.open') }}</span>
          <span v-if="activeRow?.type === 'item' && activeRow.item.kind === 'group'"><kbd class="font-mono">{{ isMac ? "⌘" : t('shell.goToAnything.ctrl') }}↵</kbd>{{ ' ' + t('shell.goToAnything.openPageInsteadScoping') }}</span>
          <span v-else><kbd class="font-mono">&gt;</kbd> {{ t('shell.goToAnything.prefixActions') }} · <kbd class="font-mono">@</kbd> {{ t('shell.goToAnything.prefixSymbols') }} · <kbd class="font-mono">#</kbd> {{ t('shell.goToAnything.prefixComponents') }} · <kbd class="font-mono">:42</kbd> {{ t('shell.goToAnything.prefixLine') }}</span>
          <span class="ml-auto"><kbd class="font-mono">⇧⇧</kbd>{{ ' / ' }}<kbd class="font-mono">{{ isMac ? "⌘P" : t('shell.goToAnything.ctrl') + "+P" }}</kbd>{{ ' · ' }}<kbd class="font-mono">Esc</kbd>{{ ' ' + t('shell.goToAnything.close') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "~/shared/ui/Icon.vue";
import I18nT from "~/shared/ui/I18nT";
import { KIND_HEADING, KIND_ICON, KIND_LABEL, TAB_LABEL, goToIndexReady, useGoToIndex, warmGoToIndex } from "~/features/shell/useGoToIndex";
import { TABS, emptyCounts, highlightRuns, labelOffset, parseQuery, tabOf, TAB_KINDS, type GoItem, type GoKind, type GoTab, type SearchResult } from "~/features/shell/goToSearch";
import { keyLabel } from "~/features/shell/shortcuts";
import { usePlatform } from "~/platform/usePlatform";
import { useLensStore } from "~/features/groups/lens.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { useStateStore } from "~/platform/state.store";
import { useDataStore } from "~/features/snapshot/data.store";
import { registerCommand } from "~/platform/commands";
import { componentPath, filePath, searchPath } from "~/features/navigation/routes";
import { fuzzyMatch } from "~/shared/fuzzy";
import { t, intlLocale } from "~/shared/i18n";

// Go to anything: ⇧⇧ (as IntelliJ's Search Everywhere) or ⌘P (as VS Code's
// Quick Open). One field over everything the app can open: views, components,
// files, classes and functions, reports, saved queries, actions, workspaces.
// Kept apart from ⌘K, which only sets the scope query. The snapshot's part of
// the index is read in the background when the snapshot opens, so the field
// answers from the first keystroke.

type Run = { text: string; hit: boolean };
type Row = { heading?: string } & (
  | { type: "item"; item: GoItem; label: Run[]; detail: Run[]; line: number | null }
  | { type: "more"; tab: Exclude<GoTab, "all">; count: number }
  | { type: "find"; text: string }
  | { type: "hint"; text: string }
);

const router = useRouter();
const lens = useLensStore();
const scope = useScopeStore();
const state = useStateStore();
const data = useDataStore();
const { isMac } = usePlatform();
const { index, prepare } = useGoToIndex(router);

const MONO = new Set<GoKind>(["component", "file", "unit", "function"]);
const COMPONENT_TABS = [
  { tab: "connections", label: t("pages.components.connections") },
  { tab: "cycles", label: t("pages.components.cycles") },
  { tab: "inside", label: t("pages.components.inside") },
  { tab: "history", label: t("pages.components.history") },
];
/** In All, how many of each kind before a "more" row; the kind that matched best gets more room. */
const PER_KIND = 5;
const FIRST_KIND = 8;
const RECENT_KEY = "goto.recent";

const open = ref(false);
const query = ref("");
const tab = ref<GoTab>("all");
const active = ref(0);
const ready = ref(true);
const result = shallowRef<SearchResult>({ hits: [], counts: emptyCounts() });
const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const parsed = computed(() => parseQuery(query.value));
const effectiveTab = computed<GoTab>(() => parsed.value.tab ?? tab.value);
const fmt = (n: number) => n.toLocaleString(intlLocale);

const placeholder = computed(() => {
  switch (effectiveTab.value) {
    case "views": return t("shell.goToAnything.placeholderViews");
    case "components": return t("shell.goToAnything.placeholderComponents");
    case "files": return t("shell.goToAnything.placeholderFiles");
    case "symbols": return t("shell.goToAnything.placeholderSymbols");
    case "reports": return t("shell.goToAnything.placeholderReports");
    case "actions": return t("shell.goToAnything.placeholderActions");
    default: return t("shell.goToAnything.placeholderAll");
  }
});

async function show(at: GoTab = "all") {
  const wasOpen = open.value;
  open.value = true;
  tab.value = at;
  active.value = 0;
  await nextTick();
  inputEl.value?.focus();
  // The last query stays, selected: typing replaces it, Enter repeats it.
  inputEl.value?.select();
  if (wasOpen) return;
  ready.value = goToIndexReady();
  const done = prepare();
  search();
  if (!ready.value) {
    await done;
    ready.value = true;
  }
  search();
}

const offGoto = registerCommand("goto", () => show("all"));
onBeforeUnmount(offGoto);

// ── Searching ────────────────────────────────────────────────────────────────
// Keystrokes that arrive faster than a search runs are folded into one: the
// field never waits on the index.
let scheduled = 0;
function search() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    const p = parsed.value;
    const tb = effectiveTab.value;
    result.value = index.value.search(p.text, tb, tb === "all" ? 400 : 300);
    active.value = 0;
    void nextTick(() => listEl.value?.scrollTo({ top: 0 }));
  });
}
watch([query, tab], search);
watch(index, () => { if (open.value) search(); });

function recentItems(): GoItem[] {
  const saved = state.get<Array<{ kind: GoKind; key: string }>>(RECENT_KEY, []) ?? [];
  return saved.map(r => index.value.find(r.kind, r.key)).filter((x): x is GoItem => !!x);
}

function itemRow(item: GoItem, heading?: string): Row {
  const p = parsed.value;
  const text = item.text ?? item.label;
  const m = p.text ? fuzzyMatch(p.text, text, item.tail ?? text.lastIndexOf("/")) : null;
  const at = m?.at ?? [];
  const detail = item.detail ?? "";
  const line = p.line && item.file ? p.line : null;
  return {
    type: "item",
    item,
    heading,
    label: highlightRuns(item.label, at, labelOffset(item)),
    // A file's folder is the front of its path: its matched letters are drawn too.
    detail: highlightRuns(detail, at, detail && text.startsWith(detail) ? 0 : -1),
    line,
  };
}

const rows = computed<Row[]>(() => {
  void index.value;
  const p = parsed.value;
  const tb = effectiveTab.value;
  if (!p.text) return emptyRows(tb);
  const hits = result.value.hits;
  const out: Row[] = [];
  if (tb === "all") {
    // Grouped by kind, kinds in the order of their best match.
    const order: GoKind[] = [];
    const byKind = new Map<GoKind, GoItem[]>();
    for (const h of hits) {
      if (!byKind.has(h.item.kind)) { byKind.set(h.item.kind, []); order.push(h.item.kind); }
      byKind.get(h.item.kind)!.push(h.item);
    }
    const moreShown = new Set<GoTab>();
    order.forEach((kind, n) => {
      const items = byKind.get(kind)!;
      const cap = n === 0 ? FIRST_KIND : PER_KIND;
      items.slice(0, cap).forEach((item, i) => out.push(itemRow(item, i === 0 ? KIND_HEADING[kind] : undefined)));
      const tk = tabOf(kind);
      if (tk && items.length > cap && !moreShown.has(tk)) {
        moreShown.add(tk);
        out.push({ type: "more", tab: tk, count: result.value.counts[tk] });
      }
    });
  } else {
    hits.forEach((h, i) => out.push(itemRow(h.item, i === 0 ? TAB_LABEL[tb] : undefined)));
  }
  if (tb === "all" || tb === "files" || tb === "symbols") out.push({ type: "find", text: p.text });
  return out;
});

/** Before anything is typed: recent picks in All, the whole list in the small tabs, a hint in the large ones. */
function emptyRows(tb: GoTab): Row[] {
  if (tb === "all") {
    const recent = recentItems();
    if (recent.length) return recent.map((item, i) => itemRow(item, i === 0 ? t("shell.goToAnything.recent") : undefined));
    return index.value.items().filter(i => i.kind === "view").map((item, i) => itemRow(item, i === 0 ? KIND_HEADING.view : undefined));
  }
  const kinds = TAB_KINDS[tb];
  const items = index.value.items().filter(i => kinds.includes(i.kind));
  if (tb === "files" || tb === "symbols" || items.length > 300) {
    return [{ type: "hint", text: t("shell.goToAnything.typeToSearch", { count: fmt(items.length), tab: TAB_LABEL[tb].toLowerCase() }) }];
  }
  let last: GoKind | null = null;
  return items.map(item => {
    const heading = item.kind !== last ? KIND_HEADING[item.kind] : undefined;
    last = item.kind;
    return itemRow(item, heading);
  });
}

const activeRow = computed(() => rows.value[active.value]);

function rowKey(row: Row): string {
  if (row.type === "item") return `${row.item.kind}:${row.item.key}`;
  if (row.type === "more") return `more:${row.tab}`;
  return `${row.type}:${row.text}`;
}

// ── Keys ─────────────────────────────────────────────────────────────────────
function onInputKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  else if (e.key === "PageDown") { e.preventDefault(); move(10, false); }
  else if (e.key === "PageUp") { e.preventDefault(); move(-10, false); }
  else if (e.key === "Tab") { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); }
  else if (e.key === "Enter") { e.preventDefault(); choose(activeRow.value, e.metaKey || e.ctrlKey); }
  else if (e.key === "Escape") { e.preventDefault(); close(); }
}

function selectable(row: Row | undefined) { return !!row && row.type !== "hint"; }

function move(d: number, wrap = true) {
  const n = rows.value.length;
  if (!n) return;
  const step = (i: number, by: number) => (wrap ? (((i + by) % n) + n) % n : Math.max(0, Math.min(n - 1, i + by)));
  let i = step(active.value, d);
  // Headings are not rows; a hint row is passed over the same way.
  for (let k = 0; k < n && !selectable(rows.value[i]); k++) i = step(i, Math.sign(d));
  if (!selectable(rows.value[i])) return;
  active.value = i;
  void nextTick(() => document.getElementById(`goto-${active.value}`)?.scrollIntoView({ block: "nearest" }));
}

function setTab(tb: GoTab) {
  // A typed prefix names its tab; choosing another tab drops it.
  if (parsed.value.tab) query.value = query.value.trimStart().slice(1).trimStart();
  tab.value = tb;
  inputEl.value?.focus();
}

function cycleTab(d: number) {
  const i = TABS.indexOf(effectiveTab.value);
  setTab(TABS[(i + d + TABS.length) % TABS.length]);
}

// ── Choosing ─────────────────────────────────────────────────────────────────
function remember(item: GoItem) {
  const saved = (state.get<Array<{ kind: GoKind; key: string }>>(RECENT_KEY, []) ?? []).filter(r => !(r.kind === item.kind && r.key === item.key));
  state.set(RECENT_KEY, [{ kind: item.kind, key: item.key }, ...saved].slice(0, 12));
}

function choose(row: Row | undefined, alt = false) {
  if (!row || row.type === "hint") return;
  if (row.type === "more") { setTab(row.tab); return; }
  close();
  if (row.type === "find") { void router.push(searchPath(row.text)); return; }
  const item = row.item;
  remember(item);
  if (row.line && item.file) { void router.push(`${filePath(item.file, "source")}#L${row.line}`); return; }
  if (item.lens) { lens.set(item.lens); return; }
  if (item.group && !alt) { scope.setGroup(item.group); return; }
  if (item.run) { void item.run(); return; }
  if (item.to) void router.push(item.to);
}

function openComponentTab(item: GoItem, tabName: string) {
  remember(item);
  close();
  void router.push(componentPath(item.key, tabName));
}

function close() { open.value = false; }

// ── ⇧⇧ ──────────────────────────────────────────────────────────────────────
// Two taps of Shift alone, each short, the second within 350 ms of the first.
// Any other key in between, or a Shift held to type a capital, starts over.
let shiftDownAt = 0;
let shiftAlone = false;
let lastTap = 0;
function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Shift") {
    if (!e.repeat) { shiftDownAt = e.timeStamp; shiftAlone = !e.metaKey && !e.ctrlKey && !e.altKey; }
    return;
  }
  shiftAlone = false;
  lastTap = 0;
}
function onKeyUp(e: KeyboardEvent) {
  if (e.key !== "Shift") return;
  const tap = shiftAlone && e.timeStamp - shiftDownAt < 300;
  shiftAlone = false;
  if (!tap) { lastTap = 0; return; }
  if (lastTap && e.timeStamp - lastTap < 350) {
    lastTap = 0;
    void show("all");
    return;
  }
  lastTap = e.timeStamp;
}

// ── Warming ──────────────────────────────────────────────────────────────────
// Read the snapshot's part once the views on screen have had their queries
// answered, so the first open finds it ready.
let warmTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => [data.hasData, data.datasetKey] as const, ([has]) => {
  if (warmTimer) clearTimeout(warmTimer);
  if (!has) return;
  warmTimer = setTimeout(() => {
    warmTimer = null;
    const idle = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    if (idle) idle(() => { void warmGoToIndex(); }, { timeout: 4000 });
    else void warmGoToIndex();
  }, 1500);
}, { immediate: true });

onMounted(() => {
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  if (warmTimer) clearTimeout(warmTimer);
  if (scheduled) cancelAnimationFrame(scheduled);
});
</script>

<style scoped>
.goto-hit {
  background: transparent;
  color: rgb(var(--c-accent-700));
  font-weight: 600;
}
</style>
