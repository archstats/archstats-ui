
<template>
  <div>
    <button v-if="!stat.children?.length" type="button"
      @click="emit('select-stat', stat.fullName)" @mouseenter="emit('hover-stat', stat)" @mouseleave="emit('hover-stat', null)"
      class="ui-menu-item justify-between" :class="{ 'is-active': selectedStat === stat.fullName }">
      <span class="truncate">{{ store.statNiceName(stat.fullName) || stat.name }}</span>
      <Icon v-if="selectedStat === stat.fullName" icon="check" class="shrink-0 text-accent-600" :size="12"/>
    </button>

    <div v-else>
      <button v-if="stat.level > 0" type="button" @click="expanded = !expanded" class="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-neutral-50">
        <Icon :icon="expanded ? 'chevron-down' : 'chevron-right'" class="shrink-0 text-neutral-400" :size="12"/>
        <span class="truncate" :class="stat.level === 1 ? 'ui-section-title mt-1 first:mt-0' : 'text-sm font-medium text-neutral-600'">{{ stat.name }}</span>
      </button>
      <div v-show="expanded" :style="{'padding-left': stat.level > 0 ? '10px' : '0px'}">
        <StatSelectOptionNode v-for="child in orderedChildren" :key="child.fullName" :selected-stat="selectedStat" :stat="child" :search-query="searchQuery" @select-stat="emit('select-stat', $event)" @hover-stat="emit('hover-stat', $event)"/>
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