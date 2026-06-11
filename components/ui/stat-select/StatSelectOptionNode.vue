<template>
  <div>
    <!-- Leaf node (Real metric option) -->
    <div 
      v-if="!stat.children?.length"
      @click="emit('select-stat', stat.fullName)"
      @mouseenter="emit('hover-stat', stat)"
      @mouseleave="emit('hover-stat', null)"
      class="group flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer select-none"
      :class="[
        selectedStat === stat.fullName 
          ? 'bg-archstats-50 text-archstats-700 font-extrabold' 
          : 'text-slate-600 hover:bg-slate-50/70 hover:text-slate-900 font-medium'
      ]"
    >
      <span class="truncate">{{ store.statNiceName(stat.fullName) || stat.name }}</span>
      <Icon 
        v-if="selectedStat === stat.fullName" 
        icon="check" 
        class="text-archstats-500 shrink-0" 
        :size="12" 
      />
    </div>

    <!-- Category node -->
    <div v-else>
      <!-- Category Header (only show if level > 0, level 0 is the root node container) -->
      <div 
        v-if="stat.level > 0"
        @click="expanded = !expanded"
        class="flex items-center gap-1.5 py-1 rounded-md cursor-pointer select-none text-left"
      >
        <Icon 
          :icon="expanded ? 'chevron-down' : 'chevron-right'" 
          class="text-slate-300 hover:text-slate-400 shrink-0" 
          :size="11" 
        />
        <span 
          class="truncate select-none"
          :class="[
            stat.level === 1 
              ? 'text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-2 first:mt-0' 
              : 'text-[11px] font-semibold text-slate-500'
          ]"
        >
          {{ stat.name }}
        </span>
      </div>

      <!-- Recursive children list -->
      <div 
        v-show="expanded" 
        :style="{'padding-left': stat.level > 0 ? '12px' : '0px'}" 
        class="space-y-0.5"
      >
        <StatSelectOptionNode 
          v-for="child in orderedChildren"
          :key="child.fullName"
          :selected-stat="selectedStat" 
          :stat="child" 
          :search-query="searchQuery"
          @select-stat="emit('select-stat', $event)"
          @hover-stat="emit('hover-stat', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Stat } from "~/utils/stat-tree";
import Icon from "~/components/ui/common/Icon.vue";
import { useDataStore } from "~/stores/data";

const store = useDataStore();

const props = defineProps<{
  stat: Stat
  selectedStat?: string
  searchQuery?: string
}>()

const emit = defineEmits(['select-stat', 'hover-stat'])

const orderedChildren = computed(() => {
  if (!props.stat.children) return []
  return [...props.stat.children].sort((a, b) => {
    if (a.children?.length == b.children?.length) return a.fullName.localeCompare(b.fullName)
    const aLength = a.children?.length ?? 0
    const bLength = b.children?.length ?? 0
    return aLength - bLength
  });
})

const expanded = ref(true)

// Auto-expand all folders when a search query is active
watch(() => props.searchQuery, (newQuery) => {
  if (newQuery) {
    expanded.value = true;
  }
}, { immediate: true })
</script>