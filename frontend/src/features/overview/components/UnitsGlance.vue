<template>
  <section v-if="data.hasData && (loading || hasUnits)" class="ui-panel mt-8 overflow-hidden" aria-labelledby="units-glance-title">
    <div class="flex items-baseline gap-3 px-4 pb-2 pt-3 hairline-b">
      <h2 id="units-glance-title" class="ui-panel-title">How the code is layered</h2>
      <span v-if="!loading" class="min-w-0 truncate text-sm text-neutral-500">{{ summary }}</span>
      <router-link to="/views/units" class="ml-auto shrink-0 text-sm text-neutral-500 hover:text-neutral-900">Open Units →</router-link>
    </div>

    <p v-if="loading" class="px-4 py-6 text-sm text-neutral-500">Reading modules…</p>
    <div v-else class="flex flex-col gap-8 px-4 pb-4 pt-3 min-[1080px]:flex-row min-[1080px]:gap-10">
      <div class="min-w-0 shrink-0 min-[1080px]:w-[400px]">
        <StackDiagram :floors="stack.floors" :flows="stack.flows" up-label="points up"
                      figure="How the layers lean" aria-label="The lanes as floors, with the references between them"
                      @select="onStack"/>
        <p class="mt-2 max-w-[46ch] text-sm leading-4 text-neutral-500">
          <template v-if="flows.length">Stacked so most references run down; red runs back against the grain. Click a lane or a link to open what it is made of.</template>
          <template v-else-if="referencesUnresolved">References between modules were not resolved in this snapshot, so no lane can be read against another.</template>
          <template v-else>No references cross a lane boundary in this snapshot.</template>
        </p>
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <h3 class="ui-section-title mb-1">What it says</h3>
        <UnitFindings :findings="shown" @open="open({ finding: $event.id })"/>
        <p v-if="!findings.length" class="py-4 text-base text-neutral-500">Nothing stands out in this snapshot. Every module sits on its own.</p>
        <router-link v-else-if="findings.length > shown.length" to="/views/units" class="pt-3 text-sm text-neutral-500 hairline-t hover:text-neutral-900">
          {{ findings.length - shown.length }} more in Units →
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import StackDiagram, { type StackSelection } from "~/features/checks/components/StackDiagram.vue"
import UnitFindings from "~/features/units/components/UnitFindings.vue"
import { useUnitsReading } from "~/features/units/useUnitsReading"
import { laneStack } from "~/features/units/stack"
import { useDataStore } from "~/features/snapshot/data.store"

// The top of the Units descent on the Overview: how the lanes lean on each
// other, and the first of the findings. Every click lands on the same place
// in Units that the same click there would.

const SHOWN = 4

const data = useDataStore()
const router = useRouter()
const { model, graph, frameworkName, laneBands, flows, notLayers, referencesUnresolved, findings } = useUnitsReading()

const loading = computed(() => model.loading.value)
const hasUnits = computed(() => model.hasUnits.value && !model.error.value)
const stack = computed(() => laneStack(laneBands.value, flows.value, notLayers.value))
const shown = computed(() => findings.value.slice(0, SHOWN))

const summary = computed(() => {
  const n = (x: number) => x.toLocaleString("en-US")
  const modules = graph.value.modules.length, refs = graph.value.edges.length
  const lanes = `${n(laneBands.value.length)} lane${laneBands.value.length === 1 ? "" : "s"}`
  return `${frameworkName.value ? `${frameworkName.value} · ` : "Lanes by folder structure · "}${lanes}, ${n(modules)} module${modules === 1 ? "" : "s"}, ${n(refs)} reference${refs === 1 ? "" : "s"}`
})

function open(query: Record<string, string>) {
  router.push({ path: "/views/units", query })
}

function onStack(s: StackSelection) {
  if (!s) return
  if (s.kind === "floor") open({ lane: s.id })
  else { const [a, b] = s.id.split(">"); open({ flow: `${a},${b}` }) }
}
</script>
