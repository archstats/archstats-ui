<template>
  <ViewWorkspaceLayout
    :title="t('http.page.title')"
    v-model:search-query="search"
    :search-placeholder="t('http.page.findRoute')"
    :tabs="[{ id: 'detail', label: t('http.page.detail') }]"
    active-tab="detail"
    :is-sidebar-open="!!picked"
    sidebar-width="340px"
  >
    <template #stats>
      <template v-if="model.routes.length">
        <span>{{ t('http.page.routes') }} <span class="text-neutral-800">{{ fmt(model.routes.length) }}</span></span>
        <template v-if="model.complete">
          <span class="text-neutral-400">·</span>
          <span :title="t('http.page.tracedTitle')">{{ t('http.page.traced') }} <span class="text-neutral-800">{{ tracedShare }}</span></span>
          <span class="text-neutral-400">·</span>
          <button type="button" class="hover:text-neutral-900" :class="{ 'text-neutral-900': picked?.kind === 'contracts' }" :title="t('http.page.contractsOpen')" @click="pickPanel('contracts')">{{ t('http.page.contracts') }} <span class="text-neutral-800">{{ fmt(allContracts.length) }}</span></button>
          <span class="text-neutral-400">·</span>
          <button type="button" class="hover:text-neutral-900" :class="{ 'text-neutral-900': picked?.kind === 'systems' }" :title="t('http.page.systemsOpen')" @click="pickPanel('systems')">{{ t('http.page.systems') }} <span class="text-neutral-800">{{ fmt(systems.filter(s => !s.configOnly).length) }}</span></button>
        </template>
      </template>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" :text="t('http.page.reading')"/>
      <EmptyState v-else-if="!data.hasView('entry_points')" :title="t('http.page.predates')" :text="t('http.page.predatesText')" icon="route"/>
      <EmptyState v-else-if="!model.routes.length" :title="t('http.page.noRoutes')" :text="t('http.page.noRoutesText')" icon="route"/>

      <div v-else class="flex min-h-0 grow flex-col">
        <p v-if="!model.complete" class="mx-4 mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">{{ t('http.page.scanAgain') }}</p>
        <!-- The API stack: how the routes flow into the code, floor by floor. -->
        <ExhibitFrame header="custom" fill class="grow">
          <div class="flex h-10 shrink-0 items-center gap-3 px-3 text-xs text-neutral-600 hairline-b">
            <template v-if="zoom != null">
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="zoom = null"><Icon icon="arrow-left" :size="12"/><span>{{ t('http.page.wholeApi') }}</span></button>
              <span class="min-w-0 truncate font-mono text-neutral-800" :title="zoom">{{ zoomLabel }}</span>
              <span class="shrink-0 text-neutral-500">{{ t('http.page.zoomWords', { routes: fmt(scopeRoutes.length), resources: fmt(stack.floors[0]?.boxes.length ?? 0) }) }}</span>
            </template>
            <span v-else class="min-w-0 truncate">{{ t('http.page.stackWords', { routes: fmt(scopeRoutes.length), components: fmt(stack.floors[0]?.boxes.length ?? 0) }) }}</span>
            <span v-if="needle" class="shrink-0 text-neutral-500">· {{ t('http.page.searchWords', { count: shownRoutes.length }) }}</span>
            <span v-if="stack.untraced" class="ml-auto shrink-0 text-neutral-500" :title="t('http.page.untracedTitle')">{{ t('http.page.untraced', { count: stack.untraced }) }}</span>
            <ExhibitButton :class="stack.untraced ? '' : 'ml-auto'"/>
          </div>
          <div class="min-h-0 flex-1 px-4 pb-2 pt-3">
            <ApiStackFigure
              :stack="stack" :lit="litRoutes" :route="picked?.kind === 'route' ? picked.id : null" :selected="figurePick"
              :system-name="systemName" :title="t('http.page.stackTitle')" :aria-label="t('http.page.stackAria', { count: scopeRoutes.length })"
              @pick="onFigurePick"
            />
          </div>
        </ExhibitFrame>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :show-in-except="[]" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-detail>
      <!-- A route: where it is handled, who may call it, the code it passes, what it reaches. -->
      <template v-if="pickedRoute">
        <h2 class="flex min-w-0 items-baseline gap-2 font-mono text-base font-medium">
          <span class="shrink-0 text-[12px]" :class="methodClass(pickedRoute.method)">{{ pickedRoute.method }}</span>
          <span class="break-all text-neutral-900">{{ pickedRoute.path }}</span>
        </h2>
        <dl class="ui-kv text-sm">
          <dt>{{ t('http.page.handler') }}</dt>
          <dd class="min-w-0"><router-link :to="sourceAt(pickedRoute.file, pickedRoute.line)" class="block truncate font-mono text-xs text-neutral-800 hover:underline" :title="`${pickedRoute.file}:${pickedRoute.line}`">{{ handlerName(pickedRoute) || pickedRoute.file }}</router-link></dd>
          <dt>{{ t('http.page.component') }}</dt>
          <dd class="min-w-0"><router-link v-if="pickedRoute.component" :to="componentPath(pickedRoute.component)" class="block truncate font-mono text-xs text-neutral-800 hover:underline">{{ componentLabel(pickedRoute.component, workspaces.active?.name) }}</router-link><span v-else>—</span></dd>
          <dt>{{ t('http.page.framework') }}</dt>
          <dd class="font-mono text-xs">{{ pickedRoute.framework }}</dd>
          <template v-if="model.complete">
            <dt>{{ t('http.page.contract') }}</dt>
            <dd class="text-xs">{{ documentedLabel(pickedRoute) }}</dd>
          </template>
        </dl>
        <div>
          <h4 class="ui-label">{{ t('http.page.access') }}</h4>
          <p v-if="pickedRoute.auth" class="flex items-baseline gap-2 break-words font-mono text-xs text-neutral-800"><span class="h-2 w-2 shrink-0 rounded-sm" :style="{ background: accessColor(pickedRoute.auth) }"/>{{ pickedRoute.auth }}</p>
          <p v-else class="text-xs text-neutral-500">{{ t('http.page.nothingSaysLong') }}</p>
        </div>
        <div v-if="routePath.length">
          <h4 class="ui-label">{{ t('http.page.pathTitle') }}</h4>
          <ol class="flex flex-col gap-1.5">
            <li v-for="step in routePath" :key="step.box.id" class="min-w-0">
              <button type="button" class="flex w-full min-w-0 items-baseline gap-2 text-left text-xs hover:underline" @click="picked = { kind: 'box', id: step.box.id }">
                <span class="w-20 shrink-0 text-neutral-500">{{ floorLabel(step.box.floor) }}</span>
                <span class="min-w-0 truncate font-medium" :class="step.box.shared ? 'text-neutral-500' : 'text-neutral-900'" :title="step.box.shared ? `${step.box.title} · ${t('http.stackFigure.sharedTip')}` : step.box.title">{{ boxName(step.box) }}</span>
              </button>
              <p class="break-words pl-[88px] font-mono text-[11px] text-neutral-600">{{ step.parts.join(', ') }}</p>
            </li>
          </ol>
        </div>
        <div v-if="pickedReach">
          <h4 class="ui-label">{{ t('http.page.reaches') }}</h4>
          <dl class="ui-kv text-sm">
            <dt :title="t('http.page.unitsTitle')">{{ t('http.page.units') }}</dt><dd class="font-mono">{{ fmt(pickedReach.units) }}</dd>
            <dt :title="t('http.page.tablesTitle')">{{ t('http.page.tables') }}</dt><dd class="font-mono">{{ fmt(pickedReach.tables) }}</dd>
            <dt :title="t('http.page.outTitle')">{{ t('http.page.callsOut') }}</dt><dd class="font-mono">{{ fmt(pickedReach.outbound) }}</dd>
            <dt :title="t('http.page.tracedTitle')">{{ t('http.page.followed') }}</dt><dd class="font-mono">{{ fmt(pickedReach.resolved) }} / {{ fmt(pickedReach.callSites) }}</dd>
          </dl>
        </div>
        <div v-if="pickedCalls.length">
          <h4 class="ui-label">{{ t('http.page.callsOut') }}</h4>
          <ul class="flex flex-col gap-1">
            <li v-for="o in pickedCalls" :key="o.id" class="flex min-w-0 items-baseline gap-2 text-xs">
              <span class="shrink-0 font-mono font-medium text-neutral-800">{{ o.system || o.client }}</span>
              <span class="min-w-0 truncate font-mono text-neutral-500">{{ o.method }} {{ o.path }}</span>
              <router-link :to="sourceAt(o.file, o.line)" class="ml-auto shrink-0 font-mono text-neutral-400 hover:underline">:{{ o.line }}</router-link>
            </li>
          </ul>
        </div>
        <div v-if="selectable.length" class="flex gap-2"><button type="button" class="ui-btn ui-btn-sm" :title="t('http.page.selectReachedTitle')" @click="selected = new Set(selectable)"><Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('http.page.selectReached', { count: selectable.length }) }}</span></button></div>
      </template>

      <!-- A system the code calls: where it is, per environment, and from where. -->
      <template v-else-if="pickedSystem">
        <h2 class="break-all font-mono text-base font-medium text-neutral-900">{{ systemName(pickedSystem.system) }}</h2>
        <p class="text-sm text-neutral-600">{{ kindLabel(pickedSystem.kind) }}<template v-if="pickedSystem.clients.length"> · {{ pickedSystem.clients.join(', ') }}</template></p>
        <p v-if="pickedSystem.calls.length && pickedSystem.kind === 'http'" class="text-xs text-neutral-600"><span class="text-neutral-500">{{ t('http.page.resilience') }}</span> {{ pickedSystem.resilience.length ? pickedSystem.resilience.map(resilienceLabel).join(', ') : t('http.page.noneRead') }}</p>
        <div v-if="pickedSystem.hosts.length">
          <h4 class="ui-label">{{ t('http.page.hosts') }}</h4>
          <ul class="flex flex-col gap-0.5">
            <li v-for="h in pickedSystem.hosts" :key="h.environment + h.host" class="flex gap-2 text-sm"><span class="w-24 shrink-0 text-neutral-500">{{ envLabel(h.environment) }}</span><span class="break-all font-mono text-xs text-neutral-800">{{ h.host }}</span></li>
          </ul>
        </div>
        <div v-if="pickedSystem.configKeys.length">
          <h4 class="ui-label">{{ t('http.page.configuredBy') }}</h4>
          <ul class="flex flex-col gap-0.5"><li v-for="k in pickedSystem.configKeys" :key="k" class="break-all font-mono text-xs text-neutral-700">{{ k }}</li></ul>
        </div>
        <div v-if="pickedSystem.calls.length">
          <h4 class="ui-label">{{ t('http.page.callSites') }}</h4>
          <ul class="flex flex-col gap-1">
            <li v-for="o in pickedSystem.calls" :key="o.id" class="flex min-w-0 flex-col text-xs">
              <span class="flex min-w-0 items-baseline gap-2">
                <span class="min-w-0 truncate font-mono text-neutral-800">{{ o.method }} {{ o.path || o.target }}</span>
                <span class="ui-tag shrink-0 !text-[10px]" :title="t('http.page.confidenceTitle')">{{ confidenceLabel(o.confidence) }}</span>
              </span>
              <router-link :to="sourceAt(o.file, o.line)" class="truncate font-mono text-neutral-500 hover:underline">{{ o.function || o.file }} · {{ o.file }}:{{ o.line }}</router-link>
            </li>
          </ul>
        </div>
        <RouteList v-if="pickedSystemRoutes.length" :title="t('http.page.reachedFromRoutes', { count: pickedSystemRoutes.length })" :routes="pickedSystemRoutes" :method-class="methodClass" @pick="pickRoute"/>
      </template>

      <!-- Boxes folded into "more": each one named, a click away. -->
      <template v-else-if="picked?.kind === 'box' && picked.members">
        <h2 class="text-base font-semibold text-neutral-900">{{ t('http.stackFigure.more', { count: picked.members.length }) }}</h2>
        <p class="text-xs text-neutral-600">{{ t('http.page.foldedText', { floor: floorLabel(foldedFloor) }) }}</p>
        <ul class="flex flex-col">
          <li v-for="b in foldedBoxes" :key="b.id">
            <button type="button" class="flex h-7 w-full min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-neutral-100" @click="picked = { kind: 'box', id: b.id }">
              <span class="min-w-0 truncate text-xs text-neutral-800" :title="b.title">{{ boxName(b) }}</span>
              <span class="ml-auto shrink-0 font-mono text-[11px] text-neutral-500">{{ fmt(b.routes.size) }}</span>
            </button>
          </li>
        </ul>
      </template>

      <!-- A box on the stack: what it is, what passes through it, where from and where to. -->
      <template v-else-if="pickedBox">
        <h2 class="break-all text-base font-semibold text-neutral-900">{{ boxName(pickedBox) }}</h2>
        <p v-if="pickedBox.title && pickedBox.title !== boxName(pickedBox)" class="-mt-2 break-all font-mono text-xs text-neutral-500">{{ pickedBox.title }}</p>
        <p v-if="pickedBox.shared" class="text-xs text-neutral-600">{{ t('http.page.sharedNote') }}</p>
        <dl class="ui-kv text-sm">
          <dt>{{ t('http.page.floor') }}</dt><dd class="text-xs">{{ floorLabel(pickedBox.floor) }}</dd>
          <dt>{{ t('http.page.routes') }}</dt><dd class="font-mono">{{ fmt(pickedBox.routes.size) }} <span class="text-neutral-400">/ {{ fmt(scopeRoutes.length) }}</span></dd>
        </dl>
        <div v-if="pickedBox.kind === 'area' || pickedBox.kind === 'resource'">
          <h4 class="ui-label">{{ t('http.page.access') }}</h4>
          <ul class="flex flex-col gap-0.5">
            <li v-for="a in accessBreakdown(boxRoutes)" :key="a.label" class="flex min-w-0 items-center gap-2 text-xs" :title="a.full">
              <span class="h-2 w-2 shrink-0 rounded-sm" :style="{ background: accessColor(a.full) }"/>
              <span class="min-w-0 truncate font-mono" :class="a.label ? 'text-neutral-800' : 'font-sans text-neutral-400'">{{ a.label || t('http.page.nothingSays') }}</span>
              <span class="ml-auto shrink-0 font-mono text-neutral-500">{{ fmt(a.count) }}</span>
            </li>
          </ul>
        </div>
        <div v-if="pickedBox.kind === 'area'">
          <h4 class="ui-label">{{ t('http.page.resourcesTitle', { count: areaResources.length }) }}</h4>
          <ul class="flex flex-col">
            <li v-for="g in areaResources.slice(0, 40)" :key="g.key">
              <button type="button" class="flex h-7 w-full min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-neutral-100" @click="openArea(pickedBox.title, `res:${g.key}`)">
                <span class="min-w-0 truncate font-mono text-xs text-neutral-800">{{ g.resource ? '/' + g.resource : g.key || '/' }}</span>
                <span class="ml-auto shrink-0 font-mono text-[11px] text-neutral-500">{{ g.routes.length }}</span>
              </button>
            </li>
          </ul>
          <button type="button" class="ui-btn ui-btn-sm mt-2" @click="openArea(pickedBox.title)"><Icon icon="zoom-in" :size="13" class="text-neutral-500"/><span>{{ t('http.page.openArea') }}</span></button>
        </div>
        <BandList v-if="incoming.length" :title="t('http.page.comesFrom')" :items="incoming" @pick="id => picked = { kind: 'box', id }"/>
        <BandList v-if="outgoing.length" :title="t('http.page.goesTo')" :items="outgoing" @pick="id => picked = { kind: 'box', id }"/>
        <div v-if="pickedBox.kind === 'component' || pickedBox.kind === 'domain'">
          <h4 class="ui-label">{{ pickedBox.kind === 'domain' ? t('http.page.tables') : t('http.page.classesTitle') }}</h4>
          <ul class="flex flex-col gap-0.5">
            <li v-for="[name, rs] in boxParts.slice(0, 16)" :key="name" class="flex min-w-0 items-baseline gap-2 text-xs">
              <span class="min-w-0 truncate font-mono text-neutral-800" :title="name">{{ shortName(name) }}</span>
              <span class="ml-auto shrink-0 font-mono text-neutral-500" :title="t('http.page.partRoutesTitle')">{{ fmt(rs.size) }}</span>
            </li>
            <li v-if="boxParts.length > 16" class="text-xs text-neutral-500">{{ t('http.page.andMore', { count: boxParts.length - 16 }) }}</li>
          </ul>
        </div>
        <RouteList v-if="pickedBox.kind !== 'area'" :title="t('http.page.passingRoutes', { count: boxRoutes.length })" :routes="boxRoutes" :method-class="methodClass" @pick="pickRoute"/>
        <div v-if="selectable.length" class="flex gap-2"><button type="button" class="ui-btn ui-btn-sm" :title="t('http.page.selectReachedTitle')" @click="selected = new Set(selectable)"><Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('http.page.selectReached', { count: selectable.length }) }}</span></button></div>
      </template>

      <!-- A band: the routes that pass from one box to the next. -->
      <template v-else-if="pickedBand">
        <h2 class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base">
          <button type="button" class="font-semibold text-neutral-900 hover:underline" @click="picked = { kind: 'box', id: pickedBand.from }">{{ boxNameById(pickedBand.from) }}</button>
          <span class="text-neutral-400">→</span>
          <button type="button" class="font-semibold text-neutral-900 hover:underline" @click="picked = { kind: 'box', id: pickedBand.to }">{{ boxNameById(pickedBand.to) }}</button>
        </h2>
        <RouteList :title="t('http.page.passingRoutes', { count: bandRoutes.length })" :routes="bandRoutes" :method-class="methodClass" @pick="pickRoute"/>
      </template>

      <!-- Every system the code calls, configured ones too. -->
      <template v-else-if="picked?.kind === 'systems'">
        <h2 class="text-base font-semibold text-neutral-900">{{ t('http.page.systemsTitle') }}</h2>
        <p class="text-xs text-neutral-600">{{ outboundWords }}</p>
        <ul class="flex flex-col">
          <li v-for="s in systems" :key="s.system">
            <button type="button" class="flex h-8 w-full min-w-0 items-center gap-2 rounded px-1 text-left hover:bg-neutral-100" @click="picked = { kind: 'system', name: s.system }">
              <span class="min-w-0 truncate font-mono text-xs" :class="s.unresolved ? 'font-sans text-neutral-500' : 'text-neutral-800'">{{ systemName(s.system) }}</span>
              <span class="shrink-0 text-[11px] text-neutral-500">{{ kindLabel(s.kind) }}</span>
              <span v-if="s.configOnly" class="ui-tag shrink-0 !text-[10px]" :title="t('http.page.configOnlyTitle')">{{ t('http.page.configOnly') }}</span>
              <span class="ml-auto shrink-0 font-mono text-[11px] text-neutral-500">{{ fmt(s.calls.length) }}</span>
            </button>
          </li>
        </ul>
        <div v-if="internalCalls.length">
          <h4 class="ui-label" :title="t('http.page.selfCallsText')">{{ t('http.page.selfCalls') }}</h4>
          <ul class="flex flex-col gap-1">
            <li v-for="o in internalCalls" :key="o.id" class="flex min-w-0 items-baseline gap-2 text-xs">
              <button v-if="o.entry" type="button" class="min-w-0 truncate text-left font-mono text-neutral-800 hover:underline" @click="pickRoute(o.entry)">{{ routeLabel(o.entry) }}</button>
              <span v-else class="min-w-0 truncate font-mono text-neutral-800">{{ o.path }}</span>
              <router-link :to="sourceAt(o.file, o.line)" class="ml-auto shrink-0 font-mono text-neutral-400 hover:underline">{{ o.file.split('/').pop() }}:{{ o.line }}</router-link>
            </li>
          </ul>
        </div>
      </template>

      <!-- The contracts: each against the routes, and the API design rules. -->
      <template v-else-if="picked?.kind === 'contracts'">
        <h2 class="text-base font-semibold text-neutral-900">{{ t('http.page.contracts') }}</h2>
        <p v-if="!allContracts.length" class="text-xs text-neutral-600">{{ t('http.page.noContractsText') }}</p>
        <section v-for="c in allContracts" :key="c.spec" class="flex flex-col gap-1">
          <div class="flex min-w-0 items-baseline gap-2">
            <h3 class="min-w-0 truncate text-sm font-semibold text-neutral-900" :title="c.title || c.spec">{{ c.title || c.spec }}</h3>
            <span v-if="c.version" class="shrink-0 font-mono text-xs text-neutral-500">{{ c.version }}</span>
            <span class="ui-tag shrink-0">{{ sideLabel(c.side) }}</span>
          </div>
          <router-link :to="sourceAt(c.spec, 1)" class="truncate font-mono text-xs text-neutral-500 hover:underline">{{ c.spec }}</router-link>
          <p class="text-xs text-neutral-600">{{ contractWords(c) }}</p>
          <ul v-if="c.specOnly.length" class="flex flex-col gap-0.5">
            <li v-for="op in c.specOnly.slice(0, 12)" :key="op.method + op.path" class="flex min-w-0 items-baseline gap-2 text-xs" :title="t('http.page.noRoute')">
              <span class="w-12 shrink-0 font-mono font-medium" :class="methodClass(op.method)">{{ op.method }}</span>
              <span class="min-w-0 truncate font-mono text-amber-700">{{ op.path }}</span>
            </li>
          </ul>
          <FindingList v-if="c.findings.length" :findings="c.findings"/>
        </section>
        <section v-if="routeRuleFindings.length" class="flex flex-col gap-1">
          <h3 class="text-sm font-semibold text-neutral-900">{{ t('http.page.routeRules') }}</h3>
          <p class="text-xs text-neutral-600">{{ t('http.page.routeRulesText') }}</p>
          <FindingList :findings="routeRuleFindings"/>
        </section>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ExhibitButton from "~/features/export/components/ExhibitButton.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import ApiStackFigure, { type StackPick } from "~/features/http/components/ApiStackFigure.vue"
