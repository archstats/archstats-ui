<template>
  <!-- One pipeline, or one row of pipelines that do the same thing: what
       starts it, what it does, what it builds or deploys and where, what it
       uses and hands off. Every fact names its file. -->
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-0.5">
      <h2 class="break-words text-base font-medium text-neutral-900">{{ title }}</h2>
      <p class="text-xs text-neutral-500">{{ subtitle }}</p>
      <EvidenceLine v-if="single" :file="single.file"/>
    </div>

    <p class="text-sm text-neutral-600">{{ sentence }}</p>

    <div class="stage-box flex flex-col gap-1">
      <span class="grid text-[10px] text-neutral-500" :style="{ gridTemplateColumns: `repeat(${STAGES.length}, var(--stage-w))` }">
        <span v-for="s in STAGES" :key="s" class="text-center">{{ STAGE_LABEL[s] }}</span>
      </span>
      <StageTrack :stages="stages"/>
      <p v-if="uses.length && single" class="text-xs text-neutral-500">{{ t('deployables.pipelinePanel.includesWhatWorkflowsActions') }}</p>
    </div>

    <div v-if="triggers.length || paths.length">
      <h4 class="ui-label">{{ t('deployables.pipelinePanel.starts') }}</h4>
      <ul class="mt-1 flex flex-col gap-0.5 text-sm text-neutral-800">
        <li v-for="trigger in triggers" :key="trigger">{{ TRIGGER_LABEL[trigger] ?? trigger }}<span v-if="(TRIGGER_LABEL[trigger] ?? trigger) !== trigger" class="ml-2 font-mono text-[11px] text-neutral-500">{{ trigger }}</span></li>
      </ul>
      <p v-if="paths.length" class="mt-1 text-xs text-neutral-600">{{ t('deployables.pipelinePanel.onlyWhenTheseChange') }} <span class="font-mono text-[11px]">{{ paths.join(", ") }}</span></p>
    </div>

    <div v-if="links.length">
      <h4 class="ui-label">{{ t('deployables.pipelinePanel.buildsDeploys') }}</h4>
      <ul class="mt-1 flex flex-col gap-1">
        <li v-for="l in links" :key="l.pipeline + l.deployable + l.action" class="flex flex-col">
          <span class="flex items-baseline gap-2 text-sm">
            <span class="text-xs text-neutral-500">{{ l.action }}</span>
            <button type="button" class="font-mono text-neutral-800 hover:underline" @click="emit('pick-deployable', l.deployable)">{{ l.deployable }}</button>
          </span>
          <EvidenceLine :file="l.file" :line="l.line" :resolution="l.resolution"/>
        </li>
      </ul>
    </div>

    <div v-if="environments.length">
      <h4 class="ui-label" :title="t('deployables.pipelinePanel.namedPipelineJobEnvironment')">{{ t('deployables.pipelinePanel.environmentsNames') }}</h4>
      <ul class="mt-1 flex flex-wrap gap-1"><li v-for="e in environments" :key="e" class="ui-tag">{{ e }}</li></ul>
    </div>

    <div v-if="uses.length">
      <h4 class="ui-label">{{ t('deployables.pipelinePanel.uses') }}</h4>
      <ul class="mt-1 flex flex-col">
        <li v-for="u in uses" :key="u.id" class="flex min-h-7 items-center gap-2">
          <button type="button" class="min-w-0 truncate text-left text-sm text-neutral-800 hover:underline" :title="u.id" @click="emit('pick-pipeline', u.id)">{{ u.name }}</button>
          <span class="shrink-0 text-xs text-neutral-500">{{ u.kind }}</span>
        </li>
      </ul>
    </div>

    <div v-if="usedBy.length">
      <h4 class="ui-label">{{ t('deployables.pipelinePanel.used') }}</h4>
      <ul class="mt-1 flex flex-col">
        <li v-for="u in usedBy" :key="u.id" class="flex min-h-7 items-center">
          <button type="button" class="min-w-0 truncate text-left text-sm text-neutral-800 hover:underline" :title="u.id" @click="emit('pick-pipeline', u.id)">{{ u.name }}</button>
        </li>
      </ul>
    </div>

    <div v-if="delegates.length">
      <h4 class="ui-label" :title="t('deployables.pipelinePanel.templateOutsideWorkspaceDoes')">{{ t('deployables.pipelinePanel.handsOff') }}</h4>
      <ul class="mt-1 flex flex-col gap-1">
        <li v-for="d in delegates" :key="d.target + d.ref" class="flex flex-col text-xs text-neutral-600">
          <span class="break-all font-mono text-[11px] text-neutral-800">{{ d.target }}</span>
          <span v-if="d.ref">{{ t('deployables.pipelinePanel.at') }} <span class="font-mono">{{ d.ref }}</span> · {{ PIN_TITLE[pinOf(d.ref)] }}</span>
        </li>
      </ul>
    </div>

    <div v-if="tools.length">
      <h4 class="ui-label">{{ t('deployables.pipelinePanel.toolsRuns') }}</h4>
      <ul class="mt-1 flex flex-wrap gap-1"><li v-for="tool in tools" :key="tool" class="ui-tag">{{ tool }}</li></ul>
    </div>

    <div v-if="members.length > 1">
      <h4 class="ui-label">{{ t('deployables.pipelinePanel.pipelines', { membersLength: members.length }) }}</h4>
      <ul class="mt-1 flex flex-col">
        <li v-for="p in members" :key="p.id" class="flex flex-col py-1">
          <button type="button" class="truncate text-left text-sm text-neutral-800 hover:underline" @click="emit('pick-pipeline', p.id)">{{ p.name }}</button>
          <EvidenceLine :file="p.file"/>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import EvidenceLine from "./EvidenceLine.vue"
