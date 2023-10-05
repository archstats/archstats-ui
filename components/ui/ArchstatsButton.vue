<template>
  <button class="flex">
    <Icon :icon="icon" class='icon' :size="iconSize" v-if="icon"/>
    <span class="self-center flex-grow"><slot></slot></span>
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
.primary{
  @apply p-3 transition-all bg-archstats-500 rounded text-white text-center items-center gap-3 hover:bg-archstats-400
}
.secondary {
  @apply p-3 transition-all border rounded border-archstats-500 text-archstats-500 text-center items-center gap-3 hover:text-archstats-400 hover:border-archstats-400
}

.tertiary {
  @apply p-2 hover:bg-gray-300 hover:bg-opacity-50 rounded transition-all flex gap-[5px] items-center text-archstats-900
}

.tertiary .icon {
  @apply text-archstats-900
}

</style>