import BandList from "~/features/http/components/BandList.vue"
import RouteList from "~/features/http/components/RouteList.vue"
import FindingList from "~/features/http/components/FindingList.vue"
import { useTable } from "~/features/export/useExportables"
import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useHttp } from "~/features/http/useHttp"
import { accessClass, accessLabel, componentLabels, contracts, contractState, handlerName, resourceGroups, routeFindings, selfCalls, shortName, systemSummaries, type AccessClass, type Contract, type Route } from "~/features/http/http"
import { apiStack, FLOORS, type FloorId, type StackBox } from "~/features/http/stack"
import { componentLabel, componentPath, filePath } from "~/features/navigation/routes"
import { t, intlLocale } from "~/shared/i18n"

// HTTP: how the API flows into the code. One stack, from the routes down
// through the code they pass to the data and systems they reach; every pick
// is answered in the inspector, contracts and systems included.

const data = useDataStore()
const workspaces = useWorkspacesStore()
const { model, loading } = useHttp()
const fmt = (n: number) => n.toLocaleString(intlLocale)

const search = ref("")
const needle = computed(() => search.value.trim().toLowerCase())
const shownRoutes = computed(() => {
  const q = needle.value
  if (!q) return model.value.routes
  return model.value.routes.filter(r => `${r.method} ${r.path} ${r.handler} ${r.function} ${r.component} ${r.auth}`.toLowerCase().includes(q))
})

