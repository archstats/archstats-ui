<template>
  <div
    v-if="visible && coverage"
    class="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-neutral-100 px-4 py-1.5 text-sm text-neutral-800"
    role="status"
  >
    <Icon icon="alert" :size="13" class="shrink-0 text-neutral-500"/>
    <p class="min-w-0 flex-1 truncate" :title="detail">
      <span class="font-medium text-neutral-900">{{ t('snapshot.importCoverageBar.importDataCoversCode', { analysed: fmt(coverage.analysed), files: fmt(coverage.files) }) }}</span>{{ " " }}
      <span class="text-neutral-600">{{ t('snapshot.importCoverageBar.noneDependenciesCyclesRules', { phrase, missingVerb }) }}</span>
    </p>
    <router-link to="/views/snapshot#coverage" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0">{{ t('snapshot.importCoverageBar.coverage') }}</router-link>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" :aria-label="t('snapshot.importCoverageBar.dismissScan')" :title="t('snapshot.importCoverageBar.dismissScan')" @click="dismiss">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useDataStore } from "../data.store";
import { useImportCoverage } from "../useImportCoverage";
import { coverageGapMatters, gapPhrase } from "../coverage";
import { t, intlLocale } from "~/shared/i18n";

// Said once per scan, above every view: a graph that silently leaves out a
// language answers every structural question with confidence it has not
// earned. The detail lives on About this snapshot.

const store = useDataStore();
const { data: coverage } = useImportCoverage();
const dismissed = ref(new Set<string>());
const visible = computed(() => !!coverage.value && coverageGapMatters(coverage.value) && !dismissed.value.has(String(store.datasetKey)));
const phrase = computed(() => (coverage.value ? gapPhrase(coverage.value) : ""));
const missingVerb = computed(() => {
  const c = coverage.value;
  return c && c.files - c.analysed === 1 ? "has" : "have";
});
const detail = computed(() => (coverage.value?.byExtension ?? []).map(r => t("snapshot.importCoverageBar.importData", { extension: r.extension, analysed: r.analysed, files: r.files })).join("\n"));
const fmt = (n: number) => n.toLocaleString(intlLocale);
function dismiss() { dismissed.value = new Set([...dismissed.value, String(store.datasetKey)]); }
</script>
