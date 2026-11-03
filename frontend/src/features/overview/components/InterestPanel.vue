<template>
  <!-- Debt interest in three parts: how few carry half of it, and the
       components and files carrying the most. Shares, not values: debt
       interest has no scale of its own. -->
  <section v-if="reading" class="ui-panel mt-6 p-5" aria-labelledby="interest-title">
    <div class="flex items-baseline gap-3">
      <h2 id="interest-title" class="ui-panel-title"><MetricHint id="codesmells__debt_interest">{{ t('overview.interestPanel.title') }}</MetricHint></h2>
      <span class="min-w-0 truncate text-sm text-neutral-500">{{ t('overview.interestPanel.lede') }}</span>
      <router-link :to="link" class="ml-auto shrink-0 text-sm text-neutral-500 hover:text-neutral-900">{{ t('overview.interestPanel.open') }}</router-link>
    </div>

    <div class="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-0">
      <!-- How few carry half -->
      <div class="lg:pr-8">
        <InterestFigure :reading="reading"/>
      </div>

      <!-- The components carrying the most -->
      <div v-if="topComponents.length" class="lg:px-8 lg:hairline-l">
        <h3 class="text-base font-medium text-neutral-900">{{ t('overview.interestPanel.componentsTitle') }}</h3>
        <p class="text-sm text-neutral-500">{{ t('overview.interestPanel.shareNote') }}</p>
        <ul class="mt-4 flex flex-col gap-3">
          <li v-for="c in topComponents" :key="c.key">
            <div class="flex items-baseline gap-3 text-sm">
              <router-link :to="c.to" class="min-w-0 truncate text-neutral-800 hover:text-neutral-950 hover:underline" :title="c.title">{{ c.label }}</router-link>
              <span class="ml-auto shrink-0 text-right font-medium tabular-nums text-neutral-700">{{ pct(c.share) }}</span>
            </div>
            <div class="mt-1.5 h-1 rounded-full bg-neutral-100"><div class="h-full rounded-full bg-red-500" :style="{ width: c.width }"></div></div>
          </li>
        </ul>
        <button v-if="reading.components.length > SHOWN" type="button" class="mt-3 text-sm text-neutral-500 hover:text-neutral-900" @click="allComponents = !allComponents">
          {{ allComponents ? t('overview.healthPanel.showFewer') : t('overview.healthPanel.showMore') }}
        </button>
      </div>

      <!-- The files carrying the most -->
      <div class="lg:pl-8 lg:hairline-l">
        <h3 class="text-base font-medium text-neutral-900">{{ t('overview.interestPanel.filesTitle') }}</h3>
        <p class="text-sm text-neutral-500">{{ t('overview.interestPanel.shareNote') }}</p>
        <ul class="mt-4 flex flex-col gap-3">
          <li v-for="f in topFiles" :key="f.key">
            <div class="flex items-baseline gap-3 text-sm">
              <router-link :to="f.to" class="min-w-0 truncate text-neutral-800 hover:text-neutral-950 hover:underline" :title="f.title">{{ f.label }}</router-link>
              <span class="ml-auto shrink-0 text-right font-medium tabular-nums text-neutral-700">{{ pct(f.share) }}</span>
            </div>
            <div class="mt-1.5 h-1 rounded-full bg-neutral-100"><div class="h-full rounded-full bg-red-500" :style="{ width: f.width }"></div></div>
          </li>
        </ul>
        <button v-if="reading.files.length > SHOWN" type="button" class="mt-3 text-sm text-neutral-500 hover:text-neutral-900" @click="allFiles = !allFiles">
          {{ allFiles ? t('overview.healthPanel.showFewer') : t('overview.healthPanel.showMore') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import MetricHint from "~/features/snapshot/components/MetricHint.vue";
import InterestFigure from "./InterestFigure.vue";
import { metricsPath } from "~/features/metrics/link";
import { distinctTails } from "~/features/metrics/plotReading";
import { componentPath, filePath } from "~/features/navigation/routes";
import { interestReading, pct, type InterestRanked, type OverviewFacts } from "~/features/overview/findings";
import { t } from "~/shared/i18n";

const props = defineProps<{ facts: OverviewFacts }>();

const link = metricsPath({ grain: "files", view: "table", sort: "codesmells__debt_interest" });

const reading = computed(() => interestReading(props.facts.files));
const tails = computed(() => distinctTails(props.facts.components.map((c) => c.name)));
// Five of each, and up to fifteen on "Show more". Bars are against the first.
const SHOWN = 5, MORE = 15;
const allComponents = ref(false), allFiles = ref(false);
const width = (row: InterestRanked, top: InterestRanked) => `${(row.share / top.share) * 100}%`;
const topComponents = computed(() => {
  const rows = reading.value?.components ?? [];
  return rows.slice(0, allComponents.value ? MORE : SHOWN).map((c) => ({
    key: c.name, to: componentPath(c.name), title: c.name, label: tails.value.get(c.name) ?? c.name, share: c.share, width: width(c, rows[0]),
  }));
});
// Files by name alone; the path is in the tooltip and the link.
const topFiles = computed(() => {
  const rows = reading.value?.files ?? [];
  return rows.slice(0, allFiles.value ? MORE : SHOWN).map((f) => ({
    key: f.name, to: filePath(f.name), title: f.name, label: f.name.split("/").pop() ?? f.name, share: f.share, width: width(f, rows[0]),
  }));
});
</script>
