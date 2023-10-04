<template>
  <section class="my-20">
    <Headline>Summary</Headline>
    <p class="text-2xl text-archstats-primary-100 leading-10">Your project <span class="text-archstats-primary-500 font-semibold"
                                                          v-if="store.getProjectPrefixIfAny">{{ store.getProjectPrefixIfAny }}</span>
      has <span class="text-archstats-primary-500 font-semibold">{{ summary["component_count"].toLocaleString() }}</span>
      components, <span class="text-archstats-primary-500 font-semibold ">{{ summary["file_count"].toLocaleString() }}</span> files
      and <span
          class="text-archstats-primary-500 font-semibold">{{ summary["line_count"].toLocaleString() }}</span> lines of code.</p>

  </section>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import Headline from "~/components/ui/Headline.vue";

const store = useDataStore();

const summary = computed(() => store.getView("summary").reduce((acc: any, item: any) => {
      acc[item.name] = item.value;
      return acc;
    }, {})
)
</script>
