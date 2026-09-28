<template>
  <!-- A computed paragraph: facts from the snapshot, written out in the
       report's own type. It reads as prose; the margin says it was counted,
       not written, and on which snapshot. -->
  <div
    class="nb-reading group/rd relative -ml-3 rounded-sm pl-3 transition-colors"
    :class="selected ? 'nb-reading-on bg-accent-50/40' : ''"
    :aria-label="`Computed: ${def?.label ?? cell.spec.type}`"
    @mousedown="$emit('select')"
  >
    <div v-if="gutter" class="absolute -left-[92px] top-[5px] flex w-[58px] flex-col items-end gap-1 text-right">
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
        :class="stale ? 'bg-accent-500 text-white hover:bg-accent-600' : 'text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:opacity-100 group-hover/rd:opacity-100'"
        :aria-label="stale ? `Run on ${kernelLabel}` : 'Run again'"
        :title="stale ? `Ran on ${cell.ranOn?.label ?? 'nothing yet'}; run on ${kernelLabel} (⇧↵)` : `Run again on ${kernelLabel} (⇧↵)`"
        :disabled="running"
        @mousedown.stop
        @click.stop="$emit('run')"
      >
        <Loader2 v-if="running" :size="12" class="animate-spin"/>
        <Play v-else :size="10" :stroke-width="2.4" fill="currentColor" class="translate-x-[1px]"/>
      </button>
      <span class="font-mono text-[10px] leading-3 text-neutral-400" :title="cell.ranOn ? `Counted on the snapshot of ${cell.ranOn.label}` : 'Not counted yet'">computed</span>
      <span v-if="changeText" class="font-mono text-[10px] leading-3 text-accent-700" :title="changeText">moved</span>
    </div>

    <p v-if="!out" class="nb-rd-text doc-prose" aria-busy="true">
      <span class="nb-rd-skel" style="width: 96%"></span><span class="nb-rd-skel" style="width: 88%"></span><span class="nb-rd-skel" style="width: 54%"></span>
    </p>
    <p v-else-if="out.absent" class="nb-rd-text doc-prose italic !text-neutral-500" :title="def?.describe">{{ plain }}</p>
    <div v-else class="nb-rd-text doc-prose" :title="def?.describe">
      <template v-for="(blk, k) in blocks" :key="k">
        <ul v-if="blk.kind === 'ul'" class="nb-rd-list">
          <li v-for="(item, m) in blk.items" :key="m" v-html="inlineHtml(item)"></li>
        </ul>
        <p v-else v-html="inlineHtml(blk.text)"></p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Loader2, Play } from "lucide-vue-next";
import { describeChange } from "~/features/reports/reportCells";
import { inlineHtml, plainText, readingBlocks, type Cell } from "~/features/reports/reportDoc";
import { readingDef } from "~/features/reports/readings";

const props = withDefaults(defineProps<{
  cell: Cell
  selected: boolean
  running: boolean
  stale: boolean
  kernelLabel: string
  /** The run gutter; a preview outside the notebook goes without. */
  gutter?: boolean
}>(), { gutter: true });
defineEmits<{ (e: "select"): void; (e: "run"): void }>();

const gutter = computed(() => props.gutter !== false);
const def = computed(() => (props.cell.spec.type === "reading" ? readingDef(props.cell.spec.reading) : undefined));
const out = computed(() => props.cell.output?.reading ?? (props.cell.output?.error ? { text: props.cell.output.error, values: {}, absent: true } : null));
const blocks = computed(() => readingBlocks(out.value?.text ?? ""));
const plain = computed(() => plainText(out.value?.text ?? ""));
const changeText = computed(() => describeChange(props.cell.previous, props.cell.output).replace(/^Unchanged.*$/, ""));
</script>

<style scoped>
/* Set as the prose around it (.doc-prose): a paragraph, or a lead sentence and a list. */
.nb-rd-text { padding: 4pt 0; }
.nb-rd-text :deep(p) { margin: 0; }
.nb-rd-text :deep(p + p), .nb-rd-text :deep(ul + p), .nb-rd-text :deep(p + ul) { margin-top: 5pt; }
.nb-rd-list { margin: 0; padding: 0; list-style: none; }
.nb-rd-list > li { position: relative; padding: 1.5pt 0 1.5pt 1.4em; }
.nb-rd-list > li::before { content: "•"; position: absolute; left: 0.35em; color: rgb(var(--c-neutral-400)); }
/* The mark of a counted paragraph: a dotted rule in the margin, solid when selected. */
.nb-reading::before { content: ""; position: absolute; left: 0; top: 7px; bottom: 7px; width: 0; border-left: 2px dotted rgb(var(--c-neutral-300)); }
.nb-reading-on::before { border-left-style: solid; border-left-color: rgb(var(--c-accent-500)); top: 0; bottom: 0; }
.nb-rd-skel { display: block; height: 10px; margin: 8px 0; border-radius: 3px; background: rgb(var(--c-neutral-100)); animation: rd-breathe 1.4s ease-in-out infinite; }
@keyframes rd-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .nb-rd-skel { animation: none; } }
</style>
