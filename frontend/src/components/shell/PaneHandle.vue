<template>
  <div
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    tabindex="0"
    class="pane-handle absolute inset-y-0 z-10 w-[7px] cursor-col-resize outline-none"
    :class="side === 'left' ? '-left-[3px]' : '-right-[3px]'"
    :data-active="active || undefined"
    :title="`Drag to resize, double-click to reset`"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @dblclick="emit('reset')"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";

// A hairline you can grab. `side` names which edge of the pane the handle sits
// on: a handle on the pane's right edge grows the pane when dragged right; one
// on its left edge shrinks it. Widths are clamped by the owner through the
// store, so the handle only reports intent.
const props = withDefaults(defineProps<{
  modelValue: number
  min: number
  max: number
  side?: "left" | "right"
  label?: string
}>(), { side: "right", label: "Resize pane" });

const emit = defineEmits<{
  (e: "update:modelValue", width: number): void
  (e: "reset"): void
  (e: "drag-start"): void
  (e: "drag-end"): void
}>();

const active = ref(false);
let startX = 0;
let startWidth = 0;

function clamp(v: number): number {
  return Math.min(props.max, Math.max(props.min, Math.round(v)));
}

function onDown(e: PointerEvent) {
  if (e.button !== 0) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  startX = e.clientX;
  startWidth = props.modelValue;
  active.value = true;
  emit("drag-start");
}

function onMove(e: PointerEvent) {
  if (!active.value) return;
  const delta = e.clientX - startX;
  emit("update:modelValue", clamp(props.side === "right" ? startWidth + delta : startWidth - delta));
}

function onUp(e: PointerEvent) {
  if (!active.value) return;
  active.value = false;
  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  emit("drag-end");
}

function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 48 : 16;
  const grow = props.side === "right" ? "ArrowRight" : "ArrowLeft";
  const shrink = props.side === "right" ? "ArrowLeft" : "ArrowRight";
  if (e.key === grow) { e.preventDefault(); emit("update:modelValue", clamp(props.modelValue + step)); }
  else if (e.key === shrink) { e.preventDefault(); emit("update:modelValue", clamp(props.modelValue - step)); }
  else if (e.key === "Enter") { e.preventDefault(); emit("reset"); }
}
</script>
