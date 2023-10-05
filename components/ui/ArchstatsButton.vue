<template>
  <button class="flex">
    <Icon :icon="icon" class='icon' :size="iconSize" v-if="icon"/>
    <span><slot></slot></span>
  </button>
</template>

<script setup lang="ts">

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
.tertiary {
  @apply p-2 hover:bg-gray-300 hover:bg-opacity-50 rounded transition-all flex gap-[5px] items-center text-archstats-900
}
.tertiary .icon {
  @apply text-archstats-900
}

</style>
