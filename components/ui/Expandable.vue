<template>

  <div class="">
    <div class="flex items-center gap-1 align-middle" @click="expanded = !expanded">
      <Icon class="hover:text-secondary-500 cursor-pointer" :icon="expanded ? 'chevron-down' : 'chevron-right'"/>
      <slot></slot>

    </div>
    <div v-if="expanded">
      <slot name="expanded-content"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">

const expanded = ref(false)
</script>