<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-10 shrink-0 items-center gap-3 px-4 hairline-b">
      <span class="ui-toolbar-meta flex items-center gap-1.5">
        <span>Cycles <span class="font-mono text-neutral-800">{{ formatNumber(selected.length) }}</span></span>
        <span class="text-neutral-300">·</span>
        <span>Components <span class="font-mono text-neutral-800">{{ formatNumber(participants.length) }}</span></span>
      </span>
      <button v-if="withComponent" type="button" class="ui-chip is-active font-mono" title="Showing only the cycles these two share" @click="setWith(null)">
        with {{ short(withComponent) }}<Icon icon="x" :size="11" class="ml-1 text-neutral-500"/>
      </button>
      <button v-if="selectedCut" type="button" class="ui-chip is-active font-mono" title="Showing the tangle with this import removed" @click="selectedIndex = null">
        cut {{ short(selectedCut.from) }} → {{ short(selectedCut.to) }}<Icon icon="x" :size="11" class="ml-1 text-neutral-500"/>
      </button>
      <router-link :to="`/views/components/cycles?component=${encodeURIComponent(name)}`" class="ui-btn ui-btn-sm ml-auto">
        <Icon icon="route" :size="13" class="text-neutral-500"/><span>Open in Cycles</span>
      </router-link>
    </div>

    <EmptyState
      v-if="mine.length === 0"
      title="Not part of any cycle"
      :text="`${short(name)} does not appear in any dependency cycle in this snapshot. Its dependencies flow one way.`"
      icon="route"
    />
    <div v-else class="min-h-0 grow overflow-y-auto">
      <p class="px-4 pt-3 text-base text-neutral-700">{{ lede }}</p>

      <!-- The tangle itself. Everything below is a way of reading it. -->
      <section class="px-4 pt-2">
        <CycleMap
          class="mx-auto max-w-[720px]"
          :centre="name"
          :centre-label="centreLabel"
          :nodes="mapNodes"
          :edges="mapEdges"
          :dimmed-edges="dimmedEdges"
          :dimmed-nodes="dimmedNodes"
          :cut-edge="selectedCut ? edgeKey(selectedCut.from, selectedCut.to) : null"
          :selected-node="withComponent || null"
          @select-cut="toggleCut"
          @select-node="toggleWith"
        />

        <p class="mx-auto max-w-[720px] px-1 text-sm text-neutral-600">
          Every line is one import. The <span class="text-accent-700">bold ones</span> are worth removing, and the number on each says how
          many of these {{ formatNumber(selected.length) }} cycles it breaks. The faint lines are the rest of the imports these cycles run
          through — all {{ formatNumber(mapEdges.length) }} of them, between {{ centreLabel }} and the {{ formatNumber(participants.length) }} components around it.
        </p>

        <!-- A ring component, once chosen, says what can be done with it. -->
        <div v-if="withComponent" class="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 hairline">
          <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="withComponent">{{ short(withComponent) }}</span>
          <span class="shrink-0 text-sm text-neutral-500">shares {{ formatNumber(selected.length) }} of {{ formatNumber(mine.length) }} cycles</span>
          <router-link :to="componentPath(withComponent)" class="ui-btn ui-btn-sm ml-auto shrink-0">
            <Icon icon="arrow-up-right" :size="13" class="text-neutral-500"/><span>Open</span>
          </router-link>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="setWith(null)">
            <Icon icon="x" :size="13" class="text-neutral-500"/><span>Clear</span>
          </button>
        </div>
      </section>

      <!-- Where to cut: the decision the map is arguing for. -->
      <section v-if="plan.length > 0" class="mt-5 px-4">
        <div class="flex items-baseline justify-between gap-4">
          <h3 class="ui-section-title">Where to cut</h3>
          <span class="text-sm text-neutral-500">{{ planLede }}</span>
          <button type="button" class="ui-btn ui-btn-sm ml-auto shrink-0" title="Open this plan in the Connections sandbox: every cut as an edit, with the tangles and coupling that result" @click="tryInSandbox">Try in the sandbox</button>
        </div>
        <p class="mt-1.5 max-w-[92ch] text-sm text-neutral-500">
          A cycle breaks if you remove any one import in it. These are chosen greedily: the import that appears in the most
          still-standing cycles first, ties going to the one with fewest references to rewrite, repeated until every listed
          cycle is gone.
        </p>
        <p v-if="verdict" class="mt-1.5 max-w-[92ch] text-base" :class="completion.clear ? 'text-neutral-700' : 'text-amber-700'">{{ verdict }}</p>

        <!-- Column names, so no number on this page is unlabelled. -->
        <div class="mt-3 flex items-center gap-3 px-3 pb-1 text-xs text-neutral-500">
          <span class="w-4 shrink-0"></span>
          <span class="min-w-0 grow">Import to remove</span>
          <span class="hidden w-[150px] shrink-0 sm:block"></span>
          <span class="w-[104px] shrink-0 text-right">Cycles it breaks</span>
          <span class="w-[150px] shrink-0 text-right">Work to remove it</span>
          <span class="w-[76px] shrink-0 text-right">Still looping</span>
        </div>

        <ol class="overflow-hidden rounded-lg hairline">
          <li v-for="(step, i) in fullPlan" :key="`${step.from}-${step.to}`" class="hairline-b last:border-b-0">
            <div v-if="step.beyondListed && i === plan.length" class="bg-ground px-3 py-1.5 text-xs text-neutral-500 hairline-b">
              Beyond the listed cycles — each of these was found by looking for a loop that survived the cuts above
            </div>
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-neutral-50"
              :class="{ 'bg-accent-50': selectedIndex === i }"
              :aria-pressed="selectedIndex === i"
              @click="toggleCut(i)"
            >
              <span class="w-4 shrink-0 text-right font-mono text-xs text-neutral-400">{{ i + 1 }}</span>
              <span class="flex min-w-0 grow items-center gap-2">
                <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="step.from">{{ short(step.from) }}</span>
                <span class="shrink-0 text-sm text-neutral-500">imports</span>
                <span class="min-w-0 truncate font-mono text-sm text-neutral-900" :title="step.to">{{ short(step.to) }}</span>
              </span>
              <span class="hidden w-[150px] shrink-0 items-center sm:flex">
                <span class="h-1 w-full overflow-hidden rounded-full bg-neutral-100">
                  <span class="block h-full rounded-full bg-accent-500" :style="{ width: `${Math.round((step.breaks / Math.max(1, selected.length)) * 100)}%` }"></span>
                </span>
              </span>
              <span
                class="w-[104px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500"
                :title="step.beyondListed ? `Found in a loop of ${step.loopSize} components that survived the cuts above` : `Removing this import destroys ${step.breaks} of the ${selected.length} cycles`"
              >
                <template v-if="step.beyondListed">a {{ step.loopSize }}-long loop</template>
                <template v-else><span class="text-neutral-800">{{ formatNumber(step.breaks) }}</span> of {{ formatNumber(selected.length) }}</template>
              </span>
              <span class="w-[150px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500" :title="costTitle(step)">
                {{ formatNumber(step.references) }} {{ step.references === 1 ? "ref" : "refs" }}<template v-if="step.sharedCommits">
                  · <span :class="entangled(step) ? 'text-amber-700' : ''">{{ formatNumber(step.sharedCommits) }} shared</span>
                </template>
              </span>
              <span class="w-[76px] shrink-0 text-right font-mono text-xs tabular-nums" :class="step.remaining === 0 && !step.beyondListed ? 'text-green-700' : 'text-neutral-400'">
                {{ step.beyondListed ? "—" : step.remaining === 0 ? "none" : formatNumber(step.remaining) }}
              </span>
            </button>

            <div v-if="selectedIndex === i" class="bg-ground px-3 py-3 hairline-t">
              <LoadingState v-if="cutFilesLoading" text="Reading imports…"/>
              <template v-else>
                <p v-if="cutStory" class="mb-3 max-w-[80ch] text-base text-neutral-700">{{ cutStory }}</p>
                <div class="grid gap-x-8 gap-y-4 md:grid-cols-2">
                  <div v-if="cutDetail.symbols.length > 0" class="min-w-0">
                    <h4 class="ui-label">What to break</h4>
                    <ul class="mt-1.5 flex flex-col">
                      <li v-for="sym in cutDetail.symbols" :key="sym.name" class="flex h-6 items-center gap-3">
                        <span class="min-w-0 truncate font-mono text-sm text-neutral-800" :title="sym.name">{{ sym.name }}</span>
                        <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ sym.files }} {{ sym.files === 1 ? "file" : "files" }}</span>
                      </li>
                    </ul>
                  </div>
                  <div class="min-w-0">
                    <h4 class="ui-label">Where</h4>
                    <p v-if="cutDetail.sites.length === 0" class="mt-1.5 text-sm text-neutral-500">The snapshot records no file-level import for this edge.</p>
                    <ul v-else class="mt-1.5 flex flex-col">
                      <li v-for="site in cutDetail.sites" :key="site.file" class="group flex h-6 items-center gap-3">
                        <router-link :to="`/views/files/${site.file}`" class="min-w-0 truncate font-mono text-sm text-neutral-800 hover:underline" :title="site.file">
                          {{ basename(site.file) }}<span v-if="site.line" class="text-neutral-500">:{{ site.line }}</span>
                          <span class="ml-1.5 text-xs text-neutral-400">{{ dirname(site.file) }}</span>
                        </router-link>
                        <OpenInEditor :file="site.file" :line="site.line || undefined" class="ml-auto opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"/>
                        <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ formatNumber(site.references) }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>
            </div>
          </li>
        </ol>
      </section>

      <!-- The cycles themselves, for when the picture is not enough. -->
      <details class="group mt-6 px-4 pb-8">
        <summary class="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
          <Icon icon="chevron-right" :size="12" class="text-neutral-400 transition-transform duration-200 group-open:rotate-90"/>
          <span>Every cycle</span>
          <span class="font-mono text-xs text-neutral-400">{{ formatNumber(shown.length) }}</span>
        </summary>

        <div class="mt-3 flex h-8 items-center gap-3">
          <label class="flex items-center gap-1.5 text-sm text-neutral-700">
            <input v-model="shortestOnly" type="checkbox" class="ui-check"/>
            Shortest only
          </label>
          <div class="ui-segmented ml-auto" role="group" aria-label="Sort cycles">
            <button v-for="s in sorts" :key="s.id" type="button" :aria-pressed="sortBy === s.id" :title="s.title" @click="sortBy = s.id">{{ s.label }}</button>
          </div>
        </div>

        <EmptyState v-if="shown.length === 0" class="py-8" title="Nothing matches" text="No cycle here matches the current filters." icon="route"/>
        <table v-else class="ui-table mt-1">
          <thead>
            <tr>
              <th class="w-[48px]">Size</th>
              <th>Through <span class="normal-case text-neutral-400">— from {{ centreLabel }} and back</span></th>
              <th class="w-[124px] text-right">Shared commits</th>
              <th class="w-[96px] text-right" :title="severityTitle">Severity</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cycle in shown" :key="cycle.id">
              <td class="is-num">{{ cycle.size }}</td>
              <td class="max-w-0">
                <span class="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                  <span v-if="cycle.through.length === 1" class="ui-tag shrink-0" title="These two import each other">mutual</span>
                  <template v-for="(node, i) in cycle.through" :key="`${cycle.id}-${i}`">
                    <Icon v-if="i !== 0" icon="chevron-right" :size="12" class="shrink-0 text-neutral-300"/>
                    <button
                      type="button"
                      class="font-mono text-sm transition-colors hover:text-neutral-900"
                      :class="node === withComponent ? 'text-accent-700' : 'text-neutral-800'"
                      :title="`${node} — show only the cycles these two share`"
                      @click="toggleWith(node)"
                    >{{ short(node) }}</button>
                  </template>
                </span>
              </td>
              <td class="is-num text-right">{{ cycle.sharedCommits ? formatNumber(cycle.sharedCommits) : "—" }}</td>
              <td class="is-num text-right text-neutral-500">{{ formatNumber(cycle.severity) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSandboxStore } from "~/stores/sandbox"
import OpenInEditor from "~/components/ui/OpenInEditor.vue"
import { TRUSTED_PAIR_SQL } from "~/utils/cochange"
import { componentPath } from "~/utils/routes"
// A component's cycles, drawn rather than listed.
//
// Every cycle leaves this component and returns to it, so the map puts it in
// the middle and rings it with everything its loops pass through. The cut
// plan is the argument the map is making; the table is the evidence, folded
// away until someone wants it.
import { computed, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useAsyncQuery } from "~/composables/useAsyncQuery"
import { formatNumber } from "~/utils/format"
import { sqlIn, sqlLiteral } from "~/utils/sql"
import { detectSeparator } from "~/utils/subject"
import { segmentPrefix } from "~/utils/neighbours"
import { cutPlan, cycleCountsByComponent, edgeKey, edgesOf, extendCutPlan, lineOf, participantsOf, pathWithout, symbolOwner, type CutStep, type CyclePath, type Digraph } from "~/utils/cycles"
import CycleMap, { type MapEdge, type MapNode } from "~/components/component/CycleMap.vue"
import EmptyState from "~/components/ui/common/EmptyState.vue"
import LoadingState from "~/components/ui/common/LoadingState.vue"
import Icon from "~/components/ui/common/Icon.vue"

type SortKey = "severity" | "size" | "sharedCommits"

const route = useRoute()
const router = useRouter()
const store = useDataStore()

const name = computed(() => String(route.params.name ?? ""))

const separator = computed(() => detectSeparator(store.allComponents.map((c: any) => c.name)))
const sharedPrefix = computed(() => segmentPrefix(store.getProjectPrefixIfAny, separator.value))
function short(componentName: string): string {
  const prefix = sharedPrefix.value
  if (!prefix || !componentName.startsWith(prefix)) return componentName
  return componentName.slice(prefix.length) || componentName
}
/** Short enough for the middle of the map. */
const centreLabel = computed(() => {
  const label = short(name.value)
  if (!separator.value) return label
  const parts = label.split(separator.value).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : label
})

// ── Filters, both of which the map drives ──────────────────────────
const withComponent = computed(() => String(route.query.with ?? ""))
function setWith(other: string | null) {
  const query = { ...route.query }
  if (other) query.with = other; else delete query.with
  void router.replace({ query })
}
const toggleWith = (other: string) => setWith(other === withComponent.value ? null : other)

const shortestOnly = ref(false)
const sortBy = ref<SortKey>("severity")
const selectedIndex = ref<number | null>(null)
watch([name, withComponent], () => { shortestOnly.value = false; selectedIndex.value = null })

const sorts: Array<{ id: SortKey; label: string; title: string }> = [
  { id: "severity", label: "Severity", title: "Length × shared commits × average hotspot of the components in it" },
  { id: "size", label: "Size", title: "How many components the cycle runs through" },
  { id: "sharedCommits", label: "Shared commits", title: "Commits that touched every component in the cycle" },
]
const severityTitle = "A reading of this view, not the engine: length × (1 + shared commits) × (1 + average hotspot)."

// ── The cycles ─────────────────────────────────────────────────────
const mine = computed<CyclePath[]>(() =>
  (store.allCyclesExpanded as CyclePath[]).filter(c => c.nodes.includes(name.value)))

const selected = computed<CyclePath[]>(() =>
  withComponent.value ? mine.value.filter(c => c.nodes.includes(withComponent.value)) : mine.value)

const participants = computed(() => participantsOf(selected.value, name.value))

// ── The cut plan ───────────────────────────────────────────────────
const referenceIndex = computed(() => {
  const refs = new Map<string, number>()
  for (const c of store.componentConnections as any[]) {
    const key = edgeKey(c.from, c.to)
    refs.set(key, (refs.get(key) ?? 0) + (Number(c.reference_count) || 0))
  }
  return refs
})

const { data: coChange } = useAsyncQuery<Map<string, number>>(
  async () => {
    const names = [name.value, ...participants.value.map(p => p.name)]
    if (names.length < 2 || !store.hasView("git_component_shared_commits")) return new Map()
    const rows = await store.query<{ pair_1: string; pair_2: string; shared_commits: number }>(`
      SELECT pair_1, pair_2, shared_commits FROM git_component_shared_commits
      WHERE pair_1 IN ${sqlIn(names)} AND pair_2 IN ${sqlIn(names)} AND ${TRUSTED_PAIR_SQL}`)
    const out = new Map<string, number>()
    for (const r of rows) {
      const n = Number(r.shared_commits) || 0
      out.set(edgeKey(r.pair_1, r.pair_2), n)
      out.set(edgeKey(r.pair_2, r.pair_1), n)
    }
    return out
  },
  [participants],
  { initial: new Map() },
)

const plan = computed(() => cutPlan(selected.value, {
  references: (from, to) => referenceIndex.value.get(edgeKey(from, to)) ?? 0,
  sharedCommits: (from, to) => coChange.value.get(edgeKey(from, to)) ?? null,
}))

// The snapshot lists only the SHORTEST cycles, so breaking all of them can
// still leave a longer loop standing — measured, it usually does. Check the
// real dependency graph and keep cutting until it is clear.
const digraph = computed<Digraph>(() => {
  const out = new Map<string, Set<string>>()
  for (const c of store.componentConnections as any[]) {
    if (!c.from || !c.to || c.from === c.to) continue
    const tos = out.get(c.from) ?? new Set<string>()
    tos.add(c.to)
    out.set(c.from, tos)
  }
  return out
})

const completion = computed(() => {
  if (withComponent.value || plan.value.length === 0) return { extra: [] as CutStep[], clear: false, checked: false }
  const { extra, clear } = extendCutPlan(digraph.value, name.value, plan.value, {
    references: (from, to) => referenceIndex.value.get(edgeKey(from, to)) ?? 0,
    sharedCommits: (from, to) => coChange.value.get(edgeKey(from, to)) ?? null,
  })
  return { extra, clear, checked: true }
})

const fullPlan = computed(() => [...plan.value, ...completion.value.extra])

const verdict = computed(() => {
  const { extra, clear, checked } = completion.value
  if (!checked) return ""
  if (clear && extra.length === 0) {
    return `Checked against the full dependency graph: with these ${formatNumber(plan.value.length)} removed, no cycle runs through ${centreLabel.value} at all.`
  }
  if (clear) {
    return `Those break every cycle listed here, but the snapshot lists only the shortest ones and longer loops survive them. ${formatNumber(extra.length)} more ${extra.length === 1 ? "cut" : "cuts"}, below, clear the rest — checked against the full dependency graph.`
  }
  return `Those break every cycle listed here, but the snapshot lists only the shortest ones. Longer loops remain beyond the ${formatNumber(extra.length)} further cuts below: this component sits in a tangle deeper than a short plan can undo.`
})

// The plan as sandbox edits: every cut, then Connections with the plan open.
const sandbox = useSandboxStore()
async function tryInSandbox() {
  await sandbox.load()
  sandbox.apply(fullPlan.value.map(step => ({ kind: "cut" as const, from: step.from, to: step.to })))
  void router.push({ path: "/views/connections", query: { level: "components", sandbox: "1" } })
}

const selectedCut = computed(() => (selectedIndex.value === null ? null : fullPlan.value[selectedIndex.value] ?? null))
function toggleCut(i: number) {
  selectedIndex.value = selectedIndex.value === i ? null : i
}

// ── The map ────────────────────────────────────────────────────────
const cutIndexByEdge = computed(() => {
  const map = new Map<string, number>()
  fullPlan.value.forEach((step, i) => map.set(edgeKey(step.from, step.to), i))
  return map
})

function tailOf(componentName: string, segments: number): string {
  const label = short(componentName)
  if (!separator.value) return label
  const parts = label.split(separator.value).filter(Boolean)
  return parts.slice(-segments).join(separator.value)
}

/** The shortest tail that tells the ring's components apart, then elided. */
function ringLabels(names: string[]): Map<string, string> {
  const labels = new Map<string, string>()
  let depth = 2
  let left = names
  while (left.length > 0 && depth <= 5) {
    const at = new Map<string, string[]>()
    for (const componentName of left) {
      const tail = tailOf(componentName, depth)
      at.set(tail, [...(at.get(tail) ?? []), componentName])
    }
    const still: string[] = []
    for (const [tail, owners] of at) {
      if (owners.length === 1) labels.set(owners[0], tail)
      else still.push(...owners)
    }
    left = still
    depth++
  }
  for (const componentName of left) labels.set(componentName, short(componentName))
  for (const [componentName, label] of labels) {
    if (label.length > 20) labels.set(componentName, `…${label.slice(-19)}`)
  }
  return labels
}

const mapNodes = computed<MapNode[]>(() => {
  const labels = ringLabels(participants.value.map(p => p.name))
  return participants.value.map(p => ({ name: p.name, label: labels.get(p.name) ?? short(p.name), cycles: p.count }))
})

const mapEdges = computed<MapEdge[]>(() => {
  const counts = new Map<string, { from: string; to: string; cycles: number }>()
  for (const cycle of selected.value) {
    for (const { from, to } of edgesOf(cycle.nodes)) {
      const key = edgeKey(from, to)
      const seen = counts.get(key)
      if (seen) seen.cycles++
      else counts.set(key, { from, to, cycles: 1 })
    }
  }
  return Array.from(counts.values()).map(e => {
    const cut = cutIndexByEdge.value.get(edgeKey(e.from, e.to)) ?? null
    return { ...e, cut, breaks: cut === null ? undefined : fullPlan.value[cut].breaks || undefined }
  })
})

/** What is left standing once the chosen cut is made. */
const surviving = computed<CyclePath[]>(() => {
  const cut = selectedCut.value
  if (!cut) return selected.value
  const gone = new Set(cut.cycleIds)
  return selected.value.filter(c => !gone.has(c.id))
})

const aliveEdges = computed(() => {
  const alive = new Set<string>()
  for (const cycle of surviving.value) {
    for (const { from, to } of edgesOf(cycle.nodes)) alive.add(edgeKey(from, to))
  }
  return alive
})

const dimmedEdges = computed(() => {
  if (!selectedCut.value) return new Set<string>()
  return new Set(mapEdges.value.map(e => edgeKey(e.from, e.to)).filter(k => !aliveEdges.value.has(k)))
})

const dimmedNodes = computed(() => {
  if (!selectedCut.value) return new Set<string>()
  const alive = new Set(surviving.value.flatMap(c => c.nodes))
  return new Set(mapNodes.value.map(n => n.name).filter(n => !alive.has(n)))
})

// ── What a cut means in the code ───────────────────────────────────
interface CutDetail {
  symbols: Array<{ name: string; files: number }>
  sites: Array<{ file: string; line: number | null; references: number }>
}
const EMPTY_DETAIL: CutDetail = { symbols: [], sites: [] }
const componentNames = computed(() => new Set(store.allComponents.map((c: any) => c.name as string)))

const { data: cutDetail, loading: cutFilesLoading } = useAsyncQuery<CutDetail>(
  async () => {
    const cut = selectedCut.value
    if (!cut) return EMPTY_DETAIL

    const files = await store.query<{ file: string; references: number }>(`
      SELECT file, SUM(reference_count) AS "references"
      FROM ${store.runtimeComponentEdges}
      WHERE "from" = ${sqlLiteral(cut.from)} AND "to" = ${sqlLiteral(cut.to)}
      GROUP BY file ORDER BY "references" DESC LIMIT 40`)
    if (files.length === 0 || !store.hasView("snippets")) {
      return { symbols: [], sites: files.map(f => ({ file: f.file, line: null, references: Number(f.references) || 0 })) }
    }

    const snippets = await store.query<{ file: string; content: string; snippet_type: string; begin_position: string }>(`
      SELECT file, content, snippet_type, begin_position FROM snippets
      WHERE file IN ${sqlIn(files.map(f => f.file))} AND snippet_type LIKE '%import%'`)

    const lines = new Map<string, number>()
    const symbolFiles = new Map<string, Set<string>>()
    for (const row of snippets) {
      if (row.snippet_type === "modularity__component__imports") {
        if (row.content !== cut.to) continue
        const line = lineOf(row.begin_position)
        if (line !== null && !lines.has(row.file)) lines.set(row.file, line)
        continue
      }
      if (symbolOwner(row.content, componentNames.value, separator.value) !== cut.to) continue
      const seen = symbolFiles.get(row.content) ?? new Set<string>()
      seen.add(row.file)
      symbolFiles.set(row.content, seen)
      const line = lineOf(row.begin_position)
      if (line !== null && !lines.has(row.file)) lines.set(row.file, line)
    }

    return {
      symbols: Array.from(symbolFiles, ([symbol, seen]) => ({ name: symbol, files: seen.size }))
        .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)),
      sites: files.map(f => ({ file: f.file, line: lines.get(f.file) ?? null, references: Number(f.references) || 0 })),
    }
  },
  [selectedCut],
  { initial: EMPTY_DETAIL },
)

