<template>
  <!-- Code health in two halves: how healthy the code is, and where the
       unhealthy code costs. Debt interest ranks the components and files to fix
       first, each with its health beside it; a snapshot scanned before debt
       interest lists the lowest-scoring instead. Colour only says the health band. -->
  <section v-if="health.mean !== null" class="ui-panel mt-6 p-5" aria-labelledby="health-title">
    <div class="flex items-baseline gap-3">
      <h2 id="health-title" class="ui-panel-title"><MetricHint id="codesmells__code_health">{{ t('overview.healthPanel.title') }}</MetricHint></h2>
      <span class="min-w-0 truncate text-sm text-neutral-500">{{ t('overview.healthPanel.lede') }}</span>
      <router-link :to="link" class="ml-auto shrink-0 text-sm text-neutral-500 hover:text-neutral-900">{{ interest ? t('overview.healthPanel.openInterest') : t('overview.healthPanel.open') }}</router-link>
    </div>

    <div class="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] lg:gap-0">
      <!-- How healthy -->
      <div class="lg:pr-8">
        <HealthFigure :facts="facts"/>
      </div>

      <!-- Where it costs -->
      <div class="lg:pl-8 lg:hairline-l">
        <template v-if="interest">
          <p class="text-base text-neutral-900">
            {{ costs[0] }}<strong class="font-semibold text-red-600 dark:text-red-400">{{ n(interest.halfFiles) }}</strong>{{ costs[1] }}
          </p>
          <p class="mt-0.5 text-sm text-neutral-500"><MetricHint id="codesmells__debt_interest">{{ t('overview.healthPanel.interestNote') }}</MetricHint></p>
        </template>

        <div class="grid gap-8 sm:grid-cols-2" :class="interest ? 'mt-5' : ''">
          <div v-for="list in lists" :key="list.key">
            <div class="flex items-baseline gap-3">
              <h3 class="min-w-0 truncate text-base font-medium text-neutral-900">{{ list.title }}</h3>
              <span class="ml-auto w-12 shrink-0 text-right text-xs text-neutral-500">{{ t('overview.healthPanel.healthColumn') }}</span>
              <span v-if="interest" class="w-14 shrink-0 text-right text-xs text-neutral-500">{{ t('overview.healthPanel.shareColumn') }}</span>
            </div>
            <p v-if="list.note" class="text-sm text-neutral-500">{{ list.note }}</p>
            <ul class="mt-3 flex flex-col gap-3">
              <li v-for="row in list.rows" :key="row.key">
                <div class="flex items-baseline gap-3 text-sm">
                  <router-link :to="row.to" class="min-w-0 truncate text-neutral-800 hover:text-neutral-950 hover:underline" :title="row.title">{{ row.label }}</router-link>
                  <span class="ml-auto w-12 shrink-0 text-right font-medium tabular-nums" :class="row.health === null ? 'text-neutral-400' : levelTextClass(healthLevel(row.health))">{{ row.health === null ? '–' : formatHealth(row.health) }}</span>
                  <span v-if="interest" class="w-14 shrink-0 text-right tabular-nums text-neutral-700">{{ pct(row.share) }}</span>
                </div>
                <div class="mt-1.5 h-1 rounded-full bg-neutral-100"><div class="h-full rounded-full" :class="row.bar" :style="{ width: row.width }"></div></div>
              </li>
            </ul>
            <button v-if="list.more" type="button" class="mt-3 text-sm text-neutral-500 hover:text-neutral-900" @click="list.toggle()">
              {{ list.all ? t('overview.healthPanel.showFewer') : t('overview.healthPanel.showMore') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import MetricHint from "~/features/snapshot/components/MetricHint.vue";
import HealthFigure from "./HealthFigure.vue";
import { formatHealth, healthLevel, levelDotClass, levelTextClass } from "~/features/metrics/useHealth";
import { metricsPath } from "~/features/metrics/link";
import { distinctTails } from "~/features/metrics/plotReading";
import { componentPath, filePath } from "~/features/navigation/routes";
import { healthDetail, healthReading, interestReading, pct, type OverviewFacts } from "~/features/overview/findings";
import { intlLocale, t } from "~/shared/i18n";

const props = defineProps<{ facts: OverviewFacts }>();

const health = computed(() => healthReading(props.facts.files));
const interest = computed(() => interestReading(props.facts.files));
const detail = computed(() => healthDetail(props.facts.files));

const link = computed(() => interest.value
  ? metricsPath({ grain: "files", view: "table", sort: "codesmells__debt_interest" })
  : metricsPath({ grain: "files", view: "table", sort: "codesmells__code_health", ascending: true }));

const n = (v: number) => v.toLocaleString(intlLocale);
// The sentence with its count in bold, in whatever order the language puts them.
const costs = computed<[string, string]>(() => {
  const r = interest.value;
  if (!r) return ["", ""];
  const [before, after = ""] = t("overview.healthPanel.costs", { count: r.halfFiles, n: "\u0000", total: n(r.fileCount) }).split("\u0000");
  return [before, after];
});

const tails = computed(() => distinctTails(props.facts.components.map((c) => c.name)));
const componentLabel = (name: string) => tails.value.get(name) ?? name;
// Every component's health, small ones included: a list by debt interest can name any.
const componentHealth = computed(() => new Map(healthDetail(props.facts.files, 1, 1).components.map((c) => [c.component, c.health])));
const fileHealth = computed(() => new Map(props.facts.files.map((f) => [f.name, f.health])));

// Five of each, and up to fifteen on "Show more".
const SHOWN = 5, MORE = 15;
const allComponents = ref(false), allFiles = ref(false);

interface Row { key: string; to: string; title: string; label: string; health: number | null; share: number; width: string; bar: string }

const lists = computed(() => {
  const r = interest.value;
  const take = (all: boolean) => (all ? MORE : SHOWN);
  let components: Row[], files: Row[], componentCount: number, fileCount: number;
  if (r) {
    // Bars are each share against the first; colour stays with the health column.
    const shareRows = (rows: typeof r.files, all: boolean, row: (name: string) => Omit<Row, "share" | "width" | "bar">) =>
      rows.slice(0, take(all)).map((x) => ({ ...row(x.name), share: x.share, width: `${(x.share / rows[0].share) * 100}%`, bar: "bg-neutral-400" }));
    components = shareRows(r.components, allComponents.value, (name) => ({ key: name, to: componentPath(name), title: name, label: componentLabel(name), health: componentHealth.value.get(name) ?? null }));
    files = shareRows(r.files, allFiles.value, (name) => ({ key: name, to: filePath(name), title: name, label: name.split("/").pop() ?? name, health: fileHealth.value.get(name) ?? null }));
    componentCount = r.components.length; fileCount = r.files.length;
  } else {
    const d = detail.value;
    const healthRow = (h: number) => ({ share: 0, width: `${h * 10}%`, bar: levelDotClass(healthLevel(h)) });
    components = d.components.slice(0, take(allComponents.value)).map((c) => ({ key: c.component, to: componentPath(c.component), title: c.component, label: componentLabel(c.component), health: c.health, ...healthRow(c.health) }));
    // Files by name alone; the path is in the tooltip and the link.
    files = d.files.slice(0, take(allFiles.value)).map((f) => ({ key: f.name, to: filePath(f.name), title: f.name, label: f.name.split("/").pop() ?? f.name, health: f.health ?? 0, ...healthRow(f.health ?? 0) }));
    componentCount = d.components.length; fileCount = d.files.length;
  }
  return [
    { key: "components", title: r ? t("overview.healthPanel.componentsFirst") : t("overview.healthPanel.componentsTitle"), note: r ? "" : t("overview.healthPanel.componentsNote"),
      rows: components, more: componentCount > SHOWN, all: allComponents.value, toggle: () => { allComponents.value = !allComponents.value; } },
    { key: "files", title: r ? t("overview.healthPanel.filesFirst") : t("overview.healthPanel.filesTitle"), note: r ? "" : t("overview.healthPanel.filesNote"),
      rows: files, more: fileCount > SHOWN, all: allFiles.value, toggle: () => { allFiles.value = !allFiles.value; } },
  ].filter((l) => l.rows.length);
});
</script>
