<template>
  <!-- How far apart the images are: each Dockerfile's final base image, by
       family and version. One bar per version, as long as the Dockerfiles
       that use it; latest and untagged in amber. -->
  <ExhibitFrame :exhibit="figure" header-class="pb-3">
    <template #title>
      <h3 class="flex min-w-0 items-baseline gap-2.5"><span class="text-[15px] font-semibold text-neutral-900">{{ t('cicd.images.baseTitle') }}</span><span class="truncate text-sm text-neutral-600">{{ t('cicd.images.baseWhat') }}</span></h3>
    </template>
  <p v-if="!families.length" class="text-sm text-neutral-600">{{ t('cicd.images.baseNone') }}</p>
  <svg v-else ref="svg" :width="width" :height="height" role="img" :aria-label="t('cicd.images.baseWhat')" :font-family="theme.fontSans">
    <g v-for="(row, i) in rows" :key="row.family" :transform="`translate(0, ${i * ROW})`">
      <text x="0" :y="ROW / 2" dominant-baseline="central" :font-family="theme.fontMono" font-size="11.5" :fill="theme.ink">{{ clip(row.family, 22) }}</text>
      <g v-for="b in row.bars" :key="b.version" class="cursor-pointer" @click="emit('pick', `${row.family}:${b.version}`)">
        <title>{{ t('cicd.images.baseBar', { family: row.family, version: b.version, count: b.count }) }}</title>
        <rect :x="b.x" :y="4" :width="b.w" :height="ROW - 8" rx="2"
          :fill="selected === `${row.family}:${b.version}` ? theme.accentSoft : b.floating ? theme.amberSoft : theme.ground"
          :stroke="selected === `${row.family}:${b.version}` ? theme.accent : b.floating ? theme.amber : theme.hairlineStrong" stroke-width="1"/>
        <text :x="b.x + 6" :y="ROW / 2" dominant-baseline="central" :font-family="theme.fontMono" font-size="11" :fill="theme.ink">{{ clip(b.version, Math.max(3, Math.floor((b.w - 26) / 6.6))) }}</text>
        <text :x="b.x + b.w - 6" :y="ROW / 2" dominant-baseline="central" text-anchor="end" :font-family="theme.fontMono" font-size="11" :fill="theme.inkSecondary">{{ b.count }}</text>
      </g>
    </g>
  </svg>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { chartTheme } from "~/shared/ui/useChartTheme"
import { useSvgFigure } from "~/features/export/useExportables"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import type { BaseFamily } from "../cicd"
import { t } from "~/shared/i18n"

const props = defineProps<{ families: BaseFamily[]; selected: string | null }>()
const emit = defineEmits<{ pick: [key: string] }>()
const svg = ref<SVGSVGElement | null>(null)
const figure = useSvgFigure({
  title: () => t("cicd.images.baseTitle"),
  legend: () => ({ items: [{ label: t("cicd.images.pinnedFloating"), color: chartTheme().amber, mark: "dot" as const }], notes: [t("cicd.images.legendWidth")] }),
  svg: () => svg.value,
})

const theme = computed(() => chartTheme())
const ROW = 28
const LABEL = 170
/** Pixels per Dockerfile: a version used ten times draws ten times as long. */
const UNIT = 22
const MIN = 64

const rows = computed(() => props.families.map(f => {
  let x = LABEL
  const bars = f.versions.map(v => {
    // Long enough for its version and count, then as long as its Dockerfiles.
    const w = Math.max(MIN, v.version.length * 6.8 + 34, v.count * UNIT)
    const bar = { version: v.version, count: v.count, x, w, floating: v.version === "latest" || v.version === "" }
    x += w + 4
    return bar
  })
  return { family: f.family, bars, end: x }
}))
const width = computed(() => Math.max(320, ...rows.value.map(r => r.end)) + 8)
const height = computed(() => rows.value.length * ROW)
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s)
</script>
