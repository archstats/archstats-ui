<template>
  <div class="my-36 container ">
    <SummarySection/>
    <main>
      <Headline>Views</Headline>
      <p class="text-gray-400 text-lg">Text for select a view</p>
      <div class="grid gap-16 my-12 ">
        <ViewCard
            name="Component Walker"
            path="/views/component-walker"
            description="This view allows you to walk through your components one-by-one in a tree-like manner."
        />
        <ViewCard
            name="Component Comparison"
            path="/views/component-comparison"
            description="This view allows components to be compared with each other."
        />
        <ViewCard
            name="Distance to Main Sequence"
            path="/views/distance-main-sequence"
            description="This view shows the distance of components to the main sequence."
        />
        <ViewCard
            name="Chord"
            path="/views/chord"
            description="This view shows the connections between components in a chord diagram."
        />
      </div>
    </main>

  </div>


</template>
<script setup lang="ts">
import Headline from "~/components/ui/Headline.vue";
import ViewCard from "~/components/ViewCard.vue";
import SummarySection from "~/components/SummarySection.vue";


definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>