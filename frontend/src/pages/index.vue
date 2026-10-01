<template>
  <div class="mx-auto w-full max-w-[1200px] px-8 pb-16 pt-7">
    <SummarySection>
      <template #activity>
        <template v-if="gitCommits.length">
          <!-- Small figures in a card: no rows of their own, the export appears over each on hover. -->
          <ExhibitFrame header="overlay">
            <GitActivityChart :end-date="calendarEnd" :start-date="calendarStart" :commits="gitCommits"/>
          </ExhibitFrame>
          <ExhibitFrame header="overlay" class="mt-3">
            <MonthlyChangesChart :commits="gitCommits" :height="96"/>
          </ExhibitFrame>
        </template>
        <p v-else class="py-6 text-sm text-neutral-500">{{ t('pages.index.noGitHistorySnapshot') }}</p>
      </template>
    </SummarySection>

    <Extremes/>

    <MetricsGlance/>

    <!-- Every language declares units now; older snapshots only for Java. -->
    <UnitsGlance v-if="store.hasView('units') || isJavaProject"/>

    <section class="mt-8" aria-labelledby="views-title">
      <h2 id="views-title" class="text-lg font-semibold text-neutral-900">{{ t('pages.index.views') }}</h2>
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
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import Extremes from "~/features/overview/components/Extremes.vue";
import MetricsGlance from "~/features/overview/components/MetricsGlance.vue";
import UnitsGlance from "~/features/overview/components/UnitsGlance.vue";
import { historyAnchor } from "~/features/git/history";
import ViewCard from "~/features/overview/components/ViewCard.vue";
import SummarySection from "~/features/overview/components/SummarySection.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import type { GitCommit } from "~/features/git/git";
import GitActivityChart from "~/features/git/components/GitActivityChart.vue";
import MonthlyChangesChart from "~/features/git/components/MonthlyChangesChart.vue";
import { computed, ref, watch } from "vue";
import { useJavaMetrics } from "~/features/java/useJavaMetrics";
import { t } from "~/shared/i18n";

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
    title: t("pages.index.components"),
    views: [
      { name: t("pages.index.metrics"), path: "/views/metrics", image: "/img/views/table.png", description: t("pages.index.everyMetricEveryComponent") },
      { name: t("pages.index.connections"), path: "/views/connections", image: "/img/views/connections.png", description: t("pages.index.componentFileGroupCoupling") },
      { name: t("pages.index.hotspots"), path: "/views/components/hotspots", image: "/img/views/hotspots.png", description: t("pages.index.unitsPackedSizeHeat") },
      { name: t("pages.index.cycles"), path: "/views/components/cycles", image: "/img/views/cycles.png", description: t("pages.index.cyclicDependenciesRankedSeverity") },
    ],
  },
  {
    title: t("pages.index.git"),
    views: [
      { name: t("pages.index.activity"), path: "/views/git/activity", image: "/img/views/git-timeline.png", description: t("pages.index.whereWorkGoingNow") },
      { name: t("pages.index.authors"), path: "/views/git/authors", image: "/img/views/git-authors.png", description: t("pages.index.whereKnowledgeHasLeft") },
    ],
  },
  // Every language declares units now, not only Java.
  ...(store.hasView("units") || isJavaProject.value ? [{
    title: t("pages.index.code"),
    views: [
      { name: t("pages.index.units"), path: "/views/units", image: "/img/views/java-classes.png", description: t("pages.index.everyNamedThingCodebase") },
    ],
  }] : []),
]);
</script>
