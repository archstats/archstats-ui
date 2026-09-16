<template>
  <div ref="containerRef" class="relative inline-block text-left">
    <!-- Trigger Button -->
    <div 
      @click="toggleDropdown"
      class="flex items-center justify-between gap-2.5 px-3.5 py-2 bg-white border border-slate-200 hover:border-archstats-400 hover:bg-slate-50 active:bg-slate-100 rounded-lg shadow-xs cursor-pointer select-none transition-all duration-150 text-xs font-bold text-slate-700 min-w-[170px]"
    >
      <span class="truncate" :class="{'text-slate-400 font-medium': !modelValue}">
        {{ modelValue ? store.statNiceName(modelValue) : placeholder }}
      </span>
      <Icon icon="chevron-down" class="text-slate-400 transition-transform duration-200 shrink-0" :class="{'rotate-180': isDropdownOpen}" :size="14" />
    </div>

    <!-- Dropdown Portal Container -->
    <div 
      v-show="isDropdownOpen" 
      class="absolute top-full mt-1.5 z-50 flex gap-2 pointer-events-auto"
      :class="alignRight ? 'right-0 flex-row-reverse' : 'left-0 flex-row'"
    >
      <!-- Dropdown Card -->
      <div class="w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[400px] border-slate-200/80">
        <!-- Search Header -->
        <div class="p-2.5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <Icon icon="search" class="text-slate-400 flex-shrink-0" :size="14" />
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="Search metrics..."
            class="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder-slate-400 focus:ring-0 py-0.5"
            @click.stop
          />
          <button 
            v-show="searchQuery" 
            class="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            @click.stop="searchQuery = ''"
          >
            <Icon icon="x" :size="12" />
          </button>
        </div>

        <!-- Scrollable Tree Container -->
        <div class="overflow-y-auto flex-grow py-2 max-h-[340px] px-2 custom-scrollbar">
          <div v-if="stats.length > 0 && stats[0].children?.length" class="space-y-1">
            <StatSelectOptionNode 
              :stat="stats[0]" 
              :selected-stat="modelValue" 
              :search-query="searchQuery"
              @select-stat="handleSelect($event)"
              @hover-stat="hoveredStat = $event"
            />
          </div>
          <div v-else class="px-4 py-8 text-center text-xs text-slate-400 font-medium italic">
            No matching metrics found
          </div>
        </div>
      </div>

      <!-- Description Hover Card -->
      <div 
        v-if="hoveredStat && hoveredStat.isRealStat"
        class="w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 flex flex-col justify-between max-h-[400px] overflow-y-auto animate-fade-in border-slate-200/80"
      >
        <div class="space-y-3">
          <!-- Category path / Breadcrumb -->
          <div class="text-[9px] font-bold uppercase tracking-wider text-archstats-400 truncate">
            {{ getStatCategoryPath(hoveredStat.fullName) }}
          </div>
          
          <!-- Stat Name -->
          <h4 class="text-slate-800 font-extrabold text-sm leading-snug">
            {{ store.statNiceName(hoveredStat.fullName) }}
          </h4>
          
          <!-- Divider -->
          <div class="h-[1px] bg-slate-100 w-full"></div>
          
          <!-- Descriptions -->
          <div class="space-y-2">
            <p v-if="getStatDefinition(hoveredStat.fullName)?.short" class="text-slate-600 text-xs leading-relaxed font-medium">
              {{ getStatDefinition(hoveredStat.fullName)?.short }}
            </p>
            <p v-if="getStatDefinition(hoveredStat.fullName)?.long" class="text-slate-400 text-[10px] leading-relaxed italic">
              {{ getStatDefinition(hoveredStat.fullName)?.long }}
            </p>
            <p v-if="!getStatDefinition(hoveredStat.fullName)?.short && !getStatDefinition(hoveredStat.fullName)?.long" class="text-slate-400 text-[10px] italic">
              No description available for this metric.
            </p>
          </div>
        </div>
        
        <!-- Metric ID / Key -->
        <div class="mt-4 pt-2.5 border-t border-slate-50 flex items-center justify-between">
          <span class="text-[9px] font-mono text-slate-400 break-all select-all py-0.5 px-1.5 bg-slate-50 rounded border border-slate-100 leading-normal">
            {{ hoveredStat.fullName }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue";
import { ref, computed, onMounted, onUnmounted } from 'vue';
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

// Click outside detection
const handleClickOutside = (event: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isDropdownOpen.value = false;
  }
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

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.15s ease-out forwards;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
