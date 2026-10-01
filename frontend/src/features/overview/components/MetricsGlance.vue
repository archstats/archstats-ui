<template>
  <section v-if="data.hasData && findings.length" class="ui-panel mt-8 overflow-hidden" aria-labelledby="metrics-glance-title">
    <div class="flex items-baseline gap-3 px-4 pb-2 pt-3 hairline-b">
      <h2 id="metrics-glance-title" class="ui-panel-title">{{ t('overview.metricsGlance.whatMetricsSay') }}</h2>
      <span class="min-w-0 truncate text-sm text-neutral-500">{{ t('overview.metricsGlance.componentsMetrics', { value: rows.length.toLocaleString(intlLocale), metricsLength: metrics.length }) }}<template v-if="scope.isActive">{{ ' ' + t('overview.metricsGlance.within', { scopeLabel: scopeLabel() }) }}</template>{{ t('overview.metricsGlance.factsAboutNumbersWhat') }}</span>
      <router-link to="/views/metrics" class="ml-auto shrink-0 text-sm text-neutral-500 hover:text-neutral-900">{{ t('overview.metricsGlance.openMetrics') }}</router-link>
    </div>
    <MetricFindings :rows="rows" :findings="findings" @go="router.push(metricsPath($event))" @open="router.push(componentPath($event))"/>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import MetricFindings from "~/features/metrics/components/MetricFindings.vue";
import { summarize } from "~/features/metrics/summary";
import { OVERVIEW_METRICS, overviewMetrics } from "~/features/metrics/lab";
import { metricsPath } from "~/features/metrics/link";
import { useDataStore } from "~/features/snapshot/data.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { scopeLabel } from "~/features/groups/scopeSql";
import { componentPath } from "~/features/navigation/routes";
import { t, intlLocale } from "~/shared/i18n";

// The Metrics summary's findings over the components, on the Overview. Each
// one opens Metrics already set up for it, the same as it does from there.

type Row = { name: string; [key: string]: any };

const data = useDataStore();
const scope = useScopeStore();
const router = useRouter();

// The same rows and the same test for a measured metric as the Metrics page,
// so a finding reads the same here as on the page it opens.
const rows = computed<Row[]>(() => (data.allComponents as Row[]).filter((r) => scope.componentInScope(String(r.name))));

// The metrics the summary reads, among those this snapshot measured.
const metrics = computed(() => {
  const sample = (data.allComponents as Row[]).slice(0, 200);
  const have = new Set<string>();
  for (const key of [...OVERVIEW_METRICS, "modularity__coupling__afferent", "modularity__coupling__efferent"]) {
    if (sample.some((r) => typeof r[key] === "number" && Number.isFinite(r[key]))) have.add(key);
  }
  return overviewMetrics(have);
});

const niceName = (k: string) => data.statNiceName(k) || k;
const findings = computed(() => summarize(rows.value, metrics.value, { niceName, noun: t("common.noun.component", { count: 2 }), one: t("common.noun.component", { count: 1 }) }));
</script>
