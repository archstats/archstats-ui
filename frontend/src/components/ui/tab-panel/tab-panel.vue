
<template>
  <div class="flex gap-4 border-b border-neutral-200" role="tablist">
    <button v-for="tab of tabs" :key="tab.tabId" type="button" role="tab" :aria-selected="activeTab === tab.tabId"
            @click="openTab($event, tab.tabId)"
            class="-mb-px h-9 border-b-2 px-1 text-base font-medium transition-colors"
            :class="activeTab === tab.tabId ? 'border-accent-500 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'"
    >{{ tab.title }}</button>
  </div>

  <div v-for="tab of tabs" :key="'p-' + tab.tabId" role="tabpanel">
    <div v-show="activeTab === tab.tabId">
      <slot :name="tab.tabId"></slot>
    </div>
  </div>
</template>
<script setup lang="ts">
import {ref} from 'vue'

interface TabPanelProps {
  title: string,
  tabId: string,
}

const props = defineProps({
  tabs: {
    type: Array<TabPanelProps>,
    required: true
  },
})

let activeTab = ref(props.tabs[0].tabId)


const openTab = (event: MouseEvent, selectedTab: string) => {
  activeTab.value = selectedTab
}

</script>
