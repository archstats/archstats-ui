<template>
  <div class="h-20 bg-archstats-50 flex px-16 gap-8 items-center justify-between">
    <input placeholder="RegEx Search..." v-model="search" class="w-96 bg-white px-4 py-2 bg-gray-100  box-border border border-archstats-500 rounded font-mono">

    <StatSelectMulti :options="store.getDistinctComponentColumns" v-model="selectedStats"></StatSelectMulti>

  </div>


  <div class="mx-16 mt-8">
    <ElementTable :elements="filteredComponents" :only-show-columns="selectedStats" :selectable-elements="false" :clickable-elements="true" @clickedElement="navToComponent" :max-page-size="20" ></ElementTable>

  </div>

</template>

<script lang="ts" setup>

import {useDataStore} from "~/stores/data";
import SimplePage from "~/components/ui/common/SimplePage.vue";
import ElementTable from "~/components/ui/tables/ElementTable.vue";
import Headline from "~/components/ui/common/Headline.vue";
import {computed, ref} from "vue";
import {RawComponent} from "~/utils/components";
import StatSelectMulti from "~/components/ui/stat-select/StatSelectMulti.vue";

const store = useDataStore();

const router = useRouter()

useSeoMeta({
  title: "Table",
})
definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})

const search = ref("")


const filteredComponents = computed(() => {
  if(!search.value.length) return store.currentComponentScope
  return store.currentComponentScope.filter((c: RawComponent) => {
    // Search name regex
    const reg = new RegExp(search.value, "i")
    return reg.test(c.name)

  })
})


const selectedStats = ref<string[]>(store.getDistinctComponentColumns)

function navToComponent(component: RawComponent) {
  router.push(`/views/components/${component.name}`)
}


</script>