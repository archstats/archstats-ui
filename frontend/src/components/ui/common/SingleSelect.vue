
<template>
  <div ref="containerRef" class="relative inline-block">
    <button type="button" class="ui-btn min-w-[120px] justify-between gap-2 font-normal" :aria-expanded="isDropdownOpen" @click="toggleDropdown">
      <slot :selectedOption="modelValue">
        <span class="truncate" :class="{ 'text-neutral-400': !modelValue }">{{ modelValue ? getOptionName(modelValue) : placeholder }}</span>
      </slot>
      <Icon icon="chevron-down" :size="14" class="shrink-0 text-neutral-400"></Icon>
    </button>

    <!-- Out of the layout entirely: see useAnchoredPanel. -->
    <Teleport to="body">
      <div
        v-if="isDropdownOpen"
        ref="panelRef"
        class="ui-menu overflow-y-auto animate-in"
        :style="{ ...panelStyle, maxHeight: Math.min(280, space) + 'px' }"
      >
        <div v-for="option in options" :key="getOptionName(option)" @click="handleSelect(option)">
          <slot name="option" :option="option">
            <button type="button" class="ui-menu-item" :class="{ 'is-active': modelValue === option }">
              <span class="truncate">{{ getOptionName(option) }}</span>
            </button>
          </slot>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";
import {onMounted, onUnmounted, ref} from 'vue';
import {PropType} from "@vue/runtime-core";
import { useAnchoredPanel } from "~/composables/useAnchoredPanel";

type Option = {
  name: string,
} | string

function getOptionName(option: Option) {
  if (typeof option === 'string') {
    return option;
  } else {
    return option.name;
  }
}

// Props
const props = defineProps({
  modelValue: {
    type: [String, Object] as PropType<Option>,
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

const containerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const { style: panelStyle, space } = useAnchoredPanel(containerRef, isDropdownOpen);

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

// The menu is teleported, so it is no longer inside the element a focusout
// would have measured against: "outside" now means outside both.
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node;
  if (containerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
  isDropdownOpen.value = false;
};
onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));

const handleSelect = (option: Option) => {
  isDropdownOpen.value = false;
  emit('update:modelValue', option);
};

</script>
