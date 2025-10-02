<template>
  <div class="my-20 mx-12">
    <SummarySection/>

    <section>
      <Headline>Git activity</Headline>
      <div class="">

        <GitActivityChart

            :end-date="new Date()"
            :commits="gitCommits"
            class="p-8 pb-24"
        ></GitActivityChart>
      </div>

    </section>
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
<!--        <ViewCard-->
<!--            name="Component Chord"-->
<!--            path="/views/components/chord"-->
<!--            image="/img/chord.png"-->
<!--            description="This view shows the connections between components in a chord diagram."-->
<!--        />-->
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
import Headline from "~/components/ui/common/Headline.vue";
import ViewCard from "~/components/ViewCard.vue";
import SummarySection from "~/components/SummarySection.vue";
import {useDataStore} from "~/stores/data";
import GitActivityChart from "~/components/components/git/git-activity/GitActivityChart.vue";

const store = useDataStore();
const gitCommits = computed(() => store.query(
    `select commit_hash,
            commit_time,
            commit_message,
            author_name,
            author_email,
            count(file)         as files_changed,
            sum(file_additions) as additions,
            sum(file_deletions) as deletions
     from git_commits
     group by commit_hash
    `
) as GitCommit[]);
useSeoMeta({
  title: "Home",
})


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