// ---- the stack: the whole API, or one component zoomed in to by its resources
const zoom = ref<string | null>(null)
const scopeRoutes = computed(() => (zoom.value != null ? model.value.routes.filter(r => r.component === zoom.value) : model.value.routes))
const stack = computed(() => apiStack(model.value, scopeRoutes.value, zoom.value != null ? "resource" : "component"))
const zoomLabel = computed(() => (zoom.value != null ? componentLabels([...new Set(model.value.routes.map(r => r.component))]).get(zoom.value) || zoom.value : ""))
function openArea(component: string, pick?: string) {
  zoom.value = component
  picked.value = pick ? { kind: "box", id: pick } : null
}

const tracedShare = computed(() => {
  let resolved = 0, sites = 0
  for (const r of model.value.reach.values()) { resolved += r.resolved; sites += r.callSites }
  return sites ? `${Math.round((resolved / sites) * 100)}%` : "–"
})

// ---- picking
type Pick =
  | { kind: "box"; id: string; members?: string[] } | { kind: "band"; id: string } | { kind: "route"; id: number }
  | { kind: "system"; name: string } | { kind: "contracts" } | { kind: "systems" } | null
const picked = ref<Pick>(null)
function pickRoute(id: number) {
  const r = routeById.value.get(id)
  if (r && zoom.value != null && r.component !== zoom.value) zoom.value = null
  picked.value = picked.value?.kind === "route" && picked.value.id === id ? null : { kind: "route", id }
}
function pickPanel(kind: "contracts" | "systems") { picked.value = picked.value?.kind === kind ? null : { kind } }
function onFigurePick(p: StackPick | null) {
  if (!p) { picked.value = null; return }
  const cur = picked.value
  if (cur && "id" in cur && cur.id === p.id) { picked.value = null; return }
  const b = p.kind === "box" ? stack.value.boxes.get(p.id) : null
  picked.value = b?.kind === "system" ? { kind: "system", name: b.title } : p
}
watch(() => data.datasetKey, () => { picked.value = null; zoom.value = null })
watch(zoom, () => { if (picked.value?.kind === "band") picked.value = null })

