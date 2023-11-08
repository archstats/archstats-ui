<template>
  <div class="w-fit border border-archstats-500 relative rounded cursor-pointer" @blur="isDropdownOpen=false"
       tabindex="0">
    <div class="flex justify-between items-center px-4 py-3  w-full h-full gap-2" @click="toggleDropdown">

      <span :class="{'text-gray-400': !modelValue }">{{ modelValue ?? "Select metric" }}</span>

      <Icon icon="chevron-down"></Icon>
    </div>


    <div v-show="isDropdownOpen"
         class="z-10 rounded border-2 border-gray-200 absolute top-full left-0 max-h-[450px] w-60 bg-white overflow-y-auto">
      <StatSelectOptionNode :stat="stats[0]" @select-stat="handleSelect($event)"></StatSelectOptionNode>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";
import {ref} from 'vue';
import {PropType} from "@vue/runtime-core";
import {columnsToStats, Stat} from "~/utils/stat-tree";

import StatSelectOptionNode from "~/components/ui/stat-select/StatSelectOptionNode.vue";

// Props
const props = defineProps({
  modelValue: {
    type: String,
    default: null
  },
  options: {
    type: Array as PropType<string[]>,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Select a stat'
  }
});

const emit = defineEmits(['update:modelValue'])
// Local State
const isDropdownOpen = ref(false);

const stats = computed(() => {
  return columnsToStats(props.options)
})

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

const handleSelect = (option: Stat) => {
  emit('update:modelValue', option);
  isDropdownOpen.value = false;
};

</script>
