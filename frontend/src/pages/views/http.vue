<template>
  <ViewWorkspaceLayout
    :title="t('http.page.title')"
    :tabs="[{ id: 'detail', label: t('http.page.detail') }]"
    active-tab="detail"
    :is-sidebar-open="!!picked"
    sidebar-width="440px"
  >
    <template #stats>
      <template v-if="model.routes.length">
        <span>{{ t('http.catalog.endpoints') }} <span class="text-neutral-800">{{ fmt(model.routes.length) }}</span></span>
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
        <div class="shrink-0 px-4 py-3 hairline-b">
          <EndpointSearch ref="searchBox" v-model:text="search" v-model:tokens="tokens" :suggest-for="suggestFor" :token-label="tokenLabel" :count="searching ? fmt(shownCount) : ''" :examples="EXAMPLES" @results="toResults"/>
        </div>

        <div class="flex min-h-0 flex-1">
          <ExhibitFrame :exhibit="inventory" header="custom" fill class="min-w-0" :class="showLayers ? 'w-[48%] shrink-0 border-r border-neutral-200' : 'flex-1'">
            <!-- The catalogue: one row per endpoint, under the class that answers it; a tick puts it in the layers. -->
            <div class="flex h-9 shrink-0 items-center gap-2 pl-4 pr-2 hairline-b">
              <span class="min-w-0 truncate text-xs text-neutral-600">{{ shownWords }}</span>
              <span v-if="checked.size" class="flex shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--c-accent-500)/0.12)] py-0.5 pl-2.5 pr-1 text-xs text-neutral-800">
                {{ t('http.catalog.checked', { count: checked.size }) }}
                <button type="button" class="rounded-full p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900" :aria-label="t('http.catalog.uncheck')" :title="t('http.catalog.uncheck')" @click="checked = new Set()"><Icon icon="x" :size="11"/></button>
              </span>
              <span class="ml-auto"/>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" @click="toggleAllGroups">{{ collapsed.size ? t('http.catalog.expandAll') : t('http.catalog.collapseAll') }}</button>
              <ExhibitButton/>
              <button v-if="!showLayers" type="button" class="ui-btn ui-btn-sm shrink-0" :title="t('http.catalog.layersTitle')" @click="showLayers = true"><Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('http.catalog.showLayers') }}</span></button>
            </div>
            <div ref="listEl" class="min-h-0 flex-1 overflow-y-auto outline-none" tabindex="0" role="listbox" aria-multiselectable="true" :aria-label="t('http.catalog.endpoints')" @keydown="onKey">
              <div class="sticky top-0 z-10 flex h-8 items-center gap-3 bg-surface pl-3 pr-2 text-[11px] font-medium text-neutral-500 hairline-b">
                <input type="checkbox" class="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--c-accent-600))]" :checked="allShownChecked" :aria-label="t('http.catalog.checkAll')" :title="t('http.catalog.checkAll')" @change="checkAllShown">
                <span class="w-[60px] shrink-0">{{ t('http.page.method') }}</span>
                <span class="min-w-0 flex-1">{{ t('http.page.path') }}</span>
                <span v-if="!showLayers" class="hidden w-44 shrink-0 2xl:block">{{ t('http.page.handler') }}</span>
                <span class="shrink-0" :class="showLayers ? 'w-8' : 'w-44'">{{ showLayers ? '' : t('http.catalog.whoMayCall') }}</span>
                <span class="shrink-0" :class="showLayers ? 'w-36' : 'w-48'">{{ t('http.catalog.changes') }}</span>
                <span v-if="!showLayers" class="hidden w-36 shrink-0 xl:block">{{ t('http.catalog.calls') }}</span>
                <span v-if="!showLayers" class="w-14 shrink-0 text-right">{{ t('http.page.contract') }}</span>
              </div>
              <p v-if="!shownGroups.length" class="px-4 py-8 text-sm text-neutral-500">{{ t('http.catalog.noMatch') }}</p>
              <section v-for="g in shownGroups" :key="g.key">
                <div class="flex h-8 min-w-0 items-center gap-2 bg-neutral-50 pl-3 pr-4 hairline-b hover:bg-neutral-100">
                  <input type="checkbox" class="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--c-accent-600))]" :checked="groupChecked(g)" :aria-label="t('http.catalog.checkGroup', { name: g.owner })" @change="checkGroup(g)">
                  <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" :aria-expanded="!collapsed.has(g.key)" :title="g.key" @click="toggleGroup(g.key)">
                    <Icon :icon="collapsed.has(g.key) ? 'chevron-right' : 'chevron-down'" :size="12" class="shrink-0 text-neutral-500"/>
                    <span class="min-w-0 truncate font-mono text-[13px] font-medium text-neutral-900"><template v-for="(m, k) in marks(g.path, hitWords)" :key="k"><mark v-if="m.hit" class="rounded-sm bg-[rgb(var(--c-amber-300)/0.55)] text-inherit">{{ m.text }}</mark><template v-else>{{ m.text }}</template></template></span>
                    <span class="min-w-0 truncate text-xs text-neutral-500">{{ g.owner }}</span>
                    <span class="ml-auto shrink-0 font-mono text-[11px] text-neutral-500">{{ g.shown.length === g.endpoints.length ? fmt(g.endpoints.length) : `${fmt(g.shown.length)} / ${fmt(g.endpoints.length)}` }}</span>
                  </button>
                </div>
                <template v-if="!collapsed.has(g.key)">
                  <div v-for="e in g.shown" :key="e.route.id" :data-route="e.route.id" role="option" :aria-selected="checked.has(e.route.id)"
                       class="flex h-8 cursor-pointer items-center gap-3 pl-3 pr-4 text-xs hairline-b"
                       :class="e.route.id === pickedId ? 'bg-[rgb(var(--c-accent-500)/0.14)]' : checked.has(e.route.id) ? 'bg-[rgb(var(--c-accent-500)/0.05)] hover:bg-neutral-50' : 'hover:bg-neutral-50'" @click="pickRoute(e.route.id)">
                    <input type="checkbox" class="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--c-accent-600))]" :checked="checked.has(e.route.id)" :aria-label="t('http.catalog.checkOne', { path: e.route.path })" @click.stop="check(e.route.id, $event)">
                    <span class="flex w-[60px] shrink-0 items-center gap-1">
                      <span class="rounded px-1.5 py-px font-mono text-[10px] font-semibold" :class="methodPill(e.methods[0])">{{ e.methods[0] }}</span>
                      <span v-if="e.methods.length > 1" class="font-mono text-[10px] text-neutral-500" :title="e.methods.join(', ')">+{{ e.methods.length - 1 }}</span>
                    </span>
                    <span class="min-w-0 flex-1 truncate font-mono text-[12.5px]" :title="e.route.path">
                      <template v-for="(p, i) in pathParts(e.route.path)" :key="i"><span class="text-neutral-400">/</span><span :class="p.param ? 'text-[rgb(var(--c-accent-600))]' : 'text-neutral-900'"><template v-for="(m, k) in marks(p.text, hitWords)" :key="k"><mark v-if="m.hit" class="rounded-sm bg-[rgb(var(--c-amber-300)/0.55)] text-inherit">{{ m.text }}</mark><template v-else>{{ m.text }}</template></template></span></template>
                      <span v-if="!pathParts(e.route.path).length" class="text-neutral-900">/</span>
                    </span>
                    <span v-if="!showLayers" class="hidden w-44 shrink-0 truncate font-mono text-[11px] text-neutral-500 2xl:block" :title="e.handler">{{ memberOf(e.handler) }}</span>
                    <span class="flex shrink-0 items-center gap-1.5" :class="showLayers ? 'w-8 justify-center' : 'w-44'" :title="e.route.auth || t('http.page.nothingSays')">
                      <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: accessColor(e.access) }"/>
                      <span v-if="!showLayers" class="min-w-0 truncate" :class="e.accessText ? 'font-mono text-[11px] text-neutral-800' : 'text-neutral-400'">{{ e.accessText ?? t('http.page.nothingSays') }}</span>
                    </span>
                    <span class="shrink-0 truncate" :class="showLayers ? 'w-36' : 'w-48'" :title="e.changes.join(', ')">
                      <span v-if="e.changes.length" class="text-neutral-800">{{ listOf(e.changes) }}</span>
                      <span v-else-if="e.mayChange.length" class="text-neutral-500" :title="t('http.catalog.mayChangeTitle')">{{ t('http.catalog.mayShort', { names: listOf(e.mayChange) }) }}</span>
                      <span v-else-if="e.reads.length" class="text-neutral-400">{{ t('http.catalog.readsOnly') }}</span>
                      <span v-else-if="!e.followed" class="text-neutral-400">{{ t('http.catalog.notFollowedShort') }}</span>
                      <span v-else class="text-neutral-300">—</span>
                    </span>
                    <span v-if="!showLayers" class="hidden w-36 shrink-0 truncate xl:block" :title="e.calls.join(', ')">
                      <span v-if="e.calls.length" :class="e.unguarded.length ? 'text-amber-700' : 'text-neutral-800'">{{ listOf(e.calls) }}</span>
                      <span v-else class="text-neutral-300">—</span>
                    </span>
                    <span v-if="!showLayers" class="w-14 shrink-0 text-right text-[11px]" :class="e.contract === 'spec' ? 'text-green-700' : e.contract === 'missing' ? 'text-amber-700' : 'text-neutral-400'" :title="documentedLabel(e.route)">{{ t(`http.catalog.contractShort.${e.contract}`) }}</span>
                  </div>
                </template>
              </section>
            </div>
          </ExhibitFrame>
          <RouteDescentFigure v-if="showLayers" class="min-w-0 flex-1"
            :data="flow" :heading="flowHeading" :lane-label="laneLabel" :lane-color="laneColor" :lit="flowLit"
            :picked="figurePicked" @node="onNode" @hide="showLayers = false" @fit="perFloor = $event"/>
        </div>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :show-in-except="[]" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>

    <template #tab-detail>
      <!-- An endpoint, as an architect writes one up: what it is, who may call it, what it does. -->
      <template v-if="pickedEndpoint">
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-1">
            <span v-for="m in pickedEndpoint.methods" :key="m" class="rounded px-1.5 py-px font-mono text-[11px] font-semibold" :class="methodPill(m)">{{ m }}</span>
          </div>
          <h2 class="break-all font-mono text-[15px] font-medium leading-snug">
            <template v-for="(p, i) in pathParts(pickedEndpoint.route.path)" :key="i"><span class="text-neutral-400">/</span><span :class="p.param ? 'text-[rgb(var(--c-accent-600))]' : 'text-neutral-900'">{{ p.text }}</span></template>
          </h2>
          <p v-if="operation?.summary" class="text-sm text-neutral-700">{{ operation.summary }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="ui-btn ui-btn-sm" @click="copy('path', pickedEndpoint.route.path)"><Icon :icon="copied === 'path' ? 'check' : 'copy'" :size="13" class="text-neutral-500"/><span>{{ copied === 'path' ? t('http.catalog.copied') : t('http.catalog.copyPath') }}</span></button>
            <button type="button" class="ui-btn ui-btn-sm" :title="t('http.catalog.copyMarkdownTitle')" @click="copy('md', markdown)"><Icon :icon="copied === 'md' ? 'check' : 'file-text'" :size="13" class="text-neutral-500"/><span>{{ copied === 'md' ? t('http.catalog.copied') : t('http.catalog.copyMarkdown') }}</span></button>
          </div>
        </div>
        <dl class="ui-kv text-sm">
          <dt>{{ t('http.page.handler') }}</dt>
          <dd class="min-w-0"><router-link :to="sourceAt(pickedEndpoint.route.file, pickedEndpoint.route.line)" class="block truncate font-mono text-xs text-neutral-800 hover:underline" :title="`${pickedEndpoint.route.file}:${pickedEndpoint.route.line}`">{{ pickedEndpoint.handler || pickedEndpoint.route.file }}</router-link></dd>
          <dt>{{ t('http.page.component') }}</dt>
          <dd class="min-w-0"><router-link v-if="pickedEndpoint.route.component" :to="componentPath(pickedEndpoint.route.component)" class="block truncate font-mono text-xs text-neutral-800 hover:underline">{{ componentLabel(pickedEndpoint.route.component, workspaces.active?.name) }}</router-link><span v-else>—</span></dd>
          <dt>{{ t('http.page.framework') }}</dt><dd class="font-mono text-xs">{{ pickedEndpoint.route.framework }}</dd>
          <template v-if="params.length"><dt>{{ t('http.catalog.parameters') }}</dt><dd class="font-mono text-xs text-[rgb(var(--c-accent-600))]">{{ params.join(', ') }}</dd></template>
          <template v-if="operation?.operationId"><dt>{{ t('http.catalog.operation') }}</dt><dd class="font-mono text-xs">{{ operation.operationId }}<span v-if="operation.tag" class="text-neutral-500"> · {{ operation.tag }}</span></dd></template>
        </dl>
        <div>
          <h4 class="ui-label">{{ t('http.catalog.whoMayCall') }}</h4>
          <p v-if="pickedEndpoint.route.auth" class="flex items-baseline gap-2 break-words font-mono text-xs text-neutral-800"><span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: accessColor(pickedEndpoint.access) }"/>{{ pickedEndpoint.route.auth }}</p>
          <p v-else class="text-xs text-neutral-500">{{ t('http.page.nothingSaysLong') }}</p>
        </div>
        <div>
          <h4 class="ui-label">{{ t('http.page.contract') }}</h4>
          <p class="text-xs text-neutral-700">{{ documentedLabel(pickedEndpoint.route) }}</p>
          <FindingList v-if="pickedRules.length" class="mt-1" :findings="pickedRules"/>
        </div>
        <div v-if="model.complete">
          <h4 class="ui-label">{{ t('http.catalog.changes') }}</h4>
          <div v-if="pickedEndpoint.changes.length" class="flex flex-wrap gap-1"><span v-for="x in pickedEndpoint.changes" :key="x" class="ui-tag !bg-blue-50 !text-blue-800">{{ x }}</span></div>
          <p v-else class="text-xs text-neutral-500">{{ pickedEndpoint.followed ? t('http.catalog.changesNone') : t('http.trace.notFollowed') }}</p>
        </div>
        <div v-if="pickedEndpoint.mayChange.length">
          <h4 class="ui-label" :title="t('http.catalog.mayChangeTitle')">{{ t('http.catalog.mayChange') }}</h4>
          <div class="flex flex-wrap gap-1"><span v-for="x in pickedEndpoint.mayChange" :key="x" class="ui-tag !bg-transparent !text-blue-700 ring-1 ring-inset ring-blue-200">{{ x }}</span></div>
          <p class="mt-1 text-[11px] text-neutral-500">{{ t('http.catalog.mayChangeTitle') }}</p>
        </div>
        <div v-if="pickedEndpoint.reads.length">
          <h4 class="ui-label">{{ t('http.catalog.reads') }}</h4>
          <div class="flex flex-wrap gap-1"><span v-for="x in pickedEndpoint.reads" :key="x" class="ui-tag">{{ x }}</span></div>
        </div>
        <div v-if="pickedCalls.length || pickedEndpoint.calls.length">
          <h4 class="ui-label">{{ t('http.catalog.calls') }}</h4>
          <ul class="flex flex-col gap-1">
            <li v-for="o in pickedCalls" :key="o.id" class="flex min-w-0 items-baseline gap-2 text-xs">
              <button type="button" class="shrink-0 font-mono font-medium text-neutral-800 hover:underline" @click="picked = { kind: 'system', name: o.system || `?${o.kind}` }">{{ o.system ? systemName(o.system) : o.client }}</button>
              <span class="min-w-0 truncate font-mono text-neutral-500">{{ o.method }} {{ o.path }}</span>
              <span v-if="['http', 'soap', 'grpc', 'graphql'].includes(o.kind)" class="shrink-0 text-[10px]" :class="/timeout|circuit_breaker/.test(o.resilience) ? 'text-neutral-500' : 'text-amber-700'">{{ o.resilience ? o.resilience.split(',').map(resilienceLabel).join(', ') : t('http.catalog.noTimeout') }}</span>
              <router-link :to="sourceAt(o.file, o.line)" class="ml-auto shrink-0 font-mono text-neutral-400 hover:underline">:{{ o.line }}</router-link>
            </li>
            <li v-if="!pickedCalls.length" class="text-xs text-neutral-700">{{ pickedEndpoint.calls.join(', ') }}</li>
          </ul>
        </div>
        <div v-if="model.complete">
          <div class="flex items-baseline gap-2">
            <h4 class="ui-label">{{ t('http.page.pathTitle') }}</h4>
            <button v-if="trace.root && trace.steps > 1" type="button" class="ml-auto text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline" @click="everyCall = !everyCall">{{ everyCall ? t('http.trace.onlyEnds') : t('http.trace.everyCall', { count: trace.steps }) }}</button>
          </div>
          <TraceTree v-if="shownTrace" :root="shownTrace" :system-name="systemName"/>
          <p v-else class="text-xs text-neutral-500">{{ t('http.trace.notFollowed') }}</p>
          <p v-if="shownTrace && !shownTrace.children.length && !everyCall && trace.steps > 1" class="text-xs text-neutral-500">{{ t('http.trace.noEnds') }}</p>
          <p v-if="trace.cut && everyCall" class="pt-1 text-[11px] text-neutral-500">{{ t('http.trace.cut', { count: trace.steps }) }}</p>
          <p v-if="pickedReach" class="pt-1 text-[11px] text-neutral-500" :title="t('http.page.tracedTitle')">{{ t('http.trace.followed', { resolved: fmt(pickedReach.resolved), sites: fmt(pickedReach.callSites) }) }}</p>
        </div>
        <div v-if="selectable.length" class="flex gap-2"><button type="button" class="ui-btn ui-btn-sm" :title="t('http.page.selectReachedTitle')" @click="selected = new Set(selectable)"><Icon icon="layers" :size="13" class="text-neutral-500"/><span>{{ t('http.page.selectReached', { count: selectable.length }) }}</span></button></div>
      </template>

      <!-- A class, table or folded group on the layers: what it is and which of the endpoints pass it. -->
      <DescentNodePanel v-else-if="pickedNode" :node="pickedNode" :flow="flow" :drawn="basis.routes.length" :everywhere="nodeEverywhere" :table-use="nodeTableUse"
        :component="componentOfNode" :source="sourceOfNode" :workspace="workspaces.active?.name" :routes-of="routesOf" :lane-label="laneLabel" :lane-color="laneColor"
        :method-class="methodClass" :system-name="systemName" :source-at="sourceAt"
        @node="picked = { kind: 'node', id: $event }" @route="pickRoute" @system="picked = { kind: 'system', name: $event }"
        @tick="checked = new Set($event)" @find="findToken"/>

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
import { computed, nextTick, ref, watch } from "vue"
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue"
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue"
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue"
import ExhibitButton from "~/features/export/components/ExhibitButton.vue"
import EmptyState from "~/shared/ui/EmptyState.vue"
import LoadingState from "~/shared/ui/LoadingState.vue"
import Icon from "~/shared/ui/Icon.vue"
import TraceTree from "~/features/http/components/TraceTree.vue"
import RouteList from "~/features/http/components/RouteList.vue"
import FindingList from "~/features/http/components/FindingList.vue"
import { useTable } from "~/features/export/useExportables"
import { useDataStore } from "~/features/snapshot/data.store"
import { useWorkspacesStore } from "~/features/workspace/workspaces.store"
import { useHttp } from "~/features/http/useHttp"
import { contracts, contractState, routeFindings, selfCalls, systemSummaries, type AccessClass, type Contract, type Route } from "~/features/http/http"
import { pruneTrace, routeFacts, traceRoute } from "~/features/http/reach"
import { catalog, endpointMarkdown, FILTER_TEST, FILTERS, haystack, pathParts, type Endpoint, type FilterId } from "~/features/http/catalog"
import { marks, parseQuery, score, suggest, type Suggestion, type Token } from "~/features/http/search"
import { descent, OTHER, ownerLane, type DescentNode } from "~/features/http/descent"
import EndpointSearch from "~/features/http/components/EndpointSearch.vue"
import { catalogStateFor } from "~/features/http/catalogState"
import RouteDescentFigure from "~/features/http/components/RouteDescentFigure.vue"
import DescentNodePanel from "~/features/http/components/DescentNodePanel.vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { anatomy, layersOf, type Anatomy } from "~/features/reports/anatomy"
import type { ReadingContext } from "~/features/reports/readings"
import { laneOf as profileLane, laneShade } from "~/features/frameworks/frameworkProfiles"
import { componentLabel, componentPath, filePath } from "~/features/navigation/routes"
import { t, intlLocale } from "~/shared/i18n"

