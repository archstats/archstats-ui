<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] flex items-start justify-center bg-neutral-900/20 pt-[12vh]" @click.self="close">
      <div class="ui-popover flex max-h-[70vh] w-[640px] max-w-[92vw] flex-col overflow-hidden animate-in" role="dialog" aria-modal="true" aria-label="Go to anything">
        <div class="flex items-center gap-2 px-3 hairline-b">
          <Icon icon="search" :size="14" class="shrink-0 text-neutral-400"/>
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            spellcheck="false"
            autocomplete="off"
            class="h-11 min-w-0 flex-1 bg-transparent font-mono text-base text-neutral-900 outline-none placeholder:font-sans placeholder:text-neutral-400"
            placeholder="A component, file, unit, author, group, view or metric"
            role="combobox"
            aria-controls="goto-results"
            :aria-activedescendant="rows.length ? `goto-${active}` : undefined"
            aria-autocomplete="list"
            :aria-expanded="true"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="choose(rows[active], $event.metaKey || $event.ctrlKey)"
            @keydown.esc.prevent="close"
          >
          <span v-if="preparing" class="shrink-0 text-sm text-neutral-400">Reading…</span>
        </div>
        <ul id="goto-results" ref="listEl" class="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
          <li v-if="!query.trim() && recentRows.length" class="ui-label px-3 pb-1 pt-2" role="presentation">Recent</li>
          <template v-for="(row, i) in rows" :key="`${row.kind}:${row.key}`">
            <li v-if="row.heading" class="ui-label px-3 pb-1 pt-3" role="presentation">{{ row.heading }}</li>
            <li
              :id="`goto-${i}`"
              role="option"
              :aria-selected="i === active"
              class="mx-1 flex cursor-default items-baseline gap-3 rounded px-2 py-1.5"
              :class="i === active ? 'bg-accent-50 text-neutral-900' : 'text-neutral-800'"
              @mousemove="active = i"
              @click="choose(row, $event.metaKey || $event.ctrlKey)"
            >
              <template v-if="row.kind === 'find'">
                <Icon icon="search-code" :size="13" class="shrink-0 self-center text-neutral-400"/>
                <span class="min-w-0 flex-1 truncate">Find <span class="font-mono">“{{ query.trim() }}”</span> in code</span>
              </template>
              <template v-else>
                <span class="min-w-0 truncate" :class="row.kind === 'view' || row.kind === 'metric' || row.kind === 'lens' || row.kind === 'group' ? '' : 'font-mono text-sm'">{{ row.label }}</span>
                <span v-if="row.detail" class="min-w-0 flex-1 truncate text-sm text-neutral-400">{{ row.detail }}</span>
                <span v-else class="flex-1"></span>
                <span class="ui-tag shrink-0">{{ KIND_LABEL[row.kind] }}</span>
              </template>
            </li>
          </template>
          <li v-if="query.trim() && rows.length === 1 && !preparing" class="px-3 pb-2 pt-1 text-sm text-neutral-500" role="presentation">Nothing by that name. Its text may still be in the code.</li>
        </ul>
        <div class="flex items-center gap-4 px-3 py-2 text-xs text-neutral-400 hairline-t">
          <span><kbd class="font-mono">↑↓</kbd> move</span>
          <span><kbd class="font-mono">↵</kbd> open</span>
          <span v-if="rows[active]?.kind === 'group'"><kbd class="font-mono">{{ isMac ? "⌘" : "Ctrl" }}↵</kbd> open its page instead of scoping</span>
          <span class="ml-auto"><kbd class="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "~/components/ui/common/Icon.vue";
import { KIND_HEADING, KIND_LABEL, useGoToIndex, type GoItem, type GoKind } from "~/composables/useGoToIndex";
import { usePlatform } from "~/composables/usePlatform";
import { useLensStore } from "~/stores/lens";
import { useScopeStore } from "~/stores/scope";
import { useStateStore } from "~/stores/state";
import { registerCommand } from "~/utils/commands";
import { searchPath } from "~/utils/routes";

// ⌘P: jump to anything by name. Kept apart from ⌘K, which only sets the
// scope query. The last row is always a search of the code itself.

type Row = (GoItem | { kind: "find"; key: string; label: string }) & { heading?: string };

const router = useRouter();
const lens = useLensStore();
const scope = useScopeStore();
const state = useStateStore();
const { isMac } = usePlatform();
const index = useGoToIndex();

const open = ref(false);
const query = ref("");
const active = ref(0);
const preparing = ref(false);
const results = ref<GoItem[]>([]);
const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const RECENT_KEY = "goto.recent";

const off = registerCommand("goto", async () => {
  open.value = true;
  query.value = "";
  active.value = 0;
  await nextTick();
  inputEl.value?.focus();
  preparing.value = true;
  try { await index.prepare(); } finally { preparing.value = false; }
  refresh();
});
onBeforeUnmount(off);

const recentRows = computed<GoItem[]>(() => {
  void preparing.value;
  const saved = state.get<Array<{ kind: GoKind; key: string }>>(RECENT_KEY, []) ?? [];
  return saved.map(r => index.find(r.kind, r.key)).filter((x): x is GoItem => !!x);
});

function refresh() {
  results.value = index.search(query.value);
  active.value = 0;
}
watch(query, refresh);

// Grouped by kind, kinds in the order of their best match; the find row last.
const rows = computed<Row[]>(() => {
  const q = query.value.trim();
  if (!q) return recentRows.value;
  const order: GoKind[] = [];
  const byKind = new Map<GoKind, GoItem[]>();
  for (const r of results.value) {
    if (!byKind.has(r.kind)) { byKind.set(r.kind, []); order.push(r.kind); }
    byKind.get(r.kind)!.push(r);
  }
  const out: Row[] = [];
  for (const k of order) byKind.get(k)!.forEach((r, i) => out.push(i === 0 ? { ...r, heading: KIND_HEADING[k] } : r));
  out.push({ kind: "find", key: q, label: q });
  return out;
});

function move(d: number) {
  const n = rows.value.length;
  if (!n) return;
  active.value = (active.value + d + n) % n;
  void nextTick(() => document.getElementById(`goto-${active.value}`)?.scrollIntoView({ block: "nearest" }));
}

function remember(item: GoItem) {
  const saved = (state.get<Array<{ kind: GoKind; key: string }>>(RECENT_KEY, []) ?? []).filter(r => !(r.kind === item.kind && r.key === item.key));
  state.set(RECENT_KEY, [{ kind: item.kind, key: item.key }, ...saved].slice(0, 8));
}

function choose(row: Row | undefined, alt = false) {
  if (!row) return;
  close();
  if (row.kind === "find") { void router.push(searchPath(row.key)); return; }
  remember(row);
  if (row.lens) { lens.set(row.lens); return; }
  if (row.group && !alt) { scope.setGroup(row.group); return; }
  if (row.to) void router.push(row.to);
}

function close() { open.value = false; }
</script>
