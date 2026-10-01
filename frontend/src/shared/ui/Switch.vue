<template>
  <!-- An on/off setting that takes effect at once (a checkbox is for a choice saved with others). -->
  <button
      type="button"
      role="switch"
      class="ui-switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      @click.stop="emit('update:modelValue', !modelValue)"
  ><span aria-hidden="true"/></button>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>()
</script>

<style scoped>
.ui-switch {
  position: relative;
  flex-shrink: 0;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: rgb(var(--c-neutral-300));
  transition: background-color 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ui-switch:hover:not(:disabled) { background: rgb(var(--c-neutral-400)); }
.ui-switch span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 18 28 / 0.28);
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ui-switch[aria-checked="true"] { background: rgb(var(--c-accent-500)); }
.ui-switch[aria-checked="true"]:hover:not(:disabled) { background: rgb(var(--c-accent-400)); }
.ui-switch[aria-checked="true"] span { transform: translateX(12px); }
.ui-switch:disabled { opacity: 0.5; cursor: default; }
.ui-switch:focus-visible { outline: 2px solid rgb(var(--c-accent-400)); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .ui-switch, .ui-switch span { transition: none; }
}
</style>
