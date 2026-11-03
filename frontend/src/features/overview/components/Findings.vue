<template>
  <!-- One finding per row, the way "What the metrics say" reads: a small
       figure, the fact in words, what it is about, and the view that shows it. -->
  <section class="ui-panel mt-6 overflow-hidden" aria-labelledby="findings-title">
    <div class="flex items-baseline gap-3 px-4 pb-2 pt-3 hairline-b">
      <h2 id="findings-title" class="ui-panel-title">{{ t('overview.findings.title') }}</h2>
      <span class="min-w-0 truncate text-sm text-neutral-500">{{ t('overview.findings.lede') }}</span>
    </div>

    <p v-if="loading && !items.length" class="px-4 py-6 text-sm text-neutral-500">{{ t('overview.findings.reading') }}</p>
    <p v-else-if="!items.length" class="px-4 py-6 text-sm text-neutral-500">{{ t('overview.findings.none') }}</p>
    <ol v-else class="flex flex-col">
      <li v-for="(f, i) in shown" :key="f.id" class="grid grid-cols-[176px_minmax(0,1fr)_auto] items-center gap-5 px-4 py-4" :class="{ 'hairline-t': i > 0 }">
        <svg :viewBox="`0 0 ${FW} ${FH}`" :width="FW" :height="FH" class="block overflow-visible" aria-hidden="true">
          <template v-if="f.figure.kind === 'share'">
            <text x="0" y="24" font-size="24" font-weight="600" :font-family="theme.fontSans" :fill="theme.ink">{{ pct(f.figure.share) }}</text>
            <text x="0" y="42" font-size="11" :fill="theme.inkMuted">{{ f.figure.caption }}</text>
            <rect x="0" :y="FH - 8" :width="FW" height="6" rx="3" :fill="theme.hairline"/>
            <rect x="0" :y="FH - 8" :width="Math.max(3, f.figure.share * FW)" height="6" rx="3" :fill="theme.ink"/>
          </template>
          <template v-else-if="f.figure.kind === 'stat'">
            <text x="0" y="34" font-size="30" font-weight="600" :font-family="theme.fontSans" :fill="theme.ink">{{ f.figure.value }}</text>
            <text x="0" y="54" font-size="11" :fill="theme.inkMuted">{{ f.figure.caption }}</text>
          </template>
          <template v-else>
            <rect v-for="(b, k) in bars(f.figure)" :key="k" :x="b.x" :y="FH - b.h" :width="b.w" :height="b.h" rx="0.5" :fill="b.hot ? theme.ink : theme.hairlineStrong"/>
          </template>
        </svg>
        <div class="flex min-w-0 flex-col gap-1">
          <p class="text-base font-semibold leading-5 text-neutral-900">{{ f.title }}</p>
          <p class="text-base leading-5 text-neutral-700">{{ f.body }}</p>
          <div v-if="f.evidence.length" class="mt-1 flex flex-wrap gap-1">
            <router-link v-for="e in f.evidence" :key="e.to" :to="e.to" class="ui-tag max-w-[280px] truncate hover:text-neutral-900" :title="e.title">{{ e.label }}</router-link>
          </div>
        </div>
        <router-link v-if="f.open" :to="f.open.to" class="ui-btn ui-btn-sm whitespace-nowrap">
          {{ t('overview.findings.open', { label: f.open.label }) }}<Icon icon="arrow-right" :size="12" class="text-neutral-500"/>
        </router-link>
      </li>
    </ol>
    <div v-if="items.length > SHOWN" class="px-4 py-2 hairline-t">
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="all = !all">
        {{ all ? t('overview.findings.showFewer') : t('overview.findings.showMore', { count: items.length - SHOWN }) }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useChartTheme } from "~/shared/ui/useChartTheme";
import { pct, type Finding, type FindingFigure } from "~/features/overview/findings";
import { t } from "~/shared/i18n";

// The most relevant findings first; the rest one click away.

const SHOWN = 6;
const FW = 176, FH = 64;

const props = defineProps<{ items: Finding[]; loading?: boolean }>();
const { theme } = useChartTheme();
const all = ref(false);
const shown = computed(() => (all.value ? props.items : props.items.slice(0, SHOWN)));

// Every item by value, largest first, binned to at most 60 bars; a bar is
// inked when it holds one of the first `hot` items.
function bars(f: Extract<FindingFigure, { kind: "rank" }>) {
  const n = f.values.length;
  const count = Math.min(n, 60);
  const w = FW / Math.max(count, 12);
  const peak = Math.max(1, f.values[0] ?? 1);
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * n) / count), to = Math.max(from + 1, Math.floor(((i + 1) * n) / count));
    const v = Math.max(...f.values.slice(from, to));
    return { x: i * w + 0.5, w: Math.max(0.8, w - 1), h: Math.max(1, (v / peak) * (FH - 2)), hot: from < f.hot };
  });
}
</script>
