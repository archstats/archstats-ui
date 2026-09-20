
<template>
  <button type="button" class="ui-btn">
    <Icon :icon="icon" class="icon shrink-0 text-neutral-500" :size="iconSize" v-if="icon"/>
    <span class="truncate"><slot></slot></span>
  </button>
</template>
<script setup lang="ts">

import Icon from "~/components/ui/common/Icon.vue";

const props = defineProps(
    {
      icon: {
        type: String,
        required: false
      },
      iconSize: {
        type: Number,
        default: 18
      }
    }
)
</script>
<style scoped>
/* Variant classes callers still pass; written out because @apply cannot see
   component-layer classes from a scoped block. */
.primary { color: rgb(var(--c-on-accent)); background: rgb(var(--c-accent-500)); box-shadow: none; }
.primary:hover { background: rgb(var(--c-accent-400)); color: rgb(var(--c-on-accent)); }
.tertiary { background: transparent; box-shadow: none; color: rgb(var(--c-neutral-600)); }
.tertiary:hover { background: rgb(var(--c-neutral-100)); color: rgb(var(--c-neutral-900)); }
.tertiary .icon { color: rgb(var(--c-neutral-500)); }
</style>
