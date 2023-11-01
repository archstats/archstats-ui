<template>
  <div :class="['', {'hover:bg-archstats-50': stat.isRealStat}]">
    <div class="text-archstats-900 px-3 w-fit" v-if="!stat.children?.length" @click="emit('select-stat', stat.fullName)">
      {{ stat.name }}
    </div>

    <div v-else>

      <div class="px-2 flex gap items-center select-none" v-if="stat.level>0">
        <Icon v-if="stat.children?.length" :icon="expanded ? 'chevron-down' : 'chevron-right'" class="cursor-pointer text-archstats-300 hover:text-archstats-500" :size="16"
              @click="expanded=!expanded"></Icon>
        <span @click="expanded=!expanded" :class="['text-archstats-500', {
        'font-semibold': stat.level === 1,
        'text-archstats-700':stat.level===1,
        'text-base': stat.level !== 1
      }]">{{ stat.name }}</span>


      </div>


      <div v-show="expanded" :style="{'padding-left': `${(stat.level) * 12}px`}" v-for="child in orderedChildren">
        <StatSelectOptionNode :selected-stat="selectedStat" :stat="child" @select-stat="emit('select-stat', $event)"></StatSelectOptionNode>
      </div>
    </div>
  </div>


</template>

<script setup lang="ts">
import {Stat} from "~/utils/stat-tree";
import Icon from "~/components/ui/common/Icon.vue";

const props = defineProps<{
  stat: Stat
  selectedStat?: string
}>()

const emit = defineEmits(['select-stat'])

const orderedChildren = computed(() => {
  return props.stat.children?.sort((a, b) => {
    if (a.children?.length == b.children?.length) return a.fullName.localeCompare(b.fullName)

    const aLength = a.children?.length ?? 0
    const bLength = b.children?.length ?? 0
    return aLength - bLength
  });
})


const expanded = ref(true)

</script>