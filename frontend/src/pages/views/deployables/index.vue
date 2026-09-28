<template>
  <ViewWorkspaceLayout
    title="Deployables"
    :queryable="false"
    v-model:search-query="search"
    search-placeholder="Find a deployable"
    :tabs="picked ? TABS : []"
    v-model:active-tab="tab"
    :is-sidebar-open="!!picked"
    sidebar-width="420px"
  >
    <template #stats>
      <template v-if="model.deployables.length">
        <span>Deployables <span class="text-neutral-800">{{ fmt(model.deployables.length) }}</span></span>
        <span class="text-neutral-400">·</span>
        <span :title="'Calls and messages between deployables built here'">Links <span class="text-neutral-800">{{ fmt(internalLinks) }}</span></span>
        <span class="text-neutral-400">·</span>
        <span>Pipelines <span class="text-neutral-800">{{ fmt(model.pipelines.length) }}</span></span>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="What to show">
        <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :title="m.title" @click="mode = m.id">{{ m.label }}</button>
      </div>
    </template>
    <template #actions>
      <button v-if="model.deployables.length" type="button" class="ui-btn ui-btn-sm" title="Group components by the deployable they ship in" @click="proposing = !proposing">
        <Icon icon="layers" :size="13" class="text-neutral-500"/><span>Make a lens</span>
      </button>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading deployables…"/>
      <EmptyState v-else-if="!available()" title="This snapshot predates deployables" text="Scans from engine revision 5 read what the workspace builds and ships: Dockerfiles, compose, Kubernetes and Helm, build plugins, pipelines. Rescan to see them." icon="boxes"/>
      <EmptyState v-else-if="!model.deployables.length && !model.pipelines.length" title="Nothing here builds or ships" text="No file in this workspace builds a container image, an executable app or a serverless function, and no pipeline was found. If the workspace ignores non-source files (an .archstatsignore with *.*), they were never read." icon="boxes"/>
      <div v-else class="flex min-h-0 grow flex-col">
        <p v-if="!model.deployables.length" class="hairline-b px-4 py-2 text-sm text-neutral-600">No file here builds a container, app or function; this workspace's pipelines are listed below.</p>

        <section v-if="proposing" class="hairline-b bg-ground px-4 py-3">
          <div class="flex items-baseline gap-3">
            <h3 class="ui-section-title">From how it ships</h3>
            <p class="text-sm text-neutral-500">One group per deployable, holding the components it ships.</p>
          </div>
          <div class="mt-2 flex items-center gap-2 text-sm">
            <Checkbox v-model="mergeCoupled">Merge deployables that call each other synchronously or share a database</Checkbox>
            <span class="text-neutral-400" title="Deployables that only exchange messages stay apart: they deploy and fail apart">(messages never merge)</span>
          </div>
          <p class="mt-2 text-sm text-neutral-700">
            {{ plural(proposal.groups.length, "group") }}
            <template v-if="proposal.shared.length"> · {{ plural(proposal.shared.length, "component") }} in more than one deployable go into a group of their own</template>
            <template v-if="proposal.unshipped"> · {{ plural(proposal.unshipped, "component") }} ship in nothing and stay out</template>
          </p>
          <ul class="mt-2 flex max-h-48 flex-col overflow-auto">
            <li v-for="g in proposal.groups" :key="g.name" class="flex h-7 items-center gap-3 text-sm">
              <span class="w-64 truncate font-mono text-neutral-800" :title="g.deployables.join(', ')">{{ g.name }}</span>
              <span class="tabular-nums text-neutral-500">{{ plural(g.components.length, "component") }}</span>
              <span v-if="g.sameCode" class="ui-tag" title="These deployables are built from exactly the same code">same code</span>
              <span v-if="g.joinedBy.length" class="truncate text-xs text-neutral-500" :title="g.joinedBy.map(l => `${l.from} ${l.kind} ${l.to} (${l.file}:${l.line})`).join('\n')">joined by {{ joinSummary(g.joinedBy) }}</span>
            </li>
          </ul>
          <div class="mt-3 flex items-center gap-2">
            <input v-model="lensName" type="text" class="ui-input ui-input-sm w-56" aria-label="Lens name"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!proposal.groups.length || !lensName.trim()" @click="takeLens">Create lens</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="proposing = false">Cancel</button>
            <span v-if="lensMade" class="text-sm text-neutral-600">Lens “{{ lensMade }}” created.</span>
          </div>
        </section>

        <DeployableMap v-if="mode === 'map' && model.deployables.length" :model="filteredModel" :selected="picked?.id ?? null" :kinds="mapKinds" @select="selectId"/>

        <div v-else-if="mode === 'list' && model.deployables.length" class="min-h-0 grow overflow-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th class="w-8"></th>
                <th>Deployable</th>
                <th>Kind</th>
                <th>Built by</th>
                <th>Runtime</th>
                <th title="Environments it runs in, from values files, overlays and pipelines">Environments</th>
                <th class="w-20 text-right" title="Production files it holds; build files are not counted">Files</th>
                <th class="w-24 text-right" title="Deployables it calls, and deployables that call it">Calls out · in</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in shownDeployables" :key="d.id" class="cursor-default" :class="{ 'is-selected': picked?.id === d.id }" @click="selectId(d.id)">
                <td @click.stop><Checkbox :model-value="checked.has(d.id)" :aria-label="`Select ${d.id}`" @update:model-value="toggle(d.id)"/></td>
                <td class="max-w-[320px] truncate font-mono text-sm text-neutral-800" :title="d.id">{{ d.id }}</td>
                <td>{{ KIND_LABEL[d.kind] ?? d.kind }}</td>
                <td class="text-neutral-600">{{ BUILT_BY_LABEL[d.built_by] ?? d.built_by }}</td>
                <td class="font-mono text-sm text-neutral-700">{{ d.runtime || "—" }}</td>
                <td class="max-w-[220px] truncate text-neutral-600" :title="envNames(d.id).join(', ')">{{ envNames(d.id).join(", ") || "—" }}</td>
                <td class="is-num text-right">{{ fmt(d.files) }}</td>
                <td class="is-num text-right">{{ fmt(callsOut(d.id)) }} · {{ fmt(callsIn(d.id)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="mode === 'pipelines' || !model.deployables.length" class="min-h-0 grow overflow-auto">
          <table class="ui-table">
            <thead>
              <tr>
                <th>Pipeline</th>
                <th>System</th>
                <th>What it does</th>
                <th>Starts on</th>
                <th title="A template outside this workspace that does the work, and the ref it is pinned to">Handed to</th>
                <th class="w-24 text-right">Deployables</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in shownPipelines" :key="p.id" class="cursor-default">
                <td class="max-w-[300px]">
                  <div class="truncate text-sm text-neutral-800" :title="p.name">{{ p.name }}</div>
                  <EvidenceLine :file="p.file"/>
                </td>
                <td class="text-neutral-600">{{ SYSTEM_LABEL[p.system] ?? p.system }}<span v-if="p.parsed !== 'full'" class="ml-1 text-neutral-400" :title="p.parsed === 'none' ? 'Recognised, not read' : 'A scripted pipeline, read in part'">({{ p.parsed === "none" ? "not read" : "in part" }})</span></td>
                <td><StageStrip :stages="p.stages"/></td>
                <td class="max-w-[160px] truncate text-neutral-600" :title="p.triggers + (p.paths ? '\nPaths: ' + p.paths : '')">{{ p.triggers || "—" }}<span v-if="p.paths" class="text-neutral-400"> · paths</span></td>
                <td class="max-w-[280px]">
                  <div v-for="(t, i) in list(p.delegates_to)" :key="t" class="flex items-center gap-1.5 truncate font-mono text-xs text-neutral-700" :title="t">
                    <span class="truncate">{{ shortTemplate(t) }}</span>
                    <span v-if="list(p.delegates_ref)[i]" class="ui-tag !text-[11px]" :title="PIN_TITLE[pinOf(list(p.delegates_ref)[i])]">@{{ list(p.delegates_ref)[i] }}</span>
                  </div>
                  <span v-if="!p.delegates_to" class="text-neutral-400">—</span>
                </td>
                <td class="is-num text-right">{{ fmt(p.deployables) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="mode === 'technology'" class="min-h-0 grow overflow-auto">
          <div class="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 hairline-b">
            <div v-for="s in spreads" :key="s.title" class="text-sm">
              <span class="text-neutral-500">{{ s.title }}</span>
              <span v-for="v in s.values.slice(0, 4)" :key="v.value" class="ml-2 text-neutral-800"><span class="font-mono">{{ v.value }}</span> <span class="tabular-nums text-neutral-500">on {{ v.count }} of {{ model.deployables.length }}</span></span>
            </div>
          </div>
          <table class="ui-table">
            <thead>
              <tr>
                <th>Deployable</th>
                <th>Runtime</th>
                <th>Framework</th>
                <th>Base image</th>
                <th title="Modules of this workspace it carries besides its own">Internal modules</th>
                <th class="w-20 text-right" title="Direct dependencies its manifests declare">Libraries</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in shownTech" :key="t.deployable" class="cursor-default" :class="{ 'is-selected': picked?.id === t.deployable }" @click="selectId(t.deployable)">
                <td class="max-w-[260px] truncate font-mono text-sm text-neutral-800">{{ t.deployable }}</td>
                <td class="font-mono text-sm">{{ t.runtime || "—" }}</td>
                <td class="max-w-[220px] truncate font-mono text-xs" :title="t.frameworks.join(', ')">{{ t.frameworks.join(", ") || "—" }}</td>
                <td class="max-w-[220px] truncate font-mono text-xs" :title="t.baseImage">{{ t.baseImage || "—" }}</td>
                <td class="max-w-[260px]"><span v-for="m in t.internal" :key="m" class="ui-tag mr-1 !text-[11px]">{{ m }}</span><span v-if="!t.internal.length" class="text-neutral-400">—</span></td>
                <td class="is-num text-right">{{ fmt(t.libraries) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <GroupActionBar v-if="checkedComponents.length" :selected-items="checkedComponents" kind="component" :show-in-except="[]" @replace="checked = new Set()" @clear="checked = new Set()" @created="checked = new Set()"/>
    </template>

    <!-- The inspector: one deployable. -->
    <template #tab-built>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p class="text-sm text-neutral-600">{{ builtSentence }}</p>
        <div>
          <h4 class="ui-label">What goes into it</h4>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="c in contentsOf" :key="c.path + c.pattern" class="flex flex-col">
              <span class="font-mono text-sm text-neutral-800">{{ c.path === "." ? "the whole workspace" : c.path }}<span v-if="c.pattern" class="text-neutral-500">/{{ c.pattern }}</span><span v-if="c.module" class="ml-2 text-xs text-neutral-500">module {{ c.module }}</span></span>
              <EvidenceLine :file="c.file" :line="c.line" :resolution="c.resolution"/>
            </li>
          </ul>
        </div>
        <div v-if="pickedComponents.length">
          <div class="flex items-baseline gap-2">
            <h4 class="ui-label">Components it ships</h4>
            <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="checked = new Set([picked.id])">Select for a group</button>
          </div>
          <ul class="mt-1 flex flex-col">
            <li v-for="c in pickedComponents.slice(0, 40)" :key="c.component" class="flex h-7 items-center gap-2">
              <router-link :to="componentPath(c.component)" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="c.component">{{ c.component }}</router-link>
              <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ fmt(c.files) }}</span>
            </li>
          </ul>
          <p v-if="pickedComponents.length > 40" class="text-xs text-neutral-500">and {{ fmt(pickedComponents.length - 40) }} more</p>
        </div>
      </template>
    </template>

    <template #tab-talks>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!talkCount" class="text-sm text-neutral-600">Its configuration names nothing this workspace builds or runs.</p>
        <div v-for="sec in talkSections" :key="sec.title" v-show="sec.rows.length">
          <h4 class="ui-label" :title="sec.hint">{{ sec.title }}</h4>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="l in sec.rows" :key="l.kind + l.to + l.via" class="flex flex-col">
              <span class="flex items-center gap-2 text-sm">
                <button v-if="l.to_kind === 'deployable'" type="button" class="font-mono text-neutral-800 hover:underline" @click="selectId(l.to)">{{ l.to }}</button>
                <span v-else class="font-mono text-neutral-600" :title="l.to_kind === 'module' ? 'A module of this workspace' : 'Not built in this workspace'">{{ l.to }}</span>
                <span class="text-xs text-neutral-500">via {{ l.via }}</span>
              </span>
              <EvidenceLine :file="l.file" :line="l.line" :resolution="l.resolution"/>
            </li>
          </ul>
        </div>
        <div v-if="talks.outside.length">
          <h4 class="ui-label" title="Hosts and images its configuration names that nothing in this workspace answers to">Named, but not in this workspace</h4>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="u in talks.outside" :key="u.ref + u.line" class="flex flex-col">
              <span class="font-mono text-sm text-neutral-600">{{ u.ref }} <span class="font-sans text-xs text-neutral-400">{{ UNRESOLVED_LABEL[u.reason] ?? u.reason }}</span></span>
              <EvidenceLine :file="u.file" :line="u.line"/>
            </li>
          </ul>
        </div>
        <div v-if="callers.length">
          <h4 class="ui-label">Called by</h4>
          <ul class="mt-1 flex flex-wrap gap-1.5">
            <li v-for="l in callers" :key="l.from"><button type="button" class="ui-tag font-mono" @click="selectId(l.from)">{{ l.from }}</button></li>
          </ul>
        </div>
      </template>
    </template>

    <template #tab-pipeline>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!pickedPipelines.length" class="text-sm text-neutral-600">No pipeline in this workspace was found to build or deploy it.</p>
        <div v-for="pp in pickedPipelines" :key="pp.pipeline.id" class="flex flex-col gap-1.5 hairline-b pb-3">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-medium text-neutral-900">{{ pp.pipeline.name }}</span>
            <span class="text-xs text-neutral-500">{{ SYSTEM_LABEL[pp.pipeline.system] ?? pp.pipeline.system }}</span>
          </div>
          <StageStrip :stages="pp.pipeline.stages"/>
          <p class="text-xs text-neutral-600">{{ pp.actions.map(a => a.action).join(" and ") }} it<template v-if="pp.pipeline.triggers"> · starts on {{ pp.pipeline.triggers }}</template></p>
          <p v-for="(t, i) in list(pp.pipeline.delegates_to)" :key="t" class="text-xs text-neutral-600">
            Handed to <span class="font-mono">{{ shortTemplate(t) }}</span>
            <template v-if="list(pp.pipeline.delegates_ref)[i]"> at <span class="font-mono">{{ list(pp.pipeline.delegates_ref)[i] }}</span> <span class="text-neutral-400">({{ PIN_TITLE[pinOf(list(pp.pipeline.delegates_ref)[i])] }})</span></template>
            <span class="text-neutral-400"> — outside this workspace</span>
          </p>
          <EvidenceLine v-for="a in pp.actions" :key="a.action" :file="a.file" :line="a.line" :resolution="a.resolution"/>
        </div>
      </template>
    </template>

    <template #tab-envs>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!pickedEnvs.length" class="text-sm text-neutral-600">No values file, overlay or pipeline names an environment for it.</p>
        <ul class="flex flex-col gap-1">
          <li v-for="e in pickedEnvs" :key="e.environment" class="flex flex-col">
            <span class="text-sm text-neutral-800">{{ e.environment }}<span v-if="e.kind === 'pattern'" class="ml-2 ui-tag !text-[11px]" title="An open-ended set, made from one template; the instances cannot be listed from the files">pattern</span></span>
            <EvidenceLine v-for="s in e.sources" :key="s.source + s.file" :file="s.file" :line="s.line"/>
          </li>
        </ul>
        <div v-if="diff.environments.length > 1">
          <h4 class="ui-label" title="Only Helm values files of this deployable are compared, key by key: files of other kinds do not share a shape">How its values files differ</h4>
          <p class="text-xs text-neutral-500">{{ fmt(diff.rows.length) }} settings differ; {{ fmt(diff.same) }} are the same everywhere. Secrets are shown by name only.</p>
          <div class="mt-1 overflow-auto">
            <table class="ui-table text-xs">
              <thead><tr><th>Setting</th><th v-for="e in diff.environments" :key="e">{{ e }}</th></tr></thead>
              <tbody>
                <tr v-for="r in diff.rows.slice(0, 80)" :key="r.key">
                  <td class="max-w-[160px] truncate font-mono" :title="r.key">{{ r.key }}</td>
                  <td v-for="e in diff.environments" :key="e" class="max-w-[120px] truncate font-mono" :title="r.values[e] ?? 'not set'">
                    <span v-if="r.secret" class="text-neutral-400">secret</span>
                    <span v-else-if="r.values[e] === undefined" class="text-neutral-300">—</span>
                    <span v-else>{{ r.values[e] }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else-if="pickedEnvs.length" class="text-xs text-neutral-500">No comparable values: the environments are named by pipelines or overlays, not by values files of one shape.</p>
      </template>
    </template>

    <template #tab-tech>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p class="text-xs text-neutral-500">Direct dependencies as its manifests declare them. Maven and Gradle resolve the rest over the network, so those are not here; a committed CycloneDX file is read as is.</p>
        <div v-for="g in techGroups" :key="g.role" v-show="g.rows.length">
          <h4 class="ui-label">{{ g.title }}</h4>
          <ul class="mt-1 flex flex-col">
            <li v-for="x in g.rows.slice(0, 60)" :key="x.ecosystem + x.name" class="flex min-h-7 items-center gap-2">
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800" :title="x.name">{{ x.name }}</span>
              <span class="shrink-0 font-mono text-xs text-neutral-500">{{ x.version || "—" }}</span>
              <OpenInEditor v-if="x.file" :file="x.file.replace(/^\.\//, '')" :line="x.line || undefined" button-class="!h-5 !w-5"/>
            </li>
          </ul>
          <p v-if="g.rows.length > 60" class="text-xs text-neutral-500">and {{ fmt(g.rows.length - 60) }} more</p>
        </div>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from "vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import Checkbox from "~/shared/ui/Checkbox.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import DeployableMap from "~/features/deployables/components/DeployableMap.vue"
import EvidenceLine from "~/features/deployables/components/EvidenceLine.vue"
import StageStrip from "~/features/deployables/components/StageStrip.vue"
import { useDeployables } from "~/features/deployables/useDeployables"
import {
  BUILT_BY_LABEL, KIND_LABEL, LINK_LABEL, PLATFORM_LABEL, SYSTEM_LABEL, UNRESOLVED_LABEL, calledBy, componentsOf, envDiff, environmentsOf,
  list, pinOf, pipelinesOf, proposeLens, spread, talksTo, technology, type Deployable, type Link,
} from "~/features/deployables/deployables"
import { componentPath } from "~/features/navigation/routes"
import { units, useGroupsStore } from "~/features/groups/groups.store"
import { useDataStore } from "~/features/snapshot/data.store"
import { useStateStore } from "~/platform/state.store"
import { useExportables } from "~/features/export/useExportables"

const { model, loading, available } = useDeployables()
const data = useDataStore()
const groups = useGroupsStore()
const state = useStateStore()
const fmt = (n: number) => n.toLocaleString("en-US")
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`

const MODES = [
  { id: "map", label: "Map", title: "What calls what, from the entry points to what the system rests on" },
  { id: "list", label: "List", title: "Every deployable, how it is built and where it runs" },
  { id: "pipelines", label: "Pipelines", title: "What each pipeline does, and what it hands to templates elsewhere" },
  { id: "technology", label: "Technology", title: "Runtime, framework, base image and shared modules, side by side" },
] as const
type Mode = typeof MODES[number]["id"]
const mode = computed<Mode>({
  get: () => (state.get<string>("deployables.mode", "map") as Mode),
  set: v => state.set("deployables.mode", v === "map" ? null : v),
})
const TABS = [
  { id: "built", label: "Built from" },
  { id: "talks", label: "Talks to" },
  { id: "pipeline", label: "Pipeline" },
  { id: "envs", label: "Environments" },
  { id: "tech", label: "Technology" },
]
const tab = ref("built")
const mapKinds = new Set(["calls", "messages", "uses_datastore"])

const search = ref("")
const matches = (s: string) => { const q = search.value.trim().toLowerCase(); return !q || s.toLowerCase().includes(q) }
const shownDeployables = computed(() => model.value.deployables.filter(d => matches(d.id)))
const shownPipelines = computed(() => model.value.pipelines.filter(p => matches(p.name) || matches(p.file)))
const filteredModel = computed(() => {
  if (!search.value.trim()) return model.value
  const keep = new Set(shownDeployables.value.map(d => d.id))
  return { ...model.value, deployables: shownDeployables.value, links: model.value.links.filter(l => keep.has(l.from)) }
})
const internalLinks = computed(() => model.value.links.filter(l => l.to_kind === "deployable" && (l.kind === "calls" || l.kind === "messages")).length)

// A click selects; the inspector says why, and leaving is a labelled link.
const picked = ref<Deployable | null>(null)
function selectId(id: string | null) {
  picked.value = id ? model.value.deployables.find(d => d.id === id) ?? null : null
}
watch(() => data.datasetKey, () => { picked.value = null })

const callsOut = (id: string) => model.value.links.filter(l => l.from === id && l.kind === "calls" && l.to_kind === "deployable").length
const callsIn = (id: string) => model.value.links.filter(l => l.to === id && l.kind === "calls" && l.to_kind === "deployable").length
const envNames = (id: string) => environmentsOf(model.value, id).map(e => e.environment)

const contentsOf = computed(() => picked.value ? model.value.contents.filter(c => c.deployable === picked.value!.id).sort((a, b) => a.path.localeCompare(b.path)) : [])
const pickedComponents = computed(() => picked.value ? componentsOf(model.value, picked.value.id) : [])
const builtSentence = computed(() => {
  const d = picked.value
  if (!d) return ""
  const how = BUILT_BY_LABEL[d.built_by] ?? d.built_by
  const kind = (KIND_LABEL[d.kind] ?? d.kind).toLowerCase()
  const on = d.base_image ? ` on ${d.base_image.split("@")[0]}` : ""
  const platform = d.platform ? ` for ${PLATFORM_LABEL[d.platform] ?? d.platform}` : ""
  return `${/^[aeiou]/.test(kind) ? "An" : "A"} ${kind}${platform} built by ${how}${on}, holding ${fmt(d.files)} production files in ${fmt(d.components)} components.`
})

const talks = computed(() => picked.value ? talksTo(model.value, picked.value.id) : talksTo(model.value, ""))
const talkCount = computed(() => talks.value.sync.length + talks.value.async.length + talks.value.data.length + talks.value.modules.length + talks.value.startup.length)
const talkSections = computed(() => [
  { title: "Calls, synchronously", hint: "A URL or host:port in its configuration, or a reference in an app host", rows: talks.value.sync },
  { title: "Messages, asynchronously", hint: "A broker it connects to, or a topic or queue another deployable names too", rows: talks.value.async },
  { title: "Data", hint: "A database it connects to, and deployables that name the same one", rows: talks.value.data },
  { title: "Shared modules", hint: "Modules of this workspace inside it that other deployables carry too", rows: talks.value.modules },
  { title: "Starts after", hint: "compose depends_on", rows: talks.value.startup },
])
const callers = computed(() => picked.value ? calledBy(model.value, picked.value.id) : [])

const pickedPipelines = computed(() => picked.value ? pipelinesOf(model.value, picked.value.id) : [])
const PIN_TITLE: Record<string, string> = { commit: "pinned to a commit", tag: "pinned to a tag", branch: "follows a branch", none: "no ref" }
function shortTemplate(t: string): string {
  return t.replace(/^.*?\/([^/]+)\/\.github\/workflows\//, "$1/").replace(/^jenkins-library:/, "Jenkins library ").replace(/^gitlab-template:/, "GitLab template ")
}

const pickedEnvs = computed(() => picked.value ? environmentsOf(model.value, picked.value.id) : [])
const diff = computed(() => picked.value ? envDiff(model.value.values, picked.value.id) : { environments: [], rows: [], same: 0 })

const techGroups = computed(() => {
  const deps = picked.value ? model.value.dependencies.filter(x => x.deployable === picked.value!.id) : []
  const by = (role: string) => deps.filter(x => x.role === role).sort((a, b) => a.name.localeCompare(b.name))
  return [
    { role: "runtime", title: "Runtime", rows: by("runtime") },
    { role: "framework", title: "Framework", rows: by("framework") },
    { role: "base_image", title: "Base image", rows: by("base_image") },
    { role: "internal", title: "Internal modules", rows: by("internal") },
    { role: "library", title: "Libraries", rows: by("library") },
  ]
})
const tech = computed(() => technology(model.value))
const shownTech = computed(() => tech.value.filter(t => matches(t.deployable)))
const spreads = computed(() => [
  { title: "Runtime", values: spread(tech.value.map(t => t.runtime)) },
  { title: "Framework", values: spread(tech.value.flatMap(t => t.frameworks)) },
].filter(s => s.values.length))

// Selection for groups: checked deployables stand for the components they ship.
const checked = ref<Set<string>>(new Set())
function toggle(id: string) { const s = new Set(checked.value); s.has(id) ? s.delete(id) : s.add(id); checked.value = s }
const checkedComponents = computed(() => [...new Set(model.value.components.filter(c => checked.value.has(c.deployable)).map(c => c.component))].sort())

// From how it ships: a lens the architect takes or leaves.
const proposing = ref(false)
const mergeCoupled = ref(false)
const lensName = ref("How it ships")
const lensMade = ref("")
const proposal = computed(() => proposeLens(model.value, data.allComponents.map(c => c.name), mergeCoupled.value))
watch(mergeCoupled, v => { lensName.value = v ? "Deployed together" : "How it ships"; lensMade.value = "" })
function joinSummary(ls: Link[]): string {
  const kinds = [...new Set(ls.map(l => (LINK_LABEL[l.kind] ?? l.kind).toLowerCase()))]
  return `${ls.length} link${ls.length === 1 ? "" : "s"} (${kinds.join(", ")})`
}
function takeLens() {
  const name = lensName.value.trim()
  groups.ensureDimension(name, {
    cut: "vertical",
    description: mergeCoupled.value
      ? "Components grouped by the deployable they ship in, with deployables that call each other synchronously or share a database merged."
      : "Components grouped by the deployable they ship in.",
  })
  for (const g of proposal.value.groups) groups.createGroup(g.name, units("component", g.components), name)
  if (proposal.value.shared.length) groups.createGroup("Shipped in several", units("component", proposal.value.shared), name)
  groups.noteSaved(name, proposal.value.groups.length + (proposal.value.shared.length ? 1 : 0))
  lensMade.value = name
}

// A small header for every inspector tab.
const DeployableHeader = defineComponent({
  props: { d: { type: Object as () => Deployable, required: true } },
  setup(props) {
    return () => h("div", { class: "flex flex-col gap-0.5" }, [
      h("h2", { class: "break-all font-mono text-base font-medium text-neutral-900" }, props.d.id),
      h("p", { class: "text-xs text-neutral-500" }, [
        `${KIND_LABEL[props.d.kind] ?? props.d.kind}${props.d.platform ? " · " + (PLATFORM_LABEL[props.d.platform] ?? props.d.platform) : ""}${props.d.runtime ? " · " + props.d.runtime : ""}${props.d.repository ? " · " + props.d.repository : ""}`,
      ]),
      h(EvidenceLine, { file: props.d.file, line: props.d.line }),
    ])
  },
})

useExportables().register({
  kind: "table",
  get title() { return "Deployables" },
  rows: () => model.value.deployables.map(d => ({ deployable: d.id, kind: d.kind, built_by: d.built_by, runtime: d.runtime, base_image: d.base_image, environments: envNames(d.id).join(", "), files: d.files, components: d.components, calls: callsOut(d.id), called_by: callsIn(d.id) })),
  columns: () => [
    { id: "deployable", label: "Deployable" }, { id: "kind", label: "Kind" }, { id: "built_by", label: "Built by" }, { id: "runtime", label: "Runtime" },
    { id: "base_image", label: "Base image" }, { id: "environments", label: "Environments" }, { id: "files", label: "Files" },
    { id: "components", label: "Components" }, { id: "calls", label: "Calls" }, { id: "called_by", label: "Called by" },
  ],
  notes: () => [["read from", "Dockerfiles, compose, Kubernetes and Helm, build plugins, app hosts, serverless templates and pipelines"], ["calls", "deployables its configuration names, joined by name"]],
  disabledReason: () => (!model.value.deployables.length ? "No deployables in this snapshot." : null),
})
</script>
