<template>
  <ViewWorkspaceLayout
    :title="t('pages.deployablesIndex.deployables')"
    :queryable="false"
    v-model:search-query="search"
    :search-placeholder="t('pages.deployablesIndex.findDeployablePipeline')"
    :tabs="inspectorTabs"
    v-model:active-tab="tab"
    :is-sidebar-open="!!pick"
    sidebar-width="420px"
  >
    <template #stats>
      <template v-if="model.deployables.length || model.pipelines.length">
        <span>{{ t('pages.deployablesIndex.deployables') }} <span class="text-neutral-800">{{ fmt(model.deployables.length) }}</span></span>
        <span class="text-neutral-400">·</span>
        <span :title="t('pages.deployablesIndex.pipelinesStartTheirOwn')">{{ t('pages.deployablesIndex.pipelines') }} <span class="text-neutral-800">{{ fmt(runners) }}</span></span>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.deployablesIndex.whatShow')">
        <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :title="m.title" @click="mode = m.id">{{ m.label }}</button>
      </div>
    </template>
    <template #actions>
      <div v-if="model.deployables.length" class="relative" @keydown.esc.stop="proposing = false">
        <button type="button" class="ui-btn ui-btn-sm" :aria-expanded="proposing" :title="t('pages.deployablesIndex.groupComponentsDeployableThey')" @click="proposing = !proposing">
          <Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('pages.deployablesIndex.makeLens') }}</span>
        </button>
        <div v-if="proposing" class="fixed inset-0 z-40" @click="proposing = false"></div>
        <section v-if="proposing" class="ui-popover absolute right-0 z-50 mt-1 flex w-[440px] flex-col gap-2 p-3 animate-in" :aria-label="t('pages.deployablesIndex.howShips')">
          <div class="flex items-baseline gap-2">
            <h3 class="text-base font-semibold text-neutral-900">{{ t('pages.deployablesIndex.howShips') }}</h3>
            <p class="text-sm text-neutral-500">{{ t('pages.deployablesIndex.oneGroupPerDeployable') }}</p>
          </div>
          <Checkbox v-model="mergeCoupled" class="text-sm">{{ t('pages.deployablesIndex.mergeDeployablesCallEach') }}</Checkbox>
          <p class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.deployablesOnlyExchangeMessages') }}</p>
          <p class="text-sm text-neutral-700">
            {{t('common.count.group', { count: proposal.groups.length })}}
            <template v-if="proposal.shared.length">{{ ' ' + t('pages.deployablesIndex.severalDeployablesGetGroup', { components: t('common.count.component', { count: proposal.shared.length }) }) }}</template>
            <template v-if="proposal.unshipped">{{ ' ' + t('pages.deployablesIndex.shipNothingStayOut', { components: t('common.count.component', { count: proposal.unshipped }) }) }}</template>
          </p>
          <ul class="flex max-h-56 flex-col overflow-auto rounded ring-1 ring-neutral-200">
            <li v-for="g in proposal.groups" :key="g.name" class="flex h-7 shrink-0 items-center gap-3 px-2 text-sm">
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800" :title="g.deployables.join(', ')">{{ g.name }}</span>
              <span v-if="g.sameCode" class="ui-tag" :title="t('pages.deployablesIndex.theseDeployablesBuiltExactly')">{{ t('pages.deployablesIndex.sameCode') }}</span>
              <span v-if="g.joinedBy.length" class="max-w-[140px] truncate text-xs text-neutral-500" :title="g.joinedBy.map(l => `${l.from} ${l.kind} ${l.to} (${l.file}:${l.line})`).join('\n')">{{ t('pages.deployablesIndex.joined', { joinedBy: joinSummary(g.joinedBy) }) }}</span>
              <span class="shrink-0 font-mono text-[11px] text-neutral-500">{{ g.components.length }}</span>
            </li>
          </ul>
          <div class="flex items-center gap-2 pt-1">
            <input v-model="lensName" type="text" class="ui-input ui-input-sm w-48" :aria-label="t('pages.deployablesIndex.lensName')"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!proposal.groups.length || !lensName.trim()" @click="takeLens">{{ t('pages.deployablesIndex.createLens') }}</button>
            <span v-if="lensMade" class="text-sm text-neutral-600">{{ t('pages.deployablesIndex.lensCreated', { lensMade }) }}</span>
          </div>
        </section>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" :text="t('pages.deployablesIndex.readingWhatWorkspaceBuilds')"/>
      <EmptyState v-else-if="!available()" :title="t('pages.deployablesIndex.snapshotPredatesDeployables')" :text="t('pages.deployablesIndex.scansEngineRevision5')" icon="boxes"/>
      <EmptyState v-else-if="!model.deployables.length && !model.pipelines.length" :title="t('pages.deployablesIndex.nothingHereBuildsShips')" text="No file in this workspace builds a container image, an executable, desktop or mobile app or a serverless function, and no pipeline was found. If the workspace ignores non-source files (an .archstatsignore with *.*), they were never read." icon="boxes"/>

      <div v-else class="min-h-0 grow overflow-y-auto" @click.self="pick = null">
        <template v-if="mode === 'overview'">
          <!-- Code: what ships each production file, from build files. -->
          <section class="px-6 pb-6 pt-4 hairline-b" :aria-label="t('pages.deployablesIndex.code')">
            <ExhibitFrame header-class="pb-3">
              <template #title><BandTitle name="Code" what="What ships each production file" source="read from build files"/></template>
              <CodeBand :model="model" :share="share" :lit="litDeployables" :selected="pick?.kind === 'deployable' ? pick.id : null" @pick="id => select({ kind: 'deployable', id })" @open-file="f => router.push(filePath(f))"/>
            </ExhibitFrame>
          </section>

          <!-- Ship: how it is built and released, from pipeline files. -->
          <section class="px-6 pb-6 pt-4 hairline-b" :aria-label="t('pages.deployablesIndex.ship')">
            <ExhibitFrame header-class="pb-3">
              <template #title><BandTitle name="Ship" what="How it is built and released" source="read from pipeline files"/></template>
              <template #aside><span v-if="pipelineWords" class="truncate text-xs">{{ pipelineWords }}</span></template>
              <p v-if="!model.pipelines.length" class="text-sm text-neutral-600">{{ t('pages.deployablesIndex.noPipelineFileWas') }}</p>
              <ShipBoard v-else :model="model" :rows="shownRows" :blocks="shownBlocks" :picked="pick" :lit="litPipelines" @pick="select"/>
            </ExhibitFrame>
          </section>

          <!-- Run: what each deployable is configured to call, from configuration. -->
          <section v-if="model.deployables.length" class="px-6 pb-6 pt-4" :aria-label="t('pages.deployablesIndex.run')">
            <ExhibitFrame header-class="pb-3">
              <template #title><BandTitle name="Run" what="What it is configured to call" source="read from configuration, not traffic"/></template>
              <template #controls>
                <div v-if="drawnMap" class="ui-segmented" role="group" :aria-label="t('pages.deployablesIndex.markEachDeployable')">
                  <button type="button" :aria-pressed="mark === 'kind'" @click="mark = 'kind'">{{ t('pages.deployablesIndex.plain') }}</button>
                  <button type="button" :aria-pressed="mark === 'runtime'" :title="t('pages.deployablesIndex.colourEachDeployableRuntime')" @click="mark = 'runtime'">{{ t('pages.deployablesIndex.runtime') }}</button>
                </div>
              </template>
              <p v-if="!drawnMap" class="text-sm text-neutral-600">{{ runStatement }}</p>
              <SystemMap v-else :model="filteredModel" :selected="pick?.kind === 'deployable' ? pick.id : null" :highlight="mapHighlight" :mark="mark" @select="id => select(id ? { kind: 'deployable', id } : null)"/>
              <div v-if="drawnMap && isolated.length" class="mt-3 flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-xs text-neutral-500" :title="t('pages.deployablesIndex.builtWorkspaceButNo')">{{ t('pages.deployablesIndex.linkedNothing') }}</span>
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
            <template #aside>{{t('common.count.deployable', { count: model.deployables.length })}}</template>
            <table class="ui-table">
              <thead>
                <tr>
                  <th class="w-8"></th>
                  <th>{{ t('pages.deployablesIndex.deployable') }}</th>
                  <th>{{ t('pages.deployablesIndex.kind') }}</th>
                  <th>{{ t('pages.deployablesIndex.built') }}</th>
                  <th>{{ t('pages.deployablesIndex.runtime') }}</th>
                  <th :title="t('pages.deployablesIndex.environmentsRunsValuesFiles')">{{ t('pages.deployablesIndex.environments') }}</th>
                  <th class="w-20 text-right" :title="t('pages.deployablesIndex.productionFilesHoldsBuild')">{{ t('pages.deployablesIndex.files') }}</th>
                  <th class="w-24 text-right" :title="t('pages.deployablesIndex.deployablesCallsDeployablesCall')">{{ t('pages.deployablesIndex.callsOut') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in shownDeployables" :key="d.id" class="cursor-default" :class="{ 'is-selected': pick?.kind === 'deployable' && pick.id === d.id }" @click="select({ kind: 'deployable', id: d.id })">
                  <td @click.stop><Checkbox :model-value="checked.has(d.id)" :aria-label="t('pages.deployablesIndex.select', { id: d.id })" @update:model-value="toggle(d.id)"/></td>
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
          <h3 v-if="model.pipelines.length" class="ui-section-title px-4 pb-1 pt-6">{{ t('pages.deployablesIndex.pipelinesWorkflowsActions') }}</h3>
          <table v-if="model.pipelines.length" class="ui-table">
            <thead>
              <tr>
                <th>{{ t('pages.deployablesIndex.pipeline') }}</th>
                <th>{{ t('pages.deployablesIndex.kind') }}</th>
                <th>{{ t('pages.deployablesIndex.whatDoes') }}</th>
                <th>{{ t('pages.deployablesIndex.starts') }}</th>
                <th :title="t('pages.deployablesIndex.templateOutsideWorkspaceDoes')">{{ t('pages.deployablesIndex.handsOff') }}</th>
                <th class="w-24 text-right">{{ t('pages.deployablesIndex.deployables') }}</th>
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
                <td class="max-w-[160px] truncate text-neutral-600" :title="p.triggers + (p.paths ? t('pages.deployablesIndex.paths', { paths: p.paths }) : '')">{{ list(p.triggers).map(t => TRIGGER_LABEL[t] ?? t).join(", ") || "—" }}</td>
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
          <h4 class="ui-label">{{ t('pages.deployablesIndex.whatGoes') }}</h4>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="c in contentsOf" :key="c.path + c.pattern" class="flex flex-col">
              <span class="font-mono text-sm text-neutral-800">{{ c.path === "." ? t('pages.deployablesIndex.wholeWorkspace') : c.path }}<span v-if="c.pattern" class="text-neutral-500">/{{ c.pattern }}</span><span v-if="c.module" class="ml-2 text-xs text-neutral-500">{{ t('pages.deployablesIndex.module', { module: c.module }) }}</span></span>
              <EvidenceLine :file="c.file" :line="c.line" :resolution="c.resolution"/>
            </li>
          </ul>
        </div>
        <div v-if="pickedComponents.length">
          <div class="flex items-baseline gap-2">
            <h4 class="ui-label">{{ t('pages.deployablesIndex.componentsShips') }}</h4>
            <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="checked = new Set([picked.id])">{{ t('pages.deployablesIndex.selectGroup') }}</button>
          </div>
          <ul class="mt-1 flex flex-col">
            <li v-for="c in pickedComponents.slice(0, 40)" :key="c.component" class="flex h-7 items-center gap-2">
              <router-link :to="componentPath(c.component)" class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800 hover:underline" :title="c.component">{{ c.component }}</router-link>
              <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ fmt(c.files) }}</span>
            </li>
          </ul>
          <p v-if="pickedComponents.length > 40" class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.more', { value: fmt(pickedComponents.length - 40) }) }}</p>
        </div>
      </template>
    </template>

    <template #tab-talks>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!talkCount" class="text-sm text-neutral-600">{{ t('pages.deployablesIndex.configurationNamesNothingWorkspace') }}</p>
        <div v-for="sec in talkSections" :key="sec.title" v-show="sec.rows.length">
          <h4 class="ui-label" :title="sec.hint">{{ sec.title }}</h4>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="l in sec.rows" :key="l.kind + l.to + l.via" class="flex flex-col">
              <span class="flex items-center gap-2 text-sm">
                <button v-if="l.to_kind === 'deployable'" type="button" class="font-mono text-neutral-800 hover:underline" @click="select({ kind: 'deployable', id: l.to })">{{ l.to }}</button>
                <span v-else class="font-mono text-neutral-600" :title="l.to_kind === 'module' ? t('pages.deployablesIndex.moduleWorkspace') : t('pages.deployablesIndex.notBuiltWorkspace')">{{ l.to }}</span>
                <span class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.via', { via: l.via }) }}</span>
              </span>
              <EvidenceLine :file="l.file" :line="l.line" :resolution="l.resolution"/>
            </li>
          </ul>
        </div>
        <div v-if="talks.outside.length">
          <h4 class="ui-label" :title="t('pages.deployablesIndex.hostsImagesConfigurationNames')">{{ t('pages.deployablesIndex.namedButNotWorkspace') }}</h4>
          <ul class="mt-1 flex flex-col gap-1">
            <li v-for="u in talks.outside" :key="u.ref + u.line" class="flex flex-col">
              <span class="font-mono text-sm text-neutral-600">{{ u.ref }} <span class="font-sans text-xs text-neutral-400">{{ UNRESOLVED_LABEL[u.reason] ?? u.reason }}</span></span>
              <EvidenceLine :file="u.file" :line="u.line"/>
            </li>
          </ul>
        </div>
        <div v-if="callers.length">
          <h4 class="ui-label">{{ t('pages.deployablesIndex.called') }}</h4>
          <ul class="mt-1 flex flex-wrap gap-1.5">
            <li v-for="l in callers" :key="l.from"><button type="button" class="ui-tag font-mono" @click="select({ kind: 'deployable', id: l.from })">{{ l.from }}</button></li>
          </ul>
        </div>
      </template>
    </template>

    <template #tab-pipeline>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!pickedDeployablePipelines.length" class="text-sm text-neutral-600">{{ t('pages.deployablesIndex.noPipelineWorkspaceWas') }}</p>
        <div v-for="pp in pickedDeployablePipelines" :key="pp.pipeline.id" class="flex flex-col gap-1.5 hairline-b pb-3">
          <div class="flex items-baseline gap-2">
            <button type="button" class="text-left text-sm font-medium text-neutral-900 hover:underline" @click="select({ kind: 'pipeline', id: pp.pipeline.id })">{{ pp.pipeline.name }}</button>
            <span class="text-xs text-neutral-500">{{ SYSTEM_LABEL[pp.pipeline.system] ?? pp.pipeline.system }}</span>
          </div>
          <span class="inspector-track"><StageTrack :stages="pp.pipeline.stages"/></span>
          <p class="text-xs text-neutral-600">{{ t('pages.deployablesIndex.it', { value: cap(listOf(pp.actions.map(a => a.action))) }) }}<template v-if="pp.pipeline.triggers">{{ ' ' + t('pages.deployablesIndex.starts2', { value: list(pp.pipeline.triggers).map(t => TRIGGER_LABEL[t] ?? t).join(", ") }) }}</template></p>
          <EvidenceLine v-for="a in pp.actions" :key="a.action" :file="a.file" :line="a.line" :resolution="a.resolution"/>
        </div>
      </template>
    </template>

    <template #tab-envs>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p v-if="!pickedEnvs.length" class="text-sm text-neutral-600">{{ t('pages.deployablesIndex.noValuesFileOverlay') }}</p>
        <ul class="flex flex-col gap-1">
          <li v-for="e in pickedEnvs" :key="e.environment" class="flex flex-col">
            <span class="text-sm text-neutral-800">{{ e.environment }}<span v-if="e.kind === 'pattern'" class="ml-2 ui-tag !text-[11px]" :title="t('pages.deployablesIndex.openEndedSetMade')">{{ t('pages.deployablesIndex.pattern') }}</span></span>
            <EvidenceLine v-for="s in e.sources" :key="s.source + s.file" :file="s.file" :line="s.line"/>
          </li>
        </ul>
        <div v-if="diff.environments.length > 1">
          <h4 class="ui-label" :title="t('pages.deployablesIndex.onlyHelmValuesFiles')">{{ t('pages.deployablesIndex.howValuesFilesDiffer') }}</h4>
          <p class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.settingsDifferSameEverywhere', { rowsLength: fmt(diff.rows.length), same: fmt(diff.same) }) }}</p>
          <div class="mt-1 overflow-auto">
            <table class="ui-table text-xs">
              <thead><tr><th>{{ t('pages.deployablesIndex.setting') }}</th><th v-for="e in diff.environments" :key="e">{{ e }}</th></tr></thead>
              <tbody>
                <tr v-for="r in diff.rows.slice(0, 80)" :key="r.key">
                  <td class="max-w-[160px] truncate font-mono" :title="r.key">{{ r.key }}</td>
                  <td v-for="e in diff.environments" :key="e" class="max-w-[120px] truncate font-mono" :title="r.values[e] ?? t('pages.deployablesIndex.notSet')">
                    <span v-if="r.secret" class="text-neutral-400">{{ t('pages.deployablesIndex.secret') }}</span>
                    <span v-else-if="r.values[e] === undefined" class="text-neutral-300">—</span>
                    <span v-else>{{ r.values[e] }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else-if="pickedEnvs.length" class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.noComparableValuesEnvironments') }}</p>
      </template>
    </template>

    <template #tab-tech>
      <template v-if="picked">
        <DeployableHeader :d="picked"/>
        <p class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.directDependenciesManifestsDeclare') }}</p>
        <div v-for="g in techGroups" :key="g.role" v-show="g.rows.length">
          <h4 class="ui-label">{{ g.title }}</h4>
          <ul class="mt-1 flex flex-col">
            <li v-for="x in g.rows.slice(0, 60)" :key="x.ecosystem + x.name" class="flex min-h-7 items-center gap-2">
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-800" :title="x.name">{{ x.name }}</span>
              <span class="shrink-0 font-mono text-xs" :class="drifted(x) ? 'font-medium text-neutral-900' : 'text-neutral-500'" :title="drifted(x) ? t('pages.deployablesIndex.otherDeployablesHereUse', { x: drifted(x) }) : undefined">{{ x.version || "—" }}</span>
              <OpenInEditor v-if="x.file" :file="x.file.replace(/^\.\//, '')" :line="x.line || undefined" button-class="!h-5 !w-5"/>
            </li>
          </ul>
          <p v-if="g.rows.length > 60" class="text-xs text-neutral-500">{{ t('pages.deployablesIndex.more', { value: fmt(g.rows.length - 60) }) }}</p>
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
import { t, intlLocale, listOf } from "~/shared/i18n"

const { model, loading, available } = useDeployables()
const data = useDataStore()
const groups = useGroupsStore()
const state = useStateStore()
const router = useRouter()
const fmt = (n: number) => n.toLocaleString(intlLocale)
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const MODES = [
  { id: "overview", label: t("pages.deployablesIndex.overview"), title: t("pages.deployablesIndex.whatShipsCodeHow") },
  { id: "list", label: t("pages.deployablesIndex.list"), title: t("pages.deployablesIndex.everyDeployableEveryPipeline") },
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
  { id: "built", label: t("pages.deployablesIndex.built2") },
  { id: "talks", label: t("pages.deployablesIndex.talks") },
  { id: "pipeline", label: t("pages.deployablesIndex.pipelines") },
  { id: "envs", label: t("pages.deployablesIndex.environments") },
  { id: "tech", label: t("pages.deployablesIndex.technology") },
]
const inspectorTabs = computed(() => (picked.value ? DEPLOYABLE_TABS : pickedPipelines.value.length ? [{ id: "pipe", label: t("pages.deployablesIndex.pipeline") }] : []))
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
  if (d.length === 1) return t("pages.deployablesIndex.configurationNamesNoOther", { id: d[0].id })
  return t("pages.deployablesIndex.noConfigurationHereNames")
})

