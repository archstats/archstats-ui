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
            name="Walker"
            path="/views/components/walker"
            image="/img/component-walker.png"
            description="This view allows you to walk through your components one-by-one in a tree-like manner."
        />
        <ViewCard
            name="Comparison"
            image="/img/component-comparison.png"
            path="/views/components/comparison"
            description="This view allows components to be compared with each other."
        />
        <ViewCard
            name="Matrix"
            path="/views/components/matrix"
            image="/img/matrix.png"
            description="This view shows the connections between components in a matrix."
        />
        <ViewCard
            name="Chord"
            path="/views/components/chord"
            image="/img/chord.png"
            description="This view shows the connections between components in a chord diagram."
        />
        <ViewCard
            name="Clustering"
            path="/views/components/clustering"
            image="/img/chord.png"
            description="Discover natural component clusters via force-directed graph and Louvain community detection."
        />
        <ViewCard
            name="Hotspots"
            path="/views/components/hotspots"
            image="/img/hotspots.png"
            description="This view plots components as a hierarchical treemap to identify architectural hotspots."
        />
        <ViewCard
            name="Cycles"
            path="/views/components/cycles"
            image="/img/hotspots.png"
            description="Identify and break cyclic dependencies. Analyze loops ranked by severity, co-change coupling, and hotspot risk."
        />
        <ViewCard
            name="Plotter"
            path="/views/components/plotter"
            image="/img/plotter.png"
            description="This view plots components in a 4d space."
        />
      </div>
    </main>

    <main>
      <Headline>Git Views</Headline>
      <div class="grid grid-cols-2 gap-16 my-12 ">
        <ViewCard
            name="Coupling"
            path="/views/git/coupling"
            image="/img/chord.png"
            description="Explore logical coupling between components via shared commits using an interactive chord diagram."
        />
        <ViewCard
            name="Churn"
            path="/views/git/churn"
            image="/img/plotter.png"
            description="Analyze component stability by plotting commit frequency (churn) against code health."
        />
        <ViewCard
            name="Timeline"
            path="/views/git/timeline"
            image="/img/hotspots.png"
            description="Track development momentum with a commit activity calendar and monthly additions/deletions chart."
        />
        <ViewCard
            name="Authors"
            path="/views/git/authors"
            image="/img/component-walker.png"
            description="Inspect contributor profiles, timelines, hotspots, and code contribution metrics."
        />
      </div>
    </main>

    <main>
      <Headline>File Views</Headline>
      <div class="grid grid-cols-2 gap-16 my-12 ">
        <ViewCard
            name="Table"
            path="/views/files/table"
            image="/img/matrix.png"
            description="A sortable, paginated metrics grid for browsing file size, complexity, code health, and git activity."
        />
        <ViewCard
            name="Dependencies"
            path="/views/files/dependencies"
            image="/img/chord.png"
            description="Visualize file-to-file import relationships as a dynamic force-directed graph."
        />
        <ViewCard
            name="Treemap"
            path="/views/files/treemap"
            image="/img/hotspots.png"
            description="Explore directory structure hierarchy and files weighted by size and colored by code health."
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
