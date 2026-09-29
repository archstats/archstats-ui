<template>
  <!-- The top of the descent: the whole codebase in one read.
       How the lanes lean on each other, and beside it where each lane lives
       in the folders; under both, the handful of claims worth making, each
       one a way down into its own evidence. Hovering a lane or a link lights
       its files on the map; a folder on the map is a way down too. -->
  <div class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-[1480px] flex-col gap-10 px-8 py-8">
      <p class="max-w-[58ch] text-lg leading-6 text-neutral-800">{{ composition }}</p>

      <div class="flex flex-col gap-10 min-[1080px]:flex-row min-[1080px]:gap-12">
        <section class="min-w-0 shrink-0 min-[1080px]:w-[440px]">
          <h2 class="ui-section-title">How the layers lean</h2>

          <!-- The lanes are this control's output, so the control belongs
               beside them. In the top-right bar alone it read as a setting
               about the app rather than the thing that decides what this
               diagram says. -->
          <label class="mt-2 flex items-center gap-2">
            <span class="shrink-0 text-sm text-neutral-500">Lanes read as</span>
            <select class="ui-input ui-input-sm min-w-0 flex-1" :value="framework" aria-label="Framework"
                    @change="$emit('framework', ($event.target as HTMLSelectElement).value)">
              <option :value="AUTO">Auto · {{ autoLabel }}</option>
              <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </label>
          <p v-if="!detected" class="mt-1.5 flex items-start gap-1.5 text-sm leading-4 text-neutral-500">
            <span class="mt-px shrink-0 text-neutral-400"><Icon icon="info" :size="12"/></span>
            <span>No framework was recognised, so these lanes are folders.
              Naming yours above regroups everything on this screen.</span>
          </p>
          <p class="mb-4 mt-3 max-w-[46ch] text-sm leading-4 text-neutral-500">
            <template v-if="flows.length">
              Stacked so most references run down. Grey follows the grain, red runs back
              against it; width is references. Hover a lane or a link to find it on the map;
              click either to open what it is made of.
            </template>
            <template v-else-if="componentEdgeCount > 0">
              References between modules were not resolved in this snapshot, so no lane can be read against another.
            </template>
            <template v-else>
              No references cross a lane boundary in this snapshot.
            </template>
          </p>
          <StackDiagram
            :floors="floors" :flows="stackFlows" up-label="points up"
            figure="How the layers lean" aria-label="The lanes as floors, with the references between them"
            @select="onStack" @hover="onStackHover"/>
        </section>

        <section class="flex min-w-0 flex-1 flex-col" aria-label="The codebase by folder">
          <div class="flex h-7 items-center gap-3">
            <h2 class="ui-section-title shrink-0">{{ MAP_TITLE[mapMode] }}</h2>
            <div class="ui-segmented ml-auto shrink-0" role="group" aria-label="Colour the map by">
              <button v-for="m in MAP_MODES" :key="m.id" type="button" :aria-pressed="mapMode === m.id" :title="m.title" @click="$emit('update:mapMode', m.id)">{{ m.label }}</button>
            </div>
          </div>
          <div class="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
            <span v-for="k in legend" :key="k.label" class="flex items-center gap-1.5" :title="k.title">
              <span class="h-2 w-2 rounded-sm" :style="{ background: k.color }"/>{{ k.label }}<span v-if="k.count != null" class="font-mono text-neutral-500">{{ k.count.toLocaleString() }}</span>
            </span>
            <button v-if="mapMode !== 'lane'" type="button" class="ml-auto text-neutral-600 underline underline-offset-2 hover:text-neutral-900" @click="$emit('evidence')">Open the list</button>
          </div>
          <div class="mt-2 h-[480px] rounded-md ring-1 ring-neutral-200">
            <FolderMap
              :files="files" :lines="lines" :paint="paint" :highlight="lit ? highlightFor(lit) : null"
              :describe="describe"
              :aria-label="`Every file by folder, coloured by ${MAP_MODES.find(m => m.id === mapMode)?.label.toLowerCase()}`"
              @select="(path, kind) => path && $emit('place', path, kind)" @open="$emit('open-file', $event)"
            />
          </div>
        </section>
      </div>

      <section>
        <h2 class="ui-section-title mb-1">What it says</h2>
        <ul class="grid grid-cols-1 gap-x-12 min-[1080px]:grid-cols-2">
            <li v-for="f in findings" :key="f.id" class="hairline-t">
              <button type="button"
                      class="group -mx-3 block w-full rounded px-3 py-4 text-left transition-colors duration-100 hover:bg-neutral-100"
                      @click="$emit('open', f)">
                <p class="flex items-start gap-2 text-base leading-5 text-neutral-900">
                  <span v-if="f.tone === 'warn'" class="mt-0.5 shrink-0 text-red-500" aria-hidden="true">
                    <Icon icon="alert" :size="14"/>
                  </span>
                  <span class="min-w-0">{{ f.headline }}</span>
                </p>
                <p class="mt-1 max-w-[54ch] text-sm leading-5 text-neutral-500">{{ f.detail }}</p>
                <p class="mt-1.5 flex items-center gap-1 text-sm text-neutral-500 group-hover:text-neutral-900">
                  <span>{{ f.action }}</span>
                  <Icon icon="arrow-right" :size="11"
                        class="transition-transform duration-200 group-hover:translate-x-0.5"/>
                </p>
              </button>
            </li>
        </ul>
        <p v-if="!findings.length" class="py-4 text-base text-neutral-500">
          Nothing stands out in this snapshot. Every module sits on its own.
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import StackDiagram, { type Floor, type Flow as StackFlow, type StackSelection } from "~/features/checks/components/StackDiagram.vue"
import FolderMap from "~/features/checks/components/FolderMap.vue"
import { stackOrder } from "~/features/checks/folderTree"
import { AUTO, type LaneColor } from "~/features/frameworks/frameworkProfiles"
import type { LaneFlow as Flow } from "~/features/units/graph"
import type { Finding } from "~/features/units/findings"

