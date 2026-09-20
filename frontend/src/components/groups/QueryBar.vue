<template>
  <div ref="host" class="relative flex min-w-0 items-center">
    <button
      type="button"
      class="ui-input ui-input-sm flex min-w-0 items-center gap-1.5 pl-2 pr-1.5 text-left"
      :class="open ? 'w-72' : scope.query ? 'w-56' : 'w-40 xl:w-56'"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :title="scope.query ? scope.query : 'Narrow every view to what a pattern matches (⌘K)'"
      @click="toggle()"
    >
      <Icon icon="braces" :size="12" class="shrink-0 text-neutral-400"/>
      <span v-if="!scope.query" class="truncate font-mono text-sm text-neutral-400">{{ placeholder }}</span>
      <span v-else class="min-w-0 truncate font-mono text-sm text-neutral-800">{{ summary }}</span>
      <span
        v-if="scope.query"
        class="ml-auto shrink-0 font-mono text-xs tabular-nums"
        :class="broken ? 'text-red-600' : found ? 'text-neutral-500' : 'text-amber-700'"
      >{{ broken ? "?" : found }}</span>
    </button>

    <button
      v-if="scope.query"
      type="button"
      class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet ml-1 shrink-0"
      aria-label="Clear the query"
      title="Clear the query"
      @click="clear"
    >
      <Icon icon="x" :size="12"/>
    </button>

    <!-- No click-away backdrop. Composing a query is the longest-lived thing
         a person does here, and a stray click that swept it away would be
         losing their work to reach the very view they are trying to watch —
         which they must stay able to click while it is open. Esc, Done and
         Keep close it. -->
    <div v-if="open" class="ui-popover absolute left-0 top-full z-50 mt-1.5 animate-in">
      <QueryComposer
        ref="composer"
        :model-value="scope.query"
        :world="world"
        :assist-world="assistWorld"
        :placeholder="placeholder"
        :matched="found"
        :matched-files="foundFiles"
        :keep-label="intoDraft ? 'Keep as group' : 'Keep'"
        :keep-into="intoDraft ? draft.dimension || 'the lens you are building' : undefined"
        @update:model-value="scope.setQuery($event)"
        @keep="keep()"
        @close="close()"
      />
    </div>

    <div v-if="naming" class="absolute left-0 top-full z-[60] mt-1.5">
      <SaveToLens
        :query="scope.query"
        :found="found"
        :suggested-name="suggestedName"
        :lens="lens.active ?? undefined"
        @cancel="naming = false"
        @save="save"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import QueryComposer from "~/components/groups/QueryComposer.vue";
import SaveToLens from "~/components/groups/SaveToLens.vue";
import { useDataStore } from "~/stores/data";
import { units, useGroupsStore, type GroupMode, type UnitKind } from "~/stores/groups";
import { useDraftStore } from "~/stores/draft";
import { useLensStore } from "~/stores/lens";
import { useScopeStore } from "~/stores/scope";
import { isBlankQuery, parseQuery, SEARCH_SEED, SEARCH_SEED_CARET, type QueryWorld } from "~/utils/query";
import type { AssistWorld } from "~/utils/queryAssist";
import { detectSeparator, nameForQuery, pathStyle } from "~/utils/studio";

// Asking a question of whatever view you are already looking at.
//
// The query is part of the scope, and every view already filters by scope, so
// one sentence works on a graph, a table and a treemap without any of them
// knowing queries exist. Typing is exploring; "Keep" is where a finding
// becomes a decision.

const props = withDefaults(defineProps<{
  placeholder?: string
  /**
   * Where a finding goes when it is kept.
   *
   * "lens" asks which saved lens to write a group into. On the builder that
   * question has no good answer — a lens is already open and half-built on
   * the screen in front of you — so the builder says "draft" and the group
   * is made in the one being built.
   */
  keepInto?: "lens" | "draft"
}>(), { placeholder: "**.controller", keepInto: "lens" });

const scope = useScopeStore();
const groups = useGroupsStore();
const data = useDataStore();
const lens = useLensStore();
const draft = useDraftStore();

/** Keeping means adding to the lens being built, not choosing one. */
const intoDraft = computed(() => props.keepInto === "draft" && draft.isOpen);

const host = ref<HTMLElement | null>(null);
const composer = ref<InstanceType<typeof QueryComposer> | null>(null);
const open = ref(false);
const naming = ref(false);

const components = computed(() => Array.from(data.componentFilesIndex.keys()));
const files = computed(() => Array.from(data.fileComponentIndex.keys()));
const sep = computed(() => detectSeparator(components.value));

