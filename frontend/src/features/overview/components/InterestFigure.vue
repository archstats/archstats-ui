<template>
  <!-- How few files, and how few components, carry half of the debt interest.
       Each bar is all of it: the files carrying half drawn one slice each,
       largest first, then the rest as one block. Debt interest has no scale
       of its own, so the count is what reads across codebases. Drawn in the
       chart theme's colours so it exports as it shows. -->
  <ExhibitFrame :exhibit="figure" :title="t('overview.interestFigure.rowTitle')">
    <div ref="host" class="w-full">
      <svg v-if="width > 0" ref="svgRef" :width="width" :height="H" :viewBox="`0 0 ${width} ${H}`" class="block" role="img" :aria-label="title"
           :font-family="theme.fontSans">
        <g v-for="(row, r) in rows" :key="row.key" :transform="`translate(0, ${r * ROW_GAP})`">
          <text x="0" y="14" font-size="14" :fill="theme.ink">
            <tspan>{{ row.sentence[0] }}</tspan><tspan font-weight="700" :fill="theme.red">{{ row.count }}</tspan><tspan>{{ row.sentence[1] }}</tspan>
          </text>
          <g :transform="`translate(0, ${BAR_Y})`">
            <rect v-for="(s, i) in row.slices" :key="i" :x="s.x" y="0" :width="s.w" :height="BAR_H" :fill="theme.red"/>
            <rect :x="row.restX" y="0" :width="Math.max(0, width - row.restX)" :height="BAR_H" :fill="theme.hairline"/>
            <!-- Half of the bar, where the slices end or just past it. -->
            <line :x1="width / 2" :x2="width / 2" :y1="-4" :y2="BAR_H + 4" :stroke="theme.ink" stroke-width="1.5"/>
            <text :x="0" :y="BAR_H + 15" font-size="11" font-weight="600" :fill="theme.red">{{ row.headLabel }}</text>
            <text :x="width / 2 + 4" :y="BAR_H + 15" font-size="11" :fill="theme.inkMuted">{{ t('overview.interestFigure.half') }}</text>
            <text :x="width" :y="BAR_H + 15" text-anchor="end" font-size="11" :fill="theme.inkSecondary">{{ row.restLabel }}</text>
          </g>
        </g>
      </svg>
      <p class="mt-2 text-sm leading-5 text-neutral-500">{{ t('overview.interestFigure.note') }}</p>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { useSvgFigure } from "~/features/export/useExportables";
import type { InterestRanked, InterestReading } from "~/features/overview/findings";
import { useChartTheme } from "~/shared/ui/useChartTheme";
import { intlLocale, t } from "~/shared/i18n";

const props = defineProps<{ reading: InterestReading }>();
const { theme } = useChartTheme();

// Each row: its sentence, then the bar with what each part holds under it.
const BAR_Y = 24, BAR_H = 28, ROW_GAP = 90;
// Past this many the slices are thinner than a pixel and draw as one block.
const MAX_SLICES = 200;

const host = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = Math.floor(entry.contentRect.width); });
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());

const title = computed(() => t("overview.interestFigure.title"));
const n = (v: number) => v.toLocaleString(intlLocale);

// A sentence with its count in bold, in whatever order the language puts them.
const sentence = (text: string): [string, string] => {
  const [before, after = ""] = text.split("\u0000");
  return [before, after];
};

const rows = computed(() => {
  const r = props.reading;
  const row = (key: "files" | "components", ranked: InterestRanked[], half: number, total: number) => {
    const head = ranked.slice(0, half);
    let x = 0;
    const slices: Array<{ x: number; w: number }> = [];
    if (half > MAX_SLICES) {
      x = head.reduce((s, h) => s + h.share, 0) * width.value;
      slices.push({ x: 0, w: x });
    } else {
      for (const h of head) {
        const w = h.share * width.value;
        // A gap of the surface between slices wide enough to keep one.
        slices.push({ x, w: Math.max(0.5, w - (w >= 3 ? 1 : 0)) });
        x += w;
      }
    }
    const params = { count: half, n: "\u0000", total: n(total) };
    const text = key === "files" ? t("overview.interestFigure.filesSentence", params) : t("overview.interestFigure.componentsSentence", params);
    const rest = { count: total - half, n: n(total - half) };
    return {
      key, slices, restX: x + 1, count: n(half), sentence: sentence(text),
      headLabel: key === "files" ? t("overview.interestFigure.headFiles", { count: half, n: n(half) }) : t("overview.interestFigure.headComponents", { count: half, n: n(half) }),
      restLabel: key === "files" ? t("overview.interestFigure.restFiles", rest) : t("overview.interestFigure.restComponents", rest),
    };
  };
  const out = [row("files", r.files, r.halfFiles, r.fileCount)];
  if (r.componentCount > 1) out.push(row("components", r.components, r.halfComponents, r.componentCount));
  return out;
});
const H = computed(() => rows.value.length * ROW_GAP - 4);

const figure = useSvgFigure({
  title: () => title.value,
  svg: () => svgRef.value,
  legendInUi: false,
  legend: () => ({
    items: [
      { label: t("overview.interestFigure.legendHalf"), color: theme.value.red },
      { label: t("overview.interestFigure.legendRest"), color: theme.value.hairline },
    ],
    notes: [t("overview.interestFigure.note")],
  }),
});
</script>