// HTTP: the endpoint catalogue. Every route as a reader looks one up, under
// the class that answers it, with what it does in the code: who may call it,
// whether a contract describes it, what data it changes, what it calls. One
// endpoint opens in full, ready to copy into a report; the whole catalogue
// exports as the inventory an assessment asks for.

const data = useDataStore()
const workspaces = useWorkspacesStore()
const { model, loading } = useHttp()
const fmt = (n: number) => n.toLocaleString(intlLocale)

const tracedShare = computed(() => {
  let resolved = 0, sites = 0
  for (const r of model.value.reach.values()) { resolved += r.resolved; sites += r.callSites }
  return sites ? `${Math.round((resolved / sites) * 100)}%` : "–"
})

// ---- the catalogue
const analysis = computed(() => routeFacts(model.value, model.value.routes))
const allContracts = computed<Contract[]>(() => contracts(model.value))
const groups = computed(() => catalog(model.value.routes, analysis.value.facts, allContracts.value, systemName))
const all = computed(() => groups.value.flatMap(g => g.endpoints))
const hay = computed(() => new Map(all.value.map(e => [e.route.id, haystack(e)])))

// ---- finding: words, a pasted URL, methods and picked facts, and filters that must all hold
const { search, tokens, collapsed, checked, picked, showLayers } = catalogStateFor(data.datasetKey)
// The checks (No timeout, Changes data…) are tokens in the search like any other.
const filters = computed(() => new Set(tokens.value.filter(x => x.kind === "filter").map(x => x.value as FilterId)))
const query = computed(() => parseQuery(search.value, tokens.value))
const searching = computed(() => !!(query.value.words.length || query.value.tokens.length || query.value.path))
const scores = computed(() => {
  const m = new Map<number, number>()
  for (const e of all.value) { const sc = searching.value ? score(e, hay.value.get(e.route.id) ?? "", query.value) : 1; if (sc) m.set(e.route.id, sc) }
  return m
})
const passes = (e: Endpoint) => {
  if (!scores.value.has(e.route.id)) return false
  for (const f of filters.value) if (!FILTER_TEST[f](e)) return false
  return true
}
// While searching, the best fits come first: a pasted URL's own route on top.
const shownGroups = computed(() => {
  const gs = groups.value.map(g => ({ ...g, shown: g.endpoints.filter(e => passes(e)) })).filter(g => g.shown.length)
  if (!searching.value) return gs
  const best = (g: { shown: Endpoint[] }) => Math.max(...g.shown.map(e => scores.value.get(e.route.id) ?? 0))
  for (const g of gs) g.shown = [...g.shown].sort((a, b) => (scores.value.get(b.route.id) ?? 0) - (scores.value.get(a.route.id) ?? 0))
  return gs.sort((a, b) => best(b) - best(a))
})
const shownEndpoints = computed(() => shownGroups.value.flatMap(g => g.shown))
const shownCount = computed(() => shownEndpoints.value.length)
const shownWords = computed(() => (searching.value ? t("http.catalog.shown", { count: shownCount.value, total: fmt(all.value.length) }) : t("http.catalog.groups", { count: groups.value.length, endpoints: fmt(all.value.length) })))
// Matches are drawn in the path and the handler.
const hitWords = computed(() => [...query.value.words, ...(query.value.path && !query.value.path.match(/\d/) ? [query.value.path.toLowerCase().replace(/^\//, "")] : [])])
const filterName = (f: string) => t(`http.catalog.filter.${f}.name`)
// With nothing typed, the checks and methods to narrow by; with a word, those it starts and then what it could name.
// Counted among what the rest of the search lets through, leaving out the word still being typed.
function suggestFor(word: string): Suggestion[] {
  const w = word.trim().toLowerCase()
  const rest = search.value.trim().split(/\s+/).filter(Boolean)
  if (w && rest[rest.length - 1]?.toLowerCase() === w) rest.pop()
  const q = parseQuery(rest.join(" "), tokens.value)
  const base = all.value.filter(e => score(e, hay.value.get(e.route.id) ?? "", q) > 0 && [...filters.value].every(f => FILTER_TEST[f](e)))
  const checks = FILTERS
    .filter(f => !filters.value.has(f) && (model.value.complete || f === "noRule" || f === "open" || f === "undocumented"))
    .map(f => ({ id: f, count: base.filter(e => FILTER_TEST[f](e)).length }))
    .filter(f => f.count > 0 && (!w || filterName(f.id).toLowerCase().split(/\s+/).some(x => x.startsWith(w))))
    .map(f => ({ token: { kind: "filter" as const, value: f.id }, label: filterName(f.id), count: f.count, group: t("http.search.group.checks"), title: t(`http.catalog.filter.${f.id}.title`) }))
  const counts = new Map<string, number>()
  for (const e of base) for (const m of e.methods) counts.set(m, (counts.get(m) ?? 0) + 1)
  const methods = [...counts].filter(([m]) => !tokens.value.some(x => x.kind === "method" && x.value === m) && (!w || m.toLowerCase().startsWith(w)))
    .sort((a, b) => b[1] - a[1])
    .map(([m, count]) => ({ token: { kind: "method" as const, value: m }, label: m, count, group: t("http.search.group.methods") }))
  if (!w) return [...checks, ...methods]
  const named = suggest(base, word).map(x => ({ ...x, group: t("http.search.group.named") }))
  return [...methods, ...checks, ...named].slice(0, 10)
}
function tokenLabel(tk: Token): string {
  if (tk.kind === "filter") return filterName(tk.value)
  if (tk.kind === "class" && tk.value.includes(".")) return tk.value.slice(tk.value.lastIndexOf(".") + 1)
  return tk.value
}
const EXAMPLES = computed(() => {
  const deep = all.value.filter(x => x.route.path.split("/").filter(Boolean).length >= 2)
  const e = deep.find(x => x.changes.length || x.mayChange.length) ?? deep[0] ?? all.value[0]
  const segs = e ? e.route.path.split("/").filter(Boolean) : []
  return [segs.length >= 2 ? `${segs[0]} ${segs[segs.length - 1]}`.toLowerCase() : "customer delete", e ? `https://host${e.route.path.replace(/\{[^}]*\}|:[\w]+|<[^>]+>/g, "42")}` : "https://host/orders/42"]
})
const searchBox = ref<{ focus: () => void } | null>(null)
function toResults() {
  const first = shownEndpoints.value[0]
  if (first) { picked.value = { kind: "route", id: first.route.id }; listEl.value?.focus() }
}

const toggleGroup = (k: string) => { const s = new Set(collapsed.value); s.has(k) ? s.delete(k) : s.add(k); collapsed.value = s }
const toggleAllGroups = () => { collapsed.value = collapsed.value.size ? new Set() : new Set(groups.value.map(g => g.key)) }

// ---- checked endpoints: what the layers show
let anchor: number | null = null
function check(id: number, ev?: MouseEvent) {
  const s = new Set(checked.value)
  const order = shownEndpoints.value.map(e => e.route.id)
  if (ev?.shiftKey && anchor != null && order.includes(anchor)) {
    const [i, j] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y)
    const on = !s.has(id)
    for (const x of order.slice(i, j + 1)) on ? s.add(x) : s.delete(x)
  } else s.has(id) ? s.delete(id) : s.add(id)
  anchor = id
  checked.value = s
}
const allShownChecked = computed(() => shownEndpoints.value.length > 0 && shownEndpoints.value.every(e => checked.value.has(e.route.id)))
function checkAllShown() {
  const s = new Set(checked.value)
  if (allShownChecked.value) for (const e of shownEndpoints.value) s.delete(e.route.id)
  else for (const e of shownEndpoints.value) s.add(e.route.id)
  checked.value = s
}
const groupChecked = (g: { shown: Endpoint[] }) => g.shown.every(e => checked.value.has(e.route.id))
function checkGroup(g: { shown: Endpoint[] }) {
  const s = new Set(checked.value)
  const on = !groupChecked(g)
  for (const e of g.shown) on ? s.add(e.route.id) : s.delete(e.route.id)
  checked.value = s
}

// ---- picking; arrows move through what is shown, space checks
const pickedId = computed(() => (picked.value?.kind === "route" ? picked.value.id : null))
const everyCall = ref(false)
const pickRoute = (id: number) => { picked.value = pickedId.value === id ? null : { kind: "route", id } }
const pickPanel = (kind: "contracts" | "systems") => { picked.value = picked.value?.kind === kind ? null : { kind } }
watch(() => data.datasetKey, k => { catalogStateFor(k) })
watch(pickedId, () => { everyCall.value = false })

const listEl = ref<HTMLElement | null>(null)
function onKey(ev: KeyboardEvent) {
  if (ev.key === "Escape") { picked.value = null; return }
  if (ev.key === " " && pickedId.value != null) { ev.preventDefault(); check(pickedId.value); return }
  if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return
  ev.preventDefault()
  const order = shownGroups.value.filter(g => !collapsed.value.has(g.key)).flatMap(g => g.shown.map(e => e.route.id))
  if (!order.length) return
  const i = pickedId.value == null ? -1 : order.indexOf(pickedId.value)
  if (i <= 0 && ev.key === "ArrowUp") { searchBox.value?.focus(); return }
  const next = order[Math.max(0, Math.min(order.length - 1, ev.key === "ArrowDown" ? i + 1 : i - 1))]
  picked.value = { kind: "route", id: next }
  nextTick(() => listEl.value?.querySelector(`[data-route="${next}"]`)?.scrollIntoView({ block: "nearest" }))
}

// ---- the layers: checked endpoints, else what the search and filters show, else all
const { data: anat } = useAsyncQuery<Anatomy | null>(
  () => anatomy({ query: (sql: string) => data.query(sql) } as ReadingContext),
  [() => data.datasetKey],
  { initial: null },
)
// A class the anatomy does not place joins the framework's own unclassified lane where it has one.
const laneOfUnit = computed(() => {
  const of = ownerLane(new Map((anat.value?.units ?? []).map(u => [u.id, u.lane])))
  const fallback = anat.value?.profile.lanes.some(l => l.id === "unclassified") ? "unclassified" : null
  return (u: string) => of(u) ?? fallback
})
const layerIds = computed(() => (anat.value ? layersOf(anat.value.profile) : []))
const laneLabel = (l: string) => (l === OTHER || !anat.value ? t("http.descent.otherLane") : profileLane(anat.value.profile, l).label)
const laneColor = (l: string) => (l === OTHER || !anat.value ? "rgb(var(--c-neutral-400))" : laneShade(profileLane(anat.value.profile, l).color))
const basis = computed<{ kind: "checked" | "shown" | "all"; routes: Route[] }>(() => {
  if (checked.value.size) return { kind: "checked", routes: [...checked.value].map(id => routeById.value.get(id)).filter((r): r is Route => !!r) }
  if (searching.value) return { kind: "shown", routes: shownEndpoints.value.map(e => e.route) }
  return { kind: "all", routes: model.value.routes }
})
const perFloor = ref(8)
const flow = computed(() => descent(analysis.value.index, basis.value.routes, laneOfUnit.value, layerIds.value, perFloor.value))
const flowHeading = computed(() => t(`http.descent.heading.${basis.value.kind}`, { count: basis.value.routes.length }))
const flowLit = computed(() => (pickedId.value != null ? new Set([pickedId.value]) : null))
function onNode(n: DescentNode) {
  if (n.kind === "route") { pickRoute(Number(n.id.slice(2))); return }
  if (n.kind === "system") { picked.value = { kind: "system", name: n.title }; return }
  picked.value = picked.value?.kind === "node" && picked.value.id === n.id ? null : { kind: "node", id: n.id }
}
const nodeById = computed(() => new Map(flow.value.floors.flatMap(f => f.nodes.map(n => [n.id, n] as const))))
// A folded class can be picked from its group; the figure marks the group.
const pickedNode = computed(() => (picked.value?.kind === "node" ? nodeById.value.get(picked.value.id) ?? flow.value.nodes.get(picked.value.id) ?? null : null))
const figurePicked = computed(() => {
  const p = picked.value
  if (p?.kind === "route") return `r:${p.id}`
  if (p?.kind !== "node") return null
  if (nodeById.value.has(p.id)) return p.id
  return flow.value.floors.flatMap(f => f.nodes).find(n => n.members.includes(p.id))?.id ?? null
})
const componentOfNode = computed(() => (pickedNode.value?.kind === "class" ? analysis.value.index.componentOf(pickedNode.value.title) : ""))
const sourceOfNode = computed(() => {
  const n = pickedNode.value
  const u = n && (n.kind === "class" || n.kind === "table") ? model.value.units.get(n.title) : undefined
  return u?.file ? { file: u.file, line: u.line } : null
})
// Every endpoint in the catalogue that reaches the picked class or uses the picked table: how far a change to it carries.
const nodeEverywhere = computed<Route[]>(() => {
  const n = pickedNode.value
  if (!n || n.kind === "more") return []
  const ids: number[] = []
  for (const [id, f] of analysis.value.facts) {
    if (n.kind === "table" ? f.writes.has(n.title) || f.mayWrite.has(n.title) || f.reads.has(n.title) : f.units.has(n.title)) ids.push(id)
  }
  return routesOf(ids)
})
const nodeTableUse = computed(() => {
  const n = pickedNode.value
  if (n?.kind !== "table") return null
  const use = { changes: 0, may: 0, reads: 0 }
  for (const f of analysis.value.facts.values()) {
    if (f.writes.has(n.title)) use.changes++
    else if (f.mayWrite.has(n.title)) use.may++
    else if (f.reads.has(n.title)) use.reads++
  }
  return use
})
function findToken(tk: Token) {
  if (!tokens.value.some(x => x.kind === tk.kind && x.value === tk.value)) tokens.value = [...tokens.value, tk]
  checked.value = new Set()
}

const routeById = computed(() => new Map(model.value.routes.map(r => [r.id, r])))
const routesOf = (ids: Iterable<number>) => [...ids].map(id => routeById.value.get(id)).filter((r): r is Route => !!r)
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))

// ---- an endpoint
const pickedEndpoint = computed(() => (pickedId.value == null ? null : all.value.find(e => e.route.id === pickedId.value) ?? null))
const pickedReach = computed(() => (pickedId.value == null ? undefined : model.value.reach.get(pickedId.value)))
const params = computed(() => (pickedEndpoint.value ? pathParts(pickedEndpoint.value.route.path).filter(p => p.param).map(p => p.text) : []))
const operation = computed(() => (pickedId.value == null ? null : model.value.operations.find(o => o.entry === pickedId.value) ?? null))
const pickedRules = computed(() => (pickedId.value == null ? [] : model.value.findings.filter(f => f.entry === pickedId.value)))
const trace = computed(() => (pickedEndpoint.value ? traceRoute(analysis.value.index, pickedEndpoint.value.route) : { root: null, steps: 0, cut: false }))
const shownTrace = computed(() => (trace.value.root ? (everyCall.value ? trace.value.root : pruneTrace(trace.value.root)) : null))
const outboundById = computed(() => new Map(model.value.outbound.map(o => [o.id, o])))
const pickedCalls = computed(() => (pickedId.value == null ? [] : model.value.targets.filter(x => x.entry === pickedId.value && x.kind === "outbound").map(x => outboundById.value.get(Number(x.target))).filter(o => !!o)))
// The code an endpoint passes, to make a group of.
const selectable = computed(() => {
  const comps = new Set<string>()
  if (trace.value.root) {
    const visit = (s: NonNullable<typeof trace.value.root>) => { if (!s.plumbing) comps.add(s.component); s.children.forEach(visit) }
    visit(trace.value.root)
  }
  return [...comps].filter(c => c && !c.includes("#")).sort()
})
const selected = ref<Set<string>>(new Set())

const markdown = computed(() => (pickedEndpoint.value ? endpointMarkdown(pickedEndpoint.value, {
  handler: t("http.page.handler"), access: t("http.catalog.whoMayCall"), contract: t("http.page.contract"), changes: t("http.catalog.changes"), mayChange: t("http.catalog.mayChange"),
  reads: t("http.catalog.reads"), calls: t("http.catalog.calls"), noTimeout: t("http.catalog.noTimeout"), nothingSays: t("http.page.nothingSays"),
  none: t("http.catalog.none"), contractWords: documentedLabel(pickedEndpoint.value.route),
}) : ""))
const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy(what: string, text: string) {
  try { await navigator.clipboard.writeText(text) } catch { return }
  copied.value = what
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = null }, 1500)
}