const metric = computed(() => {
  const m = groups.metrics;
  if (!m) return undefined;
  return (kind: UnitKind, id: string, name: string) => {
    const rowData = (kind === "component" ? m.components : m.files).get(id);
    if (!rowData) return undefined;
    const v = rowData[m.alias.get(name.toLowerCase()) ?? name];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };
});

const world = computed<QueryWorld>(() => ({
  components: components.value,
  files: files.value,
  componentSep: sep.value,
  metric: metric.value,
}));

/** What the suggestions are allowed to know: the snapshot, and what has been
 *  asked before. Metric names come from the snapshot's own definitions, so an
 *  extension that adds a metric extends the suggestions. */
const assistWorld = computed<AssistWorld>(() => {
  const m = groups.metrics;
  const names = m
    ? Array.from(new Set(m.alias.values())).map(id => ({ id: shortName(id, m.alias), label: label(id), hint: "" }))
    : [];
  return {
    components: components.value,
    files: files.value,
    sep: sep.value,
    metrics: names,
    valuesOf: (name, kind) => {
      if (!m) return [];
      const column = m.alias.get(name.toLowerCase()) ?? name;
      const out: number[] = [];
      for (const rowData of (kind === "component" ? m.components : m.files).values()) {
        const v = rowData[column];
        if (typeof v === "number" && Number.isFinite(v)) out.push(v);
      }
      return out;
    },
    recents: scope.recents,
    saved: groups.groups.filter(g => g.query).map(g => ({ name: g.name, query: g.query! })),
  };
});

/** The shortest unambiguous alias for a column, which is what people type. */
function shortName(id: string, alias: Map<string, string>): string {
  for (const [short, column] of alias) if (column === id && short.length < id.length) return short;
  return id;
}
function label(id: string): string {
  return id.split("__").slice(-1)[0].replace(/_/g, " ");
}

const parsed = computed(() => parseQuery(scope.query));
const broken = computed(() => parsed.value.errors.length > 0);
const matches = computed(() => scope.queryMatches);
const found = computed(() => matches.value?.components.size ?? 0);
const foundFiles = computed(() => matches.value?.files.size ?? 0);
const summary = computed(() => scope.query.split("\n").filter(l => l.trim() && !l.trim().startsWith("#"))[0] ?? scope.query);

const suggestedName = computed(() => {
  const ids = Array.from(matches.value?.components ?? []);
  if (!ids.length) return "";
  // The query says what the architect meant by the set; the members only
  // say what they happen to share, which for "**.controller" is the company.
  return nameForQuery(scope.query, ids, pathStyle(ids, detectSeparator(ids)));
});

async function toggle(force?: boolean) {
  open.value = force ?? !open.value;
  if (!open.value) return;
  naming.value = false;
  // A `where` clause asks the snapshot for numbers, and the thresholds it
  // suggests come from the same place, so both are loaded before the first
  // keystroke rather than after it.
  void groups.ensureMetrics();
  // Opens as a plain substring search, with the caret between the stars.
  const seeded = isBlankQuery(scope.query);
  if (seeded) scope.setQuery(SEARCH_SEED);
  await nextTick();
  composer.value?.focusRow(0, seeded ? SEARCH_SEED_CARET : undefined);
}

/** Closing on an untouched seed leaves no filter behind. */
function close() {
  open.value = false;
  if (isBlankQuery(scope.query)) scope.clearQuery();
}

function clear() {
  scope.clearQuery();
  open.value = false;
  naming.value = false;
}

function keep() {
  // The composer's Keep button reads the same `found` this guards on, so the
  // two cannot disagree any more. Kept as a belt-and-braces check, and it
  // leaves the composer open rather than closing onto nothing.
  if (!found.value || broken.value) return;
  if (intoDraft.value) {
    const ids = Array.from(matches.value?.components ?? []);
    draft.keepQuery(suggestedName.value || "New group", ids, scope.query);
    scope.remember(scope.query);
    // The finding is now a group on the board, so the view should show the
    // board rather than stay narrowed to the question that found it.
    scope.clearQuery();
    open.value = false;
    return;
  }
  naming.value = true;
  open.value = false;
}

function save({ name, lens: dimension, mode }: { name: string; lens: string; mode: GroupMode }) {
  const ids = Array.from(matches.value?.components ?? []);
  const group = groups.createGroup(name, units("component", ids), dimension);
  groups.setQuery(group.id, scope.query, mode);
  scope.remember(scope.query);
  naming.value = false;
  // The question is answered; leave the view showing the answer as a group
  // rather than as a query nobody has to re-read.
  scope.clearQuery();
  scope.toggleGroup(group.id);
}

function onKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    void toggle(true);
    return;
  }
  // Without a backdrop there is no click-away, so Escape is the way out and
  // has to work from wherever focus happens to be.
  if (event.key === "Escape" && open.value && !naming.value) {
    close();
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>
