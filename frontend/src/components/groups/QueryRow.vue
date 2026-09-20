<template>
  <div
    class="group flex h-8 items-center gap-1.5 rounded pl-1 pr-1 transition-colors"
    :class="active ? 'bg-neutral-100' : 'hover:bg-neutral-50'"
  >
    <!-- Switching a line off is a decision worth keeping, so it round-trips
         as the comment the grammar already has rather than as hidden state. -->
    <button
      type="button"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors"
      :class="off ? 'text-neutral-300 hover:text-neutral-500' : 'text-accent-600 hover:text-accent-700'"
      :aria-pressed="!off"
      :title="off ? 'Use this line again' : excludes ? 'This line takes matches away. Click to switch it off.' : 'Leave this line out without deleting it'"
      @click="emit('toggle')"
    >
      <Icon :icon="off ? 'eye-off' : excludes ? 'minus' : 'check'" :size="12"/>
    </button>

    <div class="relative min-w-0 grow rounded-sm ring-accent-400 transition-shadow focus-within:ring-2">
      <!-- The colour sits behind a transparent field so the text a person
           edits and the text they read are the same run of characters; two
           copies that can drift is how this technique usually goes wrong. -->
      <pre
        ref="ghost"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre py-0.5 font-mono text-sm leading-5"
        :class="{ 'query-clipped': clipped }"
      ><span v-for="(t, i) in tokens" :key="i" :class="COLOUR[t.kind]">{{ t.text }}</span></pre>
      <input
        ref="field"
        :value="modelValue"
        type="text"
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        autocomplete="off"
        class="query-field relative w-full bg-transparent py-0.5 font-mono text-sm leading-5 text-transparent outline-none"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="expanded"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId || undefined"
        :aria-label="accessibleName"
        :aria-invalid="!!error"
        :placeholder="placeholder"
        @input="onInput"
        @scroll="syncScroll"
        @keydown="onKeydown"
        @keyup="report"
        @click="report"
        @focus="emit('focus')"
        @blur="emit('blur')"
      />
    </div>

    <!-- What this line is worth, in the only unit that matters here. -->
    <span class="shrink-0 font-mono text-xs tabular-nums" :class="noteClass" :title="noteTitle">{{ note }}</span>

    <button
      type="button"
      class="ui-btn ui-btn-icon ui-btn-quiet h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      :aria-label="`Delete line ${index + 1}`"
      title="Delete this line"
      @click="emit('remove')"
    >
      <Icon icon="x" :size="11"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { highlight, type TokenKind } from "~/utils/queryAssist";

// One line of a query, coloured and counted.
//
// `*` and `**` differ by one character and mean different things; a leading
// `!` reverses the line; a `#` switches it off. Those three are what a reader
// misses in a monospace row, so those three carry a colour.

const COLOUR: Record<TokenKind, string> = {
  comment: "text-neutral-550 italic",
  bang: "text-red-600 font-semibold",
  keyword: "text-purple-600",
  metric: "text-blue-700",
  op: "text-neutral-550",
  number: "text-amber-700",
  glob: "text-accent-600 font-semibold",
  sep: "text-neutral-550",
  text: "text-neutral-800",
};

const props = withDefaults(defineProps<{
  modelValue: string;
  index: number;
  sep?: string;
  active?: boolean;
  placeholder?: string;
  /** How many units this line matches on its own; null while it cannot be judged. */
  matches?: number | null;
  /** For a `!` line, how many it takes away. */
  removes?: number | null;
  /** The line already holding everything this one does, if any. */
  coveredBy?: number | null;
  /** A parse complaint about this line. */
  error?: string | null;
  /** Suppress the warning while the architect is still typing it. */
  settled?: boolean;
  /** The suggestion list this row drives, for the screen reader. */
  listboxId?: string;
  activeOptionId?: string | null;
  expanded?: boolean;
}>(), { sep: ".", placeholder: "", matches: null, removes: null, coveredBy: null, error: null, settled: true, listboxId: undefined, activeOptionId: null, expanded: false });

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "caret", at: number): void;
  (e: "toggle"): void;
  (e: "remove"): void;
  (e: "newline"): void;
  (e: "up"): void;
  (e: "down"): void;
  (e: "accept", event: KeyboardEvent): void;
  (e: "focus"): void;
  (e: "blur"): void;
}>();

