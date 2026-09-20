
<template>
  <div>
    <div class="ml-5 w-fit py-0.5" v-if="!stat.children?.length" @click="emit('select-stat', stat.fullName)">
      <Checkbox :model-value="isChecked">{{ stat.name }}</Checkbox>
    </div>

    <div v-else>
      <div class="flex select-none items-center gap-1 py-0.5">
        <Icon v-if="stat.children?.length" :icon="expanded ? 'chevron-down' : 'chevron-right'" class="cursor-pointer text-neutral-400 hover:text-neutral-700" :size="14" @click="expanded=!expanded"></Icon>
        <Checkbox :model-value="isChecked" @update:model-value="emit('select-stat', stat.fullName)">
          <span :class="stat.level <= 1 ? 'font-medium text-neutral-800' : 'text-neutral-700'">{{ stat.name || "All" }}</span>
        </Checkbox>
      </div>
      <div v-show="expanded" :style="{'padding-left': `${(stat.level + 1) * 14}px`}" v-for="child in orderedChildren" :key="child.fullName">
        <StatSelectMultiNode :selected-stats="selectedStats" :stat="child" @select-stat="emit('select-stat', $event)"></StatSelectMultiNode>
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