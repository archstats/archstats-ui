<template>
  <!-- Everything else the engine measured, at the foot of the Overview. -->
  <details v-if="extraStats.length > 0" class="group/details rounded-lg hairline">
    <summary class="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-base font-medium text-neutral-800 hover:bg-neutral-50">
      <I18nT k="overview.summarySection.moreMetrics"><template #icon><Icon icon="chevron-right" :size="14" class="text-neutral-400 transition-transform group-open/details:rotate-90"/></template><template #extraStatsLength><span class="ui-tag">{{ extraStats.length }}</span></template></I18nT>
    </summary>
    <dl class="ui-kv gap-y-1.5 px-4 pb-4 pt-2 hairline-t sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:gap-x-6">
      <template v-for="stat in extraStats" :key="stat.key">
        <dt><MetricHint :id="stat.key">{{ stat.label }}</MetricHint></dt>
        <dd>{{ formatStatValue(stat.value) }}</dd>
      </template>
    </dl>
  </details>
</template>

<script setup lang="ts">
import { computed } from "vue"
import MetricHint from "~/features/snapshot/components/MetricHint.vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import Icon from "~/shared/ui/Icon.vue"
import I18nT from "~/shared/ui/I18nT"
import { fixed } from "~/shared/format"
import { intlLocale } from "~/shared/i18n"

const store = useDataStore()

// What the panels above already say; the rest of the summary table is here.
const SHOWN_ABOVE = new Set([
  "component_count", "complexity__files", "complexity__lines", "git__commits__total", "git__authors__total", "version",
  "java__class__declarations", "java__method_declarations", "java__field__declarations", "java__spring__beans",
  "java__spring__request_mappings__total", "java__jpa__entities",
])

const { data: summary } = useAsyncQuery<Array<{ name: string; value: unknown }>>(
  async () => (store.hasData ? await store.getView<any>("summary").catch(() => []) : []),
  [() => store.datasetKey],
  { initial: [] },
)

// Numbers only: a single class name stamped on the whole codebase by an older
// engine read as a metric of it.
const extraStats = computed(() => summary.value
  .filter(r => !SHOWN_ABOVE.has(r.name) && r.value !== null && r.value !== undefined && r.value !== "" && !Number.isNaN(Number(r.value)))
  .map(r => ({ key: r.name, label: store.statNiceName(r.name) || r.name, value: r.value }))
  .sort((a, b) => a.label.localeCompare(b.label)))

function formatStatValue(val: any): string {
  if (val == null || val === "") return "—"
  const n = Number(val)
  if (isNaN(n)) return String(val)
  if (Number.isInteger(n)) return n.toLocaleString(intlLocale)
  return fixed(n, 1)
}
</script>
