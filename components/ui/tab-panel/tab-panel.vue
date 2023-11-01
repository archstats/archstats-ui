<template>
  <div class="border-b-2 border-archstats-500 flex">
    <button v-for="tab of tabs" @click="openTab($event, tab.tabId)"
            class="px-3 py-1  text-lg font-semibold"
            :class="[activeTab === tab.tabId? 'text-archstats-900 border-b-2 border-archstats-900 -mb-0.5 bg-archstats-50 rounded-t-sm': 'text-archstats-500' ]"
    >{{
        tab.title
      }}
    </button>
  </div>


  <div v-for="tab of tabs">
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


const openTab = (event: any, selectedTab: string) => {
  activeTab.value = selectedTab
}

</script>
