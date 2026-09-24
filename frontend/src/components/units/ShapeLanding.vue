<template>
  <!-- The top of the descent: the whole codebase in one read.
       A picture of how the lanes lean on each other, and beside it the
       handful of claims worth making, each one a way down into its own
       evidence. Nothing here is a number waiting to be interpreted. -->
  <div class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-[1180px] flex-col gap-10 px-8 py-8">
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
              Thickness is how many references, the arrow the direction most run, red
              how much runs the other way. Hover a lane or a link to isolate it; click
              either to open what it is made of.
            </template>
            <template v-else-if="componentEdgeCount > 0">
              References between modules were not resolved in this snapshot, so no lane can be read against another.
            </template>
            <template v-else>
              No references cross a lane boundary in this snapshot.
            </template>
          </p>
          <LaneFlow :lanes="lanes" :flows="flows"
                    @lane="$emit('lane', $event)" @flow="(a, b) => $emit('flow', a, b)"/>
        </section>

        <section class="min-w-0 flex-1">
          <h2 class="ui-section-title mb-1">What it says</h2>
          <ul class="divide-y divide-neutral-200">
            <li v-for="f in findings" :key="f.id">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Icon from "~/components/ui/common/Icon.vue"
import LaneFlow from "~/components/units/LaneFlow.vue"
import { AUTO, type LaneColor } from "~/utils/javaFrameworks"
import type { LaneFlow as Flow } from "~/utils/graph"
import type { Finding } from "~/utils/findings"

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
}>()
defineEmits<{
  (e: "open", finding: Finding): void
  (e: "framework", value: string): void
  (e: "lane", id: string): void
  (e: "flow", a: string, b: string): void
}>()

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
