<template>
  <ViewWorkspaceLayout
    :title="t('cicd.page.title')"
    :queryable="false"
    v-model:search-query="search"
    :search-placeholder="t('cicd.page.search')"
    :tabs="inspectorTabs"
    v-model:active-tab="tab"
    :is-sidebar-open="!!sel"
    sidebar-width="380px"
  >
    <template #stats>
      <template v-if="state === 'ready' && hasAnything">
        <button type="button" class="hover:text-neutral-900" @click="mode = 'pipelines'">{{ t('cicd.page.statPipelines') }} <span class="text-neutral-800">{{ fmt(model.pipelines.length) }}</span><span v-if="partial" class="text-amber-700"> ({{ t('cicd.page.statPartial', { count: partial }) }})</span></button>
        <span class="text-neutral-400">·</span>
        <button type="button" class="hover:text-neutral-900" @click="mode = 'images'">{{ t('cicd.page.statImages') }} <span class="text-neutral-800">{{ fmt(model.artifacts.length) }}</span></button>
        <span class="text-neutral-400">·</span>
        <span>{{ t('cicd.page.statDockerfiles') }} <span class="text-neutral-800">{{ fmt(model.dockerfiles.length) }}</span></span>
        <span class="text-neutral-400">·</span>
        <button type="button" class="hover:text-neutral-900" @click="mode = 'flags'">{{ t('cicd.page.statFlags') }} <span class="text-neutral-800">{{ fmt(model.flags.length) }}</span></button>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('cicd.page.modes')">
        <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :title="m.title" @click="mode = m.id">{{ m.label }}</button>
      </div>
    </template>
    <template #actions>
      <div v-if="model.components.length" class="relative" @keydown.esc.stop="proposing = false">
        <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="proposing" :title="t('cicd.page.lensWhat')" @click="proposing = !proposing">
          <Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('cicd.page.makeLens') }}</span>
        </button>
        <div v-if="proposing" class="fixed inset-0 z-40" @click="proposing = false"></div>
        <section v-if="proposing" class="ui-popover absolute right-0 z-50 mt-1 flex w-[420px] flex-col gap-2 p-3 animate-in" :aria-label="t('cicd.page.lensTitle')">
          <h3 class="text-base font-semibold text-neutral-900">{{ t('cicd.page.lensTitle') }}</h3>
          <p class="text-sm text-neutral-600">{{ t('cicd.page.lensWhat') }}</p>
          <p class="text-sm text-neutral-700">
            {{ t('cicd.page.lensGroups', { count: proposal.groups.length }) }}
            <template v-if="proposal.shared.length">{{ ' ' + t('cicd.page.lensShared', { count: proposal.shared.length }) }}</template>
            <template v-if="proposal.unshipped">{{ ' ' + t('cicd.page.lensUnshipped', { count: proposal.unshipped }) }}</template>
          </p>
          <ul class="flex max-h-56 flex-col overflow-auto rounded ring-1 ring-neutral-200">
            <li v-for="g in proposal.groups" :key="g.name" class="flex h-7 shrink-0 items-center gap-3 px-2 text-sm">
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800">{{ g.name }}</span>
              <span class="shrink-0 font-mono text-[11px] text-neutral-500">{{ g.components.length }}</span>
            </li>
          </ul>
          <div class="flex items-center gap-2 pt-1">
            <input v-model="lensName" type="text" class="ui-input ui-input-sm w-48" :aria-label="t('cicd.page.lensName')"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!proposal.groups.length || !lensName.trim()" @click="takeLens">{{ t('cicd.page.lensCreate') }}</button>
            <span v-if="lensMade" class="text-sm text-neutral-600">{{ t('cicd.page.lensCreated', { name: lensMade }) }}</span>
          </div>
        </section>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" :text="t('cicd.page.reading')"/>
      <EmptyState v-else-if="state === 'old'" :title="t('cicd.page.oldTitle')" :text="t('cicd.page.oldText')" icon="workflow">
        <button type="button" class="ui-btn ui-btn-sm ui-btn-primary mt-3" @click="workspaces.startScan()">{{ t('cicd.page.rescan') }}</button>
      </EmptyState>
      <EmptyState v-else-if="!hasAnything" :title="t('cicd.page.emptyTitle')" :text="t('cicd.page.emptyText')" icon="workflow"/>

      <!-- Pipelines: the list, and the picked one drawn. The drawing has the
           room: the inspector opens only for something picked in it. -->
      <div v-else-if="mode === 'pipelines'" class="flex min-h-0 grow">
        <PipelineList class="w-[272px] shrink-0 hairline-r" :groups="groups" :selected="current" :search="search" @pick="pickPipeline"/>
        <ExhibitFrame v-if="currentPipeline" :key="currentPipeline.id" header="custom" fill class="min-w-0 grow">
          <header class="flex min-w-0 shrink-0 flex-col gap-1.5 px-6 pb-3 pt-4 hairline-b">
            <div class="flex min-w-0 items-center gap-2.5">
              <SystemMark :system="currentPipeline.system"/>
              <h2 class="min-w-[6rem] max-w-[55%] shrink-0 truncate text-[15px] font-semibold text-neutral-900" :title="currentPipeline.name">{{ currentPipeline.name }}</h2>
              <span class="min-w-0 truncate text-xs text-neutral-500">{{ t(`cicd.systems.${systemKey(currentPipeline.system)}`) }} · {{ t(`cicd.kinds.${kindKey(currentPipeline.kind)}`) }}</span>
              <span class="ml-auto flex min-w-0 items-center gap-3">
                <EvidenceLine class="min-w-0" :file="currentPipeline.file" :line="currentPipeline.line"/>
                <ExhibitButton v-if="currentPipeline.read !== 'none'"/>
              </span>
            </div>
            <p v-for="(u, i) in currentUnread" :key="i" class="flex items-start gap-1.5 text-xs text-amber-800">
              <Icon icon="circle-dashed" :size="12" class="mt-px shrink-0"/>
              <span>{{ u.reason === 'not_supported_system' ? t('cicd.graph.notReadSystem', { system: t(`cicd.systems.${systemKey(currentPipeline.system)}`) }) : t('cicd.graph.readPartly', { from: u.from_line, to: u.to_line, reason: t(`cicd.unread.${u.reason}`) }) }}</span>
            </p>
            <p v-if="libraryOnly" class="text-xs text-neutral-600">{{ libraryOnly === 'resolved' ? t('cicd.graph.libraryResolved') : t('cicd.graph.libraryOnly') }}</p>
            <p v-if="!currentOutputs.length && currentPipeline.read !== 'none' && runsOnItsOwn(currentPipeline)" class="text-xs text-neutral-500">{{ t('cicd.graph.noOutputs') }}</p>
          </header>
          <!-- A file Archstats does not read is shown, not drawn. -->
          <div v-if="currentPipeline.read === 'none'" class="min-h-0 grow overflow-auto px-6 py-5">
            <SourceLines class="max-w-[880px]" :file="currentPipeline.file" :from="0" :around="40"/>
          </div>
          <div v-else class="min-h-0 grow overflow-auto px-6 pb-8 pt-5" @click.self="sel = null">
            <PipelineGraph :ix="ix" :pipeline="currentPipeline.id" :name="currentPipeline.name" :selected="graphSelection" @select="selectInGraph"/>
          </div>
        </ExhibitFrame>
        <p v-else class="p-6 text-sm text-neutral-600">{{ t('cicd.page.pickPipeline') }}</p>
      </div>

      <!-- Images: base images across the workspace, then every artifact. -->
      <div v-else-if="mode === 'images'" class="min-h-0 grow overflow-y-auto" @click.self="sel = null">
        <section class="px-6 pb-5 pt-4 hairline-b">
          <BaseImages :families="families" :selected="baseSel" @pick="k => (baseSel = baseSel === k ? null : k)"/>
        </section>
        <ExhibitFrame :exhibit="artifactTable" header-class="px-4 pb-1 pt-3">
          <p v-if="!imageList.length" class="px-4 py-2 text-sm text-neutral-600">{{ t('cicd.images.emptyArtifacts') }}</p>
          <table v-else class="ui-table">
            <thead>
              <tr>
                <th>{{ t('cicd.images.artifact') }}</th>
                <th>{{ t('cicd.images.kind') }}</th>
                <th>{{ t('cicd.images.base') }}</th>
                <th>{{ t('cicd.images.runtime') }}</th>
                <th>{{ t('cicd.images.user') }}</th>
                <th>{{ t('cicd.images.builtBy') }}</th>
                <th>{{ t('cicd.images.environments') }}</th>
                <th class="w-16 text-right">{{ t('cicd.images.files') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in shownImages" :key="r.artifact.id" class="cursor-default" :class="{ 'is-selected': sel?.kind === 'artifact' && sel.id === r.artifact.id }" @click="select({ kind: 'artifact', id: r.artifact.id })">
                <td class="max-w-[280px] truncate font-mono text-sm text-neutral-800" :title="r.artifact.id">{{ r.artifact.name || r.artifact.id }}</td>
                <td class="text-neutral-600">{{ kindLabel(r.artifact.kind) }}<span v-if="r.artifact.platform" class="text-neutral-500"> · {{ r.artifact.platform }}</span></td>
                <td class="max-w-[220px] truncate font-mono text-xs" :title="`${r.artifact.base} — ${pinLabel(r.pinned)}`">
                  <span v-if="r.artifact.base" :class="r.pinned === 'floating' ? 'text-amber-800' : 'text-neutral-800'">{{ r.artifact.base.split('@')[0] }}</span><span v-else class="text-neutral-400">—</span>
                  <Icon v-if="r.pinned === 'digest'" icon="lock" :size="11" class="ml-1 inline align-[-1px] text-green-700"/>
                </td>
                <td class="font-mono text-xs text-neutral-700">{{ r.artifact.runtime || "—" }}</td>
                <td class="font-mono text-xs" :class="r.dockerfile && !r.dockerfile.final_user ? 'text-amber-800' : 'text-neutral-700'">{{ r.dockerfile ? (r.dockerfile.final_user || 'root') : "—" }}</td>
                <td class="max-w-[220px] truncate text-xs" :title="r.builtBy.join(', ')">
                  <span v-if="r.builtBy.length" class="text-neutral-700">{{ r.builtBy.map(id => pipelineName(id)).join(", ") }}</span>
                  <span v-else class="text-neutral-500">{{ t('cicd.inspector.nothingBuilds') }}</span>
                </td>
                <td class="max-w-[180px] truncate text-xs text-neutral-700">{{ r.environments.join(", ") || "—" }}</td>
                <td class="is-num text-right">{{ fmt(r.artifact.files) }}</td>
              </tr>
            </tbody>
          </table>
        </ExhibitFrame>
      </div>

      <!-- Flags: facts that read as risks, by rule. -->
      <div v-else class="min-h-0 grow overflow-y-auto">
        <FlagList :groups="flagGroups" :selected="sel?.kind === 'flag' ? sel.id : null" :search="search" @pick="pickFlag"/>
      </div>
    </template>

    <!-- The inspector: evidence, flags, history. -->
    <template #tab-evidence>
      <template v-if="detail">
        <div class="flex flex-col gap-0.5">
          <span class="ui-label">{{ detail.label }}</span>
          <h2 class="break-all font-mono text-[14px] font-medium text-neutral-900">{{ detail.title }}</h2>
          <EvidenceLine v-if="detail.file" :file="detail.file" :line="detail.line"/>
        </div>
        <p v-if="detail.note" class="text-sm text-neutral-700">{{ detail.note }}</p>
        <dl v-if="detail.facts.length" class="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
          <template v-for="f in detail.facts" :key="f[0]">
            <dt class="text-neutral-500">{{ f[0] }}</dt>
            <dd class="min-w-0 break-words font-mono text-[12px] text-neutral-800">{{ f[1] }}</dd>
          </template>
        </dl>
        <div class="flex flex-wrap gap-2">
          <button v-if="detail.openPipeline" type="button" class="ui-btn ui-btn-sm" @click="openPipeline(detail.openPipeline)"><Icon icon="workflow" :size="13"/>{{ t('cicd.inspector.openPipeline') }}</button>
          <button v-if="detail.openArtifact" type="button" class="ui-btn ui-btn-sm" @click="openArtifact(detail.openArtifact)"><Icon icon="container" :size="13"/>{{ t('cicd.inspector.openArtifact') }}</button>
        </div>
        <div v-if="detail.steps?.length">
          <h4 class="ui-label">{{ t('cicd.inspector.steps') }}</h4>
          <ul class="mt-1 flex flex-col">
            <li v-for="s in detail.steps" :key="s.index">
              <button type="button" class="flex h-6 w-full min-w-0 items-center gap-2 text-left hover:bg-neutral-100" @click="selectInGraph(`step:${s.job}:${s.index}`)">
                <span class="h-[7px] w-[7px] shrink-0 rounded-[2px]" :class="VERB_TONE[s.verb]"></span>
                <span class="w-16 shrink-0 text-xs" :class="VERB_TEXT[s.verb]">{{ t(`cicd.verbs.${s.verb}`) }}</span>
                <span class="min-w-0 truncate font-mono text-[11px] text-neutral-700" :title="s.text">{{ s.text }}</span>
              </button>
            </li>
          </ul>
        </div>
        <template v-if="detail.artifact">
          <div v-if="artifactContents.length && !artifactStages.length">
            <h4 class="ui-label">{{ t('cicd.inspector.inside') }}</h4>
            <ul class="mt-1 flex flex-col gap-1">
              <li v-for="c in artifactContents" :key="c.path + c.pattern" class="flex flex-col">
                <span class="font-mono text-xs text-neutral-800">{{ c.path }}<span v-if="c.pattern" class="text-neutral-500">/{{ c.pattern }}</span><span v-if="c.module" class="ml-2 text-neutral-500">{{ c.module }}</span></span>
                <EvidenceLine :file="c.file" :line="c.line"/>
              </li>
            </ul>
          </div>
          <div v-if="artifactStages.length">
            <h4 class="ui-label">{{ t('cicd.inspector.stages') }}</h4>
            <StageLadder class="mt-2" :stages="artifactStages" :contents="artifactContents" :user="artifactDockerfile?.final_user ?? ''"/>
            <p class="text-xs text-neutral-500">{{ dockerFacts }}</p>
          </div>
          <div v-if="artifactComponents.length">
            <h4 class="ui-label">{{ t('cicd.inspector.components') }}</h4>
            <ul class="mt-1 flex flex-col">
              <li v-for="c in artifactComponents.slice(0, 30)" :key="c.component" class="flex h-6 items-center gap-2">
                <router-link :to="componentPath(c.component)" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="c.component">{{ c.component }}</router-link>
                <span class="shrink-0 font-mono text-xs text-neutral-500">{{ fmt(c.files) }}</span>
              </li>
            </ul>
          </div>
        </template>
        <SourceLines v-if="detail.file && detail.line" :file="detail.file" :from="detail.line" :to="detail.toLine"/>
      </template>
    </template>
    <template #tab-flags>
      <template v-if="detail">
        <p v-if="!detailFlags.length" class="text-sm text-neutral-600">{{ t('cicd.inspector.noFlags') }}</p>
        <ul class="flex flex-col gap-2">
          <li v-for="(f, i) in detailFlags" :key="i" class="flex flex-col gap-0.5">
            <span class="text-[13px] font-medium text-neutral-900">{{ t(`cicd.flags.rules.${f.rule}.fact`) }}</span>
            <span class="text-xs text-neutral-600">{{ t(`cicd.flags.rules.${f.rule}.why`) }}</span>
            <span class="font-mono text-xs text-neutral-700">{{ f.detail }}</span>
            <EvidenceLine :file="f.file" :line="f.line"/>
          </li>
        </ul>
      </template>
    </template>
    <template #tab-history>
      <FileHistory v-if="detail?.file" :file="detail.file"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ExhibitButton from "~/features/export/components/ExhibitButton.vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import PipelineList from "~/features/cicd/components/PipelineList.vue"
import PipelineGraph from "~/features/cicd/components/PipelineGraph.vue"
import SystemMark from "~/features/cicd/components/SystemMark.vue"
import EvidenceLine from "~/features/cicd/components/EvidenceLine.vue"
import SourceLines from "~/features/cicd/components/SourceLines.vue"
import FileHistory from "~/features/cicd/components/FileHistory.vue"
import BaseImages from "~/features/cicd/components/BaseImages.vue"
import StageLadder from "~/features/cicd/components/StageLadder.vue"
import FlagList from "~/features/cicd/components/FlagList.vue"
import { useCicd } from "~/features/cicd/useCicd"
import { baseFamilies, imageRows, listGroups, runsOnItsOwn, stepKey, type Flag, type Step } from "~/features/cicd/cicd"
import { groupFlags } from "~/features/cicd/flags"
import { outputKey } from "~/features/cicd/layout"
import { proposeLens } from "~/features/cicd/lens"
import { VERB_TEXT, VERB_TONE } from "~/features/cicd/verbs"
import { componentPath } from "~/features/navigation/routes"
import { units, useGroupsStore } from "~/features/groups/groups.store"
import { useDataStore } from "~/features/snapshot/data.store"
import { useStateStore } from "~/platform/state.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useTable } from "~/features/export/useExportables"
import { t, intlLocale } from "~/shared/i18n"

const { model, ix, loading, state } = useCicd()
const data = useDataStore()
const groupsStore = useGroupsStore()
const store = useStateStore()
const workspaces = useWorkspacesStore()
const fmt = (n: number) => n.toLocaleString(intlLocale)

const MODES = [
  { id: "pipelines", label: t("cicd.page.pipelines"), title: t("cicd.page.pipelinesTitle") },
  { id: "images", label: t("cicd.page.images"), title: t("cicd.page.imagesTitle") },
  { id: "flags", label: t("cicd.page.flags"), title: t("cicd.page.flagsTitle") },
] as const
type Mode = typeof MODES[number]["id"]
const mode = computed<Mode>({
  get: () => {
    const v = store.get<string>("cicd.view", "pipelines")
    return v === "images" || v === "flags" ? v : "pipelines"
  },
  set: v => store.set("cicd.view", v === "pipelines" ? null : v),
})

const search = ref("")
const hasAnything = computed(() => model.value.pipelines.length > 0 || model.value.artifacts.length > 0 || model.value.dockerfiles.length > 0)
const partial = computed(() => model.value.pipelines.filter(p => p.read !== "full").length)

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

const groups = computed(() => listGroups(model.value, ix.value, search.value))
const current = computed<string | null>({
  get: () => {
    const id = store.get<string>("cicd.pipeline", "")
    if (id && ix.value.pipeline.has(id)) return id
    return groups.value[0]?.rows[0]?.pipeline.id ?? groups.value[0]?.used[0]?.pipeline.id ?? null
  },
  set: v => store.set("cicd.pipeline", v),
})
// A link (a report slot, Go to anything) may name the mode and the pipeline.
const route = useRoute()
watch(() => [route.query.mode, route.query.pipeline] as const, ([m, p]) => {
  if (m === "pipelines" || m === "images" || m === "flags") mode.value = m
  if (typeof p === "string" && p) current.value = p
}, { immediate: true })

const currentPipeline = computed(() => (current.value ? ix.value.pipeline.get(current.value) ?? null : null))
const currentUnread = computed(() => (current.value ? ix.value.unreadOf.get(current.value) ?? [] : []))
const currentOutputs = computed(() => (current.value ? ix.value.outputsOf.get(current.value) ?? [] : []))
/** A pipeline whose only work is a library step: say so, and whether the library is here. */
const libraryOnly = computed<"" | "resolved" | "remote">(() => {
  if (!current.value) return ""
  const steps = model.value.steps.filter(s => s.pipeline === current.value)
  const hs = (ix.value.handoffsOf.get(current.value) ?? []).filter(h => h.kind === "library_step")
  if (steps.length !== 1 || hs.length !== 1) return ""
  return hs[0].local_pipeline ? "resolved" : "remote"
})

function pickPipeline(id: string) {
  current.value = id
  sel.value = null
}
function openPipeline(id: string) {
  mode.value = "pipelines"
  search.value = ""
  pickPipeline(id)
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

type Sel =
  | { kind: "pipeline"; id: string }
  | { kind: "graph"; key: string }
  | { kind: "artifact"; id: string }
  | { kind: "flag"; id: string; flag: Flag }
const sel = ref<Sel | null>(null)
function select(s: Sel | null) {
  const same = s && sel.value && JSON.stringify(s) === JSON.stringify(sel.value)
  sel.value = same ? null : s
}
watch(() => data.datasetKey, () => { sel.value = null })
watch(mode, () => { sel.value = null })
const graphSelection = computed(() => (sel.value?.kind === "graph" ? sel.value.key : null))
function selectInGraph(key: string) {
  select({ kind: "graph", key })
}
function openArtifact(id: string) {
  mode.value = "images"
  search.value = ""
  sel.value = { kind: "artifact", id }
}
function pickFlag(f: Flag) {
  select({ kind: "flag", id: `flag:${f.rule}:${f.file}:${f.line}:${f.detail}`, flag: f })
}

const tab = ref("evidence")
const inspectorTabs = computed(() => (sel.value ? [
  { id: "evidence", label: t("cicd.inspector.evidence") },
  { id: "flags", label: t("cicd.inspector.flags") },
  { id: "history", label: t("cicd.inspector.history") },
] : []))

interface Detail {
  label: string
  title: string
  file: string
  line?: number
  toLine?: number
  facts: Array<[string, string]>
  steps?: Step[]
  openPipeline?: string
  openArtifact?: string
  artifact?: string
  /** A sentence under the title: why a flag matters. */
  note?: string
}

const pipelineName = (id: string) => ix.value.pipeline.get(id)?.name ?? id
const systemKey = (s: string) => (["github_actions", "gitlab", "jenkins", "rancher_fleet", "rancher_pipelines", "azure_pipelines", "bitbucket", "circleci", "cloud_build", "travis", "drone", "tekton", "buildkite", "woodpecker"].includes(s) ? s : "other")
const kindKey = (k: string) => (["workflow", "reusable_workflow", "action", "template", "child", "library", "gitops", "pipeline"].includes(k) ? k : "pipeline")
const KIND_LABEL: Record<string, string> = { image: t("cicd.images.kindImage"), app: t("cicd.images.kindApp"), function: t("cicd.images.kindFunction"), desktop_app: t("cicd.images.kindDesktop"), mobile_app: t("cicd.images.kindMobile") }
const kindLabel = (k: string) => KIND_LABEL[k] ?? k
const pinLabel = (p: string) => ({ digest: t("cicd.images.pinnedDigest"), tag: t("cicd.images.pinnedTag"), floating: t("cicd.images.pinnedFloating") } as Record<string, string>)[p] ?? ""
const gateLabel = (g: string) => (g ? t(`cicd.graph.gate.${g}`) : "")

const detail = computed<Detail | null>(() => {
  const s = sel.value
  if (!s) return null
  const L = (k: string) => t(`cicd.inspector.${k}`)
  if (s.kind === "pipeline") {
    const p = ix.value.pipeline.get(s.id)
    if (!p) return null
    return { label: L("pipeline"), title: p.name, file: p.file, line: p.line, facts: [
      [L("pipeline"), `${t(`cicd.systems.${systemKey(p.system)}`)} · ${t(`cicd.kinds.${kindKey(p.kind)}`)}`],
      [L("jobs"), fmt(p.jobs)],
      [L("steps"), fmt(p.steps)],
    ] }
  }
  if (s.kind === "artifact") {
    const a = ix.value.artifact.get(s.id)
    if (!a) return null
    const outs = ix.value.outputsOfArtifact.get(a.id) ?? []
    const builders = [...new Set(outs.filter(o => o.kind !== "deploy").map(o => pipelineName(o.pipeline)))]
    const deployers = [...new Set(outs.filter(o => o.kind === "deploy").map(o => `${pipelineName(o.pipeline)}${o.environment ? ` → ${o.environment}` : ""}`))]
    return { label: L("artifact"), title: a.name || a.id, file: a.file, line: a.line, artifact: a.id, openPipeline: outs[0]?.pipeline, facts: [
      [t("cicd.images.kind"), kindLabel(a.kind) + (a.platform ? ` · ${a.platform}` : "")],
      ...(a.base ? [[t("cicd.images.base"), a.base] as [string, string]] : []),
      ...(a.runtime ? [[t("cicd.images.runtime"), a.runtime] as [string, string]] : []),
      [L("builtBy"), builders.join(", ") || L("nothingBuilds")],
      ...(deployers.length ? [[L("deployedBy"), deployers.join(", ")] as [string, string]] : []),
    ] }
  }
  if (s.kind === "flag") {
    const f = s.flag
    return { label: t(`cicd.flags.rules.${f.rule}.fact`), title: f.detail || f.subject, file: f.file, line: f.line, facts: [], note: t(`cicd.flags.rules.${f.rule}.why`),
      openPipeline: ix.value.pipeline.has(f.file) ? f.file : (f.subject.split(" › ")[0] && ix.value.pipeline.has(f.subject.split(" › ")[0]) ? f.subject.split(" › ")[0] : undefined) }
  }
  const p = currentPipeline.value
  if (!p) return null
  const key = s.key
  const jobs = ix.value.jobsOf.get(p.id) ?? []
  if (key.startsWith("job:")) {
    const j = jobs.find(x => x.id === key.slice(4))
    if (!j) return null
    const facts: Array<[string, string]> = []
    if (j.runner) facts.push([L("runner"), j.runner])
    if (j.needs) facts.push([L("needs"), j.needs])
    if (j.group) facts.push([L("group"), j.group])
    if (j.environment) facts.push([L("environment"), j.environment])
    if (j.gate) facts.push([L("gate"), gateLabel(j.gate)])
    if (j.condition) facts.push([L("condition"), j.condition])
    if (j.matrix) facts.push([L("matrix"), j.matrix < 0 ? t("cicd.graph.matrixEachTitle") : t("cicd.graph.matrixTitle", { count: j.matrix })])
    return { label: L("job"), title: j.name, file: j.file || p.file, line: j.line, facts, steps: ix.value.stepsOf.get(stepKey(p.id, j.id)) ?? [] }
  }
  if (key.startsWith("step:")) {
    const rest = key.slice(5)
    const job = rest.slice(0, rest.lastIndexOf(":"))
    const index = Number(rest.slice(rest.lastIndexOf(":") + 1))
    const st = (ix.value.stepsOf.get(stepKey(p.id, job)) ?? []).find(x => x.index === index)
    if (!st) return null
    const facts: Array<[string, string]> = [[L("verb"), t(`cicd.verbs.${st.verb}`)], [L("job"), job]]
    if (st.tool) facts.push([L("tool"), st.tool])
    if (st.target) facts.push([L("target"), st.target])
    return { label: L("step"), title: st.name || st.text, file: st.file || p.file, line: st.line, facts }
  }
  if (key.startsWith("handoff:")) {
    const h = (ix.value.handoffsOf.get(p.id) ?? [])[Number(key.slice(8))]
    if (!h) return null
    const facts: Array<[string, string]> = [[L("handoff"), t(`cicd.handoffs.${h.kind}`)]]
    if (h.ref) facts.push([L("ref"), h.ref])
    if (h.pinned) facts.push([L("pinned"), t(`cicd.pins.${h.pinned}`)])
    if (h.via) facts.push([L("via"), h.via])
    if (h.local_pipeline) facts.push([L("local"), h.local_pipeline])
    return { label: L("handoff"), title: h.target, file: h.file || p.file, line: h.line, facts, openPipeline: h.local_pipeline && ix.value.pipeline.has(h.local_pipeline) ? h.local_pipeline : undefined }
  }
  if (key.startsWith("trigger:")) {
    const tr = (ix.value.triggersOf.get(p.id) ?? [])[Number(key.slice(8))]
    if (!tr) return null
    return { label: L("trigger"), title: t(`cicd.events.${tr.event}`), file: tr.file || p.file, line: tr.line, facts: tr.filter ? [[L("filter"), tr.filter]] : [] }
  }
  if (key.startsWith("output:")) {
    const outs = (ix.value.outputsOf.get(p.id) ?? []).filter(o => outputKey(o) === key.slice(7))
    const o = outs[0]
    if (!o) return null
    const facts: Array<[string, string]> = [[L("output"), t(`cicd.outputs.${o.kind}`)], [L("target"), o.target]]
    if (o.platform) facts.push([L("platform"), o.platform])
    if (o.environment) facts.push([L("environment"), o.environment])
    if (o.server) facts.push([L("server"), o.server])
    if (o.context) facts.push([L("context"), o.context])
    if (o.job) facts.push([L("job"), o.job])
    return { label: L("output"), title: o.artifact ? (ix.value.artifact.get(o.artifact)?.name ?? o.artifact) : o.target, file: o.file || p.file, line: o.line, facts, openArtifact: o.artifact || undefined }
  }
  return null
})

const detailFlags = computed(() => {
  const d = detail.value
  if (!d?.file) return []
  const all = model.value.flags.filter(f => f.file === d.file)
  // A step or job: the flags on its own lines; a pipeline or artifact: every flag in its file.
  if (sel.value?.kind === "graph" && d.line && !sel.value.key.startsWith("job:")) return all.filter(f => f.line === d.line)
  return all
})

const artifactContents = computed(() => (detail.value?.artifact ? model.value.contents.filter(c => c.artifact === detail.value!.artifact) : []))
const artifactComponents = computed(() => (detail.value?.artifact ? model.value.components.filter(c => c.artifact === detail.value!.artifact).sort((a, b) => b.files - a.files) : []))
const artifactDockerfile = computed(() => {
  const a = detail.value?.artifact ? ix.value.artifact.get(detail.value.artifact) : null
  return a?.dockerfile ? model.value.dockerfiles.find(d => d.file === a.dockerfile) ?? null : null
})
const artifactStages = computed(() => (artifactDockerfile.value ? model.value.stages.filter(s => s.file === artifactDockerfile.value!.file) : []))
const dockerFacts = computed(() => {
  const d = artifactDockerfile.value
  if (!d) return ""
  const parts: string[] = []
  if (d.ports) parts.push(t("cicd.inspector.ports", { ports: d.ports }))
  if (d.entrypoint) parts.push(t("cicd.inspector.entrypoint", { cmd: d.entrypoint }))
  if (d.healthcheck) parts.push(t("cicd.inspector.healthcheck"))
  parts.push(d.dockerignore ? t("cicd.inspector.dockerignore") : t("cicd.inspector.noDockerignore"))
  return parts.join(" · ")
})

// ---------------------------------------------------------------------------
// Images and flags
// ---------------------------------------------------------------------------

const imageList = computed(() => imageRows(model.value, ix.value, search.value))
const families = computed(() => baseFamilies(model.value))
const baseSel = ref<string | null>(null)
/** A picked base version narrows the table to the images built on it. */
const shownImages = computed(() => {
  if (!baseSel.value) return imageList.value
  const [family, version] = [baseSel.value.slice(0, baseSel.value.lastIndexOf(":")), baseSel.value.slice(baseSel.value.lastIndexOf(":") + 1)]
  const files = new Set(families.value.find(f => f.family === family)?.versions.find(v => v.version === version)?.files ?? [])
  return imageList.value.filter(r => r.artifact.dockerfile && files.has(r.artifact.dockerfile))
})
const flagGroups = computed(() => groupFlags(model.value, search.value))

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

const proposing = ref(false)
const lensName = ref(t("cicd.page.lensDefaultName"))
const lensMade = ref("")
const allComponents = computed(() => data.allComponents.map(c => c.name))
const proposal = computed(() => proposeLens(model.value, allComponents.value))
function takeLens() {
  const name = lensName.value.trim()
  groupsStore.ensureDimension(name, { cut: "vertical", description: t("cicd.page.lensDescription") })
  for (const g of proposal.value.groups) groupsStore.createGroup(g.name, units("component", g.components), name)
  if (proposal.value.shared.length) groupsStore.createGroup(t("cicd.page.sharedGroup"), units("component", proposal.value.shared), name)
  groupsStore.noteSaved(name, proposal.value.groups.length + (proposal.value.shared.length ? 1 : 0))
  lensMade.value = name
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const artifactTable = useTable({
  get title() { return t("cicd.images.tableTitle") },
  rows: () => imageList.value.map(r => ({
    artifact: r.artifact.id, kind: r.artifact.kind, base: r.artifact.base, runtime: r.artifact.runtime, user: r.dockerfile ? (r.dockerfile.final_user || "root") : "",
    built_by: r.builtBy.join(", "), deployed_to: r.environments.join(", "), files: r.artifact.files,
  })),
  columns: () => [
    { id: "artifact", label: t("cicd.images.artifact") }, { id: "kind", label: t("cicd.images.kind") }, { id: "base", label: t("cicd.images.base") },
    { id: "runtime", label: t("cicd.images.runtime") }, { id: "user", label: t("cicd.images.user") }, { id: "built_by", label: t("cicd.images.builtBy") },
    { id: "deployed_to", label: t("cicd.images.environments") }, { id: "files", label: t("cicd.images.files") },
  ],
  notes: () => [[t("cicd.inspector.source"), t("cicd.images.notes")]],
  disabledReason: () => (!imageList.value.length ? t("cicd.images.emptyArtifacts") : null),
})
</script>
