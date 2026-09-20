<template>
  <div class="min-h-0 grow overflow-y-auto">
    <LoadingState v-if="!store.hasData" text="Opening snapshot…"/>
    <div v-else-if="component" class="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <!-- Headline numbers: six cells, one hairline strip. -->
      <StatStrip :cells="strip"/>

      <!-- Where this component stands among all components. -->
      <section class="mt-8" aria-labelledby="rank-title">
        <div class="flex items-baseline justify-between">
          <h3 id="rank-title" class="ui-section-title">Among {{ formatNumber(total) }} components</h3>
          <span class="text-sm text-neutral-500">Rank 1 is the highest value</span>
        </div>
        <table class="ui-table mt-2">
          <thead>
            <tr>
              <th>Metric</th>
              <th class="w-[120px] text-right">Value</th>
              <th class="w-[100px] text-right">Rank</th>
              <th class="w-[200px]">Percentile</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in ranked" :key="row.key">
              <td :title="definitionOf(row.key)">{{ row.label }}</td>
              <td class="is-num text-right">{{ row.value }}</td>
              <td class="is-num text-right">{{ row.rank }} <span class="text-neutral-400">/ {{ total }}</span></td>
              <td>
                <span class="flex items-center gap-2">
                  <span class="h-1 w-full overflow-hidden rounded-full bg-neutral-100">
                    <span class="block h-full rounded-full bg-neutral-500" :style="{ width: `${row.percentile}%` }"></span>
                  </span>
                  <span class="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">{{ row.percentile }}%</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Groups this component belongs to. -->
      <section v-if="groups.length" class="mt-8 hairline-t pt-5" aria-labelledby="groups-title">
        <h3 id="groups-title" class="ui-section-title">Groups</h3>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span v-for="g in groups" :key="g.id" class="ui-chip">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: g.color }"></span>{{ g.name }}
          </span>
        </div>
      </section>

      <!-- Every metric, by family. -->
      <section class="mt-8 hairline-t pt-5" aria-labelledby="metrics-title">
        <h3 id="metrics-title" class="ui-section-title">All metrics</h3>
        <div class="mt-3 grid gap-x-10 gap-y-6 md:grid-cols-2">
          <div v-for="family in families" :key="family.name">
            <h4 class="text-base font-semibold text-neutral-900">{{ family.label }}</h4>
            <dl class="ui-kv mt-2">
              <template v-for="m in family.metrics" :key="m.key">
                <dt :title="definitionOf(m.key)">{{ m.label }}</dt>
                <dd>{{ m.value }}</dd>
              </template>
            </dl>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import StatStrip from "~/components/detail/StatStrip.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useGroupsStore } from "~/stores/groups"
import { formatNumber } from "~/utils/format"
import { healthLevel, hotspotLevel, levelDotClass, formatHealth, formatHotspot, type HealthLevel } from "~/composables/useHealth"

const route = useRoute()
const store = useDataStore()
const groupsStore = useGroupsStore()

const name = computed(() => String(route.params.name ?? ""))
const component = computed<any>(() => store.allComponentsIndex.get(name.value))
const total = computed(() => store.allComponents.length)

const HIDDEN = new Set(["name", "report_id", "timestamp", "connections", "git__repository"])

function raw(key: string): number | null {
  const c = component.value
  if (!c) return null
  const v = c[key]
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function definitionOf(key: string): string {
  const def = store.definitions.get(key)
  return def?.short_description || def?.long_description || ""
}

function label(key: string): string {
  return store.statNiceName(key) || key
}

// The six headline cells, in priority order, from whatever the snapshot has.
const strip = computed(() => {
  const candidates: Array<{ key: string; label: string; value: string; level?: HealthLevel }> = []
  const STRIP_LABELS: Record<string, string> = {
    codesmells__code_health: "Code health", codesmells__hotspot_score: "Hotspot", complexity__lines: "Lines", complexity__files: "Files",
    git__commits__total: "Commits", git__authors__total: "Authors", modularity__instability: "Instability", modularity__coupling__afferent: "Afferent coupling",
  }
  const push = (key: string, format: (n: number) => string, level?: (n: number) => HealthLevel) => {
    const n = raw(key)
    if (n === null) return
    candidates.push({ key, label: STRIP_LABELS[key] ?? label(key), value: format(n), level: level ? level(n) : undefined })
  }
  push("codesmells__code_health", formatHealth, healthLevel)
  push("codesmells__hotspot_score", formatHotspot, hotspotLevel)
  push("complexity__lines", n => formatNumber(n))
  push("complexity__files", n => formatNumber(n))
  push("git__commits__total", n => formatNumber(n))
  push("git__authors__total", n => formatNumber(n))
  push("modularity__instability", n => n.toFixed(2))
  push("modularity__coupling__afferent", n => formatNumber(n))
  return candidates.slice(0, 6)
})

// Rank among all components for the metrics that matter for a first read.
const RANKED_KEYS = [
  "codesmells__hotspot_score", "codesmells__code_health", "complexity__lines", "complexity__files",
  "modularity__coupling__afferent", "modularity__coupling__efferent", "modularity__instability",
  "modularity__abstractness", "modularity__distance_from_main_sequence",
  "graph__page_rank", "graph__betweenness", "cycles__short__count",
  "git__commits__total", "git__authors__total", "git__unique_file_changes__total",
]

const ranked = computed(() => {
  if (!component.value) return []
  const all = store.allComponents as any[]
  return RANKED_KEYS.flatMap(key => {
    const mine = raw(key)
    if (mine === null) return []
    const values = all.map(c => Number(c[key])).filter(n => Number.isFinite(n)).sort((a, b) => b - a)
    if (values.length === 0) return []
    const rank = values.findIndex(v => v <= mine) + 1
    const below = values.filter(v => v < mine).length
    const percentile = Math.round((below / values.length) * 100)
    const value = key === "codesmells__code_health" ? formatHealth(mine)
      : key === "codesmells__hotspot_score" ? formatHotspot(mine)
      : formatNumber(mine, 3)
    return [{ key, label: label(key), value, rank, percentile }]
  })
})

const FAMILY_LABELS: Record<string, string> = {
  complexity: "Complexity", codesmells: "Code smells", modularity: "Modularity", graph: "Graph centrality",
  cycles: "Cycles", git: "Git", java: "Java",
}

const families = computed(() => {
  if (!component.value) return []
  const groups = new Map<string, Array<{ key: string; label: string; value: string }>>()
  for (const key of store.getDistinctComponentColumns) {
    if (HIDDEN.has(key)) continue
    const n = raw(key)
    const family = key.split("__")[0]
    const list = groups.get(family) ?? []
    list.push({ key, label: label(key), value: n === null ? "—" : formatNumber(n, 3) })
    groups.set(family, list)
  }
  const order = Object.keys(FAMILY_LABELS)
  return Array.from(groups.entries())
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
    .map(([familyName, metrics]) => ({ name: familyName, label: FAMILY_LABELS[familyName] ?? familyName, metrics }))
})

const groups = computed(() => groupsStore.componentGroupIndex.get(name.value) ?? [])
</script>
