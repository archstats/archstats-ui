<template>
  <div>
    <div class="text-archstats-900 w-fit ml-5" v-if="!stat.children?.length" @click="emit('select-stat', stat.fullName)">
      <Checkbox :model-value="isChecked">
        {{ stat.name }}
      </Checkbox>
    </div>

    <div v-else>
      <div class="flex items-center gap-1 select-none">

        <Icon v-if="stat.children?.length" :icon="expanded ? 'chevron-down' : 'chevron-right'"
              class="cursor-pointer text-archstats-300 hover:text-archstats-500" :size="16"
              @click="expanded=!expanded"></Icon>
        <Checkbox :model-value="isChecked" @update:model-value="emit('select-stat', stat.fullName)">
          <span :class="['text-archstats-500', {
        'font-semibold': stat.level <= 1,
        'text-archstats-700':stat.level<=1,
        'text-base': stat.level >= 1
      }]">{{ stat.name || "All" }}</span>
        </Checkbox>


      </div>
      <div v-show="expanded" :style="{'padding-left': `${(stat.level + 1) * 18}px`}" v-for="child in orderedChildren">
        <StatSelectMultiNode :selected-stats="selectedStats" :stat="child"
                             @select-stat="emit('select-stat', $event)"></StatSelectMultiNode>
      </div>
    </div>
  </div>


</template>

<script setup lang="ts">
import {Stat} from "~/utils/stat-tree";
import Icon from "~/components/ui/common/Icon.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";

const props = defineProps<{
  stat: Stat
  selectedStats?: string[]
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
const isChecked = computed(() => {
  return props.selectedStats?.includes(props.stat.fullName) ?? false
})

</script>