const figurePick = computed<StackPick | null>(() => {
  const p = picked.value
  if (p?.kind === "box" || p?.kind === "band") return { kind: p.kind, id: p.id }
  if (p?.kind === "system") return { kind: "box", id: `sys:${p.name}` }
  return null
})
const pickedBox = computed<StackBox | null>(() => (picked.value?.kind === "box" ? stack.value.boxes.get(picked.value.id) ?? null : null))
const pickedBand = computed(() => (picked.value?.kind === "band" ? stack.value.bands.find(b => b.id === (picked.value as { id: string }).id) ?? null : null))
const foldedBoxes = computed(() => (picked.value?.kind === "box" && picked.value.members ? picked.value.members.map(id => stack.value.boxes.get(id)).filter((b): b is StackBox => !!b) : []))
const foldedFloor = computed<FloorId>(() => foldedBoxes.value[0]?.floor ?? "api")

// What lights: the pick's routes, narrowed by a search.
const litRoutes = computed<Set<number> | null>(() => {
  const p = picked.value
  let set: Set<number> | null = null
  if (p?.kind === "route") set = new Set([p.id])
  else if (p?.kind === "box" && p.members) set = new Set(foldedBoxes.value.flatMap(b => [...b.routes]))
  else if (p?.kind === "box" && pickedBox.value) set = pickedBox.value.routes
  else if (p?.kind === "band" && pickedBand.value) set = pickedBand.value.routes
  else if (p?.kind === "system") set = stack.value.boxes.get(`sys:${p.name}`)?.routes ?? null
  if (needle.value) {
    const found = new Set(shownRoutes.value.map(r => r.id))
    set = set ? new Set([...set].filter(id => found.has(id))) : found
  }
  return set
})

