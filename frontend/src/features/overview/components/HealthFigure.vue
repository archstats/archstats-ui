<template>
  <!-- Two sentences, each over its bar: how much of the code is healthy, and
       how much of the change effort goes into code that is not. Change effort
       weighs a file by its size times the commits that changed it, so the gap
       between the two bars is the cost the first average hides. Drawn in the
       chart theme's colours so it exports as it shows. -->
  <ExhibitFrame :exhibit="figure" :title="t('overview.healthFigure.rowTitle')">
    <div ref="host" class="w-full">
      <svg v-if="width > 0" ref="svgRef" :width="width" :height="H" :viewBox="`0 0 ${width} ${H}`" class="block" role="img" :aria-label="title"
           :font-family="theme.fontSans">
        <g v-for="(row, r) in rows" :key="row.key" :transform="`translate(0, ${r * ROW_GAP})`">
          <text x="0" y="14" font-size="14" :fill="theme.ink">
            <tspan>{{ row.sentence[0] }}</tspan><tspan font-weight="700" :fill="color(row.level)">{{ pct(row.share) }}</tspan><tspan>{{ row.sentence[1] }}</tspan>
          </text>
          <g :transform="`translate(0, ${BAR_Y})`">
            <g v-for="s in row.segments" :key="s.level">
              <rect :x="s.x" y="0" :width="s.w" :height="BAR_H" :fill="color(s.level)"/>
              <text v-if="s.w >= 34" :x="s.x + 8" :y="BAR_H / 2 + 4.5" font-size="12" font-weight="600" :fill="theme.surface">{{ pct(s.share) }}</text>
            </g>
            <!-- Too narrow to hold its share: the share sits under it, nudged clear of its neighbour. -->
            <text v-for="o in row.outside" :key="`o${o.level}`" :x="o.x" :y="BAR_H + 13" font-size="11" font-weight="600" :fill="color(o.level)">{{ o.text }}</text>
            <text :x="width" :y="BAR_H / 2 + 7" text-anchor="end" font-size="22" font-weight="700" :fill="color(healthLevel(row.score))">{{ formatHealth(row.score) }}</text>
            <text :x="width" :y="BAR_H + 13" text-anchor="end" font-size="10" :fill="theme.inkMuted">{{ row.average }}</text>
          </g>
        </g>

        <!-- Key -->
        <g v-for="k in key" :key="k.level" :transform="`translate(${k.x}, ${H - 12})`">
          <rect x="0" y="0" width="10" height="10" rx="2" :fill="color(k.level)"/>
          <text x="15" y="9" font-size="11" :fill="theme.inkSecondary">{{ k.label }}</text>
        </g>
      </svg>
      <p v-if="rows.length > 1" class="mt-2 text-sm leading-5 text-neutral-500">{{ t('overview.healthFigure.effortNote') }}</p>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import { useSvgFigure } from "~/features/export/useExportables";
import { HEALTH_THRESHOLDS, formatHealth, healthLevel, levelColor, type HealthLevel } from "~/features/metrics/useHealth";
import { healthDistribution, healthReading, pct, type OverviewFacts } from "~/features/overview/findings";
import { useChartTheme } from "~/shared/ui/useChartTheme";
import { t } from "~/shared/i18n";

const props = defineProps<{ facts: OverviewFacts }>();
const { theme } = useChartTheme();

// Key, then one row per reading: its name on the left, the bar, the score on the right.
// Each row: its sentence, then the bar with the average at its end; the key closes the figure.
const SCORE_W = 84, BAR_Y = 24, BAR_H = 28, ROW_GAP = 82;

const host = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = Math.floor(entry.contentRect.width); });
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());

const title = computed(() => t("overview.healthFigure.title"));
const reading = computed(() => healthReading(props.facts.files));
const dist = computed(() => healthDistribution(props.facts.files));

const BANDS: Array<{ level: "bad" | "warn" | "good"; label: string }> = [
  { level: "bad", label: t("overview.healthFigure.alert", { threshold: HEALTH_THRESHOLDS.warn }) },
  { level: "warn", label: t("overview.healthFigure.watch", { warn: HEALTH_THRESHOLDS.warn, good: HEALTH_THRESHOLDS.good }) },
  { level: "good", label: t("overview.healthFigure.healthy", { threshold: HEALTH_THRESHOLDS.good }) },
];
const color = (level: HealthLevel) => levelColor(level);
// The key's entries one after another, each as wide as its text.
const key = computed(() => {
  let x = 0;
  return BANDS.map((b) => { const at = x; x += 15 + b.label.length * 6.2 + 16; return { ...b, x: at }; });
});

// A sentence with its share in bold, in whatever order the language puts them.
const sentence = (key: string): [string, string] => {
  const [before, after = ""] = t(key, { share: "\u0000" }).split("\u0000");
  return [before, after];
};

const rows = computed(() => {
  const barW = Math.max(0, width.value - SCORE_W);
  const row = (key: "code" | "work", level: "bad" | "good", text: string, average: string, score: number | null) => {
    let x = 0;
    const segments = BANDS.map((b) => {
      const share = dist.value.bands[b.level][key];
      const w = share * barW;
      const seg = { level: b.level, share, x, w: Math.max(0, w - (w > 2 ? 2 : 0)) };
      x += w;
      return seg;
    });
    // Shares of narrow segments, under the bar, each starting clear of the one before.
    let free = -Infinity;
    const outside = segments.filter((seg) => seg.w < 34 && seg.share > 0).map((seg) => {
      const label = pct(seg.share);
      const at = Math.max(seg.x + seg.w / 2 - label.length * 3, free);
      free = at + label.length * 6.4 + 6;
      return { level: seg.level, x: at, text: label };
    });
    return { key, level, share: dist.value.bands[level][key], sentence: sentence(text), average, score: score ?? 0, segments, outside };
  };
  const out = [row("code", "good", "overview.healthFigure.codeSentence", t("overview.healthFigure.average"), reading.value.mean)];
  if (reading.value.worked !== null) out.push(row("work", "bad", "overview.healthFigure.effortSentence", t("overview.healthFigure.average"), reading.value.worked));
  return out;
});
const H = computed(() => rows.value.length * ROW_GAP + 14);

const figure = useSvgFigure({
  title: () => title.value,
  svg: () => svgRef.value,
  legendInUi: false,
  legend: () => ({
    items: [
      { label: t("overview.healthFigure.alert", { threshold: HEALTH_THRESHOLDS.warn }), color: levelColor("bad") },
      { label: t("overview.healthFigure.watch", { warn: HEALTH_THRESHOLDS.warn, good: HEALTH_THRESHOLDS.good }), color: levelColor("warn") },
      { label: t("overview.healthFigure.healthy", { threshold: HEALTH_THRESHOLDS.good }), color: levelColor("good") },
    ],
    notes: [t("overview.healthFigure.effortNote"), t("overview.healthFigure.legendScore")],
  }),
});
</script>