import StageTrack from "./StageTrack.vue"
import {
  PIPELINE_KIND_LABEL, STAGE_LABEL, STAGES, SYSTEM_LABEL, TRIGGER_LABEL, list, pinOf, pipelineKind,
  type DeployableModel, type Pipeline,
} from "../deployables"
import { t, listOf } from "~/shared/i18n"

const props = defineProps<{ model: DeployableModel; pipelines: Pipeline[]; name?: string }>()
const emit = defineEmits<{ (e: "pick-pipeline", id: string): void; (e: "pick-deployable", id: string): void }>()

const PIN_TITLE: Record<string, string> = { commit: t("deployables.pipelinePanel.pinnedCommit"), tag: t("deployables.pipelinePanel.pinnedTag"), branch: t("deployables.pipelinePanel.followsBranchSoChanges"), none: t("deployables.pipelinePanel.noRef") }
const members = computed(() => props.pipelines)
const single = computed(() => (props.pipelines.length === 1 ? props.pipelines[0] : null))
const ids = computed(() => new Set(props.pipelines.map(p => p.id)))
const byId = computed(() => new Map(props.model.pipelines.map(p => [p.id, p])))
const union = (f: (p: Pipeline) => string[]) => [...new Set(props.pipelines.flatMap(f))]

const kind = computed(() => (single.value ? pipelineKind(single.value) : pipelineKind(props.pipelines[0])))
const title = computed(() => props.name ?? single.value?.name ?? t("deployables.pipelinePanel.pipelines3", { pipelinesLength: props.pipelines.length }))
const subtitle = computed(() => {
  const p = props.pipelines[0]
  const sys = SYSTEM_LABEL[p.system] ?? p.system
  const k = PIPELINE_KIND_LABEL[kind.value] ?? kind.value
  const read = p.parsed === "none" ? t("deployables.pipelinePanel.recognisedNotRead") : p.parsed === "partial" ? t("deployables.pipelinePanel.readPart") : ""
  return `${single.value ? k : `${props.pipelines.length} × ${k.toLowerCase()}`} · ${sys}${read}`
})
const stages = computed(() => new Set(union(p => list(p.stages))))
const triggers = computed(() => union(p => list(p.triggers)))
const paths = computed(() => union(p => list(p.paths)))
const environments = computed(() => union(p => list(p.environments)))
const tools = computed(() => union(p => list(p.tools)).sort())
const links = computed(() => props.model.pipelineLinks.filter(l => ids.value.has(l.pipeline)).sort((a, b) => a.action.localeCompare(b.action) || a.deployable.localeCompare(b.deployable)))
const delegates = computed(() => {
  const out: Array<{ target: string; ref: string }> = []
  for (const p of props.pipelines) list(p.delegates_to).forEach((t, i) => { const ref = list(p.delegates_ref)[i] ?? ""; if (!out.some(d => d.target === t && d.ref === ref)) out.push({ target: t, ref }) })
  return out
})
const describe = (id: string) => { const p = byId.value.get(id); return { id, name: p?.name ?? id, kind: p ? (PIPELINE_KIND_LABEL[pipelineKind(p)] ?? "").toLowerCase() : "" } }
const uses = computed(() => union(p => list(p.calls)).map(describe))
const usedBy = computed(() => props.model.pipelines.filter(p => list(p.calls).some(c => ids.value.has(c))).map(p => describe(p.id)))

const sentence = computed(() => {
  const words = STAGES.filter(s => stages.value.has(s)).map(s => STAGE_LABEL[s].toLowerCase())
  const does = words.length ? t("deployables.pipelinePanel.would", { words: joinWords(words) }) : t("deployables.pipelinePanel.noStageWasRecognised")
  if (!triggers.value.length || triggers.value.every(t => t === "workflow_call")) {
    const n = usedBy.value.length
    return t("deployables.pipelinePanel.startsOnlyWhen", { does, value: n ? t("deployables.pipelinePanel.oneUseRuns", { value: n === 1 ? t("deployables.pipelinePanel.pipeline") : t("deployables.pipelinePanel.pipelines2", { n }), item: t("common.noun.s", { count: n }) }) : t("deployables.pipelinePanel.pipelineUsesNoneHere") })
  }
  const starts = t("deployables.pipelinePanel.starts2", { joinWords: joinWords(triggers.value.filter(t => t !== "workflow_call").map(t => TRIGGER_LABEL[t] ?? t), "or") })
  return `${starts} ${does}`
})
function joinWords(ws: string[], last: "and" | "or" = "and"): string {
  return listOf(ws, last === "or" ? "disjunction" : "conjunction")
}
</script>

<style scoped>
.stage-box { --stage-w: 44px; }
</style>
