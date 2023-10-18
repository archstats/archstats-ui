<template>
  <div class="my-36 container">
    <SummarySection/>
    <main>
      <Headline>Views</Headline>
      <div class="grid grid-cols-2 gap-16 my-12 ">
        <ViewCard
            name="Component Walker"
            path="/views/components/walker"
            image="/img/component-walker.png"
            description="This view allows you to walk through your components one-by-one in a tree-like manner."
        />
        <ViewCard
            name="Component Comparison"
            image="/img/component-comparison.png"
            path="/views/components/comparison"
            description="This view allows components to be compared with each other."
        />
        <ViewCard
            name="Component Matrix"
            path="/views/components/matrix"
            image="/img/matrix.png"
            description="This view shows the connections between components in a matrix."
        />
        <ViewCard
            name="Component Chord"
            path="/views/components/chord"
            image="/img/chord.png"
            description="This view shows the connections between components in a chord diagram."
        />
        <ViewCard
            name="Component Plotter"
            path="/views/components/plotter"
            image="/img/plotter.png"
            description="This view plots components in a 4d space."
        />
        <ViewCard
            name="Distance to Main Sequence"
            path="/views/components/distance-main-sequence"
            image="/img/distance-main-sequence.png"
            description="This view shows the distance of components to the main sequence."
        />

      </div>
    </main>

  </div>


</template>
<script setup lang="ts">
import Headline from "~/components/ui/Headline.vue";
import ViewCard from "~/components/ViewCard.vue";
import SummarySection from "~/components/SummarySection.vue";

const select = ref(null);
const options = [
  {name: 'Component Walker', value: 'Component Walker'},
  {name: 'Component Comparison', value: 'Component Comparison'},
  {name: 'Component Matrix', value: 'Component Matrix'},
  {name: 'Component Chord', value: 'Component Chord'},
  {name: 'Component Plotter', value: 'Component Plotter'},
  {name: 'Distance to Main Sequence', value: 'Distance to Main Sequence'},
];


definePageMeta({
  layout: "has-data-layout",
  middleware: [
    "redirect-if-no-data"
  ]
})
</script>
<style>
body {
  @apply bg-white
}
</style>
