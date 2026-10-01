<template>
  <!-- How the workspace is built and released, from its pipeline files: a
       row per kind of pipeline (the same stages on the same triggers are one
       row with a count), its stages as stations on one shared track, what it
       builds or deploys, and the environments it names. Under them, the
       reusable workflows and actions defined here, on the same columns: they
       start only when a pipeline uses them. Nothing here says a run happened;
       the files say what would run. -->
  <ExhibitFrame :exhibit="table">
    <div class="ship"><div class="ship-inner">
      <div class="ship-grid h-7 items-end pb-1 text-[11px] text-neutral-500 hairline-b" aria-hidden="true">
        <span class="pl-2">{{ t('deployables.shipBoard.pipelineWhatStarts') }}</span>
        <span class="grid" :style="{ gridTemplateColumns: `repeat(${STAGES.length}, var(--stage-w))` }">
          <span v-for="s in STAGES" :key="s" class="text-center"><span class="stage-long">{{ STAGE_LABEL[s] }}</span><span class="stage-short">{{ SHORT[s] }}</span></span>
        </span>
        <span>{{ t('deployables.shipBoard.buildsDeploys') }}</span>
        <span>{{ t('deployables.shipBoard.environments') }}</span>
      </div>

      <p v-if="!rows.length" class="py-3 text-sm text-neutral-600">{{ t('deployables.shipBoard.noPipelineHereStarts') }}<template v-if="blocks.length">{{ t('deployables.shipBoard.workflowsActionsBelowRun') }}</template>.</p>
      <ul>
        <li v-for="r in rows" :key="r.key">
          <button
            type="button"
            class="ship-grid w-full py-1.5 text-left transition-opacity"
            :class="[isPicked(r) ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-50', dim(r.pipelines.map(p => p.id)) ? 'opacity-35' : '']"
            :aria-pressed="isPicked(r)"
            @click="emit('pick', r.pipelines.length === 1 ? { kind: 'pipeline', id: r.pipelines[0].id } : { kind: 'row', id: r.key })"
          >
            <span class="flex min-w-0 flex-col gap-0.5 pl-2">
              <span class="flex min-w-0 items-baseline gap-2">
                <span class="truncate text-sm text-neutral-900" :title="r.pipelines.map(p => p.file).join('\n')">{{ r.name }}</span>
                <span v-if="r.pipelines.length > 1 && !r.name.endsWith('pipelines')" class="ui-tag !h-4 shrink-0 !text-[11px]" :title="t('deployables.shipBoard.pipelinesDo', { pipelinesLength: r.pipelines.length })">×{{ r.pipelines.length }}</span>
                <span v-if="r.system !== 'github_actions'" class="shrink-0 text-xs text-neutral-500">{{ SYSTEM_LABEL[r.system] ?? r.system }}</span>
              </span>
              <span class="flex min-w-0 items-center gap-2.5 text-xs text-neutral-600">
                <span v-for="slice in r.triggers.slice(0, 4)" :key="slice" class="flex shrink-0 items-center gap-1" :title="slice"><component :is="triggerIcon(slice)" :size="12" :stroke-width="1.75" class="text-neutral-400"/>{{ TRIGGER_LABEL[slice] ?? slice }}</span>
                <span v-if="r.triggers.length > 4" class="shrink-0 text-neutral-500" :title="r.triggers.slice(4).join(', ')">+{{ r.triggers.length - 4 }}</span>
                <span v-if="!r.triggers.length" class="text-neutral-500">{{ r.pipelines.every(p => p.parsed === 'none') ? t('deployables.shipBoard.recognisedNotRead') : t('deployables.shipBoard.noTriggerRead') }}</span>
                <span v-if="r.delegates.length" class="flex min-w-0 items-center gap-1 text-neutral-500" :title="t('deployables.shipBoard.handsWorkOutsideWorkspace', { value: r.delegates.join(', ') })">
                  <CornerDownRight :size="12" :stroke-width="1.75" class="shrink-0 text-neutral-400"/><span class="truncate font-mono text-[11px]">{{ shortTemplate(r.delegates[0]) }}</span><span v-if="r.delegates.length > 1" class="shrink-0">+{{ r.delegates.length - 1 }}</span>
                </span>
              </span>
            </span>
            <StageTrack :stages="r.stages"/>
            <ShipsCell :actions="r.actions"/>
            <EnvCell :environments="r.environments"/>
          </button>
        </li>
      </ul>

      <template v-if="blocks.length">
        <div class="mt-4 flex items-baseline gap-2 pb-1 hairline-b">
          <h4 class="text-xs font-medium text-neutral-700">{{ t('deployables.shipBoard.runInsideThem') }}</h4>
          <p class="text-xs text-neutral-500">{{ t('deployables.shipBoard.reusableWorkflowsActionsDefined') }}</p>
        </div>
        <ul>
          <li v-for="b in shownBlocks" :key="b.pipeline.id">
            <button
              type="button"
              class="ship-grid w-full py-1.5 text-left transition-opacity"
              :class="[picked?.kind === 'pipeline' && picked.id === b.pipeline.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-50', dim([b.pipeline.id]) ? 'opacity-35' : '']"
              :aria-pressed="picked?.kind === 'pipeline' && picked.id === b.pipeline.id"
              @click="emit('pick', { kind: 'pipeline', id: b.pipeline.id })"
            >
              <span class="flex min-w-0 flex-col gap-0.5 pl-2">
                <span class="flex min-w-0 items-center gap-1.5">
                  <component :is="BLOCK_ICON[b.kind] ?? Puzzle" :size="13" :stroke-width="1.75" class="shrink-0 text-neutral-500"/>
                  <span class="truncate text-sm text-neutral-800" :title="b.pipeline.file">{{ b.pipeline.name }}</span>
                </span>
                <span class="truncate text-xs text-neutral-500">{{ PIPELINE_KIND_LABEL[b.kind] ?? b.kind }} · {{ b.usedBy.length ? t('deployables.shipBoard.used', { pipelines: t('common.count.pipeline', { count: b.usedBy.length }) }) : t('deployables.shipBoard.usedNothingHere') }}</span>
              </span>
              <StageTrack :stages="b.pipeline.stages" muted/>
              <ShipsCell :actions="blockActions(b.pipeline.id)"/>
              <EnvCell :environments="list(b.pipeline.environments)"/>
            </button>
          </li>
        </ul>
        <button v-if="blocks.length > BLOCK_CAP && !allBlocks" type="button" class="mt-1 text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900" @click="allBlocks = true">{{ t('deployables.shipBoard.showAll', { blocksLength: blocks.length }) }}</button>
      </template>
    </div></div>
  </ExhibitFrame>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from "vue"