const routeById = computed(() => new Map(model.value.routes.map(r => [r.id, r])))
const routesOf = (ids: Iterable<number>) => [...ids].map(id => routeById.value.get(id)).filter((r): r is Route => !!r)
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
const boxRoutes = computed(() => (pickedBox.value ? routesOf(pickedBox.value.routes) : []))
const bandRoutes = computed(() => (pickedBand.value ? routesOf(pickedBand.value.routes) : []))
const boxParts = computed(() => (pickedBox.value ? [...pickedBox.value.parts.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])) : []))
const areaResources = computed(() => (pickedBox.value?.kind === "area" ? resourceGroups(boxRoutes.value).sort((a, b) => b.routes.length - a.routes.length || a.key.localeCompare(b.key)) : []))

const boxName = (b: StackBox) => (b.kind === "system" ? systemName(b.title) : b.label)
const boxNameById = (id: string) => { const b = stack.value.boxes.get(id); return b ? boxName(b) : id }
const FLOOR_LABELS: Record<FloorId, string> = {
  api: t("http.stackFigure.floorApi"), near: t("http.stackFigure.floorNear"), mid: t("http.stackFigure.floorMid"),
  deep: t("http.stackFigure.floorDeep"), data: t("http.stackFigure.floorData"), outside: t("http.stackFigure.floorOutside"),
}
const floorLabel = (f: FloorId) => FLOOR_LABELS[f]