const field = ref<HTMLInputElement | null>(null);
const ghost = ref<HTMLElement | null>(null);
const clipped = ref(false);

const off = computed(() => props.modelValue.trim().startsWith("#"));
/** A subtracting line, marked by its shape as well as by a red glyph. */
const excludes = computed(() => props.modelValue.trim().startsWith("!"));
const tokens = computed(() => highlight(props.modelValue, props.sep));
watch(() => props.modelValue, () => nextTick(syncScroll));
const label = computed(() => `Line ${props.index + 1}`);

/**
 * What the row is, said in words.
 *
 * `!` is drawn in red and `#` in grey italic, which is meaning carried by
 * colour alone — invisible to a screen reader and unreliable for anyone who
 * does not separate those hues. The name says which it is.
 */
const accessibleName = computed(() => {
  const text = props.modelValue.trim();
  if (text.startsWith("#")) return `${label.value}, switched off`;
  if (text.startsWith("!")) return `${label.value}, excludes`;
  return label.value;
});

const note = computed(() => {
  if (props.error) return "?";
  if (off.value) return "off";
  if (props.removes !== null) return props.removes > 0 ? `−${props.removes}` : "0";
  if (props.matches === null) return "";
  if (props.matches === 0) return props.settled ? "0" : "";
  return String(props.matches);
});

const noteClass = computed(() => {
  if (props.error) return "text-red-600";
  if (off.value) return "text-neutral-300";
  if (props.removes !== null) return props.removes > 0 ? "text-red-600" : "text-neutral-400";
  if (props.matches === 0 && props.settled) return "text-amber-700";
  if (props.coveredBy !== null) return "text-neutral-400";
  return "text-neutral-500";
});

const noteTitle = computed(() => {
  if (props.error) return props.error;
  if (off.value) return "This line is switched off";
  if (props.removes !== null) return `Takes ${props.removes} away`;
  if (props.matches === 0) return "Nothing in this snapshot matches — a rename would look exactly like this";
  if (props.coveredBy !== null) return `Already covered by line ${props.coveredBy + 1}`;
  return `Matches ${props.matches}`;
});

function onInput(event: Event) {
  const el = event.target as HTMLInputElement;
  emit("update:modelValue", el.value);
  nextTick(syncScroll);
  emit("caret", el.selectionStart ?? el.value.length);
}

function report(event: Event) {
  const el = event.target as HTMLInputElement;
  emit("caret", el.selectionStart ?? el.value.length);
  syncScroll();
}

/** A long line scrolls inside the field; the colour must travel with it. */
function syncScroll() {
  const el = field.value;
  if (!el) return;
  if (ghost.value) ghost.value.scrollLeft = el.scrollLeft;
  // Only fade when there is genuinely more to the right and it is not
  // already scrolled to the end, so the cue means something every time.
  clipped.value = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab" || event.key === "Escape") {
    // The list of suggestions owns these while it is open; the composer
    // decides, because only it knows whether anything is showing.
    emit("accept", event);
    if (event.defaultPrevented) return;
  }
  if (event.key === "Enter") { event.preventDefault(); emit("newline"); return; }
  if (event.key === "ArrowUp") { emit("up"); return; }
  if (event.key === "ArrowDown") { emit("down"); return; }
  if (event.key === "Backspace" && !props.modelValue) { event.preventDefault(); emit("remove"); }
}

onMounted(() => nextTick(syncScroll));

defineExpose({
  focus: (at?: number) => {
    const el = field.value;
    if (!el) return;
    el.focus();
    if (at !== undefined) el.setSelectionRange(at, at);
    syncScroll();
  },
});
</script>

<style scoped>
/* There is more of this line to the right. Said with a fade rather than an
   ellipsis, because an ellipsis would have to replace characters the person
   is in the middle of editing. */
.query-clipped {
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 1.5rem), transparent);
  mask-image: linear-gradient(to right, black calc(100% - 1.5rem), transparent);
}
/* The field's own text is invisible, so a selection would be too. A tinted
   block keeps the selected run readable through it. */
.query-field::selection {
  background: rgb(var(--c-accent-300) / 0.45);
}
.query-field {
  caret-color: rgb(var(--c-neutral-900));
}
</style>
