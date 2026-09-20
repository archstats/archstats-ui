<template>
  <div :class="inline ? 'flex w-full flex-col' : 'flex w-[34rem] max-w-[calc(100vw-2rem)] flex-col'" @keydown.esc.stop.prevent="onEscape">
    <div class="flex flex-col gap-0.5 p-1.5">
      <QueryRow
        v-for="(line, i) in lines"
        :key="i"
        :ref="el => setRow(el, i)"
        :model-value="line"
        :index="i"
        :sep="sep"
        :active="i === row"
        :placeholder="i === 0 ? placeholder : ''"
        :matches="stats[i]?.matches ?? null"
        :removes="stats[i]?.removes ?? null"
        :covered-by="stats[i]?.coveredBy ?? null"
        :error="stats[i]?.error ?? null"
        :settled="i !== row || settled"
        :listbox-id="listId"
        :active-option-id="i === row && picked >= 0 ? `${listId}-${picked}` : null"
        :expanded="i === row && suggestions.items.length > 0"
        @update:model-value="setLine(i, $event)"
        @caret="onCaret(i, $event)"
        @toggle="toggle(i)"
        @remove="removeLine(i)"
        @newline="addLine(i + 1)"
        @up="move(i - 1)"
        @down="move(i + 1)"
        @accept="onRowKey($event, i)"
        @focus="row = i"
      />

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded pl-1.5 pr-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          title="Add a line (Enter)"
          @click="addLine(lines.length)"
        >
          <Icon icon="plus" :size="11"/><span>add a line</span>
        </button>
        <span v-if="inline" class="ml-auto pr-1 font-mono text-xs tabular-nums" :class="total ? 'text-neutral-600' : 'text-neutral-400'">
          {{ total }} {{ total === 1 ? "component" : "components" }}
        </span>
      </div>
    </div>

    <!-- What the codebase actually contains, offered where the question is
         being asked. Everything here answers something the architect would
         otherwise leave the app to look up. -->
    <!-- Grouped, because an ungrouped list put three prompts, five recents
         and five saved groups in one flat run of thirteen rows with only a
         small icon telling them apart — well past what anyone holds at once. -->
    <ul
      v-if="suggestions.items.length"
      :id="listId"
      ref="listEl"
      class="max-h-56 overflow-y-auto p-1 hairline-t"
      role="listbox"
      :aria-label="`Suggestions for line ${row + 1}`"
    >
      <template v-for="section in sections" :key="section.title">
        <li v-if="section.title" :id="`${listId}-h-${section.title}`" role="presentation" class="px-1.5 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-550">
          {{ section.title }}
        </li>
        <li
          v-for="s in section.items"
          :id="`${listId}-${s.at}`"
          :key="s.kind + s.label + s.at"
          :ref="el => setOption(el, s.at)"
          role="option"
          :aria-selected="s.at === picked"
          class="flex h-7 cursor-pointer items-center gap-2 rounded px-1.5 transition-colors"
          :class="s.at === picked ? 'bg-accent-50' : 'hover:bg-neutral-100'"
          @mouseenter="picked = s.at"
          @mousedown.prevent="accept(s)"
        >
          <Icon :icon="ICONS[s.kind]" :size="11" class="shrink-0 text-neutral-550"/>
          <span class="min-w-0 truncate text-sm" :class="s.kind === 'start' ? 'text-neutral-800' : 'font-mono text-neutral-800'">{{ s.label }}</span>
          <span v-if="s.detail" class="ml-auto shrink-0 truncate pl-2 text-xs text-neutral-550">{{ s.detail }}</span>
        </li>
      </template>
    </ul>

    <!-- What changed, for a reader who cannot see the count move. -->
    <p class="sr-only" role="status" aria-live="polite">{{ spoken }}</p>

    <div v-if="!inline" class="flex items-center gap-2 px-2 py-1.5 hairline-t">
      <span class="font-mono text-xs tabular-nums" :class="total ? 'text-neutral-700' : 'text-neutral-400'">
        {{ total }} {{ total === 1 ? "component" : "components" }}
        <template v-if="fileCount"> · {{ fileCount }} files</template>
      </span>
      <span v-if="live" class="ui-tag" title="This query asks about measurements, so what it matches depends on the scan.">measured</span>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="emit('close')">Done</button>
      <button
        type="button"
        class="ui-btn ui-btn-sm ui-btn-primary"
        :disabled="!total || !!parsed.errors.length"
        :title="keepHint"
        @click="emit('keep')"
      >{{ keepLabel }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import QueryRow from "~/components/groups/QueryRow.vue";
import { isLive, parseQuery, runQuery, globToRegExp, type QueryWorld } from "~/utils/query";
import { applySuggestion, assist, coveredBy, type AssistWorld, type SuggestionKind } from "~/utils/queryAssist";

// Building a query one line at a time, with the answer beside each line.
//
// The grammar is a list: lines union, `!` lines subtract, and order never
// decides anything. So the editor is a list too, and each row carries what it
// alone is worth — which is the one thing a plain textarea cannot show.

const ICONS: Record<SuggestionKind, string> = {
  package: "component", file: "file-code", metric: "scale",
  value: "filter", start: "help", recent: "history", group: "layers",
};

const props = withDefaults(defineProps<{
  modelValue: string;
  world: QueryWorld;
  assistWorld: AssistWorld;
  placeholder?: string;
  /**
   * What the view is actually scoped to, when the caller has an authority to
   * read. The footer and the Keep button previously read one number while the
   * caller's guard read another, so the button could look usable and do
   * nothing on the one action that creates something permanent.
   *
   * Left out where there is no scope — editing a group's own query in a panel
   * — and then the composer answers for itself, which is still one number.
   */
  matched?: number;
  matchedFiles?: number;
  /** Editing inside a panel: no footer chrome, no Keep, no Done. */
  inline?: boolean;
  /** What the button says, when keeping does something more specific. */
  keepLabel?: string;
  /** Where it goes, named, when that is not "a lens you will be asked about". */
  keepInto?: string;
}>(), { placeholder: "com.example.order.**", inline: false, keepLabel: "Keep" });

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "keep"): void;
  (e: "close"): void;
}>();