// Where a box's routes come from and go to, biggest first.
const neighbours = (side: "from" | "to") => {
  const b = pickedBox.value
  if (!b) return []
  const other = side === "from" ? "to" : "from"
  return stack.value.bands.filter(x => x[other] === b.id).sort((x, y) => y.routes.size - x.routes.size).slice(0, 8)
    .map(x => ({ id: x[side], name: boxNameById(x[side]), count: x.routes.size }))
}
const incoming = computed(() => neighbours("from"))
const outgoing = computed(() => neighbours("to"))

// ---- a route
const pickedRoute = computed(() => (picked.value?.kind === "route" ? routeById.value.get(picked.value.id) ?? null : null))
const pickedReach = computed(() => (pickedRoute.value ? model.value.reach.get(pickedRoute.value.id) : undefined))
const outboundById = computed(() => new Map(model.value.outbound.map(o => [o.id, o])))
const pickedCalls = computed(() => (pickedRoute.value
  ? model.value.targets.filter(x => x.entry === pickedRoute.value!.id && x.kind === "outbound").map(x => outboundById.value.get(Number(x.target))).filter(o => !!o)
  : []))
const routePath = computed(() => {
  const r = pickedRoute.value
  const path = r ? stack.value.paths.get(r.id) : null
  if (!path) return []
  return [...path.entries()]
    .map(([id, parts]) => ({ box: stack.value.boxes.get(id), parts }))
    .filter((s): s is { box: StackBox; parts: string[] } => !!s.box)
    .sort((a, b) => FLOORS.indexOf(a.box.floor) - FLOORS.indexOf(b.box.floor) || Number(a.box.shared) - Number(b.box.shared) || b.box.routes.size - a.box.routes.size)
})
// The code a pick's routes pass, to make a group of.
const selectable = computed(() => {
  const ids = litRoutes.value
  if (!ids || !(picked.value?.kind === "route" || picked.value?.kind === "box")) return []
  const comps = new Set<string>()
  for (const b of stack.value.boxes.values()) {
    if (b.kind !== "component" && b.kind !== "area") continue
    for (const r of b.routes) if (ids.has(r)) { comps.add(b.title); break }
  }
  return [...comps].sort()
})
const selected = ref<Set<string>>(new Set())

