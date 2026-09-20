
<template>
  <div class="relative inline-block" tabindex="-1" @focusout="onFocusOut">
    <button type="button" class="ui-btn min-w-[200px] justify-between gap-2 font-normal" :aria-expanded="isDropdownOpen" @click="toggleDropdown">
      <span :class="{ 'text-neutral-400': !modelValue.length }">{{ modelValue.length }} of {{ allRealStats.length }} columns</span>
      <Icon icon="chevron-down" :size="14" class="shrink-0 text-neutral-400"></Icon>
    </button>
    <div v-show="isDropdownOpen" class="ui-popover absolute right-0 top-full z-50 mt-1 max-h-[450px] w-[340px] overflow-y-auto p-2 animate-in">
      <stat-select-multi-node :stat="stats[0]" :selected-stats='renderedSelectedStats' @select-stat="reactToSelect"></stat-select-multi-node>
    </div>
  </div>
</template>
<script setup lang="ts">

import {columnsToStats, getAllDescendants, Stat} from "~/utils/stat-tree";
import StatSelectMultiNode from "~/components/ui/stat-select/StatSelectMultiNode.vue";
import Icon from "~/components/ui/common/Icon.vue";
import StatSelectOptionNode from "~/components/ui/stat-select/StatSelectOptionNode.vue";
import {ref} from "vue";

const props = defineProps<{
  modelValue: string[],
  options: string[],
}>()


const realStats = computed(() => {
  return selectedStats.value.filter(s => {
    const stat = statLookup.value.get(s)
    return stat?.isRealStat ?? false
  })
})

const allRealStats = computed(() => {
  return stats.value.filter(s => s.isRealStat).map(s => s.fullName)
})

const isDropdownOpen = ref(false);

const emit = defineEmits(['update:modelValue'])

const stats = computed(() => {
  return columnsToStats(props.options)
})

const statLookup = computed(() => {
  return stats.value.reduce((acc, stat) => {
    acc.set(stat.fullName, stat)
    return acc
  }, new Map<string, Stat>())
})

const statToParent = computed(() => {
  const lookup = statLookup.value
  const result = new Map<string, Stat>()
  for (const stat of stats.value) {
    if (stat.level === 0) continue;

    const parent = lookup.get(stat.parent)!
    result.set(stat.fullName, parent)
  }
  return result
})


function reactToSelect(stat: string) {
  const isChecked = selectedStats.value?.includes(stat) ?? false

  if (isChecked) {
    uncheck(stat)
  } else {
    check(stat)
  }
}

function check(stat: string) {
  const current = new Set(selectedStats.value)

  const toAdd = stats.value.filter(s => s.fullName.startsWith(stat))
  toAdd.forEach(s => current.add(s.fullName))

  selectedStats.value = Array.from(current)
  emit('update:modelValue', realStats.value)
}


function uncheck(stat: string) {

  const current = new Set(selectedStats.value)

  const toRemove = stats.value.filter(s => s.fullName.startsWith(stat))
  const ancestors = getAncestors(stat).map(s => s.fullName);

  ancestors.forEach(s => current.delete(s))

  toRemove.forEach(s => current.delete(s.fullName))


  selectedStats.value = Array.from(current)
  emit('update:modelValue', realStats.value)
}

function getAncestors(stat: string) {
  const parents: Stat[] = []

  let parent = statToParent.value.get(stat)

  while (parent !== undefined) {
    parents.push(parent)
    parent = statToParent.value.get(parent.fullName)
  }

  return parents
}

const onFocusOut = (e: FocusEvent) => {
  const next = e.relatedTarget as Node | null
  const root = e.currentTarget as HTMLElement
  if (!next || !root.contains(next)) isDropdownOpen.value = false
}

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};


const selectedStats = ref(props.modelValue)

const renderedSelectedStats = computed(() => {
  const toReturn = new Set<string>(selectedStats.value)
  const derived = new Set<string>()

  for (const stat of stats.value) {
    const descendantsThatMatter = getAllDescendants(stat).filter(s => s.isRealStat).map(s => s.fullName)

    if (descendantsThatMatter.length === 0) continue;
    const allDescendantsSelected = descendantsThatMatter.every(d => toReturn.has(d))
    if (allDescendantsSelected) {
      derived.add(stat.fullName)
    }
  }


  return Array.from(toReturn).concat(Array.from(derived))
})


</script>