const rows = new Map<number, InstanceType<typeof QueryRow>>();
const options = new Map<number, HTMLElement>();
const listEl = ref<HTMLElement | null>(null);
const row = ref(0);
const caret = ref(0);
// -1 means "nothing chosen yet". The list is almost always showing something
// while a name is being typed, so treating its first row as pre-selected made
// Enter accept a suggestion instead of starting a line — and the next thing
// typed landed on the same row. Nothing is selected until the architect says
// so with an arrow key or the pointer.
const picked = ref(-1);
const settled = ref(true);
const listId = `query-suggestions-${Math.random().toString(36).slice(2, 8)}`;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

const setRow = (el: any, i: number) => { if (el) rows.set(i, el); else rows.delete(i); };
const setOption = (el: any, i: number) => { if (el) options.set(i, el as HTMLElement); else options.delete(i); };

const sep = computed(() => props.assistWorld.sep);
const lines = computed(() => props.modelValue.split("\n"));
const parsed = computed(() => parseQuery(props.modelValue));
const live = computed(() => isLive(parsed.value));
// Still run here, but only to work out what each LINE is worth; the totals
// come from the caller so there is exactly one answer in play.
const result = computed(() => runQuery(parsed.value, props.world));
const total = computed(() => props.matched ?? result.value.components.length);
const fileCount = computed(() => props.matchedFiles ?? result.value.files.length);

/** What each line is worth on its own — never "what it adds after the ones
 *  above", because the model has no order and a count that moved when a line
 *  moved would be lying about the language. */
const stats = computed(() => {
  const ids = props.world.components;
  const base = new Set(result.value.components);
  return lines.value.map((line, i) => {
    const text = line.trim();
    const error = parsed.value.errors.find(e => e.no === i + 1)?.message ?? null;
    if (!text || text.startsWith("#") || error) return { matches: null, removes: null, coveredBy: null, error };
    if (text.startsWith("!")) {
      const bare = text.slice(1).trim();
      if (!bare || /\swhere\s/i.test(bare)) return { matches: null, removes: null, coveredBy: null, error };
      const rx = globToRegExp(bare, sep.value);
      // What it takes away is what it hits that would otherwise have stayed.
      const removes = ids.filter(id => rx.test(id) && !base.has(id)).length;
      return { matches: null, removes, coveredBy: null, error };
    }
    const one = runQuery(parseQuery(line), props.world);
    return {
      matches: one.components.length,
      removes: null,
      coveredBy: coveredBy(line, lines.value, ids, sep.value),
      error,
    };
  });
});

/** A disabled button that will not say why is a dead end. */
const keepHint = computed(() => {
  if (parsed.value.errors.length) return `Line ${parsed.value.errors[0].no} cannot be read yet`;
  if (!total.value) return "Nothing matches yet, so there is nothing to keep";
  return `Keep these ${total.value} as a group${props.keepInto ? ` in ${props.keepInto}` : ""} (⌘↵)`;
});

const suggestions = computed(() => assist(lines.value[row.value] ?? "", caret.value, props.assistWorld));

const SECTION: Partial<Record<SuggestionKind, string>> = {
  start: "Start with", recent: "Recent", group: "Saved groups",
};

