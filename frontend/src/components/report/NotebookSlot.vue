<template>
  <!-- A figure or table the template asks for: which view, set how. It is
       filled by adding from that view; until then it holds its place and its
       number, and stays out of the PDF. -->
  <figure
    class="nb-slot relative my-3 rounded-lg transition-shadow"
    :class="selected ? 'nb-slot-on' : ''"
    :aria-label="`${number}, to add from ${spec.view}`"
    @mousedown="$emit('select')"
  >
    <div class="flex items-baseline gap-2 px-4 pt-3">
      <span class="shrink-0 text-xs font-medium text-neutral-500">{{ number }}</span>
      <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-800">{{ cell.title || spec.view }}</span>
      <span class="ui-tag shrink-0">to add</span>
    </div>
    <div class="flex items-center gap-5 px-4 pb-4 pt-3" :class="compact ? '' : 'min-h-[132px]'">
      <!-- A sketch of what goes here: a frame for a figure, rows for a table. -->
      <div class="nb-slot-sketch shrink-0" :class="spec.kind === 'figure' ? 'h-[88px] w-[132px]' : 'h-[72px] w-[132px]'" aria-hidden="true">
        <template v-if="spec.kind === 'figure'">
          <span class="absolute bottom-3 left-3 h-6 w-3 rounded-[2px] bg-neutral-200"></span>
          <span class="absolute bottom-3 left-8 h-10 w-3 rounded-[2px] bg-neutral-200"></span>
          <span class="absolute bottom-3 left-[52px] h-4 w-3 rounded-[2px] bg-neutral-200"></span>
          <span class="absolute bottom-3 left-[72px] h-12 w-3 rounded-[2px] bg-neutral-200"></span>
          <span class="absolute bottom-3 left-[92px] h-8 w-3 rounded-[2px] bg-neutral-200"></span>
        </template>
        <template v-else>
          <span v-for="r in 5" :key="r" class="absolute left-3 right-3 h-[3px] rounded-full bg-neutral-200" :style="{ top: `${10 + (r - 1) * 12}px`, right: `${12 + ((r * 7) % 20)}px` }"></span>
        </template>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[13px] leading-5 text-neutral-700">Add it from <span class="font-medium text-neutral-900">{{ spec.view }}</span>: {{ spec.hint }}.</p>
        <p class="mt-0.5 text-[12px] leading-5 text-neutral-500">Open the view, then Export › Add to report; it lands here.</p>
        <button v-if="!compact" type="button" class="ui-btn ui-btn-sm mt-2.5" @mousedown.stop @click.stop="$emit('open')">
          <Icon :icon="spec.kind === 'figure' ? 'image' : 'table'" :size="13" class="text-neutral-500"/><span>Open {{ spec.view }}</span>
        </button>
      </div>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import type { Cell, CellSpec } from "~/utils/reportDoc";

const props = withDefaults(defineProps<{ cell: Cell; number: string; selected: boolean; compact?: boolean }>(), { compact: false });
defineEmits<{ (e: "select"): void; (e: "open"): void }>();
const spec = computed(() => props.cell.spec as Extract<CellSpec, { type: "slot" }>);
</script>

<style scoped>
.nb-slot { background: rgb(var(--c-neutral-50) / 0.6); box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-200)); background-image: repeating-linear-gradient(135deg, transparent 0 9px, rgb(var(--c-neutral-200) / 0.35) 9px 10px); }
.nb-slot:hover { box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-300)); }
.nb-slot-on, .nb-slot-on:hover { box-shadow: 0 0 0 1px rgb(var(--c-accent-400)), inset 2px 0 0 rgb(var(--c-accent-500)); }
.nb-slot-sketch { position: relative; border-radius: 6px; background: rgb(var(--c-surface)); box-shadow: inset 0 0 0 1px rgb(var(--c-neutral-200)); }
</style>
