<template>
  <!-- Code health in three parts: how much is unhealthy, the components that
       score lowest, and the files that do. Colour only says the health band. -->
  <section v-if="health.mean !== null" class="ui-panel mt-6 p-5" aria-labelledby="health-title">
    <div class="flex items-baseline gap-3">
      <h2 id="health-title" class="ui-panel-title"><MetricHint id="codesmells__code_health">{{ t('overview.healthPanel.title') }}</MetricHint></h2>
      <span class="min-w-0 truncate text-sm text-neutral-500">{{ t('overview.healthPanel.lede') }}</span>
      <router-link :to="link" class="ml-auto shrink-0 text-sm text-neutral-500 hover:text-neutral-900">{{ t('overview.healthPanel.open') }}</router-link>
    </div>

    <div class="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-0">
      <!-- How much -->
      <div class="lg:pr-8">
        <HealthFigure :facts="facts"/>
      </div>

      <!-- The components that score lowest -->
      <div v-if="lowComponents.length" class="lg:px-8 lg:hairline-l">
        <h3 class="text-base font-medium text-neutral-900">{{ t('overview.healthPanel.componentsTitle') }}</h3>
        <p class="text-sm text-neutral-500">{{ t('overview.healthPanel.componentsNote') }}</p>
        <ul class="mt-4 flex flex-col gap-3">
          <li v-for="c in lowComponents" :key="c.key">
            <div class="flex items-baseline gap-3 text-sm">
              <router-link :to="c.to" class="min-w-0 truncate text-neutral-800 hover:text-neutral-950 hover:underline" :title="c.title">{{ c.label }}</router-link>
              <span class="ml-auto w-8 text-right font-medium tabular-nums" :class="levelTextClass(healthLevel(c.health))">{{ formatHealth(c.health) }}</span>
            </div>
            <div class="mt-1.5 h-1 rounded-full bg-neutral-100"><div class="h-full rounded-full" :class="levelDotClass(healthLevel(c.health))" :style="{ width: c.health * 10 + '%' }"></div></div>
          </li>
        </ul>
        <button v-if="detail.components.length > SHOWN" type="button" class="mt-3 text-sm text-neutral-500 hover:text-neutral-900" @click="allComponents = !allComponents">
          {{ allComponents ? t('overview.healthPanel.showFewer') : t('overview.healthPanel.showMore') }}
        </button>
      </div>

      <!-- The files that score lowest -->
      <div v-if="lowFiles.length" class="lg:pl-8 lg:hairline-l">
        <h3 class="text-base font-medium text-neutral-900">{{ t('overview.healthPanel.filesTitle') }}</h3>
        <p class="text-sm text-neutral-500">{{ t('overview.healthPanel.filesNote') }}</p>
        <ul class="mt-4 flex flex-col gap-3">
          <li v-for="f in lowFiles" :key="f.key">
            <div class="flex items-baseline gap-3 text-sm">
              <router-link :to="f.to" class="min-w-0 truncate text-neutral-800 hover:text-neutral-950 hover:underline" :title="f.title">{{ f.label }}</router-link>
              <span class="ml-auto w-8 text-right font-medium tabular-nums" :class="levelTextClass(healthLevel(f.health))">{{ formatHealth(f.health) }}</span>
            </div>
            <div class="mt-1.5 h-1 rounded-full bg-neutral-100"><div class="h-full rounded-full" :class="levelDotClass(healthLevel(f.health))" :style="{ width: f.health * 10 + '%' }"></div></div>
          </li>
        </ul>
        <button v-if="detail.files.length > SHOWN" type="button" class="mt-3 text-sm text-neutral-500 hover:text-neutral-900" @click="allFiles = !allFiles">
          {{ allFiles ? t('overview.healthPanel.showFewer') : t('overview.healthPanel.showMore') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import MetricHint from "~/features/snapshot/components/MetricHint.vue";
import HealthFigure from "./HealthFigure.vue";
import { HEALTH_THRESHOLDS, formatHealth, healthLevel, levelDotClass, levelTextClass } from "~/features/metrics/useHealth";
import { metricsPath } from "~/features/metrics/link";
import { distinctTails } from "~/features/metrics/plotReading";
import { componentPath, filePath } from "~/features/navigation/routes";
import { healthDetail, healthReading, type OverviewFacts } from "~/features/overview/findings";
import { t } from "~/shared/i18n";

const props = defineProps<{ facts: OverviewFacts }>();

const link = metricsPath({ grain: "files", view: "table", sort: "codesmells__code_health", ascending: true });

const health = computed(() => healthReading(props.facts.files));

const detail = computed(() => healthDetail(props.facts.files));
const tails = computed(() => distinctTails(props.facts.components.map((c) => c.name)));
// Five of each, and up to fifteen on "Show more".
const SHOWN = 5, MORE = 15;
const allComponents = ref(false), allFiles = ref(false);
const lowComponents = computed(() => detail.value.components.slice(0, allComponents.value ? MORE : SHOWN).map((c) => ({
  key: c.component, to: componentPath(c.component), title: c.component, label: tails.value.get(c.component) ?? c.component, health: c.health,
})));
// Files by name alone; the path is in the tooltip and the link.
const lowFiles = computed(() => detail.value.files.slice(0, allFiles.value ? MORE : SHOWN).map((f) => ({
  key: f.name, to: filePath(f.name), title: f.name, label: f.name.split("/").pop() ?? f.name, health: f.health ?? 0,
})));
</script>