// ---- access
const C = (ramp: string, step: number) => `rgb(var(--c-${ramp}-${step}))`
const ACCESS_COLORS: Record<AccessClass, string> = { rule: C("blue", 600), signedIn: C("blue", 300), open: C("amber", 400), other: C("violet", 300), none: C("neutral", 300) }
const accessColor = (auth: string) => ACCESS_COLORS[accessClass(auth)]
function accessBreakdown(routes: Route[]): Array<{ label: string; full: string; count: number }> {
  const by = new Map<string, { label: string; full: string; count: number }>()
  for (const r of routes) {
    const key = accessLabel(r.auth) ?? ""
    const e = by.get(key) ?? { label: key, full: r.auth, count: 0 }
    e.count++
    by.set(key, e)
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function methodClass(m: string): string {
  switch (m.split(",")[0]) {
    case "GET": return "text-blue-700"
    case "POST": return "text-green-700"
    case "PUT": case "PATCH": return "text-amber-700"
    case "DELETE": return "text-red-700"
    default: return "text-neutral-500"
  }
}

// ---- contracts
const allContracts = computed<Contract[]>(() => contracts(model.value))
const routeRuleFindings = computed(() => routeFindings(model.value))
function documentedLabel(r: Route): string {
  switch (r.documented) {
    case "spec": return t("http.page.documentedSpec")
    case "annotations": return t("http.page.documentedAnnotations")
    case "framework": return t("http.page.documentedFramework")
  }
  return contractState(r, allContracts.value) === "missing" ? t("http.page.notInContractTitle") : t("http.page.documentedNone")
}
function contractWords(c: Contract): string {
  if (c.side === "consumed") return t("http.page.consumedWords", { count: c.operations.length })
  return t("http.page.providedWords", { matched: fmt(c.matched), total: fmt(c.operations.length), specOnly: fmt(c.specOnly.length), codeOnly: fmt(c.codeOnly.length) })
}
function sideLabel(side: string): string {
  return side === "provided" ? t("http.page.sideProvided") : side === "consumed" ? t("http.page.sideConsumed") : t("http.page.sideUnknown")
}

// ---- systems
const systems = computed(() => systemSummaries(model.value))
const internalCalls = computed(() => selfCalls(model.value))
const pickedSystem = computed(() => (picked.value?.kind === "system" ? systems.value.find(s => s.system === (picked.value as { name: string }).name) ?? null : null))
const pickedSystemRoutes = computed(() => {
  const s = pickedSystem.value
  if (!s) return []
  const onStack = stack.value.boxes.get(`sys:${s.system}`)?.routes
  return routesOf(new Set([...s.routes, ...(onStack ?? [])]))
})
const outboundWords = computed(() => {
  const unresolved = model.value.outbound.filter(o => o.confidence === "unresolved").length
  return t("http.page.outboundWords", { calls: fmt(model.value.outbound.length), unresolved: fmt(unresolved) })
})
const KINDS: Record<string, string> = {
  http: t("http.kind.http"), soap: t("http.kind.soap"), grpc: t("http.kind.grpc"), graphql: t("http.kind.graphql"),
  message: t("http.kind.message"), sql: t("http.kind.sql"), nosql: t("http.kind.nosql"), cache: t("http.kind.cache"),
  search: t("http.kind.search"), mail: t("http.kind.mail"), ldap: t("http.kind.ldap"), storage: t("http.kind.storage"),
  file_transfer: t("http.kind.file_transfer"), identity: t("http.kind.identity"),
}
const CONFIDENCE: Record<string, string> = {
  declared: t("http.confidence.declared"), resolved: t("http.confidence.resolved"), partial: t("http.confidence.partial"), unresolved: t("http.confidence.unresolved"),
}
const RESILIENCE: Record<string, string> = {
  timeout: t("http.resilience.timeout"), retry: t("http.resilience.retry"), circuit_breaker: t("http.resilience.circuit_breaker"),
}
const resilienceLabel = (r: string) => RESILIENCE[r] ?? r
const kindLabel = (k: string) => KINDS[k] ?? k
const confidenceLabel = (c: string) => CONFIDENCE[c] ?? c
// "?http" is the calls of a kind whose address could not be followed.
const systemName = (key: string) => (key.startsWith("?") ? t("http.page.unresolvedKind", { kind: kindLabel(key.slice(1)) }) : key)
const envLabel = (e: string) => (e ? e : t("http.page.everyEnvironment"))
const routeLabel = (id: number) => { const r = routeById.value.get(id); return r ? `${r.method} ${r.path}` : `#${id}` }
const sourceAt = (file: string, line: number) => `${filePath(file, "source")}${line ? `#L${line}` : ""}`

// Every route as a table, from the toolbar's Export.
useTable({
  get title() { return t("http.page.routesTableTitle") },
  rows: () => model.value.routes.map(r => {
    const reach = model.value.reach.get(r.id)
    return { method: r.method, path: r.path, handler: handlerName(r), component: r.component, access: r.auth, contract: contractState(r, allContracts.value), units: reach?.units ?? "", tables: reach?.tables ?? "", calls_out: reach?.outbound ?? "", file: r.file, line: r.line }
  }),
  columns: () => [
    { id: "method", label: t("http.page.method") }, { id: "path", label: t("http.page.path") }, { id: "handler", label: t("http.page.handler") },
    { id: "component", label: t("http.page.component") }, { id: "access", label: t("http.page.access") }, { id: "contract", label: t("http.page.contract") },
    { id: "units", label: t("http.page.units") }, { id: "tables", label: t("http.page.tables") }, { id: "calls_out", label: t("http.page.callsOut") },
    { id: "file", label: t("http.page.file") }, { id: "line", label: t("http.page.line") },
  ],
  notes: () => [["access", t("http.page.accessNote")], ["units", t("http.page.unitsNote")]],
  disabledReason: () => (!model.value.routes.length ? t("http.page.noRoutes") : null),
})
</script>
