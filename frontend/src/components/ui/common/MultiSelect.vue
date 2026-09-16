<template>
  <div class="w-fit border border-gray-400 relative rounded px-4 py-3 cursor-pointer" @blur='isDropdownOpen=false'
       tabindex="0">
    <div class="flex justify-between items-center w-full h-full gap-2" @click="toggleDropdown">
      <div class="whitespace-nowrap">
        {{ modelValue.length }} of {{ options.length }} selected
      </div>
      <Icon icon="chevron-down"></Icon>
    </div>

    <div class="" v-if="isDropdownOpen">
      <div
          class="z-10 rounded border-2 border-gray-200 absolute top-full left-0  bg-white">
        <div :class="['px-4 py-2 hover:bg-gray-200 flex gap-2', {
              'bg-gray-100': isAllSelected
            }]"
             @click="toggleSelectAll"
        >
          <Checkbox :model-value="isAllSelected">All</Checkbox>
        </div>
        <hr>
        <div class="max-h-[250px] overflow-y-auto">
          <div v-for="(option, idx) in options" :key="getOptionName(option)" @click="handleSelect(option)">
            <div :class="['px-4 py-2 hover:bg-gray-200 flex gap-2', {
              'bg-gray-100': isSelected(option)
            }]">
              <Checkbox :model-value="isSelected(option)">{{ getOptionName(option) }}</Checkbox>

            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">

import Icon from "~/components/ui/common/Icon.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";

export interface Props<Type> {
  options: Type[]
  modelValue: Type[]
  getOptionName?: (option: Type) => string
}

const props = defineProps<Props<unknown>>()

const emit = defineEmits(['update:modelValue'])

const isDropdownOpen = ref(false)

const handleSelect = (option: any) => {
  let currentSelected = [...props.modelValue]
  if (isSelected(option)) {
    currentSelected = currentSelected.filter(o => o !== option)
  } else {
    currentSelected.push(option)
  }
  emit('update:modelValue', currentSelected)
}

function isStringBased() {
  return typeof props.options[0] === 'string'
}

const getOptionName = (opt: any) => {
  if (isStringBased()) {
    return opt as string
  } else {
    if (props.getOptionName) {
      return props.getOptionName(opt)
    } else {
      return JSON.stringify(opt)
    }
  }
}

function isSelected(option: any) {
  return props.modelValue.includes(option)
}

const isAllSelected = computed(() => {
  return props.modelValue.length === props.options.length
})

function toggleSelectAll() {
  if (props.modelValue.length === props.options.length) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', props.options)
  }
}


function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}
</script>