// ---- how things read
const ACCESS_TOKENS: Record<AccessClass, string> = { rule: "--c-blue-600", signedIn: "--c-blue-300", open: "--c-amber-500", other: "--c-violet-400", none: "--c-neutral-300" }
const accessColor = (a: AccessClass) => `rgb(var(${ACCESS_TOKENS[a]}))`
function methodPill(m: string): string {
  switch (m) {
    case "GET": return "bg-blue-50 text-blue-700"
    case "POST": return "bg-green-50 text-green-700"
    case "PUT": case "PATCH": return "bg-amber-50 text-amber-700"
    case "DELETE": return "bg-red-50 text-red-700"
    default: return "bg-neutral-100 text-neutral-600"
  }
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
const memberOf = (h: string) => h.slice(h.lastIndexOf(".") + 1)
const listOf = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, 2).join(", ")} +${xs.length - 2}` : xs.join(", "))

// ---- contracts
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
  const ids = new Set(s.routes)
  for (const [id, f] of analysis.value.facts) if (f.waits.has(s.system) || f.other.has(s.system)) ids.add(id)
  return routesOf(ids)
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
function systemName(key: string): string { return key.startsWith("?") ? t("http.page.unresolvedKind", { kind: kindLabel(key.slice(1)) }) : key }
const envLabel = (e: string) => (e ? e : t("http.page.everyEnvironment"))
const routeLabel = (id: number) => { const r = routeById.value.get(id); return r ? `${r.method} ${r.path}` : `#${id}` }
const sourceAt = (file: string, line: number) => `${filePath(file, "source")}${line ? `#L${line}` : ""}`