const props = defineProps<{
  frameworkName: string
  moduleCount: number
  unitCount: number
  edgeCount: number
  /** Component-level imports, passed when module references resolved to none despite them. */
  componentEdgeCount?: number
  lanes: Array<{ id: string; label: string; color: LaneColor; count: number }>
  flows: Flow[]
  findings: Finding[]
  framework: string
  autoLabel: string
  detected: boolean
  profiles: Array<{ id: string; label: string }>
  /** The modules, by path, that the folder map draws. */
  files: string[]
  lines: ReadonlyMap<string, number>
  paint: (file: string) => string
  describe: (file: string) => string
  /** The files a hovered lane or link stands for. */
  highlightFor: (on: { lane: string } | { a: string; b: string }) => Set<string>
  /** Lanes that are not layers (what matched no rule, what is defined by being referenced): never red. */
  notLayers: string[]
  mapMode: "lane" | "reach" | "dupes"
  legend: Array<{ label: string; color: string; count?: number; title?: string }>
}>()
const lit = ref<{ lane: string } | { a: string; b: string } | null>(null)
const emit = defineEmits<{
  (e: "update:mapMode", mode: "lane" | "reach" | "dupes"): void
  (e: "evidence"): void
  (e: "place", path: string, kind: "file" | "folder"): void
  (e: "open-file", path: string): void
  (e: "open", finding: Finding): void
  (e: "framework", value: string): void
  (e: "lane", id: string): void
  (e: "flow", a: string, b: string): void
}>()

const MAP_MODES = [
  { id: "lane", label: "Lane", title: "Each file in its lane's colour" },
  { id: "reach", label: "Reach", title: "Whether an entry point reaches each file" },
  { id: "dupes", label: "Duplicates", title: "Files that declare a name another file declares, or share a file name" },
] as const
const MAP_TITLE = { lane: "Where each lane lives", reach: "What the entry points reach", dupes: "What is written twice" }