const ownCommits = computed(() => {
  const c: any = store.allComponentsIndex.get(name.value)
  const n = Number(c?.git__commits__total)
  return Number.isFinite(n) && n > 0 ? n : null
})
function coChangeShare(step: CutStep): number | null {
  if (!step.sharedCommits || !ownCommits.value) return null
  return Math.min(1, step.sharedCommits / ownCommits.value)
}
const entangled = (step: CutStep) => (coChangeShare(step) ?? 0) >= 0.75
function costTitle(step: CutStep): string {
  const refs = `${step.references} import ${step.references === 1 ? "reference" : "references"} to remove`
  const share = coChangeShare(step)
  if (share === null) return refs
  return `${refs}. ${step.sharedCommits} commits touched both — ${Math.round(share * 100)}% of this component's history.`
}

const cutStory = computed(() => {
  const cut = selectedCut.value
  if (!cut) return ""
  const symbols = cutDetail.value.symbols
  const files = cutDetail.value.sites.length
  const importers = `${files} ${files === 1 ? "file imports" : "files import"}`
  const what = symbols.length === 1
    ? `${importers} one name from ${short(cut.to)}: ${symbols[0].name}.`
    : symbols.length > 1
      ? `${importers} ${symbols.length} names from ${short(cut.to)}.`
      : `${importers} ${short(cut.to)}.`
  const share = coChangeShare(cut)
  const together = share !== null && share >= 0.75
    ? ` The two have barely changed apart: ${cut.sharedCommits} of this component's ${ownCommits.value} commits touched both.`
    : ""
  return `${what}${together}`
})

