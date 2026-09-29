<template>
  <ViewWorkspaceLayout
    title="Deployables"
    :queryable="false"
    v-model:search-query="search"
    search-placeholder="Find a deployable or pipeline"
    :tabs="inspectorTabs"
    v-model:active-tab="tab"
    :is-sidebar-open="!!pick"
    sidebar-width="420px"
  >
    <template #stats>
      <template v-if="model.deployables.length || model.pipelines.length">
        <span>Deployables <span class="text-neutral-800">{{ fmt(model.deployables.length) }}</span></span>
        <span class="text-neutral-400">·</span>
        <span title="Pipelines that start on their own">Pipelines <span class="text-neutral-800">{{ fmt(runners) }}</span></span>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" aria-label="What to show">
        <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :title="m.title" @click="mode = m.id">{{ m.label }}</button>
      </div>
    </template>
    <template #actions>
      <div v-if="model.deployables.length" class="relative" @keydown.esc.stop="proposing = false">
        <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="proposing" title="Group components by the deployable they ship in" @click="proposing = !proposing">
          <Icon icon="layers" :size="13" class="text-neutral-500"/><span>Make a lens</span>
        </button>
        <div v-if="proposing" class="fixed inset-0 z-40" @click="proposing = false"></div>
        <section v-if="proposing" class="ui-popover absolute right-0 z-50 mt-1 flex w-[440px] flex-col gap-2 p-3 animate-in" aria-label="From how it ships">
          <div class="flex items-baseline gap-2">
            <h3 class="text-base font-semibold text-neutral-900">From how it ships</h3>
            <p class="text-sm text-neutral-500">One group per deployable, holding the components it ships.</p>
          </div>
          <Checkbox v-model="mergeCoupled" class="text-sm">Merge deployables that call each other synchronously or share a database</Checkbox>
          <p class="text-xs text-neutral-500">Deployables that only exchange messages stay apart: they deploy and fail apart.</p>
          <p class="text-sm text-neutral-700">
            {{ plural(proposal.groups.length, "group") }}
            <template v-if="proposal.shared.length"> · {{ plural(proposal.shared.length, "component") }} in several deployables get a group of their own</template>
            <template v-if="proposal.unshipped"> · {{ plural(proposal.unshipped, "component") }} ship in nothing and stay out</template>
          </p>
          <ul class="flex max-h-56 flex-col overflow-auto rounded ring-1 ring-neutral-200">
            <li v-for="g in proposal.groups" :key="g.name" class="flex h-7 shrink-0 items-center gap-3 px-2 text-sm">
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800" :title="g.deployables.join(', ')">{{ g.name }}</span>
              <span v-if="g.sameCode" class="ui-tag" title="These deployables are built from exactly the same code">same code</span>
              <span v-if="g.joinedBy.length" class="max-w-[140px] truncate text-xs text-neutral-500" :title="g.joinedBy.map(l => `${l.from} ${l.kind} ${l.to} (${l.file}:${l.line})`).join('\n')">joined by {{ joinSummary(g.joinedBy) }}</span>
              <span class="shrink-0 font-mono text-[11px] text-neutral-500">{{ g.components.length }}</span>
            </li>
          </ul>
          <div class="flex items-center gap-2 pt-1">
            <input v-model="lensName" type="text" class="ui-input ui-input-sm w-48" aria-label="Lens name"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!proposal.groups.length || !lensName.trim()" @click="takeLens">Create lens</button>
            <span v-if="lensMade" class="text-sm text-neutral-600">Lens “{{ lensMade }}” created.</span>
          </div>
        </section>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading what this workspace builds and ships…"/>
      <EmptyState v-else-if="!available()" title="This snapshot predates deployables" text="Scans from engine revision 5 read what the workspace builds and ships: Dockerfiles, compose, Kubernetes and Helm, build plugins, pipelines. Rescan to see them." icon="boxes"/>
      <EmptyState v-else-if="!model.deployables.length && !model.pipelines.length" title="Nothing here builds or ships" text="No file in this workspace builds a container image, an executable, desktop or mobile app or a serverless function, and no pipeline was found. If the workspace ignores non-source files (an .archstatsignore with *.*), they were never read." icon="boxes"/>

      <div v-else class="min-h-0 grow overflow-y-auto" @click.self="pick = null">
        <template v-if="mode === 'overview'">
          <!-- Code: what ships each production file, from build files. -->
          <section class="px-6 pb-6 pt-4 hairline-b" aria-label="Code">
            <ExhibitFrame header-class="pb-3">
              <template #title><BandTitle name="Code" what="What ships each production file" source="read from build files"/></template>
              <CodeBand :model="model" :share="share" :lit="litDeployables" :selected="pick?.kind === 'deployable' ? pick.id : null" @pick="id => select({ kind: 'deployable', id })" @open-file="f => router.push(filePath(f))"/>
            </ExhibitFrame>
          </section>

          <!-- Ship: how it is built and released, from pipeline files. -->
          <section class="px-6 pb-6 pt-4 hairline-b" aria-label="Ship">
            <ExhibitFrame header-class="pb-3">
              <template #title><BandTitle name="Ship" what="How it is built and released" source="read from pipeline files"/></template>
              <template #aside><span v-if="pipelineWords" class="truncate text-xs">{{ pipelineWords }}</span></template>
              <p v-if="!model.pipelines.length" class="text-sm text-neutral-600">No pipeline file was found: nothing here says how this code is built or released.</p>
              <ShipBoard v-else :model="model" :rows="shownRows" :blocks="shownBlocks" :picked="pick" :lit="litPipelines" @pick="select"/>
            </ExhibitFrame>
          </section>

          <!-- Run: what each deployable is configured to call, from configuration. -->
          <section v-if="model.deployables.length" class="px-6 pb-6 pt-4" aria-label="Run">
            <ExhibitFrame header-class="pb-3">
              <template #title><BandTitle name="Run" what="What it is configured to call" source="read from configuration, not traffic"/></template>
              <template #controls>
                <div v-if="drawnMap" class="ui-segmented" role="group" aria-label="Mark each deployable by">
                  <button type="button" :aria-pressed="mark === 'kind'" @click="mark = 'kind'">Plain</button>
                  <button type="button" :aria-pressed="mark === 'runtime'" title="Colour each deployable by its runtime; two versions of one runtime read darker" @click="mark = 'runtime'">Runtime</button>
                </div>
              </template>
              <p v-if="!drawnMap" class="text-sm text-neutral-600">{{ runStatement }}</p>
              <SystemMap v-else :model="filteredModel" :selected="pick?.kind === 'deployable' ? pick.id : null" :highlight="mapHighlight" :mark="mark" @select="id => select(id ? { kind: 'deployable', id } : null)"/>
              <div v-if="drawnMap && isolated.length" class="mt-3 flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-xs text-neutral-500" title="Built in this workspace, but no call, message or datastore line touches them">Linked to nothing</span>
                <button
                  v-for="id in isolated" :key="id" type="button" class="ui-chip font-mono !text-[11px]"
                  :class="{ 'is-active': pick?.kind === 'deployable' && pick.id === id, 'opacity-40': litDeployables && !litDeployables.has(id) }"
                  @click="select({ kind: 'deployable', id })"
                >{{ id }}</button>
              </div>
            </ExhibitFrame>
          </section>
        </template>

        <div v-else class="flex flex-col">
          <ExhibitFrame v-if="model.deployables.length" :exhibit="deployTable" header-class="px-4 pb-1 pt-3">
            <template #aside>{{ plural(model.deployables.length, "deployable") }}</template>
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
                <tr v-for="d in shownDeployables" :key="d.id" class="cursor-default" :class="{ 'is-selected': pick?.kind === 'deployable' && pick.id === d.id }" @click="select({ kind: 'deployable', id: d.id })">
                  <td @click.stop><Checkbox :model-value="checked.has(d.id)" :aria-label="`Select ${d.id}`" @update:model-value="toggle(d.id)"/></td>
                  <td class="max-w-[320px] truncate font-mono text-sm text-neutral-800" :title="d.id">{{ d.id }}</td>
                  <td>{{ KIND_LABEL[d.kind] ?? d.kind }}<span v-if="d.platform" class="text-neutral-500"> · {{ PLATFORM_LABEL[d.platform] ?? d.platform }}</span></td>
                  <td class="text-neutral-600">{{ BUILT_BY_LABEL[d.built_by] ?? d.built_by }}</td>
                  <td class="font-mono text-sm text-neutral-700">{{ d.runtime || "—" }}</td>
                  <td class="max-w-[220px] truncate text-neutral-600" :title="envNames(d.id).join(', ')">{{ envNames(d.id).join(", ") || "—" }}</td>
                  <td class="is-num text-right">{{ fmt(d.files) }}</td>
                  <td class="is-num text-right">{{ fmt(callsOut(d.id)) }} · {{ fmt(callsIn(d.id)) }}</td>
                </tr>
              </tbody>
            </table>
          </ExhibitFrame>
          <h3 v-if="model.pipelines.length" class="ui-section-title px-4 pb-1 pt-6">Pipelines, workflows and actions</h3>
          <table v-if="model.pipelines.length" class="ui-table">
            <thead>
              <tr>
                <th>Pipeline</th>
                <th>Kind</th>
                <th>What it does</th>
                <th>Starts on</th>
                <th title="A template outside this workspace that does the work, and the ref it is pinned to">Hands off to</th>
                <th class="w-24 text-right">Deployables</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in shownPipelines" :key="p.id" class="cursor-default" :class="{ 'is-selected': pick?.kind === 'pipeline' && pick.id === p.id }" @click="select({ kind: 'pipeline', id: p.id })">
                <td class="max-w-[300px]">
                  <div class="truncate text-sm text-neutral-800" :title="p.name">{{ p.name }}</div>
                  <EvidenceLine :file="p.file"/>
                </td>
                <td class="text-neutral-600">{{ PIPELINE_KIND_LABEL[pipelineKind(p)] ?? pipelineKind(p) }}<span v-if="p.system !== 'github_actions'" class="text-neutral-500"> · {{ SYSTEM_LABEL[p.system] ?? p.system }}</span></td>
                <td class="list-track"><StageTrack :stages="p.stages"/></td>
                <td class="max-w-[160px] truncate text-neutral-600" :title="p.triggers + (p.paths ? '\nPaths: ' + p.paths : '')">{{ list(p.triggers).map(t => TRIGGER_LABEL[t] ?? t).join(", ") || "—" }}</td>
                <td class="max-w-[280px] truncate font-mono text-xs text-neutral-700" :title="p.delegates_to">{{ p.delegates_to || "—" }}</td>
                <td class="is-num text-right">{{ fmt(p.deployables) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <GroupActionBar v-if="checkedComponents.length" :selected-items="checkedComponents" kind="component" :show-in-except="[]" @replace="checked = new Set()" @clear="checked = new Set()" @created="checked = new Set()"/>
    </template>

    <!-- The inspector for a pipeline, or a row of pipelines that do the same thing. -->
    <template #tab-pipe>
      <PipelinePanel
        v-if="pickedPipelines.length" :model="model" :pipelines="pickedPipelines" :name="pickedRow?.name"
        @pick-pipeline="id => select({ kind: 'pipeline', id })" @pick-deployable="id => select({ kind: 'deployable', id })"
      />
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
                <button v-if="l.to_kind === 'deployable'" type="button" class="font-mono text-neutral-800 hover:underline" @click="select({ kind: 'deployable', id: l.to })">{{ l.to }}</button>
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
            <li v-for="l in callers" :key="l.from"><button type="button" class="ui-tag font-mono" @click="select({ kind: 'deployable', id: l.from })">{{ l.from }}</button></li>
          </ul>
        </div>
      </template>
    </template>

    <template #tab-pipeline>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!pickedDeployablePipelines.length" class="text-sm text-neutral-600">No pipeline in this workspace was found to build or deploy it.</p>
        <div v-for="pp in pickedDeployablePipelines" :key="pp.pipeline.id" class="flex flex-col gap-1.5 hairline-b pb-3">
          <div class="flex items-baseline gap-2">
            <button type="button" class="text-left text-sm font-medium text-neutral-900 hover:underline" @click="select({ kind: 'pipeline', id: pp.pipeline.id })">{{ pp.pipeline.name }}</button>
            <span class="text-xs text-neutral-500">{{ SYSTEM_LABEL[pp.pipeline.system] ?? pp.pipeline.system }}</span>
          </div>
          <span class="inspector-track"><StageTrack :stages="pp.pipeline.stages"/></span>
          <p class="text-xs text-neutral-600">{{ cap(pp.actions.map(a => a.action).join(" and ")) }} it<template v-if="pp.pipeline.triggers"> · starts on {{ list(pp.pipeline.triggers).map(t => TRIGGER_LABEL[t] ?? t).join(", ") }}</template></p>
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
              <span class="shrink-0 font-mono text-xs" :class="drifted(x) ? 'font-medium text-neutral-900' : 'text-neutral-500'" :title="drifted(x) ? `Other deployables here use ${drifted(x)}` : undefined">{{ x.version || "—" }}</span>
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
import { useRouter } from "vue-router"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import OpenInEditor from "~/features/files/components/OpenInEditor.vue"
import Checkbox from "~/shared/ui/Checkbox.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import SystemMap from "~/features/deployables/components/SystemMap.vue"
import CodeBand from "~/features/deployables/components/CodeBand.vue"
import ShipBoard from "~/features/deployables/components/ShipBoard.vue"
import PipelinePanel from "~/features/deployables/components/PipelinePanel.vue"
import StageTrack from "~/features/deployables/components/StageTrack.vue"
import EvidenceLine from "~/features/deployables/components/EvidenceLine.vue"
import { useDeployables } from "~/features/deployables/useDeployables"
import {
  arrangeMap, buildingBlocks, BUILT_BY_LABEL, calledBy, codeShare, componentsOf, envDiff, environmentsOf, KIND_LABEL, LINK_LABEL, list,
  PIPELINE_KIND_LABEL, pipelineKind, pipelinesOf, PLATFORM_LABEL, proposeLens, shippedBy, shipRows, startsOnItsOwn, SYSTEM_LABEL, talksTo,
  TRIGGER_LABEL, UNRESOLVED_LABEL, type Dependency, type Deployable, type Link,
} from "~/features/deployables/deployables"
import { componentPath, filePath } from "~/features/navigation/routes"
import { units, useGroupsStore } from "~/features/groups/groups.store"
import { useDataStore } from "~/features/snapshot/data.store"
import { useStateStore } from "~/platform/state.store"
import { useTable } from "~/features/export/useExportables"

const { model, loading, available } = useDeployables()
const data = useDataStore()
const groups = useGroupsStore()
const state = useStateStore()
const router = useRouter()
const fmt = (n: number) => n.toLocaleString("en-US")
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const MODES = [
  { id: "overview", label: "Overview", title: "What ships the code, how it is built and released, and what it calls" },
  { id: "list", label: "List", title: "Every deployable and every pipeline, as tables" },
] as const
type Mode = typeof MODES[number]["id"]
const mode = computed<Mode>({
  // A key of its own: the page before this one kept "deployables.mode", and a
  // List chosen there would hide the overview that replaced its map.
  get: () => (state.get<string>("deployables.view", "overview") === "list" ? "list" : "overview"),
  set: v => state.set("deployables.view", v === "overview" ? null : v),
})
const mark = computed<"kind" | "runtime">({
  get: () => (state.get<string>("deployables.mark", "kind") === "runtime" ? "runtime" : "kind"),
  set: v => state.set("deployables.mark", v === "kind" ? null : v),
})

// A band title: the band's one word, what it shows, and which files say so.
const BandTitle = defineComponent({
  props: { name: { type: String, required: true }, what: { type: String, required: true }, source: { type: String, required: true } },
  setup(p) {
    return () => h("h3", { class: "flex min-w-0 items-baseline gap-2.5" }, [
      h("span", { class: "text-[15px] font-semibold text-neutral-900" }, p.name),
      h("span", { class: "truncate text-sm text-neutral-700" }, p.what),
      h("span", { class: "hidden shrink-0 text-xs text-neutral-500 lg:inline" }, p.source),
    ])
  },
})

// ---------------------------------------------------------------------------
// What is picked, and what it lights in the other bands
// ---------------------------------------------------------------------------

type Pick = { kind: "deployable" | "pipeline" | "row"; id: string }
const pick = ref<Pick | null>(null)
function select(p: Pick | null) {
  pick.value = p && pick.value && p.kind === pick.value.kind && p.id === pick.value.id ? null : p
}
watch(() => data.datasetKey, () => { pick.value = null })

const picked = computed<Deployable | null>(() => (pick.value?.kind === "deployable" ? model.value.deployables.find(d => d.id === pick.value!.id) ?? null : null))
const rows = computed(() => shipRows(model.value))
const blocks = computed(() => buildingBlocks(model.value))
const runners = computed(() => model.value.pipelines.filter(startsOnItsOwn).length)
const pickedRow = computed(() => (pick.value?.kind === "row" ? rows.value.find(r => r.key === pick.value!.id) ?? null : null))
const pickedPipelines = computed(() => {
  if (pickedRow.value) return pickedRow.value.pipelines
  if (pick.value?.kind === "pipeline") return model.value.pipelines.filter(p => p.id === pick.value!.id)
  return []
})

const DEPLOYABLE_TABS = [
  { id: "built", label: "Built from" },
  { id: "talks", label: "Talks to" },
  { id: "pipeline", label: "Pipelines" },
  { id: "envs", label: "Environments" },
  { id: "tech", label: "Technology" },
]
const inspectorTabs = computed(() => (picked.value ? DEPLOYABLE_TABS : pickedPipelines.value.length ? [{ id: "pipe", label: "Pipeline" }] : []))
const tab = ref("built")
watch(pick, p => {
  if (p?.kind === "deployable" && tab.value === "pipe") tab.value = "built"
  if (p && p.kind !== "deployable") tab.value = "pipe"
})

const search = ref("")
const query = computed(() => search.value.trim().toLowerCase())
const matches = (s: string) => !query.value || s.toLowerCase().includes(query.value)

const pipelineIds = (ps: Array<{ id: string }>) => new Set(ps.map(p => p.id))
/** The pipelines a set uses and is used by, one step out. */
function withNeighbours(ids: Set<string>): Set<string> {
  const out = new Set(ids)
  for (const p of model.value.pipelines) {
    if (ids.has(p.id)) list(p.calls).forEach(c => out.add(c))
    if (list(p.calls).some(c => ids.has(c))) out.add(p.id)
  }
  return out
}

const litDeployables = computed<Set<string> | null>(() => {
  const p = pick.value
  if (p?.kind === "deployable") return new Set([p.id])
  if (p) return shippedBy(model.value, withNeighbours(pipelineIds(pickedPipelines.value)))
  if (query.value) return new Set(model.value.deployables.filter(d => matches(d.id)).map(d => d.id))
  return null
})
const litPipelines = computed<Set<string> | null>(() => {
  const p = pick.value
  if (p?.kind === "deployable") return withNeighbours(new Set(model.value.pipelineLinks.filter(l => l.deployable === p.id).map(l => l.pipeline)))
  if (p) return withNeighbours(pipelineIds(pickedPipelines.value))
  return null
})
const mapHighlight = computed(() => (pick.value && pick.value.kind !== "deployable" ? litDeployables.value : query.value ? litDeployables.value : null))

const share = computed(() => codeShare(model.value))
const shownRows = computed(() => (query.value ? rows.value.filter(r => r.pipelines.some(p => matches(p.name) || matches(p.file))) : rows.value))
const shownBlocks = computed(() => (query.value ? blocks.value.filter(b => matches(b.pipeline.name) || matches(b.pipeline.file)) : blocks.value))
const shownDeployables = computed(() => model.value.deployables.filter(d => matches(d.id)))
const shownPipelines = computed(() => model.value.pipelines.filter(p => matches(p.name) || matches(p.file)))
const filteredModel = computed(() => {
  if (!query.value) return model.value
  const keep = new Set(shownDeployables.value.map(d => d.id))
  return { ...model.value, deployables: shownDeployables.value, links: model.value.links.filter(l => keep.has(l.from)) }
})

const arranged = computed(() => arrangeMap(filteredModel.value))
const drawnMap = computed(() => arranged.value.edges.length > 0)
const isolated = computed(() => arranged.value.isolated)
const runStatement = computed(() => {
  const d = model.value.deployables
  if (d.length === 1) return `Its configuration names no other deployable, datastore, broker or service for ${d[0].id} to call.`
  return "No configuration here names a call, a message or a datastore between these deployables."
})

const pipelineWords = computed(() => {
  const n = rows.value.reduce((a, r) => a + r.pipelines.length, 0)
  const groupsOfMany = rows.value.filter(r => r.pipelines.length > 1).length
  if (!n || !groupsOfMany) return ""
  return `${plural(n, "pipeline")} in ${plural(rows.value.length, "row")}: pipelines that do the same thing share one`
})

// ---------------------------------------------------------------------------
// One deployable
// ---------------------------------------------------------------------------

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
  const platform = d.platform && d.platform !== d.built_by ? ` for ${PLATFORM_LABEL[d.platform] ?? d.platform}` : ""
  return `${/^[aeiou]/.test(kind) ? "An" : "A"} ${kind}${platform} built by ${how}${on}, holding ${fmt(d.files)} production files in ${fmt(d.components)} components.`
})

