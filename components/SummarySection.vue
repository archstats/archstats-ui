<template>
  <section class="my-20">
    <Headline>Summary</Headline>
    <p class="text-2xl text-archstats-200 leading-10">Your project
      has <span class="text-archstats-500 font-semibold">{{ summary["component_count"].toLocaleString() }}</span>
      components, <span class="text-archstats-500 font-semibold ">{{ summary["complexity__files"].toLocaleString() }}</span>
      files
      and <span
          class="text-archstats-500 font-semibold">{{ summary["complexity__lines"].toLocaleString() }}</span> lines of code.
    </p>

  </section>
</template>
<script setup lang="ts">
import {useDataStore} from "~/stores/data";
import Headline from "~/components/ui/common/Headline.vue";

const store = useDataStore();

const summary = computed(() => store.getView("summary").reduce((acc: any, item: any) => {
      acc[item.name] = item.value;
      return acc;
    }, {})
)
</script>
