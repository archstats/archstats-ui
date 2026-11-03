<template>
  <div class="mx-auto w-full max-w-[1200px] px-8 pb-16 pt-7">
    <SummarySection :facts="facts" :recent-authors="recentAuthors">
      <template #activity>
        <template v-if="gitCommits.length">
          <!-- Small figures in a card: no rows of their own, the export appears over each on hover. -->
          <div ref="calendarHost">
            <ExhibitFrame header="overlay">
              <GitActivityChart :end-date="calendarEnd" :start-date="calendarStart" :commits="gitCommits"/>
            </ExhibitFrame>
          </div>
          <ExhibitFrame header="overlay" class="mt-3">
            <MonthlyChangesChart :commits="gitCommits" :height="110"/>
          </ExhibitFrame>
        </template>
        <p v-else class="py-6 text-sm text-neutral-500">{{ t('pages.index.noGitHistorySnapshot') }}</p>
      </template>
      <template #findings>
        <Findings :items="items" :loading="factsLoading"/>
      </template>
    </SummarySection>

    <!-- Every language declares units now; older snapshots only for Java. -->
    <UnitsGlance v-if="store.hasView('units') || isJavaProject"/>

    <MetricsGlance/>

    <section class="mt-10" aria-labelledby="views-title">
      <h2 id="views-title" class="text-lg font-semibold text-neutral-900">{{ t('pages.index.views') }}</h2>
      <div class="mt-3 grid gap-6 lg:grid-cols-2">
        <div v-for="family in families" :key="family.title" class="ui-panel overflow-hidden">
          <h3 class="ui-section-title px-3 pb-1.5 pt-2.5 hairline-b">{{ family.title }}</h3>
          <div class="divide-y divide-neutral-100">
            <ViewCard v-for="view in family.views" :key="view.path" v-bind="view"/>
          </div>
        </div>
      </div>
    </section>

    <MoreMetrics class="mt-6"/>
  </div>
</template>

<script setup lang="ts">
import Findings from "~/features/overview/components/Findings.vue";
import { findings } from "~/features/overview/findings";
import { useOverviewFacts } from "~/features/overview/useOverviewFacts";
import MetricsGlance from "~/features/overview/components/MetricsGlance.vue";
import UnitsGlance from "~/features/overview/components/UnitsGlance.vue";
import ViewCard from "~/features/overview/components/ViewCard.vue";
import SummarySection from "~/features/overview/components/SummarySection.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import type { GitCommit } from "~/features/git/git";
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import GitActivityChart from "~/features/git/components/GitActivityChart.vue";
import MonthlyChangesChart from "~/features/git/components/MonthlyChangesChart.vue";
import { historyAnchor } from "~/features/git/history";
import MoreMetrics from "~/features/overview/components/MoreMetrics.vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useJavaMetrics } from "~/features/java/useJavaMetrics";
import { t } from "~/shared/i18n";

const store = useDataStore();
const { facts, loading: factsLoading, recentAuthors } = useOverviewFacts();
const items = computed(() => findings(facts.value));
const gitCommits = ref<GitCommit[]>([]);
// The calendar ends at the last commit: ending it today left a repository
// that went quiet in 2023 an empty grid. It shows as many weeks as the panel
// has room for, at most a year; a full year of 16px weeks is wider than the
// panel and scrolled sideways.
const calendarEnd = computed(() => {
  let last = 0;
  for (const c of gitCommits.value) { const t = new Date(c.commit_time).getTime(); if (t > last) last = t; }
  return last ? new Date(last) : historyAnchor().date;
});
const WEEK_PX = 16, DAY_LABELS_PX = 48;
const calendarHost = ref<HTMLElement | null>(null);
const calendarWidth = ref(0);
const calendarWeeks = computed(() => (calendarWidth.value ? Math.max(8, Math.min(53, Math.floor((calendarWidth.value - DAY_LABELS_PX) / WEEK_PX))) : 26));
const calendarStart = computed(() => new Date(calendarEnd.value.getTime() - (calendarWeeks.value * 7 - 1) * 86400000));
let calendarObserver: ResizeObserver | null = null;
onMounted(() => {
  calendarObserver = new ResizeObserver(([entry]) => { calendarWidth.value = Math.floor(entry.contentRect.width); });
  watch(calendarHost, (el, old) => { if (old) calendarObserver?.unobserve(old); if (el) calendarObserver?.observe(el); }, { immediate: true });
});
onBeforeUnmount(() => calendarObserver?.disconnect());
watch(
  () => [store.hasData, store.datasetKey] as const,
  async ([hasData]) => {
    if (!hasData || !store.hasView("git_commits")) {
      gitCommits.value = [];
      return;
    }
    // While one snapshot replaces another, the table list can be the new
    // one's and the data the old one's; a failed read leaves the charts empty
    // rather than raising "Something went wrong".
    try {
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
    } catch {
      gitCommits.value = [];
    }
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