import { Box, Clock, Container, CornerDownRight, FileCode2, GitCommit, GitPullRequest, Hand, Puzzle, Tag, Webhook, Workflow } from "lucide-vue-next"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import { useTable } from "~/features/export/useExportables"
import StageTrack from "./StageTrack.vue"
import {
  PIPELINE_KIND_LABEL, STAGE_LABEL, STAGES, SYSTEM_LABEL, TRIGGER_LABEL, list, pipelineKind,
  type Block, type DeployableModel, type ShipRow,
} from "../deployables"
import { t, intlLocale } from "~/shared/i18n"

export type ShipPick = { kind: "pipeline" | "row"; id: string }

const props = defineProps<{
  model: DeployableModel
  rows: ShipRow[]
  blocks: Block[]
  picked: ShipPick | { kind: "deployable"; id: string } | null
  /** Pipelines to keep in full; the rest fade. */
  lit: ReadonlySet<string> | null
}>()
const emit = defineEmits<{ (e: "pick", p: ShipPick): void }>()

const SHORT: Record<string, string> = { build: t("deployables.shipBoard.bld"), test: t("deployables.shipBoard.tst"), scan: t("deployables.shipBoard.scn"), package: t("deployables.shipBoard.pkg"), publish: t("deployables.shipBoard.pub"), deploy: t("deployables.shipBoard.dep"), approve: t("deployables.shipBoard.apr") }
const BLOCK_ICON = { reusable_workflow: Workflow, composite_action: Puzzle, docker_action: Container, javascript_action: FileCode2, action: Box }
const BLOCK_CAP = 12
const allBlocks = ref(false)
const shownBlocks = computed(() => (allBlocks.value ? props.blocks : props.blocks.slice(0, BLOCK_CAP)))

const plural = (n: number, w: string) => `${n.toLocaleString(intlLocale)} ${w}${n === 1 ? "" : "s"}`
const isPicked = (r: ShipRow) => (props.picked?.kind === "row" && props.picked.id === r.key) || (props.picked?.kind === "pipeline" && r.pipelines.length === 1 && r.pipelines[0].id === props.picked.id)
const dim = (ids: string[]) => !!props.lit && !ids.some(id => props.lit!.has(id))

