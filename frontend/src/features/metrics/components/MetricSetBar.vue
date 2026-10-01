<template>
  <!-- The metrics a view draws, as chips in drawing order: × removes, drag or
       Alt+←/→ reorders, "Add metric" picks from every metric with its definition. -->
  <div class="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1.5 px-3 py-1.5 hairline-b" role="group" :aria-label="t('metrics.metricSetBar.metrics', { viewName })">
    <span class="ui-label mr-1">{{ t('metrics.metricSetBar.metrics2') }}</span>
    <TransitionGroup name="chip" tag="div" class="contents">
      <span
          v-for="(key, i) in modelValue"
          :key="key"
          class="ui-chip cursor-grab gap-1 pr-1 active:cursor-grabbing"
          :class="{ 'opacity-40': dragFrom === i, 'is-active': dropAt === i && dragFrom !== null && dragFrom !== i }"
          draggable="true"
          tabindex="0"
          :title="t('metrics.metricSetBar.dragAltMove', { key: niceName(key) })"
          @dragstart="onDragStart($event, i)"
          @dragover.prevent="dropAt = i"
          @dragleave="dropAt = dropAt === i ? null : dropAt"
          @drop.prevent="onDrop(i)"
          @dragend="dragFrom = null; dropAt = null"
          @keydown.alt.left.prevent="move(i, i - 1, $event)"
          @keydown.alt.right.prevent="move(i, i + 1, $event)"
          @keydown.delete.prevent="remove(i)"
          @keydown.backspace.prevent="remove(i)"
      >
        <span class="max-w-[180px] truncate">{{ niceName(key) }}</span>
        <button
            type="button"
            class="grid h-4 w-4 place-items-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800 disabled:pointer-events-none disabled:opacity-30"
            :disabled="modelValue.length <= min"
            :aria-label="t('metrics.metricSetBar.remove', { key: niceName(key) })"
            :title="modelValue.length <= min ? t('metrics.metricSetBar.needsLeast', { viewName, min }) : t('metrics.metricSetBar.remove', { key: niceName(key) })"
            @click="remove(i)"
        >
          <Icon icon="x" :size="11"/>
        </button>
      </span>
    </TransitionGroup>

    <StatSelectSingle :model-value="null" :options="addable" @update:model-value="add">
      <template #trigger="{ toggle, open }">
        <button type="button" class="ui-btn ui-btn-sm gap-1" :aria-expanded="open" :disabled="full || addable.length === 0"
                :title="full ? t('metrics.metricSetBar.holdsUpMetricsRemove', { viewName, max }) : t('metrics.metricSetBar.addMetric')" @click="toggle">
          <Icon icon="plus" :size="12" class="text-neutral-500"/>{{ t('metrics.metricSetBar.addMetric2') }}
        </button>
      </template>
    </StatSelectSingle>
    <span v-if="max < Infinity" class="font-mono text-xs text-neutral-500">{{ modelValue.length }} / {{ max }}</span>

    <button v-if="changed" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="emit('reset')">{{ t('metrics.metricSetBar.resetDefaults') }}</button>
    <!-- What the bar draws exports from its end: the bar is that exhibit's header. -->
    <div v-if="$slots.end" class="flex items-center" :class="changed ? 'ml-1' : 'ml-auto'"><slot name="end"/></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, type PropType } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import StatSelectSingle from "~/features/metrics/components/StatSelectSingle.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { t } from "~/shared/i18n";

const props = defineProps({
  modelValue: { type: Array as PropType<string[]>, required: true },
  /** Every metric the view could draw. */
  options: { type: Array as PropType<string[]>, required: true },
  defaults: { type: Array as PropType<string[]>, required: true },
  viewName: { type: String, required: true },
  min: { type: Number, default: 1 },
  max: { type: Number, default: Infinity },
});

const emit = defineEmits<{
  (e: "update:modelValue", keys: string[]): void;
  (e: "reset"): void;
}>();

const store = useDataStore();
const niceName = (k: string) => store.statNiceName(k) || k;

const addable = computed(() => props.options.filter((o) => !props.modelValue.includes(o)));
const full = computed(() => props.modelValue.length >= props.max);
const changed = computed(() => props.modelValue.join("|") !== props.defaults.join("|"));

function add(key: string | null) {
  if (!key || full.value || props.modelValue.includes(key)) return;
  emit("update:modelValue", [...props.modelValue, key]);
}

function remove(i: number) {
  if (props.modelValue.length <= props.min) return;
  emit("update:modelValue", props.modelValue.filter((_, k) => k !== i));
}

function reorder(from: number, to: number): string[] {
  const next = [...props.modelValue];
  const [key] = next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

function move(from: number, to: number, e: KeyboardEvent) {
  if (to < 0 || to >= props.modelValue.length) return;
  emit("update:modelValue", reorder(from, to));
  // Keep focus on the chip that moved.
  const group = (e.currentTarget as HTMLElement).parentElement;
  nextTick(() => (group?.querySelectorAll<HTMLElement>("[draggable]")[to])?.focus());
}

const dragFrom = ref<number | null>(null);
const dropAt = ref<number | null>(null);

function onDragStart(e: DragEvent, i: number) {
  dragFrom.value = i;
  e.dataTransfer?.setData("text/plain", props.modelValue[i]);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onDrop(i: number) {
  const from = dragFrom.value;
  dragFrom.value = null;
  dropAt.value = null;
  if (from === null || from === i) return;
  emit("update:modelValue", reorder(from, i));
}
</script>

<style scoped>
.chip-move {
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-reduced-motion: reduce) {
  .chip-move { transition: none; }
}
</style>