// The inventory: every endpoint with what it does, as an assessment asks
// for it; what is filtered or searched is what exports.
const inventory = useTable({
  get title() { return t("http.catalog.inventoryTitle") },
  rows: () => shownGroups.value.flatMap(g => g.shown).map(e => ({
    method: e.methods.join(", "), path: e.route.path, handler: e.handler, class: ownerName(e), component: e.route.component,
    access: e.route.auth, access_kind: t(`http.catalog.accessKind.${e.access}`), contract: documentedLabel(e.route),
    changes: e.changes.join(", "), may_change: e.mayChange.join(", "), reads: e.reads.join(", "), calls: e.calls.join(", "), no_timeout: e.unguarded.join(", "),
    followed: e.followed ? t("http.catalog.yes") : t("http.catalog.no"), file: e.route.file, line: e.route.line,
  })),
  columns: () => [
    { id: "method", label: t("http.page.method") }, { id: "path", label: t("http.page.path") }, { id: "handler", label: t("http.page.handler") },
    { id: "class", label: t("http.catalog.class") }, { id: "component", label: t("http.page.component") },
    { id: "access", label: t("http.catalog.accessRule") }, { id: "access_kind", label: t("http.catalog.whoMayCall") }, { id: "contract", label: t("http.page.contract") },
    { id: "changes", label: t("http.catalog.changes") }, { id: "may_change", label: t("http.catalog.mayChange") }, { id: "reads", label: t("http.catalog.reads") }, { id: "calls", label: t("http.catalog.calls") },
    { id: "no_timeout", label: t("http.catalog.noTimeoutColumn") }, { id: "followed", label: t("http.catalog.followedColumn") },
    { id: "file", label: t("http.page.file") }, { id: "line", label: t("http.page.line") },
  ],
  notes: () => [["access", t("http.page.accessNote")], ["changes", t("http.catalog.changesNote")], ["may_change", t("http.catalog.mayChangeTitle")], ["followed", t("http.catalog.followedNote")]],
  disabledReason: () => (!model.value.routes.length ? t("http.page.noRoutes") : null),
})
const ownerOf = computed(() => new Map(groups.value.flatMap(g => g.endpoints.map(e => [e.route.id, g.owner] as const))))
const ownerName = (e: Endpoint) => ownerOf.value.get(e.route.id) ?? ""
</script>
