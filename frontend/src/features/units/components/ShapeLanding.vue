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
          <!-- The diagram's frame hands its figure up, so the export button ends this heading's row. -->
          <ExhibitFrame title="How the layers lean" header-class="pb-0">
            <template #intro>
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
            </template>
            <StackDiagram
              :floors="floors" :flows="stackFlows" up-label="points up"
              figure="How the layers lean" aria-label="The lanes as floors, with the references between them"
              @select="onStack" @hover="onStackHover"/>
          </ExhibitFrame>
        </section>

        <section class="flex min-w-0 flex-1 flex-col" aria-label="The codebase by folder">
          <ExhibitFrame :title="MAP_TITLE[mapMode]" class="flex-1" header-class="pb-0">
            <template #aside>
              <div class="ui-segmented shrink-0" role="group" aria-label="Colour the map by">
                <button v-for="m in MAP_MODES" :key="m.id" type="button" :aria-pressed="mapMode === m.id" :title="m.title" @click="$emit('update:mapMode', m.id)">{{ m.label }}</button>
              </div>
            </template>
            <template #intro>
              <div class="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
                <span v-for="k in legend" :key="k.label" class="flex items-center gap-1.5" :title="k.title">
                  <span class="h-2 w-2 rounded-sm" :style="{ background: k.color }"/>{{ k.label }}<span v-if="k.count != null" class="font-mono text-neutral-500">{{ k.count.toLocaleString() }}</span>
                </span>
                <button v-if="mapMode !== 'lane'" type="button" class="ml-auto text-neutral-600 underline underline-offset-2 hover:text-neutral-900" @click="$emit('evidence')">Open the list</button>
              </div>
            </template>
            <div class="mt-2 h-[480px] rounded-md ring-1 ring-neutral-200">
              <FolderMap
                :files="files" :lines="lines" :paint="paint" :highlight="lit ? highlightFor(lit) : null"
                :describe="describe" :links-of="linksOf" :bad-link="badLink"
                :aria-label="`Every file by folder, coloured by ${MAP_MODES.find(m => m.id === mapMode)?.label.toLowerCase()}`"
                :figure="MAP_TITLE[mapMode]" :legend="{ items: legend }" :legend-in-ui="false"
                @select="(path, kind) => path && $emit('place', path, kind)" @open="$emit('open-file', $event)"
              />
            </div>
          </ExhibitFrame>
        </section>
      </div>

      <section>
        <h2 class="ui-section-title mb-1">What it says</h2>
        <UnitFindings class="gap-x-12 min-[1080px]:grid-cols-2" :findings="findings" @open="$emit('open', $event)"/>
        <p v-if="!findings.length" class="py-4 text-base text-neutral-500">
          Nothing stands out in this snapshot. Every module sits on its own.
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { computed, ref } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import StackDiagram, { type StackSelection } from "~/features/checks/components/StackDiagram.vue"
import FolderMap from "~/features/checks/components/FolderMap.vue"
import { laneStack } from "~/features/units/stack"
import UnitFindings from "~/features/units/components/UnitFindings.vue"
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
  /** A file's references, drawn when it is hovered on the map. */
  linksOf: (file: string) => { uses: string[]; usedBy: string[] }
  badLink: (from: string, to: string) => boolean
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

const stack = computed(() => laneStack(props.lanes, props.flows, props.notLayers))
const floors = computed(() => stack.value.floors)
const stackFlows = computed(() => stack.value.flows)
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