/** The same items, in named runs, keeping each one's index in the whole list
 *  so the keyboard and the active-descendant id stay in agreement. */
const sections = computed(() => {
  const out: Array<{ title: string; items: Array<{ at: number; label: string; detail?: string; insert: string; kind: SuggestionKind; caret?: number }> }> = [];
  suggestions.value.items.forEach((item, at) => {
    const title = SECTION[item.kind] ?? "";
    const last = out[out.length - 1];
    if (last && last.title === title) last.items.push({ ...item, at });
    else out.push({ title, items: [{ ...item, at }] });
  });
  // A single unnamed run needs no heading; it is the whole list.
  return out.length === 1 ? [{ ...out[0], title: "" }] : out;
});

/** Announced, not drawn: a parse complaint and the running total. */
const spoken = computed(() => {
  const bad = parsed.value.errors[0];
  if (bad) return `Line ${bad.no}: ${bad.message}`;
  if (!props.modelValue.trim()) return "";
  return `${total.value} ${total.value === 1 ? "component" : "components"} match`;
});
watch(suggestions, () => { picked.value = -1; });

function setLine(i: number, value: string) {
  const next = [...lines.value];
  next[i] = value;
  emit("update:modelValue", next.join("\n"));
  // A half-typed line is not a mistake, so the warning waits until the
  // typing stops. Scolding mid-keystroke teaches people to ignore warnings.
  settled.value = false;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { settled.value = true; }, 500);
}

function onCaret(i: number, at: number) { row.value = i; caret.value = at; }

function toggle(i: number) {
  const line = lines.value[i];
  const next = [...lines.value];
  next[i] = line.trim().startsWith("#") ? line.replace(/^(\s*)#\s?/, "$1") : "# " + line;
  emit("update:modelValue", next.join("\n"));
}

function addLine(at: number) {
  const next = [...lines.value];
  next.splice(at, 0, "");
  emit("update:modelValue", next.join("\n"));
  nextTick(() => move(at));
}

function removeLine(i: number) {
  if (lines.value.length === 1) { emit("update:modelValue", ""); return; }
  const next = lines.value.filter((_, j) => j !== i);
  emit("update:modelValue", next.join("\n"));
  nextTick(() => move(Math.max(0, i - 1)));
}

function move(to: number, at?: number) {
  const i = Math.max(0, Math.min(lines.value.length - 1, to));
  row.value = i;
  const where = at ?? lines.value[i]?.length ?? 0;
  caret.value = where;
  nextTick(() => rows.get(i)?.focus(where));
}

/** The suggestion list owns the arrows and Enter only while it is showing. */
function onRowKey(event: KeyboardEvent, i: number) {
  if (event.metaKey || event.ctrlKey) {
    if (event.key === "Enter") { event.preventDefault(); emit("keep"); }
    return;
  }
  const items = suggestions.value.items;
  if (!items.length) return;
  if (event.key === "ArrowDown") { event.preventDefault(); select(picked.value < 0 ? 0 : picked.value + 1); return; }
  if (event.key === "ArrowUp") { event.preventDefault(); select(picked.value < 0 ? items.length - 1 : picked.value - 1); return; }
  // Tab takes the obvious one; Enter only takes what was actually chosen, and
  // otherwise starts the next line, which is what Enter does in a list.
  const index = event.key === "Tab" ? Math.max(0, picked.value) : picked.value;
  if ((event.key === "Tab" || event.key === "Enter") && index >= 0) {
    const pick = items[index];
    // The three entry points are prompts, not text: accepting one that
    // inserts nothing would look like a broken keystroke.
    if (pick && !(pick.kind === "start" && !pick.insert)) { event.preventDefault(); accept(pick); }
    else if (event.key === "Tab") event.preventDefault();
    return;
  }
  if (event.key === "Escape") { event.preventDefault(); picked.value = -1; caret.value = -1; }
  void i;
}

function select(to: number) {
  const n = suggestions.value.items.length;
  picked.value = ((to % n) + n) % n;
  nextTick(() => options.get(picked.value)?.scrollIntoView({ block: "nearest" }));
}

function accept(pick: { label: string; insert: string; kind: SuggestionKind; caret?: number }) {
  const i = row.value;
  const out = applySuggestion(lines.value[i] ?? "", suggestions.value, pick as any);
  const next = [...lines.value];
  next[i] = out.line;
  emit("update:modelValue", next.join("\n"));
  nextTick(() => { rows.get(i)?.focus(out.caret); caret.value = out.caret; picked.value = -1; });
}

function onEscape() {
  // First Escape puts the suggestions away; a second closes the composer.
  if (suggestions.value.items.length && caret.value >= 0) { caret.value = -1; return; }
  emit("close");
}

defineExpose({ focusRow: move });
</script>
