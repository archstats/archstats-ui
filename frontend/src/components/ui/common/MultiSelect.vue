
<template>
  <div class="relative inline-block" tabindex="-1" @focusout="onFocusOut">
    <button type="button" class="ui-btn justify-between gap-2 font-normal" :aria-expanded="isDropdownOpen" @click="toggleDropdown">
      <span class="whitespace-nowrap">{{ modelValue.length }} of {{ options.length }} selected</span>
      <Icon icon="chevron-down" :size="14" class="shrink-0 text-neutral-400"></Icon>
    </button>

    <div v-if="isDropdownOpen" class="ui-menu absolute left-0 top-full z-50 mt-1 min-w-[220px] animate-in">
      <button type="button" class="ui-menu-item" @click="toggleSelectAll">
        <Checkbox :model-value="isAllSelected" class="pointer-events-none">All</Checkbox>
      </button>
      <div class="my-1 h-px bg-neutral-200"></div>
      <div class="max-h-[250px] overflow-y-auto">
        <button type="button" v-for="(option, idx) in options" :key="getOptionName(option)" class="ui-menu-item" @click="handleSelect(option)">
          <Checkbox :model-value="isSelected(option)" class="pointer-events-none">{{ getOptionName(option) }}</Checkbox>
        </button>
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


function onFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Node | null
  const root = e.currentTarget as HTMLElement
  if (!next || !root.contains(next)) isDropdownOpen.value = false
}

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}
</script>