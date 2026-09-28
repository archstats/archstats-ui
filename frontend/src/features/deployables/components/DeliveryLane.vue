<template>
  <!-- How the code gets out: the pipelines that build and ship it, left, the
       environments it runs in, right, in the order a release is promoted.
       Selecting a deployable on the map narrows the lane to its own path;
       picking a pipeline or an environment lights what it ships on the map. -->
  <section class="flex max-h-[42%] min-h-[150px] shrink-0 flex-col bg-surface hairline-t" aria-label="Delivery">
    <div class="flex h-9 shrink-0 items-center gap-3 px-4 hairline-b">
      <h3 class="ui-section-title shrink-0">Delivery</h3>
      <p class="min-w-0 truncate text-xs text-neutral-600">
        <template v-if="focus">
          <span class="font-mono text-neutral-900">{{ focus }}</span>
          <template v-if="focusPipelines.length"> is {{ verbsFor(focus) }} by {{ plural(focusPipelines.length, "pipeline") }}</template>
          <template v-else> has no pipeline in this workspace</template>
          <template v-if="focusEnvs.size">, and runs in {{ plural(focusEnvs.size, "environment") }}</template><template v-else>; no environment names it</template>.
        </template>
        <template v-else-if="roster.acting.length">{{ plural(roster.acting.length, "pipeline") }} build or ship what is on the map<template v-if="envs.length">, into {{ plural(envs.length, "environment") }}</template>. Pick one to see what it ships.</template>
        <template v-else-if="envs.length">No pipeline here builds or ships what is on the map; {{ plural(envs.length, "environment") }} are named by values files and overlays. Pick one to see what runs there.</template>
        <template v-else>No pipeline here builds or ships what is on the map, and no environment is named.</template>
      </p>
      <button v-if="pipeline || environment" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto shrink-0" @click="emit('update:pipeline', null); emit('update:environment', null)">Clear</button>
    </div>

    <div class="grid min-h-0 grow grid-cols-[minmax(0,1fr)_28px_minmax(220px,300px)]">
      <!-- Pipelines -->
      <div class="min-h-0 overflow-y-auto py-1">
        <div class="sticky top-0 z-10 grid h-6 grid-cols-[minmax(0,1fr)_repeat(7,26px)_64px] items-center gap-x-0.5 bg-surface px-4 text-[10px] text-neutral-500">
          <span class="text-[11px]">Pipeline</span>
          <span v-for="s in STAGES" :key="s" class="text-center font-mono" :title="STAGE_LABEL[s]">{{ ABBR[s] }}</span>
          <span class="text-right text-[11px]">{{ focus ? "Does" : "Ships" }}</span>
        </div>
        <p v-if="!shownPipelines.length" class="px-4 py-2 text-sm text-neutral-500">{{ focus ? "No pipeline here builds or deploys it." : "No pipeline here builds or deploys a deployable." }}</p>
        <ul>
          <li v-for="r in shownPipelines" :key="r.pipeline.id">
            <button
              type="button"
              class="grid h-7 w-full grid-cols-[minmax(0,1fr)_repeat(7,26px)_64px] items-center gap-x-0.5 px-4 text-left"
              :class="pipeline === r.pipeline.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'"
              :aria-pressed="pipeline === r.pipeline.id"
              :title="`${r.pipeline.name} · ${SYSTEM_LABEL[r.pipeline.system] ?? r.pipeline.system}\n${r.pipeline.file}${r.pipeline.triggers ? '\nStarts on ' + r.pipeline.triggers : ''}`"
              @click="emit('update:pipeline', pipeline === r.pipeline.id ? null : r.pipeline.id); emit('update:environment', null)"
            >
              <span class="truncate text-sm text-neutral-900">{{ r.pipeline.name }}</span>
              <span v-for="s in STAGES" :key="s" class="mx-auto h-2.5 w-4 rounded-sm" :class="stagesOf(r.pipeline).has(s) ? 'bg-neutral-700' : 'ring-1 ring-inset ring-neutral-200'" :title="`${STAGE_LABEL[s]}: ${stagesOf(r.pipeline).has(s) ? 'yes' : 'not seen'}`"/>
              <span class="truncate text-right font-mono text-[11px] text-neutral-600">{{ focus ? actionFor(r, focus) : shipsCount(r) }}</span>
            </button>
            <div v-if="pipeline === r.pipeline.id" class="flex flex-col gap-1 px-4 pb-2 pl-6 text-xs text-neutral-600">
              <p>
                <template v-for="(a, i) in [...r.actions]" :key="a[0]">{{ i ? "; " : "" }}{{ cap(a[0]) }} {{ plural(a[1].length, "deployable") }}</template><template v-if="r.pipeline.triggers"> · starts on {{ r.pipeline.triggers }}</template>
              </p>
              <p v-for="(t, i) in list(r.pipeline.delegates_to)" :key="t">Hands the work to <span class="font-mono">{{ t }}</span><template v-if="list(r.pipeline.delegates_ref)[i]"> at <span class="font-mono">{{ list(r.pipeline.delegates_ref)[i] }}</span></template>, outside this workspace</p>
              <EvidenceLine :file="r.pipeline.file"/>
            </div>
          </li>
        </ul>
        <p v-if="!focus && roster.idle.length" class="px-4 pb-2 pt-1 text-[11px] text-neutral-500" :title="roster.idle.map(p => p.name).join('\n')">
          {{ plural(roster.idle.length, "more pipeline") }} ship nothing on the map: reviews, scans and housekeeping.
        </p>
      </div>

      <div class="flex items-center justify-center text-neutral-300" aria-hidden="true"><Icon icon="arrow-right" :size="16"/></div>

      <!-- Environments -->
      <div class="min-h-0 overflow-y-auto py-1 pr-4">
        <div class="sticky top-0 z-10 flex h-6 items-center justify-between bg-surface text-[11px] text-neutral-500"><span>Runs in</span><span>Deployables</span></div>
        <p v-if="!envs.length" class="py-2 text-sm text-neutral-500">No values file, overlay or pipeline names an environment.</p>
        <ul>
          <li v-for="e in envs" :key="e.environment">
            <button
              type="button"
              class="flex h-7 w-full items-center gap-2 rounded px-2 text-left"
              :class="[environment === e.environment ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100', focus && !focusEnvs.has(e.environment) ? 'opacity-35' : '']"
              :aria-pressed="environment === e.environment"
              :title="e.pattern ? 'An open-ended set made from one template; the instances cannot be listed from the files' : e.deployables.join(', ')"
              @click="emit('update:environment', environment === e.environment ? null : e.environment); emit('update:pipeline', null)"
            >
              <span class="min-w-0 truncate text-sm text-neutral-900" :class="{ 'italic': e.pattern }">{{ e.environment }}</span>
              <span class="relative ml-auto h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100"><span class="absolute inset-y-0 left-0 rounded-full bg-neutral-500" :style="{ width: Math.round((e.deployables.length / maxEnv) * 100) + '%' }"/></span>
              <span class="w-7 shrink-0 text-right font-mono text-[11px] text-neutral-600">{{ e.deployables.length }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Icon from "~/shared/ui/Icon.vue"
import EvidenceLine from "./EvidenceLine.vue"
import { environmentRoster, list, pipelineRoster, STAGE_LABEL, STAGES, SYSTEM_LABEL, type DeployableModel, type Pipeline } from "../deployables"

const props = defineProps<{
  model: DeployableModel
  /** The deployable selected on the map. */
  focus: string | null
  pipeline: string | null
  environment: string | null
}>()
const emit = defineEmits<{
  (e: "update:pipeline", id: string | null): void
  (e: "update:environment", name: string | null): void
}>()

const ABBR: Record<string, string> = { build: "bld", test: "tst", scan: "scn", package: "pkg", publish: "pub", deploy: "dep", approve: "apr" }
const roster = computed(() => pipelineRoster(props.model))
const envs = computed(() => environmentRoster(props.model))
const maxEnv = computed(() => Math.max(1, ...envs.value.map(e => e.deployables.length)))
const stagesOf = (p: Pipeline) => new Set(list(p.stages))

type Row = ReturnType<typeof pipelineRoster>["acting"][number]
const touches = (r: Row, id: string) => [...r.actions.values()].some(ds => ds.includes(id))
const focusPipelines = computed(() => (props.focus ? roster.value.acting.filter(r => touches(r, props.focus!)) : []))
const focusEnvs = computed(() => new Set(props.focus ? envs.value.filter(e => e.deployables.includes(props.focus!)).map(e => e.environment) : []))
const shownPipelines = computed(() => (props.focus ? focusPipelines.value : roster.value.acting))
const shipsCount = (r: Row) => new Set([...r.actions.values()].flat()).size.toLocaleString("en-US")
const actionFor = (r: Row, id: string) => [...r.actions].filter(([, ds]) => ds.includes(id)).map(([a]) => a).join(", ")
const PAST: Record<string, string> = { builds: "built", deploys: "deployed", publishes: "published", tests: "tested", scans: "scanned" }
function verbsFor(id: string) {
  const verbs = new Set(focusPipelines.value.flatMap(r => [...r.actions].filter(([, ds]) => ds.includes(id)).map(([a]) => a)))
  return [...verbs].map(v => PAST[v] ?? v).join(" and ") || "touched"
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`
</script>
