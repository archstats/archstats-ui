<template>
  <ExhibitFrame :exhibit="figure">
    <div ref="hostRef" class="w-full">
      <svg ref="svgRef" class="block w-full" :style="{ height: height + 'px' }" role="img" :aria-label="t('git.monthlyChangesChart.monthlyAdditionsDeletions')"></svg>
    </div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { REPORT_FIGURE_WIDTH, useSvgFigure } from "~/features/export/useExportables"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as d3 from "d3"
import type { GitCommit } from "~/features/git/git"
import { chartTheme, useChartTheme } from "~/shared/ui/useChartTheme"
import { formatSigned } from "~/shared/format"
import { t } from "~/shared/i18n"

// Diverging bars per month: additions up, deletions down. Shared by Activity
// (full height) and the Overview activity panel (compact).
const props = withDefaults(defineProps<{
  commits: GitCommit[]
  height?: number
}>(), { height: 140 })

const hostRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const { version } = useChartTheme()

interface MonthBucket { key: string; date: Date; additions: number; deletions: number }

function buckets(): MonthBucket[] {
  const byMonth = new Map<string, MonthBucket>()
  let first: Date | null = null
  let last: Date | null = null
  for (const c of props.commits) {
    const d = new Date(c.commit_time)
    if (Number.isNaN(d.getTime())) continue
    const month = new Date(d.getFullYear(), d.getMonth(), 1)
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`
    const b = byMonth.get(key) ?? { key, date: month, additions: 0, deletions: 0 }
    b.additions += Number(c.additions) || 0
    b.deletions += Number(c.deletions) || 0
    byMonth.set(key, b)
    if (!first || month < first) first = month
    if (!last || month > last) last = month
  }
  if (!first || !last) return []
  // Every month between the first and last commit gets a slot, so a quiet
  // quarter reads as a gap rather than being squeezed out of the axis.
  const out: MonthBucket[] = []
  const cur = new Date(first)
  while (cur <= last) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`
    out.push(byMonth.get(key) ?? { key, date: new Date(cur), additions: 0, deletions: 0 })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

/**
 * The top of the scale. One huge month (an import, a vendored library) used
 * to flatten every other bar into the axis; past three times the 95th
 * percentile the scale stops there and the big months are cut and labelled.
 */
function scaleTop(data: MonthBucket[]): { value: number; clipped: boolean } {
  const values = data.flatMap(d => [d.additions, d.deletions]).filter(v => v > 0).sort((a, b) => a - b)
  const max = values[values.length - 1] ?? 1
  const p95 = d3.quantileSorted(values, 0.95) ?? max
  return max > 3 * p95 && p95 > 0 ? { value: p95 * 1.5, clipped: true } : { value: max, clipped: false }
}

// "Dec 08" read as the eighth of December; the apostrophe makes it a year.
const tickLabel = d3.timeFormat("%b ’%y")
const titleLabel = d3.timeFormat("%B %Y")

/** Draws at the host's width, or at `at` (a report page's width, for export). */
function draw(at: number | null = null) {
  const svg = svgRef.value
  const host = hostRef.value
  if (!svg || !host) return
  const t = chartTheme()
  const width = at ?? host.clientWidth
  const height = props.height
  const sel = d3.select(svg)
  sel.selectAll("*").remove()
  if (width <= 0) return
  sel.attr("viewBox", `0 0 ${width} ${height}`)

  const data = buckets()
  if (data.length === 0) return

  const margin = { top: 4, right: 8, bottom: 18, left: 40 }
  const innerW = Math.max(0, width - margin.left - margin.right)
  const innerH = Math.max(0, height - margin.top - margin.bottom)

  const x = d3.scaleBand<string>().domain(data.map(d => d.key)).range([0, innerW]).padding(0.25)
  const top = scaleTop(data)
  const y = d3.scaleLinear().domain([-top.value, top.value]).range([innerH, 0]).nice()
  const [lo, hi] = y.domain()
  const clip = (v: number) => Math.min(v, hi)

  const g = sel.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

  const bars = g.selectAll("g.month").data(data).join("g").attr("class", "month")
  bars.append("title").text(d => `${titleLabel(d.date)}: ${formatSigned(d.additions)} / ${formatSigned(-d.deletions)}`)
  bars.append("rect")
    .attr("x", d => x(d.key)!)
    .attr("width", x.bandwidth())
    .attr("y", d => y(clip(d.additions)))
    .attr("height", d => Math.max(0, y(0) - y(clip(d.additions))))
    .attr("fill", t.green)
    .attr("rx", 1)
  bars.append("rect")
    .attr("x", d => x(d.key)!)
    .attr("width", x.bandwidth())
    .attr("y", y(0))
    .attr("height", d => Math.max(0, y(Math.max(-d.deletions, lo)) - y(0)))
    .attr("fill", t.red)
    .attr("rx", 1)
  // A month past the scale is cut at its edge, marked with a break, and its total written beside it.
  if (top.clipped) {
    const cut = data.filter(d => d.additions > hi || d.deletions > -lo)
    for (const d of cut) {
      const cx = x(d.key)! + x.bandwidth() / 2
      for (const [v, edge, dy] of [[d.additions, hi, -1], [d.deletions, -lo, 1]] as const) {
        if (v <= edge) continue
        const yy = dy < 0 ? y(hi) + 5 : y(lo) - 5
        g.append("line").attr("x1", cx - 4).attr("x2", cx + 4).attr("y1", yy + 2).attr("y2", yy - 2).attr("stroke", t.surface).attr("stroke-width", 2)
        g.append("text").attr("x", cx + x.bandwidth() / 2 + 3).attr("y", dy < 0 ? y(hi) + 9 : y(lo) - 2)
          .attr("font-size", "10px").attr("font-family", t.fontMono).attr("fill", t.inkSecondary)
          .text(d3.format("~s")(v))
      }
    }
  }

  g.append("line")
    .attr("x1", 0).attr("x2", innerW).attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", t.hairlineStrong).attr("stroke-width", 1)

  // Roughly one x label per 64px, always including the first month.
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 64))))
  const xTicks = data.filter((_, i) => i % every === 0).map(d => d.key)
  const byKey = new Map(data.map(d => [d.key, d.date]))
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(xTicks).tickSize(0).tickPadding(6).tickFormat(k => tickLabel(byKey.get(k)!)))
    .call(a => a.select(".domain").remove())
    .call(a => a.selectAll("text").attr("fill", t.inkSecondary).attr("font-size", "11px").attr("font-family", t.fontSans))

  const yTicks = Math.max(2, Math.floor(innerH / 36))
  g.append("g")
    .call(d3.axisLeft(y).ticks(yTicks).tickSize(0).tickPadding(6).tickFormat(v => {
      const n = Math.abs(Number(v))
      return n >= 1000 ? `${d3.format("~s")(n)}` : String(n)
    }))
    .call(a => a.select(".domain").remove())
    .call(a => a.selectAll("text").attr("fill", t.inkSecondary).attr("font-size", "11px").attr("font-family", t.fontMono))
}

let ro: ResizeObserver | null = null
onMounted(() => {
  draw()
  ro = new ResizeObserver(() => draw())
  if (hostRef.value) ro.observe(hostRef.value)
})
onBeforeUnmount(() => ro?.disconnect())
watch([() => props.commits, () => props.height, version], () => draw(), { flush: "post" })

const figure = useSvgFigure({
  title: t("git.monthlyChangesChart.linesAddedRemovedMonth"),
  svg: () => svgRef.value,
  exportWidth: REPORT_FIGURE_WIDTH,
  relayout: width => draw(width),
  legend: () => {
    const theme = chartTheme()
    return {
      items: [{ label: t("git.monthlyChangesChart.linesAdded"), color: theme.green }, { label: t("git.monthlyChangesChart.linesRemoved"), color: theme.red }],
      notes: [t("git.monthlyChangesChart.oneBarPerMonth2")],
    }
  },
})
</script>