function triggerIcon(t: string) {
  if (t === "push") return GitCommit
  if (t.startsWith("pull_request") || t === "merge_group") return GitPullRequest
  if (t === "schedule") return Clock
  if (t === "workflow_dispatch") return Hand
  if (t === "release") return Tag
  return Webhook
}
function shortTemplate(t: string): string {
  return t.replace(/^.*?\/([^/]+)\/\.github\/workflows\//, "$1/").replace(/^jenkins-library:/, "").replace(/^gitlab-template:/, "")
}
function blockActions(id: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const l of props.model.pipelineLinks) if (l.pipeline === id) out.set(l.action, [...new Set([...(out.get(l.action) ?? []), l.deployable])].sort())
  return out
}

// What a row builds or deploys: the name when it is one, a count when more.
const ShipsCell = defineComponent({
  props: { actions: { type: Map as unknown as () => Map<string, string[]>, required: true } },
  setup(p) {
    return () => {
      const parts = [...p.actions].filter(([, ds]) => ds.length)
      if (!parts.length) return h("span", { class: "text-xs text-neutral-400" }, "—")
      return h("span", { class: "flex min-w-0 flex-col text-xs text-neutral-600" }, parts.map(([action, ds]) =>
        h("span", { class: "flex min-w-0 items-baseline gap-1.5", title: `${action} ${ds.join(", ")}` }, [
          h("span", { class: "shrink-0" }, action),
          ds.length === 1
            ? h("span", { class: "truncate font-mono text-[11px] text-neutral-900" }, ds[0])
            : h("span", { class: "shrink-0 font-mono text-[11px] text-neutral-900" }, t("deployables.shipBoard.deployables", { dsLength: ds.length })),
        ])))
    }
  },
})
const EnvCell = defineComponent({
  props: { environments: { type: Array as () => string[], required: true } },
  setup(p) {
    return () => p.environments.length
      ? h("span", { class: "flex min-w-0 flex-wrap gap-1", title: p.environments.join(", ") }, [
          ...p.environments.slice(0, 3).map(e => h("span", { class: "ui-tag !h-4 max-w-[96px] truncate !text-[11px]" }, e)),
          p.environments.length > 3 ? h("span", { class: "text-[11px] text-neutral-500" }, `+${p.environments.length - 3}`) : null,
        ])
      : h("span", { class: "text-xs text-neutral-400" }, "—")
  },
})

const table = useTable({
  get title() { return t("deployables.shipBoard.pipelines") },
  rows: () => props.model.pipelines.map(p => ({
    pipeline: p.name, kind: PIPELINE_KIND_LABEL[pipelineKind(p)] ?? pipelineKind(p), system: SYSTEM_LABEL[p.system] ?? p.system, file: p.file,
    starts_on: list(p.triggers).map(t => TRIGGER_LABEL[t] ?? t).join(", "), stages: list(p.stages).map(s => STAGE_LABEL[s] ?? s).join(", "),
    builds: props.model.pipelineLinks.filter(l => l.pipeline === p.id && l.action === "builds").map(l => l.deployable).join(", "),
    deploys: props.model.pipelineLinks.filter(l => l.pipeline === p.id && l.action === "deploys").map(l => l.deployable).join(", "),
    environments: p.environments, hands_off_to: p.delegates_to, uses: p.calls ?? "",
  })),
  columns: () => [
    { id: "pipeline", label: t("deployables.shipBoard.pipeline") }, { id: "kind", label: t("deployables.shipBoard.kind") }, { id: "system", label: t("deployables.shipBoard.system") }, { id: "file", label: t("deployables.shipBoard.file") },
    { id: "starts_on", label: t("deployables.shipBoard.starts") }, { id: "stages", label: t("deployables.shipBoard.stages") }, { id: "builds", label: t("deployables.shipBoard.builds") }, { id: "deploys", label: t("deployables.shipBoard.deploys") },
    { id: "environments", label: t("deployables.shipBoard.environments") }, { id: "hands_off_to", label: t("deployables.shipBoard.handsOff") }, { id: "uses", label: t("deployables.shipBoard.uses") },
  ],
  notes: () => [[t("deployables.shipBoard.read"), t("deployables.shipBoard.pipelineFilesWhatThey")]],
  disabledReason: () => (!props.model.pipelines.length ? t("deployables.shipBoard.noPipelinesSnapshot") : null),
})
</script>

<style scoped>
/* The columns every row shares, so the tracks line up. Narrow, the stage
   names shorten and the stations close up. */
.ship { container-type: inline-size; }
.ship-inner { --stage-w: 52px; }
.ship-grid {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) calc(var(--stage-w) * 7) minmax(120px, 0.55fr) minmax(96px, 0.4fr);
  column-gap: 16px;
  align-items: center;
}
.stage-short { display: none; }
@container (max-width: 820px) {
  .ship-inner { --stage-w: 34px; }
  .stage-long { display: none; }
  .stage-short { display: inline; }
}
</style>
