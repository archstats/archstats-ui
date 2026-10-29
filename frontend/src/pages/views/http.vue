<template>
  <ViewWorkspaceLayout
    :title="t('http.page.title')"
    v-model:search-query="search"
    :search-placeholder="mode === 'outbound' ? t('http.page.findSystem') : t('http.page.findRoute')"
    :tabs="[{ id: 'detail', label: t('http.page.detail') }]"
    active-tab="detail"
    :is-sidebar-open="!!picked"
    sidebar-width="400px"
  >
    <template #stats>
      <template v-if="model.routes.length">
        <span>{{ t('http.page.routes') }} <span class="text-neutral-800">{{ fmt(model.routes.length) }}</span></span>
        <template v-if="model.complete">
          <span class="text-neutral-400">·</span>
          <span :title="t('http.page.tracedTitle')">{{ t('http.page.traced') }} <span class="text-neutral-800">{{ tracedShare }}</span></span>
          <span class="text-neutral-400">·</span>
          <span>{{ t('http.page.contracts') }} <span class="text-neutral-800">{{ fmt(allContracts.length) }}</span></span>
          <span class="text-neutral-400">·</span>
          <span>{{ t('http.page.systems') }} <span class="text-neutral-800">{{ fmt(systems.filter(s => !s.configOnly).length) }}</span></span>
        </template>
      </template>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('http.page.whatShow')">
        <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :title="m.title" :disabled="m.id !== 'routes' && !model.complete" @click="mode = m.id">{{ m.label }}</button>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" :text="t('http.page.reading')"/>
      <EmptyState v-else-if="!data.hasView('entry_points')" :title="t('http.page.predates')" :text="t('http.page.predatesText')" icon="route"/>
      <EmptyState v-else-if="!model.routes.length && !model.outbound.length" :title="t('http.page.noRoutes')" :text="t('http.page.noRoutesText')" icon="route"/>

      <div v-else class="flex min-h-0 grow flex-col">
        <p v-if="!model.complete" class="mx-4 mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">{{ t('http.page.scanAgain') }}</p>

        <!-- Routes: a tree of paths, each route with what it reaches. -->
        <ExhibitFrame v-if="mode === 'routes'" :exhibit="routeTable" class="grow" fill header-class="h-9 shrink-0 px-4 hairline-b">
          <template #aside>{{ t('http.page.routeCount', { count: shownRoutes.length }) }}</template>
          <div class="absolute inset-0 overflow-auto">
            <table class="ui-table">
              <thead>
                <tr>
                  <th>{{ t('http.page.route') }}</th>
                  <th>{{ t('http.page.handler') }}</th>
                  <th>{{ t('http.page.access') }}</th>
                  <th v-if="allContracts.length">{{ t('http.page.contract') }}</th>
                  <th v-if="model.complete" class="w-56" :title="t('http.page.reachesTitle')">{{ t('http.page.reaches') }}</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in visibleRows" :key="row.kind === 'node' ? 'n' + row.node.prefix : 'r' + row.route.id">
                  <tr v-if="row.kind === 'node'" class="cursor-default" :class="{ 'is-selected': picked?.kind === 'prefix' && picked.prefix === row.node.prefix }" @click="pickPrefix(row.node.prefix)">
                    <td :colspan="columns" class="font-mono text-sm">
                      <span :style="{ paddingLeft: row.node.depth * 16 + 'px' }" class="inline-flex items-center gap-1.5">
                        <button type="button" class="text-neutral-400 hover:text-neutral-800" :aria-expanded="row.open" :aria-label="row.open ? t('http.page.collapse') : t('http.page.expand')" @click.stop="toggleNode(row.node.prefix)">
                          <Icon :icon="row.open ? 'chevron-down' : 'chevron-right'" :size="12"/>
                        </button>
                        <span class="text-neutral-800">/{{ row.node.segment }}</span>
                        <span class="text-xs text-neutral-400">{{ fmt(row.node.count) }}</span>
                      </span>
                    </td>
                  </tr>
                  <tr v-else class="cursor-default" :class="{ 'is-selected': picked?.kind === 'route' && picked.id === row.route.id }" @click="pickRoute(row.route.id)">
                    <td class="max-w-[420px]">
                      <span :style="{ paddingLeft: row.depth * 16 + 18 + 'px' }" class="flex min-w-0 items-center gap-2">
                        <span class="w-14 shrink-0 font-mono text-[11px] font-medium" :class="methodClass(row.route.method)">{{ row.route.method }}</span>
                        <span class="truncate font-mono text-sm text-neutral-800" :title="row.route.path">{{ row.route.path }}</span>
                      </span>
                    </td>
                    <td class="max-w-[240px] truncate font-mono text-xs text-neutral-600" :title="row.route.handler">{{ shortHandler(row.route) }}</td>
                    <td class="max-w-[200px] truncate text-xs text-neutral-600" :title="row.route.auth">
                      <span v-if="row.route.auth">{{ row.route.auth }}</span>
                      <span v-else class="text-neutral-400">{{ t('http.page.nothingSays') }}</span>
                    </td>
                    <td v-if="allContracts.length" class="whitespace-nowrap">
                      <span v-if="contractOf(row.route) === 'described'" class="ui-tag">{{ t('http.page.inContract') }}</span>
                      <span v-else-if="contractOf(row.route) === 'missing'" class="ui-tag bg-amber-50 text-amber-700" :title="t('http.page.notInContractTitle')">{{ t('http.page.notInContract') }}</span>
                    </td>
                    <td v-if="model.complete" class="whitespace-nowrap text-xs text-neutral-600">
                      <template v-if="model.reach.get(row.route.id)">{{ reachWords(model.reach.get(row.route.id)!) }}</template>
                      <span v-else class="text-neutral-400">{{ t('http.page.notTraced') }}</span>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <button v-if="treeVisible.length > visibleRows.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mx-4 my-3" @click="limit += 400">{{ t('http.page.showMore', { count: Math.min(400, treeVisible.length - visibleRows.length) }) }}</button>
          </div>
        </ExhibitFrame>

        <!-- Flow: the layers picture for the picked route, prefix, or what the search shows. -->
        <div v-else-if="mode === 'flow'" class="min-h-0 grow overflow-y-auto px-6 pb-6 pt-4">
          <div class="mb-3 flex flex-wrap items-baseline gap-3">
            <p class="text-sm text-neutral-700">{{ flowScopeWords }}</p>
            <button v-if="flowData.components.length" type="button" class="ui-btn ui-btn-sm ml-auto" :title="t('http.page.selectReachedTitle')" @click="selected = new Set(flowData.components)">
              <Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('http.page.selectReached', { count: flowData.components.length }) }}</span>
            </button>
          </div>
          <EmptyState v-if="!flowRouteIds.length" :title="t('http.page.noFlow')" :text="t('http.page.noFlowText')" icon="git-branch"/>
          <FlowLanes v-else :flow="flowData" :selected="flowPick" :title="flowTitle" @select="id => flowPick = id"/>
        </div>

        <!-- Contract: each contract against the routes, and the design rules. -->
        <div v-else-if="mode === 'contract'" class="min-h-0 grow overflow-y-auto">
          <EmptyState v-if="!allContracts.length && !routeRuleFindings.length" :title="t('http.page.noContracts')" :text="t('http.page.noContractsText')" icon="file-text"/>
          <ExhibitFrame v-if="allContracts.length" :exhibit="operationsTable" header-class="px-6 pt-3">
          <section v-for="c in allContracts" :key="c.spec" class="px-6 pb-6 pt-3 hairline-b">
                <div class="mb-1 flex min-w-0 items-baseline gap-2">
                  <h3 class="truncate text-base font-semibold text-neutral-900">{{ c.title || c.spec }}</h3>
                  <span v-if="c.version" class="font-mono text-xs text-neutral-500">{{ c.version }}</span>
                  <span class="ui-tag">{{ sideLabel(c.side) }}</span>
                  <router-link :to="sourceAt(c.spec, 1)" class="truncate font-mono text-xs text-neutral-500 hover:underline">{{ c.spec }}</router-link>
                </div>
              <p class="mb-2 text-sm text-neutral-600">{{ contractWords(c) }}</p>
              <table class="ui-table">
                <thead><tr><th class="w-20">{{ t('http.page.method') }}</th><th>{{ t('http.page.path') }}</th><th>{{ t('http.page.operation') }}</th><th>{{ t('http.page.answeredBy') }}</th></tr></thead>
                <tbody>
                  <tr v-for="op in c.operations" :key="op.method + op.path">
                    <td class="font-mono text-[11px] font-medium" :class="methodClass(op.method)">{{ op.method }}</td>
                    <td class="font-mono text-sm text-neutral-800"><span :class="{ 'line-through text-neutral-400': op.deprecated }">{{ op.path }}</span></td>
                    <td class="truncate font-mono text-xs text-neutral-600" :title="op.summary">{{ op.operationId }}</td>
                    <td class="text-xs">
                      <button v-if="op.entry" type="button" class="font-mono text-neutral-800 hover:underline" @click="openRoute(op.entry)">{{ routeLabel(op.entry) }}</button>
                      <span v-else-if="c.side === 'consumed'" class="text-neutral-400">{{ t('http.page.calledNotServed') }}</span>
                      <span v-else class="text-amber-700">{{ t('http.page.noRoute') }}</span>
                    </td>
                  </tr>
                  <tr v-for="r in c.codeOnly" :key="'code' + r.id">
                    <td class="font-mono text-[11px] font-medium" :class="methodClass(r.method)">{{ r.method }}</td>
                    <td class="font-mono text-sm text-neutral-800">{{ r.path }}</td>
                    <td class="text-xs text-amber-700">{{ t('http.page.notInContract') }}</td>
                    <td class="text-xs"><button type="button" class="font-mono text-neutral-800 hover:underline" @click="openRoute(r.id)">{{ shortHandler(r) }}</button></td>
                  </tr>
                </tbody>
              </table>
              <FindingList v-if="c.findings.length" :findings="c.findings" class="mt-3"/>
          </section>
          </ExhibitFrame>
          <section v-if="routeRuleFindings.length" class="px-6 pb-6 pt-4">
            <h3 class="mb-1 text-base font-semibold text-neutral-900">{{ t('http.page.routeRules') }}</h3>
            <p class="mb-2 text-sm text-neutral-600">{{ t('http.page.routeRulesText') }}</p>
            <FindingList :findings="routeRuleFindings"/>
          </section>
        </div>

        <!-- Outbound: every system the code reaches, per environment. -->
        <div v-else class="flex min-h-0 grow flex-col">
          <ExhibitFrame :exhibit="systemTable" class="grow" fill header-class="h-9 shrink-0 px-4 hairline-b">
            <template #aside>{{ outboundWords }}</template>
            <div class="absolute inset-0 overflow-auto">
              <table class="ui-table w-full table-fixed">
                <thead>
                  <tr>
                    <th class="w-[24%]">{{ t('http.page.system') }}</th>
                    <th class="w-[13%]">{{ t('http.page.kind') }}</th>
                    <th>{{ t('http.page.hosts') }}</th>
                    <th class="w-16 text-right">{{ t('http.page.calls') }}</th>
                    <th class="w-16 text-right" :title="t('http.page.routesReachingTitle')">{{ t('http.page.routes') }}</th>
                    <th class="w-[14%]">{{ t('http.page.resilience') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in shownSystems" :key="s.system" class="cursor-default" :class="{ 'is-selected': picked?.kind === 'system' && picked.name === s.system }" @click="pickSystem(s.system)">
                    <td class="truncate font-mono text-sm text-neutral-800" :title="systemLabel(s)">
                      <span :class="{ 'font-sans text-neutral-500': s.unresolved }">{{ systemLabel(s) }}</span>
                      <span v-if="s.configOnly" class="ui-tag ml-1" :title="t('http.page.configOnlyTitle')">{{ t('http.page.configOnly') }}</span>
                    </td>
                    <td class="truncate text-xs text-neutral-600">{{ kindLabel(s.kind) }}</td>
                    <td class="max-w-[360px]">
                      <span class="flex min-w-0 gap-1 overflow-hidden">
                        <span v-for="h in s.hosts.slice(0, 2)" :key="h.environment + h.host" class="ui-chip min-w-0 shrink !text-[11px]" :title="`${envLabel(h.environment)}: ${h.host}`"><span v-if="h.environment" class="text-neutral-500">{{ h.environment }}</span> <span class="truncate font-mono">{{ h.host }}</span></span>
                        <span v-if="s.hosts.length > 2" class="shrink-0 text-xs text-neutral-500">+{{ s.hosts.length - 2 }}</span>
                        <span v-if="!s.hosts.length" class="text-xs text-neutral-400">{{ t('http.page.noHost') }}</span>
                      </span>
                    </td>
                    <td class="is-num text-right">{{ fmt(s.calls.length) }}</td>
                    <td class="is-num text-right">{{ s.routes.length ? fmt(s.routes.length) : '' }}</td>
                    <td class="truncate text-xs text-neutral-600">
                      <span v-if="s.resilience.length">{{ s.resilience.map(resilienceLabel).join(', ') }}</span>
                      <span v-else-if="s.calls.length && s.kind === 'http'" class="text-neutral-400">{{ t('http.page.noneRead') }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <section v-if="internalCalls.length" class="px-4 py-4">
                <h3 class="mb-1 text-sm font-semibold text-neutral-900">{{ t('http.page.selfCalls') }}</h3>
                <p class="mb-2 text-sm text-neutral-600">{{ t('http.page.selfCallsText') }}</p>
                <ul class="flex max-w-full flex-col gap-1 overflow-hidden">
                  <li v-for="o in internalCalls" :key="o.id" class="flex min-w-0 items-baseline gap-2 text-sm">
                    <router-link :to="sourceAt(o.file, o.line)" class="min-w-0 max-w-[50%] truncate font-mono text-xs text-neutral-600 hover:underline" :title="`${o.file}:${o.line}`">{{ o.file }}:{{ o.line }}</router-link>
                    <span class="shrink-0 text-neutral-400">→</span>
                    <button v-if="o.entry" type="button" class="min-w-0 truncate text-left font-mono text-xs text-neutral-800 hover:underline" @click="openRoute(o.entry)">{{ routeLabel(o.entry) }}</button>
                    <span v-else class="font-mono text-xs text-neutral-800">{{ o.path }}</span>
                  </li>
                </ul>
              </section>
            </div>
          </ExhibitFrame>
        </div>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :show-in-except="[]" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-detail>
      <!-- A route: where it is handled, who may call it, what it reaches. -->
      <template v-if="pickedRoute">
        <h2 class="break-all font-mono text-base font-medium text-neutral-900"><span :class="methodClass(pickedRoute.method)">{{ pickedRoute.method }}</span> {{ pickedRoute.path }}</h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-neutral-500">{{ t('http.page.handler') }}</dt>
          <dd class="min-w-0"><router-link :to="sourceAt(pickedRoute.file, pickedRoute.line)" class="break-all font-mono text-xs text-neutral-800 hover:underline">{{ pickedRoute.handler || pickedRoute.file }}</router-link></dd>
          <dt class="text-neutral-500">{{ t('http.page.framework') }}</dt>
          <dd class="font-mono text-xs text-neutral-700">{{ pickedRoute.framework }}</dd>
          <dt class="text-neutral-500">{{ t('http.page.component') }}</dt>
          <dd class="min-w-0"><router-link v-if="pickedRoute.component" :to="componentPath(pickedRoute.component)" class="break-all font-mono text-xs text-neutral-800 hover:underline">{{ componentLabel(pickedRoute.component, workspaces.active?.name) }}</router-link></dd>
          <dt class="text-neutral-500">{{ t('http.page.access') }}</dt>
          <dd class="break-words text-xs text-neutral-700">{{ pickedRoute.auth || t('http.page.nothingSaysLong') }}</dd>
          <template v-if="model.complete">
            <dt class="text-neutral-500">{{ t('http.page.contract') }}</dt>
            <dd class="text-xs text-neutral-700">{{ documentedLabel(pickedRoute) }}</dd>
          </template>
        </dl>
        <template v-if="pickedReach">
          <h4 class="ui-label">{{ t('http.page.reaches') }}</h4>
          <p class="text-sm text-neutral-700">{{ reachWords(pickedReach) }}</p>
          <p class="text-xs text-neutral-500">{{ t('http.page.traceShare', { resolved: fmt(pickedReach.resolved), sites: fmt(pickedReach.callSites), unknown: fmt(pickedReach.unknown) }) }}</p>
          <div v-if="pickedTables.length">
            <h4 class="ui-label">{{ t('http.page.tables') }}</h4>
            <ul class="flex flex-wrap gap-1"><li v-for="tb in pickedTables" :key="tb" class="ui-chip font-mono !text-[11px]">{{ shortName(tb) }}</li></ul>
          </div>
          <div v-if="pickedCalls.length">
            <h4 class="ui-label">{{ t('http.page.callsOut') }}</h4>
            <ul class="flex flex-col gap-1">
              <li v-for="o in pickedCalls" :key="o.id" class="flex min-w-0 items-baseline gap-2 text-xs">
                <span class="font-mono font-medium text-neutral-800">{{ o.system || o.client }}</span>
                <span class="truncate font-mono text-neutral-500">{{ o.method }} {{ o.path }}</span>
                <router-link :to="sourceAt(o.file, o.line)" class="ml-auto shrink-0 font-mono text-neutral-400 hover:underline">:{{ o.line }}</router-link>
              </li>
            </ul>
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" class="ui-btn ui-btn-sm" @click="mode = 'flow'">{{ t('http.page.showFlow') }}</button>
          </div>
        </template>
      </template>

      <!-- A prefix: the routes under it. -->
      <template v-else-if="picked?.kind === 'prefix'">
        <h2 class="break-all font-mono text-base font-medium text-neutral-900">{{ picked.prefix }}/**</h2>
        <p class="text-sm text-neutral-600">{{ t('http.page.routeCount', { count: prefixRoutes.length }) }}</p>
        <div class="flex gap-2"><button type="button" class="ui-btn ui-btn-sm" @click="mode = 'flow'">{{ t('http.page.showFlow') }}</button></div>
      </template>

      <!-- A system: where it is, per environment, and who calls it. -->
      <template v-else-if="pickedSystem">
        <h2 class="break-all font-mono text-base font-medium text-neutral-900">{{ systemLabel(pickedSystem) }}</h2>
        <p class="text-sm text-neutral-600">{{ kindLabel(pickedSystem.kind) }}<template v-if="pickedSystem.clients.length"> · {{ pickedSystem.clients.join(', ') }}</template></p>
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
              <span class="flex items-baseline gap-2">
                <span class="font-mono text-neutral-800">{{ o.method }} {{ o.path || o.target }}</span>
                <span class="ui-tag !text-[10px]" :title="t('http.page.confidenceTitle')">{{ confidenceLabel(o.confidence) }}</span>
              </span>
              <router-link :to="sourceAt(o.file, o.line)" class="truncate font-mono text-neutral-500 hover:underline">{{ o.function || o.file }} · {{ o.file }}:{{ o.line }}</router-link>
            </li>
          </ul>
        </div>
        <div v-if="pickedSystem.routes.length">
          <h4 class="ui-label">{{ t('http.page.reachedFrom') }}</h4>
          <ul class="flex flex-col gap-0.5">
            <li v-for="id in pickedSystem.routes.slice(0, 40)" :key="id"><button type="button" class="font-mono text-xs text-neutral-800 hover:underline" @click="openRoute(id)">{{ routeLabel(id) }}</button></li>
          </ul>
        </div>
      </template>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import FlowLanes from "~/features/http/components/FlowLanes.vue"
import FindingList from "~/features/http/components/FindingList.vue"
import { useTable } from "~/features/export/useExportables"
import { useDataStore } from "~/features/snapshot/data.store"
import { useStateStore } from "~/platform/state.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useHttp } from "~/features/http/useHttp"
import { contracts, contractState, flow, routeFindings, routeTree, selfCalls, shortName, systemSummaries, treeRows, underPrefix, type Contract, type Reach, type Route } from "~/features/http/http"
import { componentLabel, componentPath, filePath } from "~/features/navigation/routes"
import { t, intlLocale } from "~/shared/i18n"

// HTTP: the routes a system offers, what each reaches, the contracts it
// publishes or calls, and the systems it goes out to, per environment.

const data = useDataStore()
const state = useStateStore()
const workspaces = useWorkspacesStore()
const { model, loading } = useHttp()
const fmt = (n: number) => n.toLocaleString(intlLocale)

type Mode = "routes" | "flow" | "contract" | "outbound"
const MODES: Array<{ id: Mode; label: string; title: string }> = [
  { id: "routes", label: t("http.page.modeRoutes"), title: t("http.page.modeRoutesTitle") },
  { id: "flow", label: t("http.page.modeFlow"), title: t("http.page.modeFlowTitle") },
  { id: "contract", label: t("http.page.modeContract"), title: t("http.page.modeContractTitle") },
  { id: "outbound", label: t("http.page.modeOutbound"), title: t("http.page.modeOutboundTitle") },
]
const mode = computed<Mode>({
  get: () => (state.get<Mode>("http.mode", "routes") ?? "routes"),
  set: v => state.set("http.mode", v === "routes" ? null : v),
})

const search = ref("")
const needle = computed(() => search.value.trim().toLowerCase())

// ---- routes
const shownRoutes = computed(() => {
  const q = needle.value
  if (!q) return model.value.routes
  return model.value.routes.filter(r => `${r.method} ${r.path} ${r.handler} ${r.component} ${r.auth}`.toLowerCase().includes(q))
})
const tree = computed(() => routeTree(shownRoutes.value))
const closed = ref<Set<string>>(new Set())
function toggleNode(prefix: string) {
  const s = new Set(closed.value)
  s.has(prefix) ? s.delete(prefix) : s.add(prefix)
  closed.value = s
}
const treeVisible = computed(() => treeRows(tree.value, closed.value))
const limit = ref(400)
watch(search, () => { limit.value = 400 })
const visibleRows = computed(() => treeVisible.value.slice(0, limit.value))
const allContracts = computed<Contract[]>(() => contracts(model.value))
const columns = computed(() => 3 + (allContracts.value.length ? 1 : 0) + (model.value.complete ? 1 : 0))
const contractOf = (r: Route) => contractState(r, allContracts.value)
const routeById = computed(() => new Map(model.value.routes.map(r => [r.id, r])))

const tracedShare = computed(() => {
  let resolved = 0, sites = 0
  for (const r of model.value.reach.values()) { resolved += r.resolved; sites += r.callSites }
  return sites ? `${Math.round((resolved / sites) * 100)}%` : "–"
})

function reachWords(r: Reach): string {
  const parts = [t("http.page.unitCount", { count: r.units })]
  if (r.tables) parts.push(t("http.page.tableCount", { count: r.tables }))
  if (r.outbound) parts.push(t("http.page.callOutCount", { count: r.outbound }))
  return parts.join(" · ")
}
function shortHandler(r: Route): string {
  const h = r.function || r.handler
  if (h) return h
  return r.unit ? shortName(r.unit) : ""
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
function documentedLabel(r: Route): string {
  switch (r.documented) {
    case "spec": return t("http.page.documentedSpec")
    case "annotations": return t("http.page.documentedAnnotations")
    case "framework": return t("http.page.documentedFramework")
  }
  return contractOf(r) === "missing" ? t("http.page.notInContractTitle") : t("http.page.documentedNone")
}
const routeLabel = (id: number) => { const r = routeById.value.get(id); return r ? `${r.method} ${r.path}` : `#${id}` }
const sourceAt = (file: string, line: number) => `${filePath(file, "source")}${line ? `#L${line}` : ""}`

const routeTable = useTable({
  get title() { return t("http.page.routesTableTitle") },
  rows: () => shownRoutes.value.map(r => {
    const reach = model.value.reach.get(r.id)
    return { method: r.method, path: r.path, handler: shortHandler(r), component: r.component, access: r.auth, contract: contractOf(r), units: reach?.units ?? "", tables: reach?.tables ?? "", calls_out: reach?.outbound ?? "", file: r.file, line: r.line }
  }),
  columns: () => [
    { id: "method", label: t("http.page.method") }, { id: "path", label: t("http.page.path") }, { id: "handler", label: t("http.page.handler") },
    { id: "component", label: t("http.page.component") }, { id: "access", label: t("http.page.access") }, { id: "contract", label: t("http.page.contract") },
    { id: "units", label: t("http.page.units") }, { id: "tables", label: t("http.page.tables") }, { id: "calls_out", label: t("http.page.callsOut") },
    { id: "file", label: t("http.page.file") }, { id: "line", label: t("http.page.line") },
  ],
  notes: () => [["access", t("http.page.accessNote")], ["units", t("http.page.unitsNote")]],
  disabledReason: () => (!shownRoutes.value.length ? t("http.page.noRoutes") : null),
})

// ---- picking
type Pick = { kind: "route"; id: number } | { kind: "prefix"; prefix: string } | { kind: "system"; name: string } | null
const picked = ref<Pick>(null)
function pickRoute(id: number) { picked.value = picked.value?.kind === "route" && picked.value.id === id ? null : { kind: "route", id } }
function pickPrefix(prefix: string) { picked.value = picked.value?.kind === "prefix" && picked.value.prefix === prefix ? null : { kind: "prefix", prefix } }
function pickSystem(name: string) { picked.value = picked.value?.kind === "system" && picked.value.name === name ? null : { kind: "system", name } }
function openRoute(id: number) { picked.value = { kind: "route", id }; mode.value = "routes" }
// A pick belongs to the modes that show it: a route or prefix to Routes and
// Flow, a system to Outbound and Flow.
watch(mode, m => {
  const p = picked.value
  if (!p) return
  if ((m === "contract" || m === "outbound") && p.kind !== "system" || m === "routes" && p.kind === "system" || m === "contract") picked.value = null
})
watch(() => data.datasetKey, () => { picked.value = null; closed.value = new Set() })

const pickedRoute = computed(() => (picked.value?.kind === "route" ? routeById.value.get(picked.value.id) ?? null : null))
const pickedReach = computed(() => (pickedRoute.value ? model.value.reach.get(pickedRoute.value.id) : undefined))
const pickedTables = computed(() => (pickedRoute.value ? model.value.targets.filter(x => x.entry === pickedRoute.value!.id && x.kind === "table").map(x => x.target) : []))
const outboundById = computed(() => new Map(model.value.outbound.map(o => [o.id, o])))
const pickedCalls = computed(() => (pickedRoute.value
  ? model.value.targets.filter(x => x.entry === pickedRoute.value!.id && x.kind === "outbound").map(x => outboundById.value.get(Number(x.target))).filter(o => !!o)
  : []))
const prefixRoutes = computed(() => (picked.value?.kind === "prefix" ? underPrefix(model.value.routes, picked.value.prefix) : []))

// ---- flow
const FLOW_CAP = 80
const flowRouteIds = computed<number[]>(() => {
  if (picked.value?.kind === "route") return [picked.value.id]
  if (picked.value?.kind === "prefix") return prefixRoutes.value.slice(0, FLOW_CAP).map(r => r.id)
  if (picked.value?.kind === "system") return pickedSystem.value?.routes.slice(0, FLOW_CAP) ?? []
  return shownRoutes.value.slice(0, FLOW_CAP).map(r => r.id)
})
const flowData = computed(() => flow(model.value, flowRouteIds.value))
const flowPick = ref<string | null>(null)
watch(flowRouteIds, () => { flowPick.value = null })
const flowScopeWords = computed(() => {
  const p = picked.value
  if (p?.kind === "route") return t("http.page.flowOneRoute", { route: routeLabel(p.id) })
  if (p?.kind === "prefix") {
    const n = prefixRoutes.value.length
    return n > FLOW_CAP ? t("http.page.flowPrefixFirst", { prefix: p.prefix, count: FLOW_CAP, total: n }) : t("http.page.flowPrefix", { prefix: p.prefix, count: n })
  }
  if (p?.kind === "system") return t("http.page.flowSystem", { system: p.name, count: flowRouteIds.value.length })
  const n = shownRoutes.value.length
  return n > FLOW_CAP ? t("http.page.flowFirst", { count: FLOW_CAP, total: n }) : t("http.page.flowAll", { count: n })
})
const flowTitle = computed(() => t("http.page.flowFigureTitle"))
const selected = ref<Set<string>>(new Set())

// ---- contracts
const routeRuleFindings = computed(() => routeFindings(model.value))
const operationsTable = useTable({
  get title() { return t("http.page.contractTableTitle") },
  rows: () => allContracts.value.flatMap(c => [
    ...c.operations.map(o => ({ contract: c.title || c.spec, method: o.method, path: o.path, operation: o.operationId, answered_by: o.entry ? routeLabel(o.entry) : c.side === "consumed" ? "" : t("http.page.noRoute") })),
    ...c.codeOnly.map(r => ({ contract: c.title || c.spec, method: r.method, path: r.path, operation: t("http.page.notInContract"), answered_by: shortHandler(r) })),
  ]),
  columns: () => [
    { id: "contract", label: t("http.page.contract") }, { id: "method", label: t("http.page.method") }, { id: "path", label: t("http.page.path") },
    { id: "operation", label: t("http.page.operation") }, { id: "answered_by", label: t("http.page.answeredBy") },
  ],
  disabledReason: () => (!allContracts.value.length ? t("http.page.noContracts") : null),
})
function contractWords(c: Contract): string {
  if (c.side === "consumed") return t("http.page.consumedWords", { count: c.operations.length })
  return t("http.page.providedWords", { matched: fmt(c.matched), total: fmt(c.operations.length), specOnly: fmt(c.specOnly.length), codeOnly: fmt(c.codeOnly.length) })
}
function sideLabel(side: string): string {
  return side === "provided" ? t("http.page.sideProvided") : side === "consumed" ? t("http.page.sideConsumed") : t("http.page.sideUnknown")
}

// ---- outbound
const systems = computed(() => systemSummaries(model.value))
const shownSystems = computed(() => {
  const q = needle.value
  if (!q || mode.value !== "outbound") return systems.value
  return systems.value.filter(s => `${s.system} ${s.kind} ${s.hosts.map(h => h.host).join(" ")} ${s.clients.join(" ")}`.toLowerCase().includes(q))
})
const internalCalls = computed(() => selfCalls(model.value))
const pickedSystem = computed(() => (picked.value?.kind === "system" ? systems.value.find(s => s.system === (picked.value as { name: string }).name) ?? null : null))
const outboundWords = computed(() => {
  const unresolved = model.value.outbound.filter(o => o.confidence === "unresolved").length
  return t("http.page.outboundWords", { calls: fmt(model.value.outbound.length), unresolved: fmt(unresolved) })
})
const systemTable = useTable({
  get title() { return t("http.page.systemsTableTitle") },
  rows: () => shownSystems.value.flatMap(s => (s.hosts.length ? s.hosts : [{ environment: "", host: "" }]).map(h => ({
    system: s.system, kind: s.kind, environment: h.environment, host: h.host, calls: s.calls.length, routes: s.routes.length, resilience: s.resilience.join(","), config_keys: s.configKeys.join(" "),
  }))),
  columns: () => [
    { id: "system", label: t("http.page.system") }, { id: "kind", label: t("http.page.kind") }, { id: "environment", label: t("http.page.environment") },
    { id: "host", label: t("http.page.host") }, { id: "calls", label: t("http.page.calls") }, { id: "routes", label: t("http.page.routes") },
    { id: "resilience", label: t("http.page.resilience") }, { id: "config_keys", label: t("http.page.configuredBy") },
  ],
  notes: () => [["host", t("http.page.hostNote")], ["calls", t("http.page.callsNote")]],
  disabledReason: () => (!shownSystems.value.length ? t("http.page.noSystems") : null),
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
const kindLabel = (k: string) => KINDS[k] ?? k
const systemLabel = (s: { system: string; unresolved: boolean; clients: string[] }) => (s.unresolved ? t("http.page.unresolvedSystem", { clients: s.clients.join(", ") }) : s.system)
const envLabel = (e: string) => (e ? e : t("http.page.everyEnvironment"))
const resilienceLabel = (r: string) => RESILIENCE[r] ?? r
const confidenceLabel = (c: string) => CONFIDENCE[c] ?? c
</script>
