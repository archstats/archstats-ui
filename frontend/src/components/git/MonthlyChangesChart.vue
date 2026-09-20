<template>
  <div ref="hostRef" class="w-full">
    <svg ref="svgRef" class="block w-full" :style="{ height: height + 'px' }" role="img" aria-label="Monthly additions and deletions"></svg>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import * as d3 from "d3"
import type { GitCommit } from "~/utils/git"
import { chartTheme, useChartTheme } from "~/composables/useChartTheme"
import { formatSigned } from "~/utils/format"

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

const tickLabel = d3.timeFormat("%b %y")
const titleLabel = d3.timeFormat("%B %Y")

function draw() {
  const svg = svgRef.value
  const host = hostRef.value
  if (!svg || !host) return
  const t = chartTheme()
  const width = host.clientWidth
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
  const maxVal = d3.max(data, d => Math.max(d.additions, d.deletions)) || 1
  const y = d3.scaleLinear().domain([-maxVal, maxVal]).range([innerH, 0]).nice()

  const g = sel.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

  const bars = g.selectAll("g.month").data(data).join("g").attr("class", "month")
  bars.append("title").text(d => `${titleLabel(d.date)}: ${formatSigned(d.additions)} / ${formatSigned(-d.deletions)}`)
  bars.append("rect")
    .attr("x", d => x(d.key)!)
    .attr("width", x.bandwidth())
    .attr("y", d => y(d.additions))
    .attr("height", d => Math.max(0, y(0) - y(d.additions)))
    .attr("fill", t.green)
    .attr("rx", 1)
  bars.append("rect")
    .attr("x", d => x(d.key)!)
    .attr("width", x.bandwidth())
    .attr("y", y(0))
    .attr("height", d => Math.max(0, y(-d.deletions) - y(0)))
    .attr("fill", t.red)
    .attr("rx", 1)

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
</script>
