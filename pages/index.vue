<template>
  <div class="my-36 container">
    <CustomSelect :options="options"/>
    <CustomSelect :options="optionsHover">
      <template #optionSlot="{option}">
        <OptionHover :option=option />
      </template>
    </CustomSelect>
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
      </div>
    </main>

  </div>


</template>
<script setup lang="ts">
import Headline from "~/components/ui/Headline.vue";
import ViewCard from "~/components/ViewCard.vue";
import SummarySection from "~/components/SummarySection.vue";
import OptionHover from "~/components/CustomSelect/OptionHover.vue";

const options = [
  {label: 'Component Walker', value: 'Component Walker'},
  {label: 'Component Comparison', value: 'Component Comparison'},
  {label: 'Component Matrix', value: 'Component Matrix'},
  {label: 'Component Chord', value: 'Component Chord'},
  {label: 'Component Plotter', value: 'Component Plotter'},
  {label: 'Distance to Main Sequence', value: 'Distance to Main Sequence'},
];
const optionsHover = [
  {label: 'Component Walker', value: 'Component Walker', extraInfo: 'Niggers'},
  {label: 'Component Comparison', value: 'Component Comparison', extraInfo: 'Second'},
  {label: 'Component Matrix', value: 'Component Matrix', extraInfo: 'Big man flex'},
  {label: 'Component Chord', value: 'Component Chord', extraInfo: 'Cracker'},
  {label: 'Component Plotter', value: 'Component Plotter', extraInfo: 'We bombing shit up'},
  {label: 'Distance to Main Sequence', value: 'Distance to Main Sequence', extraInfo: 'Night night nigga'},
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