const talks = computed(() => talksTo(model.value, picked.value?.id ?? ""))
const talkCount = computed(() => talks.value.sync.length + talks.value.async.length + talks.value.data.length + talks.value.modules.length + talks.value.startup.length)
const talkSections = computed(() => [
  { title: "Calls, synchronously", hint: "A URL or host:port in its configuration, or a reference in an app host", rows: talks.value.sync },
  { title: "Messages, asynchronously", hint: "A broker it connects to, or a topic or queue another deployable names too", rows: talks.value.async },
  { title: "Data", hint: "A database it connects to, and deployables that name the same one", rows: talks.value.data },
  { title: "Shared modules", hint: "Modules of this workspace inside it that other deployables carry too", rows: talks.value.modules },
  { title: "Starts after", hint: "compose depends_on", rows: talks.value.startup },
])
const callers = computed(() => picked.value ? calledBy(model.value, picked.value.id) : [])
const pickedDeployablePipelines = computed(() => picked.value ? pipelinesOf(model.value, picked.value.id) : [])
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
// Runtimes, frameworks and base images in more than one version across the workspace.
const versionsOf = computed(() => {
  const by = new Map<string, Set<string>>()
  for (const x of model.value.dependencies) {
    if (!x.version || !["runtime", "framework", "base_image"].includes(x.role)) continue
    const k = `${x.role}|${x.name}`
    by.set(k, (by.get(k) ?? new Set()).add(x.version))
  }
  return by
})
function drifted(x: Dependency): string {
  const vs = versionsOf.value.get(`${x.role}|${x.name}`)
  return vs && vs.size > 1 ? [...vs].filter(v => v !== x.version).join(", ") : ""
}

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