// ── The list ───────────────────────────────────────────────────────
const smallest = computed(() => selected.value.reduce((min, c) => Math.min(min, c.size), Infinity))

const shown = computed(() => {
  let list = selected.value
  if (selectedCut.value) {
    const ids = new Set(selectedCut.value.cycleIds)
    list = list.filter(c => ids.has(c.id))
  }
  if (shortestOnly.value) list = list.filter(c => c.size === smallest.value)
  return [...list]
    .sort((a, b) => {
      if (sortBy.value === "size") return a.size - b.size || b.severity - a.severity
      if (sortBy.value === "sharedCommits") return b.sharedCommits - a.sharedCommits || b.severity - a.severity
      return b.severity - a.severity
    })
    .map(c => ({ ...c, through: pathWithout(c.nodes, name.value) }))
})

// ── The readings, now that the map carries the shape ───────────────
const calibration = computed(() => {
  const counts = cycleCountsByComponent(store.allCyclesExpanded as CyclePath[])
  const total = store.allComponents.length
  if (total < 10) return ""
  const ours = counts.get(name.value) ?? 0
  if (ours <= 0) return ""
  let above = 0, atLeast = 0
  for (const n of counts.values()) { if (n > ours) above++; if (n >= ours) atLeast++ }
  if (above === 0) return atLeast > 1 ? ` — tied for the most tangled component in this snapshot` : " — the most tangled component in this snapshot"
  // Strictly less tangled, components in no cycle included; never "100%",
  // which would count this component against itself.
  const percentile = Math.min(99, Math.floor(((total - atLeast) / total) * 100))
  return percentile >= 50 ? ` — more tangled than ${percentile}% of this codebase` : ""
})

