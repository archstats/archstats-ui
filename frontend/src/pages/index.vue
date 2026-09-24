<template>
  <div class="mx-auto w-full max-w-[1200px] px-8 pb-16 pt-7">
    <SummarySection>
      <template #activity>
        <template v-if="gitCommits.length">
          <GitActivityChart :end-date="calendarEnd" :start-date="calendarStart" :commits="gitCommits"/>
          <MonthlyChangesChart :commits="gitCommits" :height="96" class="mt-3"/>
        </template>
        <p v-else class="py-6 text-sm text-neutral-500">No git history in this snapshot.</p>
      </template>
    </SummarySection>

    <section class="mt-8" aria-labelledby="views-title">
      <h2 id="views-title" class="text-lg font-semibold text-neutral-900">Views</h2>
      <div class="mt-3 grid gap-5 lg:grid-cols-2">
        <div v-for="family in families" :key="family.title" class="ui-panel overflow-hidden">
          <h3 class="ui-section-title px-3 pb-1.5 pt-2.5 hairline-b">{{ family.title }}</h3>
          <div class="divide-y divide-neutral-100">
            <ViewCard v-for="view in family.views" :key="view.path" v-bind="view"/>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { historyAnchor } from "~/utils/history";
import ViewCard from "~/components/ViewCard.vue";
import SummarySection from "~/components/SummarySection.vue";
import { useDataStore } from "~/stores/data";
import type { GitCommit } from "~/utils/git";
import GitActivityChart from "~/components/components/git/git-activity/GitActivityChart.vue";
import MonthlyChangesChart from "~/components/git/MonthlyChangesChart.vue";
import { computed, ref, watch } from "vue";
import { useJavaMetrics } from "~/composables/useJavaMetrics";

const store = useDataStore();
const gitCommits = ref<GitCommit[]>([]);
// The calendar shows the year of work before the last commit. Ending it
// today left a repository that went quiet in 2023 an empty grid.
const calendarEnd = computed(() => {
  let last = 0;
  for (const c of gitCommits.value) { const t = new Date(c.commit_time).getTime(); if (t > last) last = t; }
  return last ? new Date(last) : historyAnchor().date;
});
const calendarStart = computed(() => new Date(calendarEnd.value.getTime() - 365 * 86400000));
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    if (!hasData || !store.hasView("git_commits")) {
      gitCommits.value = [];
      return;
    }
    gitCommits.value = await store.query<GitCommit>(
      `select commit_hash,
              commit_time,
              commit_message,
              author_name,
              author_email,
              count(file)         as files_changed,
              sum(file_additions) as additions,
              sum(file_deletions) as deletions
       from git_commits
       group by commit_hash`
    );
  },
  { immediate: true }
);

const { isJavaProject } = useJavaMetrics();
const families = computed(() => [
  {
    title: "Components",
    views: [
      { name: "Metrics", path: "/views/metrics", image: "/img/views/table.png", description: "Every metric for every component or file, as a table or a plot." },
      { name: "Connections", path: "/views/connections", image: "/img/views/connections.png", description: "Component, file or group coupling as a matrix, a chord diagram or a force graph." },
      { name: "Hotspots", path: "/views/components/hotspots", image: "/img/views/hotspots.png", description: "Units packed by size and heat, at component, directory or file grain." },
      { name: "Cycles", path: "/views/components/cycles", image: "/img/views/cycles.png", description: "Cyclic dependencies ranked by severity and co-change." },
    ],
  },
  {
    title: "Git",
    views: [
      { name: "Activity", path: "/views/git/activity", image: "/img/views/git-timeline.png", description: "Every commit in the snapshot, by month and by author." },
      { name: "Authors", path: "/views/git/authors", image: "/img/views/git-authors.png", description: "Contributors, their hotspots and timelines." },
    ],
  },
  // Every language declares units now, not only Java.
  ...(store.hasView("units") || isJavaProject.value ? [{
    title: "Code",
    views: [
      { name: "Units", path: "/views/units", image: "/img/views/java-classes.png", description: "Every named thing in the codebase — types, functions, modules — with role lanes, seed-and-expand and a path tracer." },
    ],
  }] : []),
]);
</script>