// The lanes as floors, stacked so that most references run down. A profile
// lists its lanes in the order a request travels (Django: views, models,
// forms), which is not the order they depend in: forms use models. Lanes
// that are not layers sit at the bottom, outside the stack's argument.
const laneColour = (c: LaneColor) => (c === "neutral" ? "rgb(var(--c-neutral-400))" : `rgb(var(--c-${c}-500))`)
const ordered = computed(() => {
  const outside = new Set(props.notLayers)
  const layers = props.lanes.filter((l) => !outside.has(l.id))
  const pairs = props.flows.flatMap((f) => [{ from: f.from, to: f.to, count: f.count }, { from: f.to, to: f.from, count: f.reverse }])
  const byId = new Map(props.lanes.map((l) => [l.id, l]))
  return [...stackOrder(layers.map((l) => l.id), pairs).map((id) => byId.get(id)!), ...props.lanes.filter((l) => outside.has(l.id))]
})
const floors = computed<Floor[]>(() => ordered.value.map((l) => ({
  id: l.id, label: l.label, weight: l.count, color: laneColour(l.color),
  sub: `${l.count.toLocaleString()} module${l.count === 1 ? "" : "s"}`,
})))
const stackFlows = computed<StackFlow[]>(() => {
  const outside = new Set(props.notLayers)
  const label = (id: string) => props.lanes.find((l) => l.id === id)?.label ?? id
  const one = (from: string, to: string, count: number, bad: boolean): StackFlow => ({
    key: `${from}>${to}`, from, to, count, bad,
    title: `${label(from)} uses ${label(to)}: ${count.toLocaleString()} reference${count === 1 ? "" : "s"}${bad ? ", against the grain" : ""}`,
  })
  // Red is what Units has always called wrong: the minority direction of a
  // pair that leans both ways, between two lanes that are layers.
  return props.flows.flatMap((f) => [
    ...(f.count ? [one(f.from, f.to, f.count, false)] : []),
    ...(f.reverse ? [one(f.to, f.from, f.reverse, !outside.has(f.from) && !outside.has(f.to))] : []),
  ])
})
const toLit = (s: StackSelection) => {
  if (!s) return null
  if (s.kind === "floor") return { lane: s.id }
  const [a, b] = s.id.split(">")
  return { a, b }
}
function onStackHover(s: StackSelection) { lit.value = toLit(s) }
function onStack(s: StackSelection) {
  if (!s) return
  if (s.kind === "floor") emit("lane", s.id)
  else { const [a, b] = s.id.split(">"); emit("flow", a, b) }
}

/**
 * What this codebase is, as a sentence rather than a row of statistics.
 *
 * It has to read for a Java repo where every module holds exactly one unit,
 * and for a snapshot that recorded no dependencies at all.
 */
const composition = computed(() => {
  const n = (x: number) => x.toLocaleString()
  // "An ASP.NET Core codebase", not "A ASP.NET": by the sound of the first
  // letter, which for these names is the letter itself.
  const article = props.frameworkName && /^[AEIOU]/i.test(props.frameworkName) ? "An" : "A"
  const what = props.frameworkName ? `${article} ${props.frameworkName} codebase` : "This codebase"
  const size = props.unitCount > props.moduleCount
    ? `${n(props.moduleCount)} files holding ${n(props.unitCount)} declared things`
    : `${n(props.moduleCount)} files`
  const ties = props.edgeCount > 0
    ? `${n(props.edgeCount)} references run between them.`
    : (props.componentEdgeCount ?? 0) > 0
      ? `References between them were not resolved in this snapshot, though the component graph has ${n(props.componentEdgeCount ?? 0)} connections, so only their contents can be read here. Connections has the component graph.`
      : "None of them import each other in this snapshot, so only their contents can be read."
  return `${what} of ${size}. ${ties}`
})
</script>
