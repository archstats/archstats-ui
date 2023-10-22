<template>
  <div class=" border border-gray-400 relative rounded px-4 py-3 cursor-pointer" @blur="isDropdownOpen=false" tabindex="0">
    <div class="flex justify-between items-center w-full h-full" @click="toggleDropdown">
      <slot :selectedOption="modelValue">
        <span :class="{'text-gray-400': !modelValue }">{{ modelValue ? modelValue.name : placeholder }}</span>
      </slot>

      <Icon icon="chevron-down"></Icon>
    </div>


    <div v-if="isDropdownOpen"
         class="z-10 rounded w-full border-2 border-gray-200 absolute top-full left-0 max-h-[250px] bg-white overflow-y-auto">
      <div v-for="(option, idx) in options" :key="option.name" @click="handleSelect(option)">
        <slot name="option" :option="option">
          <div class="px-4 py-2 hover:bg-gray-100">
            {{ option.name }}
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import {PropType} from "@vue/runtime-core";

type Option = {
  name: string,
}

// Props
const props = defineProps({
  modelValue: {
    type: Object as PropType<Option>,
    default: null
  },
  options: {
    type: Array as PropType<Option[]>,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Select an option'
  }
});

const emit = defineEmits(['update:modelValue'])
// Local State
const isDropdownOpen = ref(false);

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

const handleSelect = (option: Option) => {
  isDropdownOpen.value = false;
  emit('update:modelValue', option);
};

</script>