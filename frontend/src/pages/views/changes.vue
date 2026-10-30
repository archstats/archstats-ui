<template>
  <ViewWorkspaceLayout :queryable="false" :title="t('pages.changes.changes')">
    <template #stats>
      <span v-if="changeSet">{{ summary }}</span>
    </template>
    <template #switches>
      <div class="ui-segmented" role="group" :aria-label="t('pages.changes.changes')">
        <router-link to="/views/changes" custom v-slot="{ navigate }"><button type="button" aria-pressed="true" @click="navigate">{{ t('pages.changes.compare') }}</button></router-link>
        <router-link to="/views/trends" custom v-slot="{ navigate }"><button type="button" aria-pressed="false" @click="navigate">{{ t('pages.changes.overTime') }}</button></router-link>
      </div>
    </template>

    <template #visualizer>
      <div ref="scroller" class="flex min-h-0 grow flex-col overflow-y-auto">
        <EmptyState v-if="!data.hasData || !head" :title="t('pages.changes.noSnapshotOpen')" :text="t('pages.changes.openScanCompareEarlier')" icon="history"/>
        <template v-else>
          <!-- Where the comparison starts: a point in history, or two snapshots picked by hand. -->
          <SinceBar v-if="!manual" :since="since" :workspace-id="workspaces.activeWorkspaceId" :head="head" :previous="previous" :snapshots="otherSnapshots"
                    :base="resolved" :commits="context?.work?.commits ?? null" @update:since="setSince" @pick-snapshots="pickSnapshots"/>
          <div v-else class="flex min-h-11 flex-wrap items-center gap-2 px-6 py-2 hairline-b">
            <SingleSelect :model-value="baseOption" :options="options" @update:model-value="(o: any) => setSide('base', o?.id)"/>
            <Icon icon="arrow-right" :size="14" class="text-neutral-400"/>
            <SingleSelect :model-value="headOption" :options="options" @update:model-value="(o: any) => setSide('head', o?.id)"/>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('pages.changes.swapTwoSides')" @click="swap">{{ t('pages.changes.swap') }}</button>
            <span v-if="manualSides.swapped" class="text-sm text-neutral-500">{{ t('pages.changes.olderCodeLeft') }}</span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="setSince(since)">{{ t('pages.changes.backToSince') }}</button>
          </div>
          <div v-if="notes.length && changeSet" class="flex items-center gap-3 px-6 py-1.5 text-sm text-neutral-700 hairline-b" role="status">
            <Icon icon="alert" :size="13" class="shrink-0 text-neutral-500"/>
            <span class="min-w-0 flex-1 truncate" :title="notes.join(' ')">{{ notes.join(" ") }}</span>
          </div>

          <!-- Not comparable yet: the panel that clears it. -->
          <LoadingState v-if="stage === 'resolving'" :text="t('pages.changes.findingCommit', { point: pointText })"/>
          <EmptyState v-else-if="stage === 'error'" :title="t('pages.changes.noSuchPoint')" :text="resolveError" icon="alert"/>
          <EmptyState v-else-if="stage === 'nobase'" :title="t('pages.changes.changesNeedsSecondSnapshot')" :text="t('pages.changes.compareReadsWhatChanged')" icon="history"/>
          <SincePanel v-else-if="stage === 'same' || stage === 'outdated' || stage === 'scan' || stage === 'scanning'"
                      :state="stage" :commit="resolved" :point="pointText" :since-is-time="since.kind === 'ago'" :other="ready.other"
                      :head-revision="head.analysisRevision ?? null" :engine-revision="data._engineRevision" @anyway="(id: string) => (anywayId = id)"/>

          <LoadingState v-else-if="loading" :text="t('pages.changes.comparingSnapshots')"/>
          <EmptyState v-else-if="error" :title="t('pages.changes.couldNotCompare')" :text="error" icon="alert"/>
          <div v-else-if="changeSet" class="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-6 pb-16 pt-5">
            <StatStrip :cells="stats"/>

            <!-- The reading: the facts in words, most consequential first, each a way to its evidence. -->
            <section>
              <h2 class="ui-section-title">{{ t('pages.changes.whatChanged') }}</h2>
              <p v-if="unchanged && !reading.length" class="mt-2 text-base text-neutral-700">{{ t('pages.changes.noStructuralChanges') }}</p>
              <ul v-else class="mt-2 flex flex-col">
                <li v-if="unchanged" class="py-1.5 text-base text-neutral-700">{{ t('pages.changes.noStructuralChanges') }}</li>
                <li v-for="item in reading" :key="item.key">
                  <button type="button" class="group flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 -mx-2 text-left hover:bg-neutral-100" @click="follow(item)">
                    <span class="mt-[1px] h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full" :class="dotClass(item)"></span>
                    <span class="min-w-0 text-base leading-6 text-neutral-800">
                      {{ item.lead }}
                      <template v-for="(name, i) in item.names" :key="name"><span v-if="i" class="text-neutral-400">, </span><code class="font-mono text-sm text-neutral-900">{{ name }}</code></template>
                      <span v-if="item.more" class="text-neutral-500">{{ " " + t('pages.changes.andMore', { count: item.more }) }}</span>
                    </span>
                    <Icon icon="arrow-down" :size="12" class="ml-auto shrink-0 text-neutral-300 group-hover:text-neutral-500"/>
                  </button>
                </li>
              </ul>
            </section>

            <!-- Where it landed: areas against areas. -->
            <section v-if="areas && order.length > 1" ref="matrixEl">
              <ChangeMatrix :order="order" :cells="cells" :label="label" :size="(k: string) => areas!.size.get(k) ?? 0" :commits="commitsPerArea"
                            :selected="pickedCell" :selected-area="pickedArea" :title="t('pages.changes.whereDependenciesChanged')"
                            @select="c => { pickedCell = c; pickedArea = null }" @select-area="a => { pickedArea = a; pickedCell = null }">
                <template #aside>
                  <span v-if="!pickedCell && !pickedArea">{{ t('pages.changes.clickCell') }}</span>
                </template>
              </ChangeMatrix>
            </section>

            <!-- The component dependencies behind the cells. -->
            <section id="changes-links" ref="linksEl">
              <div class="flex min-h-7 flex-wrap items-center gap-3">
                <h2 class="ui-section-title">{{ t('pages.changes.dependencyChanges') }}</h2>
                <span v-if="pickedCell" class="ui-chip is-active max-w-[420px]">
                  <span class="truncate font-mono">{{ label(pickedCell.from) }} → {{ label(pickedCell.to) }}</span>
                  <button type="button" class="-mr-1 text-neutral-500 hover:text-neutral-900" :aria-label="t('pages.changes.clearFilter')" @click="pickedCell = null"><Icon icon="x" :size="12"/></button>
                </span>
                <span v-else-if="pickedArea" class="ui-chip is-active max-w-[420px]">
                  <span class="truncate font-mono">{{ label(pickedArea) }}</span>
                  <button type="button" class="-mr-1 text-neutral-500 hover:text-neutral-900" :aria-label="t('pages.changes.clearFilter')" @click="pickedArea = null"><Icon icon="x" :size="12"/></button>
                </span>
                <span class="font-mono text-sm text-neutral-500">{{ linkCount }}</span>
                <ExhibitButton :exhibit="edgeTable" class="ml-auto"/>
              </div>
              <p v-if="!groups.length" class="mt-2 text-sm text-neutral-500">{{ pickedCell || pickedArea ? t('pages.changes.noLinkChangesHere') : t('pages.changes.noLinkChanges') }}</p>
              <div v-else class="mt-2 overflow-hidden rounded-lg hairline">
                <table class="ui-table table-fixed">
                  <colgroup><col class="w-8"/><col class="w-7"/><col/><col/><col class="w-[96px]"/><col class="w-[64px]"/></colgroup>
                  <thead><tr><th></th><th></th><th>{{ t('pages.changes.from') }}</th><th>{{ t('pages.changes.to') }}</th><th class="text-right">{{ t('pages.changes.refs') }}</th><th class="text-right">{{ t('pages.changes.files') }}</th></tr></thead>
                  <tbody>
                    <template v-for="g in shownGroups" :key="g.key">
                      <tr class="bg-neutral-50">
                        <td colspan="6" class="!py-1.5">
                          <span class="font-mono text-sm font-medium text-neutral-900">{{ label(g.from) }} <span class="text-neutral-400">→</span> {{ label(g.to) }}</span>
                          <span v-if="g.state === 'new'" class="ui-tag ml-2">{{ t('pages.changes.newLink') }}</span>
                          <span v-else-if="g.state === 'gone'" class="ui-tag ml-2">{{ t('pages.changes.linkGone') }}</span>
                          <span v-else-if="g.from === g.to" class="ui-tag ml-2">{{ t('pages.changes.insideArea') }}</span>
                          <span class="ml-2 font-mono text-sm text-neutral-500">{{ g.counts }}</span>
                        </td>
                      </tr>
                      <template v-for="r in (openGroups.has(g.key) ? g.rows : g.rows.slice(0, GROUP_ROWS))" :key="r.key">
                        <tr class="is-clickable" :class="{ 'is-selected': selected.has(r.from) && selected.has(r.to) }" @click="toggleExpanded(r)">
                          <td @click.stop><Checkbox :model-value="selected.has(r.from) && selected.has(r.to)" @update:model-value="toggleEdge(r)"/></td>
                          <td class="font-mono text-neutral-500" :title="kindTitle(r.kind)">{{ r.kind === "added" ? "+" : r.kind === "removed" ? "−" : "~" }}</td>
                          <td class="truncate font-mono text-sm" :class="r.kind === 'removed' ? 'text-neutral-500' : ''" :title="r.from">{{ r.from }}</td>
                          <td class="truncate font-mono text-sm" :class="r.kind === 'removed' ? 'text-neutral-500' : ''" :title="r.to">{{ r.to }}<span v-if="r.dynamic" class="ui-tag ml-2" :title="t('pages.changes.joinedOnlyRuntimeLookup')">{{ t('pages.changes.lookup') }}</span></td>
                          <td class="is-num text-right">{{ r.kind === "changed" ? `${fmt(r.before)} → ${fmt(r.after)}` : fmt(r.refs) }}</td>
                          <td class="is-num text-right">{{ r.files.length || "" }}</td>
                        </tr>
                        <tr v-if="expanded === r.key && r.files.length">
                          <td></td><td></td>
                          <td colspan="4" class="!py-2">
                            <ul class="flex flex-col gap-1.5">
                              <li v-for="f in r.files" :key="f" class="flex flex-col gap-0.5">
                                <router-link :to="filePath(f, r.kind === 'removed' ? 'history' : 'imports')" class="truncate font-mono text-sm text-neutral-800 hover:underline">{{ f }}</router-link>
                                <span v-for="c in (fileCommits[f] ?? []).slice(0, 3)" :key="c.hash" class="flex min-w-0 gap-2 pl-3 text-sm text-neutral-600">
                                  <span class="shrink-0 font-mono text-neutral-500">{{ c.hash.slice(0, 7) }}</span>
                                  <span class="min-w-0 truncate" :title="authors.displayText(c.message)">{{ authors.displayText(c.message) }}</span>
                                  <span class="ml-auto shrink-0 text-neutral-500">{{ authors.display(c.author) }} · {{ shortDate(c.time) }}</span>
                                </span>
                                <span v-if="fileCommits[f] && !fileCommits[f].length" class="pl-3 text-sm text-neutral-500">{{ t('pages.changes.noCommitInRange') }}</span>
                              </li>
                            </ul>
                          </td>
                        </tr>
                      </template>
                      <tr v-if="g.rows.length > GROUP_ROWS && !openGroups.has(g.key)">
                        <td></td><td></td>
                        <td colspan="4" class="!py-1"><button type="button" class="ui-btn ui-btn-sm ui-btn-quiet -ml-2" @click="openGroups = new Set([...openGroups, g.key])">{{ t('pages.changes.showAllInPair', { count: g.rows.length }) }}</button></td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
              <button v-if="groups.length > shownGroups.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-2" @click="allGroups = true">{{ t('pages.changes.showAllLinks', { count: groups.length }) }}</button>
            </section>

            <!-- Tangles: loops that formed, grew, shrank or came apart. -->
            <section v-if="changeSet.tangles?.length" id="changes-tangles">
              <h2 class="ui-section-title">{{ t('pages.changes.tangles') }}</h2>
              <ul class="mt-2 flex flex-col gap-3">
                <li v-for="(tg, i) in changeSet.tangles" :key="i" class="rounded-lg p-3 hairline">
                  <p class="text-base text-neutral-900"><span class="font-medium">{{ tangleKind(tg.kind) }}</span>
                    <span class="ml-2 font-mono text-sm text-neutral-500">{{ t('pages.changes.tangleSize', { before: tg.before?.length ?? 0, after: tg.after?.length ?? 0 }) }}</span></p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <router-link v-for="m in (tg.after?.length ? tg.after : tg.before ?? [])" :key="m" :to="componentLink(m)" class="ui-chip font-mono"
                                 :class="{ 'is-active': tg.kind !== 'formed' && tg.joined.includes(m) }" :title="tg.joined.includes(m) && tg.kind !== 'formed' ? t('pages.changes.joinedTangle') : m">
                      {{ tg.joined.includes(m) && tg.kind !== "formed" ? "+ " : "" }}{{ m }}
                    </router-link>
                    <span v-for="m in (tg.kind !== 'dissolved' ? tg.left : [])" :key="'left-' + m" class="ui-chip font-mono text-neutral-400 line-through" :title="t('pages.changes.leftTangle')">{{ m }}</span>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Rule findings, new and gone. -->
            <section v-if="ruleRows.length || !changeSet.rulesChecked?.base" id="changes-rules">
              <div class="flex min-h-7 items-center gap-3">
                <h2 class="ui-section-title">{{ t('pages.changes.ruleFindings') }}</h2>
                <ExhibitButton :exhibit="ruleTable" class="ml-auto"/>
              </div>
              <p v-if="!changeSet.rulesChecked?.base" class="mt-2 text-sm text-neutral-500">{{ t('pages.changes.rulesWereNotChecked') }}</p>
              <div v-if="ruleRows.length" class="mt-2 overflow-hidden rounded-lg hairline">
                <table class="ui-table">
                  <thead><tr><th class="w-16"></th><th>{{ t('pages.changes.rule') }}</th><th>{{ t('pages.changes.fromTo') }}</th><th>{{ t('pages.changes.where') }}</th></tr></thead>
                  <tbody>
                    <tr v-for="r in page(ruleRows, 'rule')" :key="r.key">
                      <td class="text-sm" :class="r.kind === 'new' ? 'text-neutral-900' : 'text-neutral-500'">{{ r.kind === "new" ? t('pages.changes.new') : t('pages.changes.gone') }}</td>
                      <td class="text-sm">{{ r.rule }}</td>
                      <td class="max-w-0 truncate font-mono text-sm" :title="`${r.from} → ${r.to}`">{{ r.from }} → {{ r.to }}</td>
                      <td class="max-w-0 truncate font-mono text-sm"><router-link v-if="r.kind === 'new'" :to="`${filePath(r.file, 'source')}#L${r.line}`" class="hover:underline">{{ r.file.split("/").pop() }}:{{ r.line }}</router-link><span v-else class="text-neutral-500">{{ r.file.split("/").pop() }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <MoreButton :total="ruleRows.length" section="rule"/>
            </section>

            <!-- The active lens's declared order, new and gone crossings. -->
            <section v-if="lensDiff">
              <h2 class="ui-section-title">{{ t('pages.changes.lensFindings', { active: lens.active }) }}</h2>
              <p v-if="!lensDiff.added.length && !lensDiff.gone.length" class="mt-2 text-sm text-neutral-500">{{ t('pages.changes.noImportStartedStopped') }}</p>
              <div v-else class="mt-2 overflow-hidden rounded-lg hairline">
                <table class="ui-table">
                  <thead><tr><th class="w-16"></th><th>{{ t('pages.changes.fromTo') }}</th><th>{{ t('pages.changes.groups') }}</th><th>{{ t('pages.changes.where') }}</th></tr></thead>
                  <tbody>
                    <tr v-for="f in [...lensDiff.added.map(e => ({ e, kind: 'new' })), ...lensDiff.gone.map(e => ({ e, kind: 'gone' }))]" :key="f.kind + f.e.fromComponent + f.e.toComponent + f.e.file">
                      <td class="text-sm" :class="f.kind === 'new' ? 'text-neutral-900' : 'text-neutral-500'">{{ f.kind === "new" ? t('pages.changes.new') : t('pages.changes.gone') }}</td>
                      <td class="max-w-0 truncate font-mono text-sm" :title="`${f.e.fromComponent} → ${f.e.toComponent}`">{{ f.e.fromComponent }} → {{ f.e.toComponent }}</td>
                      <td class="text-sm text-neutral-600">{{ groupName(f.e.fromGroup) }} → {{ groupName(f.e.toGroup) }}</td>
                      <td class="max-w-0 truncate font-mono text-sm"><router-link v-if="f.kind === 'new'" :to="`${filePath(f.e.file, 'source')}${f.e.line ? `#L${f.e.line}` : ''}`" class="hover:underline">{{ f.e.file.split("/").pop() }}{{ f.e.line ? `:${f.e.line}` : "" }}</router-link><span v-else class="text-neutral-500">{{ f.e.file.split("/").pop() }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Through the lens's groups. -->
            <section v-if="structure.available.value">
              <div class="flex items-center gap-3">
                <h2 class="ui-section-title">{{ t('pages.changes.structure') }}</h2>
                <span class="text-sm text-neutral-500">{{ t('pages.changes.throughLens', { active: lens.active }) }}</span>
              </div>
              <p class="mt-1 max-w-[760px] text-sm text-neutral-500">{{ t('pages.changes.bothSnapshotsReadThrough') }}</p>
              <LoadingState v-if="structure.loading.value" :text="t('pages.changes.readingBothSnapshotsImports')"/>
              <p v-else-if="structure.error.value" class="mt-2 text-sm text-red-700">{{ structure.error.value }}</p>
              <template v-else-if="structure.diff.value">
                <div class="mt-2 overflow-hidden rounded-lg hairline">
                  <table class="ui-table">
                    <thead><tr><th>{{ t('pages.changes.check') }}</th><th class="text-right">{{ t('pages.changes.before') }}</th><th class="text-right">{{ t('pages.changes.after') }}</th></tr></thead>
                    <tbody>
                      <tr v-for="r in structure.diff.value.rows" :key="r.label">
                        <td :title="r.why">{{ r.label }}</td>
                        <td class="is-num text-right text-neutral-500">{{ r.before.toLocaleString(intlLocale) }}</td>
                        <td class="is-num text-right" :class="r.better === 'lower' && r.after !== r.before ? (r.after < r.before ? 'text-green-700' : 'text-red-700') : 'text-neutral-900'">{{ r.after.toLocaleString(intlLocale) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul class="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
                  <li v-if="structure.diff.value.mutualGone.length">{{ t('pages.changes.noLongerImportingEach', { value: structure.diff.value.mutualGone.map(m => `${structure.name(m.a)} ⇄ ${structure.name(m.b)}`).join(", ") }) }}</li>
                  <li v-if="structure.diff.value.mutualNew.length" class="text-neutral-900">{{ t('pages.changes.nowImportingEachOther', { value: structure.diff.value.mutualNew.map(m => `${structure.name(m.a)} ⇄ ${structure.name(m.b)}`).join(", ") }) }}</li>
                  <li v-if="structure.diff.value.depsNew.length">{{ t('pages.changes.newDependencies', { value: structure.diff.value.depsNew.slice(0, 8).map(d => `${structure.name(d.from)} → ${structure.name(d.to)} (${d.imports})`).join(", "), value2: structure.diff.value.depsNew.length > 8 ? t('pages.changes.more', { value: structure.diff.value.depsNew.length - 8 }) : "" }) }}</li>
                  <li v-if="structure.diff.value.depsGone.length">{{ t('pages.changes.gone2', { value: structure.diff.value.depsGone.slice(0, 8).map(d => `${structure.name(d.from)} → ${structure.name(d.to)} (${d.imports})`).join(", "), value2: structure.diff.value.depsGone.length > 8 ? t('pages.changes.more', { value: structure.diff.value.depsGone.length - 8 }) : "" }) }}</li>
                </ul>
              </template>
            </section>

            <!-- Readings that moved, one at a time: no composite. -->
            <section v-if="moves.length" id="changes-moves">
              <div class="flex min-h-7 items-center gap-3">
                <h2 class="ui-section-title">{{ t('pages.changes.readingsMoved') }}</h2>
                <SingleSelect :model-value="metricOption" :options="metricOptions" @update:model-value="(o: any) => (metric = o?.id ?? metric)"/>
                <ExhibitButton :exhibit="movesTable" class="ml-auto"/>
              </div>
              <div class="mt-2 overflow-hidden rounded-lg hairline">
                <table class="ui-table table-fixed">
                  <colgroup><col class="w-8"/><col/><col class="w-[180px]"/><col class="w-[200px]"/></colgroup>
                  <thead><tr><th></th><th>{{ t('pages.changes.component') }}</th><th class="text-right">{{ t('pages.changes.beforeAfter') }}</th><th class="text-right">{{ t('pages.changes.change') }}</th></tr></thead>
                  <tbody>
                    <tr v-for="m in page(metricMoves, 'move')" :key="m.component" :class="{ 'is-selected': selected.has(m.component) }">
                      <td @click.stop><Checkbox :model-value="selected.has(m.component)" @update:model-value="toggle(m.component)"/></td>
                      <td class="truncate font-mono text-sm"><router-link :to="componentLink(m.component)" class="text-neutral-900 hover:underline" :title="m.component">{{ m.component }}</router-link></td>
                      <td class="is-num text-right">{{ fmtMetric(m.before) }} → {{ fmtMetric(m.after) }}</td>
                      <td class="is-num">
                        <!-- The change drawn on one scale for the whole list, up right of the axis, down left. -->
                        <span class="flex items-center justify-end gap-2">
                          <span class="relative h-2 w-[96px]" aria-hidden="true">
                            <span class="absolute inset-y-0 left-1/2 w-px bg-neutral-300"></span>
                            <span class="absolute inset-y-0 rounded-[1px] bg-neutral-400" :style="moveBar(m)"></span>
                          </span>
                          <span class="w-[64px] text-right">{{ m.after >= m.before ? "+" : "−" }}{{ fmtMetric(Math.abs(m.after - m.before)) }}</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <MoreButton :total="metricMoves.length" section="move"/>
            </section>

            <!-- Components that came and went, by area. -->
            <section v-if="compRows.length" id="changes-components">
              <div class="flex min-h-7 items-center gap-3">
                <h2 class="ui-section-title">{{ t('pages.changes.componentsAddedRemoved') }}</h2>
                <ExhibitButton :exhibit="compTable" class="ml-auto"/>
              </div>
              <div class="mt-2 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
                <div v-for="side in compSides" :key="side.kind">
                  <p class="ui-label">{{ side.kind === "added" ? t('pages.changes.added', { count: side.rows.length }) : t('pages.changes.removed', { count: side.rows.length }) }}</p>
                  <ul class="mt-1 flex flex-col">
                    <li v-for="r in (showAll.has('comp-' + side.kind) ? side.rows : side.rows.slice(0, 12))" :key="r" class="flex h-7 items-center gap-2">
                      <Checkbox :model-value="selected.has(r)" @update:model-value="toggle(r)"/>
                      <router-link v-if="side.kind === 'added'" :to="componentLink(r)" class="truncate font-mono text-sm text-neutral-900 hover:underline" :title="r">{{ r }}</router-link>
                      <span v-else class="truncate font-mono text-sm text-neutral-500 line-through decoration-neutral-300" :title="r">{{ r }}</span>
                    </li>
                  </ul>
                  <button v-if="side.rows.length > 12 && !showAll.has('comp-' + side.kind)" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="showAll = new Set([...showAll, 'comp-' + side.kind])">{{ t('pages.changes.showAll', { value: side.rows.length.toLocaleString(intlLocale) }) }}</button>
                </div>
              </div>
            </section>
          </div>
        </template>
      </div>
      <GroupActionBar v-if="selected.size" :selected-items="[...selected]" kind="component" :show-in-except="[]" @replace="selected = new Set($event)" @clear="selected = new Set()" @created="selected = new Set()"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import { computed, defineComponent, h, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Compare } from "wailsjs/go/app/ChangesService";
import { QueryIn } from "wailsjs/go/app/QueryService";
import { ResolveCommit, ResolveCommitAt } from "wailsjs/go/app/ScanService";
import { lensGroups } from "~/features/groups/lensEdges";
import { checkLens } from "~/features/rules/useLensFindings";
import { useGroupsStore } from "~/features/groups/groups.store";
import { useLensStore } from "~/features/groups/lens.store";
import { findingKey } from "~/features/rules/lensRules";
import { useStructureCompare } from "~/features/trends/useStructureCompare";
import { useChangeContext, commitsByArea, commitsTouching, type RangeCommit } from "~/features/trends/useChangeContext";
import type { GroupEdge } from "~/features/groups/groupEdges";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import ChangeMatrix from "~/features/trends/components/ChangeMatrix.vue";
import SinceBar from "~/features/trends/components/SinceBar.vue";
import SincePanel from "~/features/trends/components/SincePanel.vue";
import StatStrip, { type StatCell } from "~/features/metrics/components/StatStrip.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import SingleSelect from "~/shared/ui/SingleSelect.vue";
import { useExportables, useTable } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useAuthorsStore } from "~/features/git/authors.store";
import { changesMarkdown, countChanges, isUnchanged, normalizeChangeSet, pickSides, summaryLine, type ChangeSet, type Move } from "~/features/trends/changes";
import { comparability } from "~/features/trends/comparability";
import { defaultSince, monthsBefore, parseSince, previousComparable, readiness, sameCommit, sinceKey, type ResolvedCommit, type Since } from "~/features/trends/since";
import { adaptiveAreas, areaCells, areaLabel, changedCells, orderAreas, type AreaCell } from "~/features/trends/areas";
import { changeReading, type ReadingItem } from "~/features/trends/reading";
import { buildProvenance, provenanceShort } from "~/features/export/provenance";
import { componentPath, filePath } from "~/features/navigation/routes";
import { newestFirst } from "~/features/workspace/scanOrder";
import { formatScanTime } from "~/shared/time";
import { t, intlLocale, dateLocale } from "~/shared/i18n";

// What the code did to its structure since a point in its history. The point
// is a commit (the previous comparable scan, a time back, a tag), never "the
// scan before this one", which is usually the same commit read again. The page
// reads the change in words, draws where it landed between areas, and keeps
// every component dependency, tangle, rule finding and reading that moved
// underneath. Neutral ink throughout: a new dependency is a fact, not an alarm.

const data = useDataStore();
const workspaces = useWorkspacesStore();
const authors = useAuthorsStore();
const route = useRoute();
const router = useRouter();
onMounted(() => { void authors.loadLabels(); });

const complete = computed(() => newestFirst(workspaces.scans.filter((s: any) => s.status === "complete")) as any[]);
const openScan = computed<any>(() => complete.value.find(s => s.id === workspaces.openScanId) ?? null);

// ── Two snapshots picked by hand ────────────────────────────────────────
const manual = computed(() => typeof route.query.base === "string" && typeof route.query.head === "string");
const manualSides = computed(() => pickSides(complete.value, {
  head: typeof route.query.head === "string" ? route.query.head : workspaces.openScanId,
  base: typeof route.query.base === "string" ? route.query.base : null,
}));
const labelOf = (s: any) => (s ? `${s.label ? s.label + " · " : ""}${formatScanTime(s.headTime ?? s.startedAt)}${s.headCommit ? ` · ${s.headCommit.slice(0, 7)}` : ""}` : "");
// Two scans of one commit read alike; the scan time and revision tell them apart.
const options = computed(() => {
  const base = complete.value.map(s => ({ id: s.id, name: labelOf(s), scan: s }));
  const seen = new Map<string, number>();
  for (const o of base) seen.set(o.name, (seen.get(o.name) ?? 0) + 1);
  return base.map(o => ({ id: o.id, name: (seen.get(o.name) ?? 0) > 1 ? t("pages.changes.scanned", { name: o.name, startedAt: formatScanTime(o.scan.startedAt), revision: o.scan.analysisRevision || "?" }) : o.name }));
});
const baseOption = computed(() => options.value.find(o => o.id === manualSides.value.base?.id) ?? null);
const headOption = computed(() => options.value.find(o => o.id === manualSides.value.head?.id) ?? null);
function setSide(side: "base" | "head", id?: string) {
  if (!id) return;
  void router.replace({ query: { base: manualSides.value.base?.id, head: manualSides.value.head?.id, [side]: id } });
}
function swap() {
  const { base, head: hd } = manualSides.value;
  if (base && hd) void router.replace({ query: { base: hd.id, head: base.id } });
}
function pickSnapshots() {
  const b = baseScan.value ?? previous.value ?? complete.value.find(s => s.id !== head.value?.id);
  void router.replace({ query: { base: b?.id ?? head.value?.id, head: head.value?.id } });
}

// ── Since a point in history ────────────────────────────────────────────
const head = computed<any>(() => (manual.value ? manualSides.value.head : openScan.value ?? complete.value[0] ?? null));
const previous = computed<any>(() => (head.value ? previousComparable(complete.value, head.value) : null));
const otherSnapshots = computed(() => complete.value.filter(s => s.id !== head.value?.id && !sameCommit(s.headCommit, head.value?.headCommit)));
const since = computed<Since>(() => parseSince(route.query.since) ?? (head.value ? defaultSince(complete.value, head.value, (workspaces.active as any)?.baselineScanId) : { kind: "ago", months: 3 }));
function setSince(s: Since) {
  anywayId.value = null;
  void router.replace({ query: { since: sinceKey(s) } });
}
const pointText = computed(() => {
  const s = since.value;
  if (s.kind === "ago") return t("pages.changes.monthsBack", { count: s.months });
  if (s.kind === "ref") return /^[0-9a-f]{12,40}$/i.test(s.ref) ? s.ref.slice(0, 7) : s.ref;
  const scan = complete.value.find(x => x.id === s.id);
  return scan?.headCommit ? scan.headCommit.slice(0, 7) : t("pages.changes.thatSnapshot");
});

const resolved = ref<ResolvedCommit | null>(null);
const resolving = ref(false);
const resolveError = ref("");
const anywayId = ref<string | null>(null);
let resolveToken = 0;
watch([() => sinceKey(since.value), () => head.value?.id, manual], async () => {
  const mine = ++resolveToken;
  resolved.value = null; resolveError.value = "";
  const ws = workspaces.activeWorkspaceId;
  const hd = head.value;
  if (manual.value || !ws || !hd) return;
  const s = since.value;
  resolving.value = true;
  try {
    let c: ResolvedCommit | null = null;
    if (s.kind === "scan") {
      const scan = complete.value.find(x => x.id === s.id);
      if (!scan) throw new Error(t("pages.changes.snapshotGone"));
      c = scan.headCommit ? ((await ResolveCommit(ws, scan.headCommit).catch(() => null)) as any) ?? { sha: scan.headCommit, time: String(scan.headTime ?? scan.startedAt), subject: "" } : { sha: "", time: String(scan.headTime ?? scan.startedAt), subject: "" };
    } else if (s.kind === "ago") {
      const from = new Date(hd.headTime ?? hd.startedAt);
      c = (await ResolveCommitAt(ws, monthsBefore(from, s.months).toISOString() as any)) as any;
    } else {
      c = (await ResolveCommit(ws, s.ref)) as any;
    }
    if (mine === resolveToken) resolved.value = c ? { sha: c.sha, time: String(c.time), subject: c.subject ?? "" } : null;
  } catch (e) {
    if (mine === resolveToken) resolveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (mine === resolveToken) resolving.value = false;
  }
}, { immediate: true });

const ready = computed(() => {
  const hd = head.value, c = resolved.value;
  if (!hd || !c) return { state: "none" as const, base: null as any, other: [] as any[] };
  // A scan picked by hand without a recorded commit is its own point.
  if (since.value.kind === "scan" && !c.sha) {
    const scan = complete.value.find(x => x.id === (since.value as any).id);
    return comparability(scan, hd).ok ? { state: "ready" as const, base: scan, other: [] } : { state: "scan" as const, base: null, other: [scan] };
  }
  const r = readiness(complete.value, hd, c, data._engineRevision);
  return { state: r.state, base: r.state === "ready" ? r.base : null, other: "other" in r ? r.other : [] };
});
const scanningPoint = computed(() => {
  const p: any = workspaces.activeProgress;
  return !!p?.ref && !!resolved.value?.sha && sameCommit(p.ref, resolved.value.sha);
});
const stage = computed(() => {
  if (manual.value) return manualSides.value.base ? "ready" : "nobase";
  if (resolving.value) return "resolving";
  if (resolveError.value) return "error";
  if (anywayId.value) return "ready";
  if (scanningPoint.value) return "scanning";
  return ready.value.state === "none" ? "resolving" : ready.value.state;
});
const baseScan = computed<any>(() => {
  if (manual.value) return manualSides.value.base;
  if (anywayId.value) return complete.value.find(s => s.id === anywayId.value) ?? null;
  return stage.value === "ready" ? ready.value.base : null;
});

const check = computed(() => (baseScan.value && head.value ? comparability(baseScan.value, head.value) : { ok: true, reasons: [] }));
const notes = computed(() => check.value.reasons.map(r => r.text));

// ── The comparison ──────────────────────────────────────────────────────
// What the reader has picked in it: an area pair, an area, an open row.
const pickedCell = ref<{ from: string; to: string } | null>(null);
const pickedArea = ref<string | null>(null);
const expanded = ref<string | null>(null);
const changeSet = ref<ChangeSet | null>(null);
const loading = ref(false);
const error = ref("");
watch([() => baseScan.value?.id, () => head.value?.id, stage], async ([b, hd, st]) => {
  if (changeSet.value && changeSet.value.baseId === b && changeSet.value.headId === hd) return;
  changeSet.value = null; error.value = "";
  pickedCell.value = null; pickedArea.value = null; expanded.value = null;
  if (!b || !hd || st !== "ready") return;
  loading.value = true;
  try { changeSet.value = normalizeChangeSet((await Compare(b, hd)) as any); } catch (e) { error.value = e instanceof Error ? e.message : String(e); } finally { loading.value = false; }
}, { immediate: true });

const counts = computed(() => (changeSet.value ? countChanges(changeSet.value) : null));
const unchanged = computed(() => !!counts.value && isUnchanged(counts.value));
const summary = computed(() => (counts.value ? summaryLine(counts.value) : ""));

const queryIn = (scanId: string, sql: string) => QueryIn(scanId, sql) as Promise<any[]>;
const rangeFrom = computed(() => String(baseScan.value?.headTime ?? resolved.value?.time ?? "") || null);
const rangeTo = computed(() => String(head.value?.headTime ?? "") || null);
const { context } = useChangeContext(
  computed(() => (changeSet.value ? { base: changeSet.value.baseId, head: changeSet.value.headId, from: rangeFrom.value, to: rangeTo.value } : null)),
  queryIn,
);

const fmt = (n: number) => n.toLocaleString(intlLocale);
const shortDate = (v: string) => new Date(v).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
const componentLink = (name: string) => `${componentPath(name)}?baseline=${baseScan.value?.id ?? ""}`;
const signed = (plus: number, minus: number) => (plus || minus ? `+${fmt(plus)} −${fmt(minus)}` : "0");

const stats = computed<StatCell[]>(() => {
  const c = counts.value, ctx = context.value;
  if (!c) return [];
  const tg = ctx?.tangled;
  return [
    { label: t("pages.changes.statCommits"), value: ctx?.work ? fmt(ctx.work.commits) : "–", title: ctx?.work ? t("trends.reading.people", { count: ctx.work.authors }) : t("pages.changes.noHistory") },
    { label: t("pages.changes.statComponents"), value: signed(c.componentsAdded, c.componentsRemoved) },
    { label: t("pages.changes.statDependencies"), value: signed(c.edgesAdded, c.edgesRemoved) },
    { label: t("pages.changes.statTangled"), value: tg && tg.before !== null && tg.after !== null ? (tg.before === tg.after ? fmt(tg.after) : `${fmt(tg.before)} → ${fmt(tg.after)}`) : "–", title: t("pages.changes.statTangledTitle") },
    { label: t("pages.changes.statRules"), value: changeSet.value?.rulesChecked?.base && changeSet.value?.rulesChecked?.head ? signed(c.rulesNew, c.rulesGone) : t("pages.changes.notChecked") },
  ];
});

// ── Areas ───────────────────────────────────────────────────────────────
const areas = computed(() => {
  const ctx = context.value, cs = changeSet.value;
  if (!ctx || !cs || !ctx.headNames.length) return null;
  return adaptiveAreas([...ctx.headNames, ...(cs.componentsRemoved ?? [])], 20);
});
const label = (k: string) => (areas.value ? areaLabel(areas.value, k) : k);
const cells = computed<AreaCell[]>(() => (areas.value && context.value && changeSet.value ? areaCells(areas.value, context.value.headEdges, changeSet.value.edgesAdded ?? [], changeSet.value.edgesRemoved ?? []) : []));
const order = computed(() => (areas.value ? orderAreas(areas.value.keys, cells.value) : []));
const commitsPerArea = computed(() => (areas.value && context.value?.work ? commitsByArea(context.value.work, c => areas.value!.areaOf.get(c)) : null));

const reading = computed<ReadingItem[]>(() => (changeSet.value && areas.value ? changeReading({
  cs: changeSet.value, cells: cells.value, areaLabel: label, areaOf: c => areas.value!.areaOf.get(c), work: context.value?.work ?? null,
}) : []));
const dotClass = (item: ReadingItem) => (item.target === "work" || item.target === "components" ? "bg-neutral-300" : item.key.startsWith("linksNew") || item.key === "hubs" ? "bg-blue-500" : item.key.startsWith("formed") || item.key.startsWith("grew") || item.key === "rulesNew" ? "bg-neutral-700" : "bg-neutral-400");

const matrixEl = ref<HTMLElement | null>(null);
const linksEl = ref<HTMLElement | null>(null);
async function follow(item: ReadingItem) {
  if (item.cell) { pickedCell.value = item.cell; pickedArea.value = null; }
  await nextTick();
  const el = item.target === "links" ? (item.cell ? linksEl.value : matrixEl.value ?? linksEl.value)
    : item.target === "work" ? matrixEl.value
    : document.getElementById(`changes-${item.target}`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Component dependencies, grouped by the area pair they fall in ───────
const edgeRows = computed(() => [
  ...(changeSet.value?.edgesAdded ?? []).map(e => ({ kind: "added" as const, key: `+${e.from}>${e.to}`, ...e, files: e.files ?? [], before: 0, after: e.refs })),
  ...(changeSet.value?.edgesRemoved ?? []).map(e => ({ kind: "removed" as const, key: `-${e.from}>${e.to}`, ...e, files: e.files ?? [], before: e.refs, after: 0 })),
  ...(changeSet.value?.edgesChanged ?? []).map(e => ({ kind: "changed" as const, key: `~${e.from}>${e.to}`, from: e.from, to: e.to, refs: e.after, files: [] as string[], dynamic: false, before: e.before, after: e.after })),
]);
type EdgeRow = (typeof edgeRows.value)[number];
const groups = computed(() => {
  const a = areas.value;
  if (!a) return [];
  const cellOf = new Map(cells.value.map(c => [`${c.from}\u0000${c.to}`, c]));
  const by = new Map<string, EdgeRow[]>();
  for (const r of edgeRows.value) {
    const from = a.areaOf.get(r.from), to = a.areaOf.get(r.to);
    if (!from || !to) continue;
    if (pickedCell.value && (pickedCell.value.from !== from || pickedCell.value.to !== to)) continue;
    if (pickedArea.value && from !== pickedArea.value && to !== pickedArea.value) continue;
    // Reference counts that moved on a link that held are shown only on request.
    if (r.kind === "changed" && !pickedCell.value && !pickedArea.value) continue;
    const k = `${from}\u0000${to}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  }
  const rank = (c?: AreaCell) => (!c ? 3 : c.state === "new" ? 0 : c.state === "gone" ? 1 : 2);
  const kindRank = { added: 0, removed: 1, changed: 2 };
  return [...by.entries()].map(([k, rows]) => {
    const cell = cellOf.get(k);
    const [from, to] = k.split("\u0000");
    const plus = rows.filter(r => r.kind === "added").length, minus = rows.filter(r => r.kind === "removed").length;
    return { key: k, from, to, state: cell?.state ?? "changed", cell, counts: [plus ? `+${plus}` : "", minus ? `−${minus}` : ""].filter(Boolean).join(" "),
      rows: rows.sort((x, y) => kindRank[x.kind] - kindRank[y.kind] || y.refs - x.refs) };
  }).sort((x, y) => rank(x.cell) - rank(y.cell) || (x.from === x.to ? 1 : 0) - (y.from === y.to ? 1 : 0) || y.rows.length - x.rows.length);
});
const allGroups = ref(false);
// A pair holding a hundred dependencies must not push every other pair off the page.
const GROUP_ROWS = 6;
const openGroups = ref(new Set<string>());
const shownGroups = computed(() => (allGroups.value || pickedCell.value || pickedArea.value ? groups.value : groups.value.slice(0, 8)));
const linkCount = computed(() => { const n = groups.value.reduce((s, g) => s + g.rows.length, 0); return n ? t("pages.changes.linkCount", { count: n }) : ""; });
const kindTitle = (k: string) => (k === "added" ? t("pages.changes.kindAdded") : k === "removed" ? t("pages.changes.kindRemoved") : t("pages.changes.kindChanged"));
const tangleKind = (k: string) => ({ formed: t("pages.changes.tangleFormed"), grew: t("pages.changes.tangleGrew"), shrank: t("pages.changes.tangleShrank"), reshaped: t("pages.changes.tangleReshaped"), dissolved: t("pages.changes.tangleDissolved") } as Record<string, string>)[k] ?? k;

const fileCommits = ref<Record<string, RangeCommit[]>>({});
async function toggleExpanded(r: EdgeRow) {
  expanded.value = expanded.value === r.key ? null : r.key;
  const cs = changeSet.value;
  if (expanded.value !== r.key || !cs || !rangeFrom.value || !rangeTo.value) return;
  const want = r.files.filter(f => !(f in fileCommits.value));
  if (!want.length) return;
  try {
    const rows = await commitsTouching(queryIn, cs.headId, want, rangeFrom.value, rangeTo.value);
    const next = { ...fileCommits.value };
    for (const f of want) next[f] = rows.filter(c => c.file === f);
    fileCommits.value = next;
  } catch { /* A snapshot without history shows the files alone. */ }
}

// ── Rule findings, components, readings ─────────────────────────────────
const ruleRows = computed(() => [
  ...(changeSet.value?.rulesNew ?? []).map(f => ({ kind: "new" as const, key: `n${f.rule}${f.file}${f.from}${f.to}`, ...f })),
  ...(changeSet.value?.rulesGone ?? []).map(f => ({ kind: "gone" as const, key: `g${f.rule}${f.file}${f.from}${f.to}`, ...f })),
]);
const compRows = computed(() => [
  ...(changeSet.value?.componentsAdded ?? []).map(name => ({ kind: "added" as const, name })),
  ...(changeSet.value?.componentsRemoved ?? []).map(name => ({ kind: "removed" as const, name })),
]);
const compSides = computed(() => (["added", "removed"] as const).map(kind => ({ kind, rows: compRows.value.filter(r => r.kind === kind).map(r => r.name) })).filter(s => s.rows.length));
const moves = computed<Move[]>(() => changeSet.value?.moves ?? []);

// ── Lens findings: the active lens's declaration, run on both sides ─────
const lens = useLensStore();
const groupsStore = useGroupsStore();
const groupName = (id: string) => groupsStore.getGroupById(id)?.name ?? id;
const lensDiff = ref<{ added: GroupEdge[]; gone: GroupEdge[] } | null>(null);
watch([() => changeSet.value, () => lens.active, () => groupsStore.dimensionRecords], async () => {
  lensDiff.value = null;
  const cs = changeSet.value;
  const dim = lens.active;
  const declared = dim ? groupsStore.dimensionRecords.find(d => d.name === dim)?.declared : null;
  if (!cs || !dim || !declared) return;
  const groupsOfLens = lensGroups(dim);
  const [base, hd] = await Promise.all([
    checkLens(sql => QueryIn(cs.baseId, sql) as Promise<any[]>, groupsOfLens, declared),
    checkLens(sql => QueryIn(cs.headId, sql) as Promise<any[]>, groupsOfLens, declared),
  ]);
  const key = (e: GroupEdge) => `${e.fromGroup}>${e.toGroup}|${findingKey(e)}`;
  const baseKeys = new Set(base.crossings.flatMap(c => c.edges).map(key));
  const headKeys = new Set(hd.crossings.flatMap(c => c.edges).map(key));
  lensDiff.value = {
    added: hd.crossings.flatMap(c => c.edges).filter(e => !baseKeys.has(key(e))),
    gone: base.crossings.flatMap(c => c.edges).filter(e => !headKeys.has(key(e))),
  };
}, { immediate: true });

// ── Structure: both sides through the lens ──────────────────────────────
const structure = useStructureCompare(
  computed(() => (changeSet.value ? { base: changeSet.value.baseId, head: changeSet.value.headId } : null)),
  queryIn,
);

// ── Readings that moved: one metric at a time, no composite ─────────────
const metric = ref("modularity__coupling__dependents");
const metricOptions = computed(() => [...new Set(moves.value.map(m => m.metric))].map(id => ({ id, name: data.statNiceName(id) || id })));
const metricOption = computed(() => metricOptions.value.find(o => o.id === metric.value) ?? metricOptions.value[0] ?? null);
watch(metricOptions, opts => { if (opts.length && !opts.some(o => o.id === metric.value)) metric.value = opts[0].id; });
const metricMoves = computed(() => moves.value.filter(m => m.metric === (metricOption.value?.id ?? metric.value)).sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)));
const fmtMetric = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString(intlLocale) : v.toLocaleString(intlLocale, { maximumFractionDigits: 2 }));
const maxMove = computed(() => Math.max(1e-9, ...metricMoves.value.map(m => Math.abs(m.after - m.before))));
const moveBar = (m: Move) => {
  const share = Math.abs(m.after - m.before) / maxMove.value * 50;
  return m.after >= m.before ? { left: "50%", width: `${share}%` } : { right: "50%", width: `${share}%` };
};

// ── Paging: 50 rows, then all ───────────────────────────────────────────
const PAGE = 50;
const showAll = ref(new Set<string>());
function page<T>(rows: T[], section: string): T[] {
  return showAll.value.has(section) ? rows : rows.slice(0, PAGE);
}
const MoreButton = defineComponent({
  props: { total: { type: Number, required: true }, section: { type: String, required: true } },
  setup(props) {
    return () => props.total > PAGE && !showAll.value.has(props.section)
      ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-2", onClick: () => { showAll.value = new Set([...showAll.value, props.section]); } }, t("pages.changes.showAll", { value: props.total.toLocaleString(intlLocale) }))
      : null;
  },
});

// ── Selection into a group ──────────────────────────────────────────────
const selected = ref(new Set<string>());
function toggle(name: string) {
  const next = new Set(selected.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  selected.value = next;
}
function toggleEdge(r: { from: string; to: string }) {
  const next = new Set(selected.value);
  const on = next.has(r.from) && next.has(r.to);
  for (const n of [r.from, r.to]) if (on) next.delete(n); else next.add(n);
  selected.value = next;
}

// ── Exports ─────────────────────────────────────────────────────────────
const { register } = useExportables();
register({
  kind: "document",
  title: t("pages.changes.changesSummary"),
  label: t("pages.changes.copyChangesSummary"),
  savable: true,
  markdown: () => changesMarkdown(changeSet.value!, labelOf(baseScan.value), labelOf(head.value), provenanceShort(buildProvenance())),
  disabledReason: () => (changeSet.value ? null : t("pages.changes.nothingComparedYet")),
});
const edgeTable = useTable({
  title: t("pages.changes.dependenciesChanged"),
  rows: () => edgeRows.value.map(r => ({ change: r.kind, from: r.from, to: r.to, from_area: label(areas.value?.areaOf.get(r.from) ?? ""), to_area: label(areas.value?.areaOf.get(r.to) ?? ""), refs_before: r.before, refs_after: r.after, runtime_lookup_only: r.dynamic, files: r.files.join("; ") })),
  columns: () => ["change", "from", "to", "from_area", "to_area", "refs_before", "refs_after", "runtime_lookup_only", "files"].map(id => ({ id, label: id.replace(/_/g, " ") })),
});
const compTable = useTable({
  title: t("pages.changes.componentsAddedRemoved"),
  rows: () => compRows.value.map(r => ({ change: r.kind, component: r.name })),
  columns: () => [{ id: "change", label: t("pages.changes.change") }, { id: "component", label: t("pages.changes.component") }],
});
const ruleTable = useTable({
  title: t("pages.changes.ruleFindingsNewGone"),
  rows: () => ruleRows.value.map(r => ({ change: r.kind, rule: r.rule, from: r.from, to: r.to, file: r.file, line: r.line })),
  columns: () => ["change", "rule", "from", "to", "file", "line"].map(id => ({ id, label: id })),
});
const movesTable = useTable({
  get title() { return t("pages.changes.largestMoves2", { value: metricOption.value?.name ?? "" }); },
  rows: () => metricMoves.value.map(m => ({ component: m.component, [`${m.metric}_before`]: m.before, [`${m.metric}_after`]: m.after })),
  columns: () => { const id = metricOption.value?.id ?? metric.value; return [{ id: "component", label: t("pages.changes.component") }, { id: `${id}_before`, label: t("pages.changes.before") }, { id: `${id}_after`, label: t("pages.changes.after") }]; },
});
</script>