const pipelineWords = computed(() => {
  const n = rows.value.reduce((a, r) => a + r.pipelines.length, 0)
  const groupsOfMany = rows.value.filter(r => r.pipelines.length > 1).length
  if (!n || !groupsOfMany) return ""
  return t("pages.deployablesIndex.pipelinesDoSameThing", { pipelines: t("common.count.pipeline", { count: n }), rows: t("common.count.row", { count: rows.value.length }) })
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
  const on = d.base_image ? t("pages.deployablesIndex.on", { value: d.base_image.split("@")[0] }) : ""
  const platform = d.platform && d.platform !== d.built_by ? t("pages.deployablesIndex.for", { value: PLATFORM_LABEL[d.platform] ?? d.platform }) : ""
  return t("pages.deployablesIndex.builtHoldingProductionFiles", { value: /^[aeiou]/.test(kind) ? t("pages.deployablesIndex.an") : "A", kind, platform, how, on, files: fmt(d.files), components: fmt(d.components) })
})

const talks = computed(() => talksTo(model.value, picked.value?.id ?? ""))
const talkCount = computed(() => talks.value.sync.length + talks.value.async.length + talks.value.data.length + talks.value.modules.length + talks.value.startup.length)
const talkSections = computed(() => [
  { title: t("pages.deployablesIndex.callsSynchronously"), hint: t("pages.deployablesIndex.urlHostPortConfiguration"), rows: talks.value.sync },
  { title: t("pages.deployablesIndex.messagesAsynchronously"), hint: t("pages.deployablesIndex.brokerConnectsTopicQueue"), rows: talks.value.async },
  { title: t("pages.deployablesIndex.data"), hint: t("pages.deployablesIndex.databaseConnectsDeployablesName"), rows: talks.value.data },
  { title: t("pages.deployablesIndex.sharedModules"), hint: t("pages.deployablesIndex.modulesWorkspaceInsideOther"), rows: talks.value.modules },
  { title: t("pages.deployablesIndex.startsAfter"), hint: t("pages.deployablesIndex.composeDepends"), rows: talks.value.startup },
])
const callers = computed(() => picked.value ? calledBy(model.value, picked.value.id) : [])
const pickedDeployablePipelines = computed(() => picked.value ? pipelinesOf(model.value, picked.value.id) : [])
const pickedEnvs = computed(() => picked.value ? environmentsOf(model.value, picked.value.id) : [])
const diff = computed(() => picked.value ? envDiff(model.value.values, picked.value.id) : { environments: [], rows: [], same: 0 })