// A small header for every deployable inspector tab.
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

const deployTable = useTable({
  get title() { return "Deployables" },
  rows: () => model.value.deployables.map(d => ({ deployable: d.id, kind: d.kind, platform: d.platform ?? "", built_by: d.built_by, runtime: d.runtime, base_image: d.base_image, environments: envNames(d.id).join(", "), files: d.files, components: d.components, calls: callsOut(d.id), called_by: callsIn(d.id) })),
  columns: () => [
    { id: "deployable", label: "Deployable" }, { id: "kind", label: "Kind" }, { id: "platform", label: "Platform" }, { id: "built_by", label: "Built by" }, { id: "runtime", label: "Runtime" },
    { id: "base_image", label: "Base image" }, { id: "environments", label: "Environments" }, { id: "files", label: "Files" },
    { id: "components", label: "Components" }, { id: "calls", label: "Calls" }, { id: "called_by", label: "Called by" },
  ],
  notes: () => [["read from", "Dockerfiles, compose, Kubernetes and Helm, build plugins, app hosts, serverless templates, desktop and mobile app configuration, and pipelines"], ["calls", "deployables its configuration names, joined by name"]],
  disabledReason: () => (!model.value.deployables.length ? "No deployables in this snapshot." : null),
})
</script>

<style scoped>
.list-track { --stage-w: 22px; }
.inspector-track { --stage-w: 44px; }
</style>