const lede = computed(() => {
  const n = selected.value.length
  if (n === 0) return ""
  if (withComponent.value) {
    return `${formatNumber(n)} of its ${formatNumber(mine.value.length)} cycles also run through ${short(withComponent.value)}.`
  }
  const sizes = selected.value.map(c => c.size)
  const span = Math.min(...sizes) === Math.max(...sizes) ? `${Math.min(...sizes)} components long` : `${Math.min(...sizes)} to ${Math.max(...sizes)} components long`
  return `${formatNumber(n)} ${n === 1 ? "cycle" : "cycles"} through ${formatNumber(participants.value.length)} other ${participants.value.length === 1 ? "component" : "components"}, ${span}${calibration.value}.`
})

const planLede = computed(() => {
  const total = selected.value.length
  if (plan.value.length === 0 || total === 0) return ""
  let covered = 0, taken = 0
  for (const step of plan.value) {
    covered += step.breaks
    taken++
    if (covered >= total * 0.8) break
  }
  // The head of the plan, said as the head: "removing 3 imports destroys 53 of
  // the 66" beside "those break every cycle listed" read as two answers.
  const all = plan.value.length
  if (taken >= all) return `${formatNumber(all)} ${all === 1 ? "import breaks" : "imports break"} all ${formatNumber(total)}`
  return `the first ${formatNumber(taken)} break ${formatNumber(covered)} of the ${formatNumber(total)}; all ${formatNumber(all)} break every one`
})

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? path : path.slice(i + 1)
}
function dirname(path: string): string {
  const i = path.lastIndexOf("/")
  return i === -1 ? "" : path.slice(0, i)
}
</script>