const techGroups = computed(() => {
  const deps = picked.value ? model.value.dependencies.filter(x => x.deployable === picked.value!.id) : []
  const by = (role: string) => deps.filter(x => x.role === role).sort((a, b) => a.name.localeCompare(b.name))
  return [
    { role: "runtime", title: t("pages.deployablesIndex.runtime"), rows: by("runtime") },
    { role: "framework", title: t("pages.deployablesIndex.framework"), rows: by("framework") },
    { role: "base_image", title: t("pages.deployablesIndex.baseImage"), rows: by("base_image") },
    { role: "internal", title: t("pages.deployablesIndex.internalModules"), rows: by("internal") },
    { role: "library", title: t("pages.deployablesIndex.libraries"), rows: by("library") },
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
const lensName = ref(t("pages.deployablesIndex.howShips2"))
const lensMade = ref("")
const proposal = computed(() => proposeLens(model.value, data.allComponents.map(c => c.name), mergeCoupled.value))
watch(mergeCoupled, v => { lensName.value = v ? t("pages.deployablesIndex.deployedTogether") : t("pages.deployablesIndex.howShips2"); lensMade.value = "" })
function joinSummary(ls: Link[]): string {
  const kinds = [...new Set(ls.map(l => (LINK_LABEL[l.kind] ?? l.kind).toLowerCase()))]
  return `${ls.length} link${ls.length === 1 ? "" : "s"} (${kinds.join(", ")})`
}
function takeLens() {
  const name = lensName.value.trim()
  groups.ensureDimension(name, {
    cut: "vertical",
    description: mergeCoupled.value
      ? t("pages.deployablesIndex.componentsGroupedDeployableThey")
      : t("pages.deployablesIndex.componentsGroupedDeployableThey2"),
  })
  for (const g of proposal.value.groups) groups.createGroup(g.name, units("component", g.components), name)
  if (proposal.value.shared.length) groups.createGroup(t("pages.deployablesIndex.shippedSeveral"), units("component", proposal.value.shared), name)
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
  get title() { return t("pages.deployablesIndex.deployables") },
  rows: () => model.value.deployables.map(d => ({ deployable: d.id, kind: d.kind, platform: d.platform ?? "", built_by: d.built_by, runtime: d.runtime, base_image: d.base_image, environments: envNames(d.id).join(", "), files: d.files, components: d.components, calls: callsOut(d.id), called_by: callsIn(d.id) })),
  columns: () => [
    { id: "deployable", label: t("pages.deployablesIndex.deployable") }, { id: "kind", label: t("pages.deployablesIndex.kind") }, { id: "platform", label: t("pages.deployablesIndex.platform") }, { id: "built_by", label: t("pages.deployablesIndex.built") }, { id: "runtime", label: t("pages.deployablesIndex.runtime") },
    { id: "base_image", label: t("pages.deployablesIndex.baseImage") }, { id: "environments", label: t("pages.deployablesIndex.environments") }, { id: "files", label: t("pages.deployablesIndex.files") },
    { id: "components", label: t("pages.deployablesIndex.components") }, { id: "calls", label: t("pages.deployablesIndex.calls") }, { id: "called_by", label: t("pages.deployablesIndex.called") },
  ],
  notes: () => [[t("pages.deployablesIndex.read"), t("pages.deployablesIndex.dockerfilesComposeKubernetesHelm")], ["calls", t("pages.deployablesIndex.deployablesConfigurationNamesJoined")]],
  disabledReason: () => (!model.value.deployables.length ? t("pages.deployablesIndex.noDeployablesSnapshot") : null),
})
</script>

<style scoped>
.list-track { --stage-w: 22px; }
.inspector-track { --stage-w: 44px; }
</style>
