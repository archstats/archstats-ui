
<template>
  <div ref="containerRef" class="relative inline-block text-left">
    <button type="button" @click="toggleDropdown" class="ui-btn min-w-[132px] max-w-[220px] justify-between gap-2 font-normal" :aria-expanded="isDropdownOpen">
      <span class="truncate" :class="{ 'text-neutral-400': !modelValue }">{{ modelValue ? store.statNiceName(modelValue) : placeholder }}</span>
      <Icon icon="chevron-down" class="shrink-0 text-neutral-400 transition-transform" :class="{ 'rotate-180': isDropdownOpen }" :size="14"/>
    </button>

    <!-- Out of the layout entirely: see useAnchoredPanel. -->
    <Teleport to="body">
      <div v-if="isDropdownOpen" ref="panelRef" class="flex gap-2" :class="alignRight ? 'flex-row-reverse' : 'flex-row'" :style="panelStyle">
      <div class="ui-popover flex w-72 flex-col overflow-hidden animate-in" :style="{ maxHeight: Math.min(400, space) + 'px' }">
        <div class="flex items-center gap-2 border-b border-neutral-200 px-2.5 py-2">
          <Icon icon="search" class="shrink-0 text-neutral-400" :size="14"/>
          <input v-model="searchQuery" type="text" placeholder="Search metrics" class="w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400" @click.stop/>
          <button v-show="searchQuery" type="button" class="shrink-0 text-neutral-400 hover:text-neutral-700" aria-label="Clear" @click.stop="searchQuery = ''">
            <Icon icon="x" :size="12"/>
          </button>
        </div>
        <div class="min-h-0 flex-grow overflow-y-auto p-1">
          <div v-if="stats.length > 0 && stats[0].children?.length">
            <StatSelectOptionNode :stat="stats[0]" :selected-stat="modelValue" :search-query="searchQuery" @select-stat="handleSelect($event)" @hover-stat="hoveredStat = $event"/>
          </div>
          <div v-else class="px-3 py-8 text-center text-sm text-neutral-400">No matching metrics</div>
        </div>
      </div>

      <div v-if="hoveredStat && hoveredStat.isRealStat" class="ui-popover flex w-72 flex-col justify-between overflow-y-auto p-3 animate-in" :style="{ maxHeight: Math.min(400, space) + 'px' }">
        <div class="flex flex-col gap-2">
          <div class="truncate text-xs text-neutral-500">{{ getStatCategoryPath(hoveredStat.fullName) }}</div>
          <h4 class="text-base font-semibold leading-5 text-neutral-900">{{ store.statNiceName(hoveredStat.fullName) }}</h4>
          <div class="h-px w-full bg-neutral-200"></div>
          <p v-if="getStatDefinition(hoveredStat.fullName)?.short" class="text-base leading-5 text-neutral-700">{{ getStatDefinition(hoveredStat.fullName)?.short }}</p>
          <p v-if="getStatDefinition(hoveredStat.fullName)?.long" class="text-sm leading-4 text-neutral-500">{{ getStatDefinition(hoveredStat.fullName)?.long }}</p>
          <p v-if="!getStatDefinition(hoveredStat.fullName)?.short && !getStatDefinition(hoveredStat.fullName)?.long" class="text-sm text-neutral-400">No description available for this metric.</p>
        </div>
        <div class="mt-3 border-t border-neutral-200 pt-2">
          <span class="ui-tag select-all break-all">{{ hoveredStat.fullName }}</span>
        </div>
      </div>
      </div>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAnchoredPanel } from "~/composables/useAnchoredPanel";
import { PropType } from "@vue/runtime-core";
import { columnsToStats, Stat } from "~/utils/stat-tree";
import { useDataStore } from "~/stores/data";

const store = useDataStore();

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
  },
  alignRight: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue'])

// Local State
const isDropdownOpen = ref(false);
const searchQuery = ref('');
const hoveredStat = ref<Stat | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const { style: panelStyle, space } = useAnchoredPanel(containerRef, isDropdownOpen, props.alignRight ? "right" : "left");

// Click outside detection. The panel is no longer inside the trigger, so
// "outside" has to mean outside both of them.
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node;
  if (containerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
  isDropdownOpen.value = false;
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Dynamic filtering of columns before converting to tree
const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  const query = searchQuery.value.toLowerCase().trim();
  return props.options.filter(opt => {
    const niceName = store.statNiceName(opt).toLowerCase();
    const rawName = opt.toLowerCase();
    return rawName.includes(query) || niceName.includes(query);
  });
});

const stats = computed(() => {
  return columnsToStats(filteredOptions.value);
});

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
  if (isDropdownOpen.value) {
    // Reset search and hover state when opening
    searchQuery.value = '';
    hoveredStat.value = null;
  }
};

const handleSelect = (option: string) => {
  emit('update:modelValue', option);
  isDropdownOpen.value = false;
};

const getStatDefinition = (fullName: string) => {
  return store.definitions.get(fullName);
};

const getStatCategoryPath = (fullName: string) => {
  return fullName.split('__').map(part => {
    return part.replace(/_/g, ' ');
  }).join(' › ');
};
</script>

