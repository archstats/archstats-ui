<template>
  <ViewWorkspaceLayout
    :title="t('pages.cyclesView.cycles')"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="380px"
  >
    <template #stats>
      <span v-if="tangles.length">{{ t('pages.cyclesView.componentsListedCycles', { tangles: t('common.count.tangle', { count: tangles.length }), tangledCount: fmt(tangledCount), componentCount: fmt(componentCount), listedCyclesLength: fmt(listedCycles.length) }) }}</span>
    </template>

    <template #switches>
      <div v-if="tangle" class="ui-segmented" role="group" :aria-label="t('pages.cyclesView.drawTangle')">
        <button type="button" :aria-pressed="mode === 'graph'" :title="t('pages.cyclesView.levelsLeftRightImports')" @click="mode = 'graph'">{{ t('pages.cyclesView.levels') }}</button>
        <button type="button" :aria-pressed="mode === 'matrix'" :title="t('pages.cyclesView.rowImportsColumnSame')" @click="mode = 'matrix'">{{ t('pages.cyclesView.matrix') }}</button>
      </div>
    </template>

    <template #visualizer>
      <EmptyState v-if="!store.hasData" icon="recycle" :title="t('pages.cyclesView.noSnapshotOpen')" :text="t('pages.cyclesView.openScanLookDependency')"/>
      <div v-else-if="!tangles.length" class="flex h-full flex-col items-center justify-center px-8 text-center">
        <Icon icon="recycle" :size="22" class="text-neutral-300"/>
        <h2 class="mt-3 text-lg font-semibold text-neutral-900">{{ t('pages.cyclesView.noComponentTangle') }}</h2>
        <p class="mt-2 max-w-[460px] text-sm leading-6 text-neutral-600">{{ t('pages.cyclesView.everyImportChainBetween', { componentCount: fmt(componentCount) }) }}</p>
      </div>
      <div v-else-if="!scopedTangles.length" class="flex h-full items-center justify-center">
        <EmptyState icon="recycle" :title="t('pages.cyclesView.noTangleScope')" :text="t('pages.cyclesView.noTangleHasComponent', { value: scopeLabel() || t('pages.cyclesView.activeScope') })">
          <button type="button" class="ui-btn ui-btn-sm" @click="scope.clear()">{{ t('pages.cyclesView.clearScope') }}</button>
        </EmptyState>
      </div>

      <template v-else-if="tangle && layout">
        <!-- Every tangle, to scale: the knot the snapshot has, and which one is open. -->
        <div class="flex shrink-0 items-center gap-3 px-4 py-2.5 hairline-b" role="tablist" :aria-label="t('pages.cyclesView.tangles')">
          <div class="flex min-w-0 flex-1 gap-[3px]">
            <button
              v-for="(tg, i) in scopedTangles"
              :key="tg.key"
              type="button"
              role="tab"
              :aria-selected="tg.key === tangle.key"
              class="group/tg relative flex h-7 min-w-[18px] items-center justify-center rounded-[4px] font-mono text-[11px] tabular-nums transition-colors"
              :class="tg.key === tangle.key ? 'bg-accent-500 text-on-accent' : tg.matches ? 'bg-accent-200 text-accent-900 hover:bg-accent-300' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 hover:text-neutral-900'"
              :style="{ flex: `${tg.members.length} 1 0` }"
              :title="t('pages.cyclesView.tangleComponentsLinesListed', { value: i + 1, membersLength: tg.members.length, lines: fmt(tg.lines), cycles: fmt(tg.cycles) })"
              @click="selectTangle(tg.key)"
            >
              <span v-if="tg.members.length >= 3 || scopedTangles.length <= 8">{{ tg.members.length }}</span>
            </button>
          </div>
          <span class="shrink-0 text-[12px] text-neutral-500">{{ t('pages.cyclesView.componentsPerTangle') }}</span>
        </div>

        <ExhibitFrame header="custom" fill class="min-h-0 grow">
          <!-- What this one is, and what the cuts have done to it. -->
          <div class="flex h-11 shrink-0 items-center gap-3 px-4 hairline-b">
            <span class="shrink-0 whitespace-nowrap text-[13px] font-semibold text-neutral-900">{{ t('pages.cyclesView.tangle', { tangleNumber }) }}</span>
            <span v-if="prefix" class="min-w-0 max-w-[32%] shrink truncate font-mono text-[12px] text-neutral-500" :title="t('pages.cyclesView.namesBelowLeaveOut', { prefix })">{{ t('pages.cyclesView.in', { replace: prefix.replace(/[./]$/, "") }) }}</span>
            <span class="ui-toolbar-meta flex min-w-0 shrink items-center gap-1.5 truncate">
              <span class="whitespace-nowrap">{{ t('pages.cyclesView.components', { membersLength: tangle.members.length }) }}</span><span class="text-neutral-300">·</span>
              <span class="whitespace-nowrap">{{ t('pages.cyclesView.lines', { lines: fmt(tangle.lines) }) }}</span><span class="text-neutral-300">·</span>
              <span class="whitespace-nowrap">{{ t('pages.cyclesView.levels2', { layersLength: layout.layers.length }) }}</span><span class="text-neutral-300">·</span>
              <span class="whitespace-nowrap">{{ t('pages.cyclesView.listedCycles', { cycles: fmt(tangle.cycles) }) }}</span>
              <template v-if="crossed.length > 1"><span class="text-neutral-300">·</span><span class="whitespace-nowrap" :title="crossed.map(c => `${c.name}: ${c.count}`).join('\n')">{{ t('pages.cyclesView.groups', { crossedLength: crossed.length }) }}</span></template>
            </span>
            <div class="ml-auto flex shrink-0 items-center gap-1.5">
              <PinButton kind="cycle" :entity-key="[...tangle.members].sort().join('\n')" :title="t('pages.cyclesView.tangleComponents', { membersLength: tangle.members.length })" :values="{ size: tangle.members.length }"/>
              <button type="button" class="ui-btn ui-btn-sm" :title="t('pages.cyclesView.componentsBecomeGroup')" @click="saveAsGroup"><Icon icon="bookmark" :size="13" class="text-neutral-500"/><span>{{ t('pages.cyclesView.saveGroup') }}</span></button>
              <!-- The drawing below exports from its own header, beside Pin. -->
              <ExhibitButton class="ml-1"/>
            </div>
          </div>

          <!-- The cuts, as they stand: always here, so cutting never moves the drawing. -->
          <div class="flex h-9 shrink-0 items-center gap-3 px-4 text-[12.5px] hairline-b" role="status">
            <template v-if="cut.size">
              <span class="text-neutral-900"><I18nT k="pages.cyclesView.componentsOutAnyTangle"><template #cutSize><span class="font-semibold tabular-nums">{{ cut.size }}</span></template><template #value>{{t('common.noun.cut', { count: cut.size })}}</template><template #freedSize><span class="font-semibold tabular-nums">{{ after.freed.size }}</span></template><template #membersLength>{{ tangle.members.length }}</template></I18nT></span>
              <span class="text-neutral-500">{{ after.tangles.length ? t('pages.cyclesView.left', { tangles: t('common.count.tangle', { count: after.tangles.length }), value: after.tangles.map(t => t.length).join(", ") }) : t('pages.cyclesView.noCycleLeft') }}</span>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="setCuts([])">{{ t('pages.cyclesView.undoCuts') }}</button>
            </template>
            <span v-else class="text-neutral-500">{{ t('pages.cyclesView.nothingCutYetGuide', { cuts: t('common.count.cut', { count: plan.length }) }) }}</span>
          </div>

          <div class="relative min-h-0 grow">
            <TangleGraph
              v-if="mode === 'graph'"
              :layout="layout"
              :cut="cut"
              :freed="after.freed"
              :selected-edge="selectedEdge"
              :selected-node="selectedNode"
              :matches="matches"
              :lit="lit"
              :label="shortName"
              :color="groupColor"
              :lines="linesOf"
              :step="stepOf"
              :title="figureTitle"
              :focus="guideFocus"
              :callout="guideCallout"
              :flashed="flashed"
              @select-edge="selectEdge"
              @select-node="selectNode"
              @open="n => router.push(componentPath(n))"
              @clear="clearSelection"
            />
            <TangleMatrix
              v-else
              :layout="layout"
              :cut="cut"
              :freed="after.freed"
              :selected-edge="selectedEdge"
              :selected-node="selectedNode"
              :matches="matches"
              :label="shortName"
              :title="figureTitle"
              @select-edge="selectEdge"
              @select-node="selectNode"
              @open="n => router.push(componentPath(n))"
            />
          </div>
        </ExhibitFrame>
      </template>
    </template>

    <!-- The guide: one cut at a time, in words, with the loop it breaks in the drawing. -->
    <template #tab-guide>
      <div v-if="tangle && layout" class="flex flex-col gap-4 outline-none" tabindex="-1" @keydown="onGuideKey">
        <!-- Where the walk is. -->
        <div>
          <div class="flex items-baseline text-[12px] text-neutral-500">
            <span class="flex-1">{{ guideStep === 0 ? t('pages.cyclesView.beforeYouStart') : guideStep > plan.length || !after.tangles.length ? t('pages.cyclesView.done') : t('pages.cyclesView.cut', { guideStep, planLength: plan.length }) }}</span>
            <span class="tabular-nums">{{ t('pages.cyclesView.free', { freedSize: after.freed.size, membersLength: tangle.members.length }) }}</span>
          </div>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" :aria-valuenow="after.freed.size" :aria-valuemax="tangle.members.length" :aria-label="t('pages.cyclesView.componentsOutKnot')">
            <div class="h-full rounded-full bg-accent-500 transition-[width] duration-500 ease-out" :style="{ width: `${(100 * after.freed.size) / tangle.members.length}%` }"></div>
          </div>
        </div>

        <!-- What the drawing shows, in plain words. -->
        <section v-if="guideStep === 0" class="flex flex-col gap-3 text-[13px] leading-[1.6] text-neutral-800">
          <h3 class="text-[15px] font-semibold leading-6 text-neutral-950">{{ t('pages.cyclesView.theseComponentsKnottedTogether', { membersLength: tangle.members.length }) }}</h3>
          <p>{{ t('pages.cyclesView.followImportsAnyOne') }}</p>
          <p>
            {{ t('pages.cyclesView.drawingPutsThemOrder') }}
            <svg width="20" height="8" class="inline align-middle" aria-hidden="true"><path d="M1 4 H19" stroke="rgb(var(--c-neutral-400))" stroke-width="1.5"/></svg>{{ t('pages.cyclesView.orangePointBackUp', { againstLength: layout.against.length }) }}
            <svg width="20" height="8" class="inline align-middle" aria-hidden="true"><path d="M1 4 H19" stroke="rgb(var(--c-accent-500))" stroke-width="2.5"/></svg>{{ t('pages.cyclesView.eachThoseClosesLoops') }}
          </p>
          <p>{{ t('pages.cyclesView.themEnoughGuideTakes', { planLength: plan.length }) }}</p>
          <p class="text-[12px] leading-5 text-neutral-500">{{ t('pages.cyclesView.cuttingHereChangesNothing') }}</p>
          <button type="button" class="ui-btn ui-btn-primary self-start" @click="goStep(1)">{{ t('pages.cyclesView.startFirstCut') }}<Icon icon="arrow-right" :size="14"/></button>
        </section>

        <!-- One cut. -->
        <section v-else-if="guideCurrent && after.tangles.length" class="flex flex-col gap-3">
          <h3 class="flex flex-wrap items-center gap-1.5 break-all font-mono text-[14px] font-semibold leading-6 text-neutral-950">
            <span>{{ shortName(guideCurrent.from) }}</span>
            <Icon icon="arrow-right" :size="14" class="shrink-0 text-accent-600"/>
            <span>{{ shortName(guideCurrent.to) }}</span>
          </h3>
          <p class="text-[13px] leading-[1.6] text-neutral-800">
            <I18nT k="pages.cyclesView.importsLoopLitDrawing"><template #from><code class="gd-name">{{ shortName(guideCurrent.from) }}</code></template><template #to><code class="gd-name">{{ shortName(guideCurrent.to) }}</code></template><template #back><template v-if="!guideLoop || guideLoop.length < 2">{{ t('pages.cyclesView.cutsBeforeAlreadyBroke') }}</template><template v-else-if="guideLoop.length === 2"><I18nT k="pages.cyclesView.importsStraightBack"><template #to><code class="gd-name">{{ shortName(guideCurrent.to) }}</code></template></I18nT></template><template v-else><I18nT k="pages.cyclesView.leadsBackThrough"><template #to><code class="gd-name">{{ shortName(guideCurrent.to) }}</code></template><template #value><template v-for="(n, i) in guideLoop.slice(2, 5)" :key="n"><code class="gd-name">{{ shortName(n) }}</code>{{ i < Math.min(3, guideLoop.length - 2) - 1 ? ", " : "" }}</template></template><template #more><template v-if="guideLoop.length > 5">{{ ' ' + t('pages.cyclesView.more', { value: guideLoop.length - 5 }) }}</template></template></I18nT></template></template></I18nT> </p>
          <p class="rounded-md bg-accent-50 px-3 py-2 text-[13px] leading-[1.55] text-neutral-900">
            <template v-if="guideEffect.freed.length">{{ t('pages.cyclesView.cuttingFrees') }} <b>{{ t('common.count.component', { count: guideEffect.freed.length }) }}</b>: <template v-for="(n, i) in guideEffect.freed.slice(0, 6)" :key="n"><code class="gd-name">{{ shortName(n) }}</code>{{ i < Math.min(6, guideEffect.freed.length) - 1 ? ", " : "" }}</template><template v-if="guideEffect.freed.length > 6">{{ ' ' + t('pages.cyclesView.more', { value: guideEffect.freed.length - 6 }) }}</template>.</template>
            <template v-else-if="guideEffect.split">{{ t('pages.cyclesView.cuttingFreesNoOne', { afterLength: guideEffect.after.length, value: listOf(guideEffect.after) }) }}</template>
            <template v-else-if="guideEffect.already">{{ t('pages.cyclesView.cut2') }}</template>
            <template v-else>{{ t('pages.cyclesView.ownFreesNoOne') }}</template>
          </p>

          <div class="flex flex-col gap-1.5">
            <h4 class="ui-label">{{ t('pages.cyclesView.whatChange', { imports: t('common.count.import', { count: guideCurrent.imports }), files: t('common.count.file', { count: guideCurrent.files }) }) }}</h4>
            <p v-if="guideLinesLoading" class="text-[12px] text-neutral-500">{{ t('pages.cyclesView.readingCode') }}</p>
            <ul v-else class="flex flex-col gap-1.5">
              <li v-for="l in guideLines" :key="`${l.file}:${l.line}`" class="overflow-hidden rounded-md bg-neutral-50 hairline">
                <router-link :to="fileSourcePath(l.file, l.line)" class="flex items-baseline gap-2 px-2.5 pt-1.5 text-[11.5px] text-neutral-600 hover:text-neutral-950" :title="l.file">
                  <span class="min-w-0 truncate font-medium">{{ l.file.split("/").pop() }}</span><span class="shrink-0 font-mono text-neutral-400">{{ t('pages.cyclesView.line', { line: l.line }) }}</span>
                </router-link>
                <pre class="overflow-x-auto px-2.5 pb-1.5 pt-0.5 font-mono text-[12px] leading-5 text-neutral-900">{{ l.text || t('pages.cyclesView.lineNotKeptSnapshot') }}</pre>
              </li>
            </ul>
            <p v-if="guideMoreLines" class="text-[11.5px] text-neutral-500">{{ t('pages.cyclesView.moreSelectionListsEvery', { guideMoreLines }) }}</p>
            <p v-if="cochange.get(edgeId(guideCurrent.from, guideCurrent.to))" class="text-[11.5px] leading-4 text-neutral-500">{{ t('pages.cyclesView.twoComponentsChangedTogether', { edgeId: cochange.get(edgeId(guideCurrent.from, guideCurrent.to)) }) }}</p>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <button type="button" class="ui-btn ui-btn-primary" :title="guideEffect.already ? t('pages.cyclesView.nextCut') : t('pages.cyclesView.cutGoNext')" @click="cutAndNext">{{ guideEffect.already ? t('pages.cyclesView.nextCut2') : t('pages.cyclesView.cutNext') }}<Icon icon="arrow-right" :size="14"/></button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="t('pages.cyclesView.leaveGoNextS')" @click="goStep(guideStep + 1)">{{ t('pages.cyclesView.skip') }}</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" :disabled="guideStep <= 0" :title="t('pages.cyclesView.back')" @click="goStep(guideStep - 1)"><Icon icon="arrow-left" :size="13"/>{{ t('pages.cyclesView.back2') }}</button>
          </div>
        </section>

        <!-- The end of the walk. -->
        <section v-else class="flex flex-col gap-3 text-[13px] leading-[1.6] text-neutral-800">
          <template v-if="!after.tangles.length">
            <h3 class="text-[15px] font-semibold leading-6 text-neutral-950">{{ t('pages.cyclesView.knotUndone') }}</h3>
            <p>{{ t('pages.cyclesView.allComponentsFreeEvery', { cuts: t('common.count.cut', { count: cut.size }), imports: t('common.count.import', { count: cutImports }), membersLength: tangle.members.length }) }}</p>
          </template>
          <template v-else>
            <h3 class="text-[15px] font-semibold leading-6 text-neutral-950">{{ t('pages.cyclesView.free', { freedSize: after.freed.size, membersLength: tangle.members.length }) }}</h3>
            <p>{{ t('pages.cyclesView.youSkippedSomeCuts', { reduce: after.tangles.reduce((s, t) => s + t.length, 0) }) }}</p>
          </template>
          <p>{{ t('pages.cyclesView.nextExportPlanReport') }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="ui-btn ui-btn-sm" @click="goStep(0)">{{ t('pages.cyclesView.startOver') }}</button>
            <button v-if="nextTangle" type="button" class="ui-btn ui-btn-sm" @click="selectTangle(nextTangle.key)">{{ t('pages.cyclesView.nextKnot', { membersLength: nextTangle.members.length }) }}<Icon icon="arrow-right" :size="13"/></button>
          </div>
        </section>
        <p v-if="guideCurrent && after.tangles.length" class="text-[11px] text-neutral-400">{{ t('pages.cyclesView.cutGoSSkip') }}</p>
      </div>
    </template>

    <!-- The plan: what to cut, in the order that untangles most. -->
    <template #tab-plan>
      <div v-if="tangle && layout" class="flex flex-col gap-4">
        <section>
          <p class="text-[13px] leading-5 text-neutral-900">
            <I18nT k="pages.cyclesView.leaveNoCycleTangle"><template #icon><span class="font-semibold">{{ plan.length }} {{t('common.noun.cut', { count: plan.length })}}</span></template><template #planImports>{{ fmt(planImports) }}</template><template #value>{{t('common.noun.import', { count: planImports })}}</template><template #planFiles>{{ fmt(planFiles) }}</template><template #value2>{{t('common.noun.file', { count: planFiles })}}</template><template #firstFreeHalf><template v-if="firstHalf">{{ ' ' + t('pages.cyclesView.firstFreeHalf', { step: firstHalf.step }) }}</template></template></I18nT>
          </p>
          <p class="mt-1 text-[11.5px] leading-4 text-neutral-500">{{ t('pages.cyclesView.planNotOnlyOne', { value: totals ? t('pages.cyclesView.acrossAllTanglesCuts', { tanglesLength: tangles.length, cuts: fmt(totals.cuts), imports: fmt(totals.imports) }) : "" }) }}</p>
        </section>

        <!-- How fast it comes apart. -->
        <section :aria-label="t('pages.cyclesView.componentsStillTangledCut')">
          <svg :viewBox="`0 0 ${CW} ${CH}`" class="block w-full cursor-pointer" role="img" :aria-label="t('pages.cyclesView.componentsTangledBeforeAny', { membersLength: tangle.members.length, planLength: plan.length })" @click="onCurveClick">
            <line :x1="PADL" :y1="CH - PADB" :x2="CW - 4" :y2="CH - PADB" stroke="rgb(var(--c-neutral-200))"/>
            <path :d="curve.area" fill="rgb(var(--c-accent-200) / 0.45)"/>
            <path :d="curve.line" fill="none" stroke="rgb(var(--c-accent-500))" stroke-width="1.75"/>
            <line :x1="curve.x(cut.size)" :y1="6" :x2="curve.x(cut.size)" :y2="CH - PADB" stroke="rgb(var(--c-neutral-900))" stroke-width="1" stroke-dasharray="2 3"/>
            <circle :cx="curve.x(cut.size)" :cy="curve.y(tangledAt(cut.size))" r="3.5" fill="rgb(var(--c-neutral-900))"/>
            <text :x="PADL - 6" y="12" text-anchor="end" font-size="10" fill="rgb(var(--c-neutral-500))" font-family="JetBrains Mono, monospace">{{ tangle.members.length }}</text>
            <text :x="PADL - 6" :y="CH - PADB" text-anchor="end" font-size="10" fill="rgb(var(--c-neutral-500))" font-family="JetBrains Mono, monospace">0</text>
            <text :x="PADL" :y="CH - 2" font-size="10" fill="rgb(var(--c-neutral-500))">{{ t('pages.cyclesView.noCut') }}</text>
            <text :x="CW - 4" :y="CH - 2" text-anchor="end" font-size="10" fill="rgb(var(--c-neutral-500))">{{ t('pages.cyclesView.cuts', { planLength: plan.length }) }}</text>
          </svg>
          <label class="mt-1 flex items-center gap-3 text-[12px] text-neutral-600">
            <span class="w-[92px] shrink-0">{{ t('pages.cyclesView.applyFirst') }}</span>
            <input type="range" min="0" :max="plan.length" :value="prefixApplied" class="sq-range min-w-0 flex-1" :aria-label="t('pages.cyclesView.cutsApplied')" @input="applyFirst(Number(($event.target as HTMLInputElement).value))">
            <span class="w-14 shrink-0 text-right font-mono tabular-nums text-neutral-900">{{ cut.size }} / {{ plan.length }}</span>
          </label>
        </section>

        <section>
          <div class="mb-1 flex items-center gap-2">
            <h3 class="ui-label flex-1">{{ t('pages.cyclesView.cuts2') }}</h3>
            <span class="text-[11px] text-neutral-500">{{ t('pages.cyclesView.moveSpaceCut') }}</span>
            <ExhibitButton :exhibit="planTable"/>
          </div>
          <ol ref="planList" class="-mx-1 flex flex-col outline-none" tabindex="0" :aria-label="t('pages.cyclesView.cutPlan')" @keydown="onPlanKey">
            <li
              v-for="s in plan"
              :key="s.step"
              :data-step="s.step"
              class="group/cut flex cursor-default items-start gap-2 rounded px-1 py-1.5"
              :class="isSelectedEdge(s) ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'"
              @click="selectEdge(s.from, s.to, false)"
            >
              <Checkbox :model-value="cut.has(edgeId(s.from, s.to))" :aria-label="t('pages.cyclesView.cut3', { from: shortName(s.from), to: shortName(s.to) })" class="mt-[3px]" @click.stop @update:model-value="toggleCut(s.from, s.to)"/>
              <span class="w-5 shrink-0 pt-px text-right font-mono text-[11px] tabular-nums text-neutral-400">{{ s.step }}</span>
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-1 font-mono text-[12px] text-neutral-900">
                  <span class="min-w-0 truncate" :title="s.from">{{ shortName(s.from) }}</span>
                  <Icon icon="arrow-right" :size="11" class="shrink-0 text-accent-600"/>
                  <span class="min-w-0 truncate" :title="s.to">{{ shortName(s.to) }}</span>
                </span>
                <span class="block text-[11.5px] leading-4 text-neutral-500">
                  {{ s.imports }} {{t('common.noun.import', { count: s.imports })}} · {{ s.files }} {{t('common.noun.file', { count: s.files })}}<template v-if="cochange.get(edgeId(s.from, s.to))">{{ ' ' + t('pages.cyclesView.changedTogether', { edgeId: cochange.get(edgeId(s.from, s.to)) }) }}</template>
                </span>
              </span>
              <span class="shrink-0 pt-px text-right text-[11.5px] tabular-nums" :class="gain(s) > 0 ? 'font-medium text-accent-700' : 'text-neutral-400'" :title="t('pages.cyclesView.componentsStillTangledAfter', { tangled: s.tangled, value: s.left.length ? ` (${s.left.join(', ')})` : '' })">{{ gain(s) > 0 ? t('pages.cyclesView.frees2', { s: gain(s) }) : s.splits ? "splits" : "narrows" }}</span>
            </li>
          </ol>
        </section>

      </div>
    </template>

    <!-- The selected import or component, with its evidence. -->
    <template #tab-selection>
      <template v-if="selectedEdge && edgeDetail">
        <section class="flex flex-col gap-2">
          <p class="flex flex-wrap items-center gap-1 break-all font-mono text-[12.5px] text-neutral-900">
            <router-link :to="componentPath(selectedEdge.from)" class="hover:underline" :title="selectedEdge.from">{{ shortName(selectedEdge.from) }}</router-link>
            <Icon icon="arrow-right" :size="12" :class="isAgainst ? 'text-accent-600' : 'text-neutral-400'"/>
            <router-link :to="componentPath(selectedEdge.to)" class="hover:underline" :title="selectedEdge.to">{{ shortName(selectedEdge.to) }}</router-link>
          </p>
          <p class="text-[12.5px] leading-5 text-neutral-700">
            <template v-if="selectedStep">{{ t('pages.cyclesView.cutPlanRunsBack', { step: selectedStep.step, value: gain(selectedStep) > 0 ? t('pages.cyclesView.takenOrderFrees', { components: t('common.count.component', { count: gain(selectedStep) }) }) : selectedStep.splits ? t('pages.cyclesView.takenOrderSplitsTangle') : t('pages.cyclesView.takenOrderNarrowsLoops') }) }}</template>
            <template v-else-if="isAgainst">{{ t('pages.cyclesView.runsBackAgainstLevels') }}</template>
            <template v-else>{{ t('pages.cyclesView.runsLevelsCuttingAlone') }}</template>
          </p>
          <dl class="ui-kv">
            <dt>{{ t('pages.cyclesView.imports') }}</dt><dd>{{ fmt(edgeDetail.imports) }}</dd>
            <dt>{{ t('pages.cyclesView.files') }}</dt><dd>{{ fmt(edgeDetail.files.length) }}</dd>
            <template v-if="cochange.get(edgeId(selectedEdge.from, selectedEdge.to))"><dt>{{ t('pages.cyclesView.changedTogether2') }}</dt><dd>{{ t('pages.cyclesView.commits', { edgeId: cochange.get(edgeId(selectedEdge.from, selectedEdge.to)) }) }}</dd></template>
            <dt>{{ t('pages.cyclesView.listedCycles2') }}</dt><dd>{{ fmt(cyclesThroughEdge) }}</dd>
          </dl>
          <div v-if="selectedStep" class="flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm" :class="cut.has(edgeId(selectedEdge.from, selectedEdge.to)) ? '' : 'ui-btn-primary'" @click="toggleCut(selectedEdge.from, selectedEdge.to)">{{ cut.has(edgeId(selectedEdge.from, selectedEdge.to)) ? t('pages.cyclesView.undoCut') : t('pages.cyclesView.cut4') }}</button>
          </div>
        </section>
        <section class="mt-4 flex flex-col gap-1 pt-3 hairline-t">
          <h3 class="ui-label">{{ t('pages.cyclesView.whereImports') }}</h3>
          <LoadingState v-if="linesLoading" :text="t('pages.cyclesView.readingImportLines')"/>
          <p v-else-if="!edgeDetail.files.length" class="text-xs text-neutral-500">{{ t('pages.cyclesView.snapshotRecordsNoFile') }}</p>
          <ul v-else class="flex flex-col">
            <li v-for="f in edgeDetail.files" :key="f.file" class="flex flex-col py-1.5 hairline-b last:shadow-none">
              <div class="flex items-center gap-1.5">
                <router-link :to="fileSourcePath(f.file, f.first)" class="min-w-0 truncate font-mono text-[12px] font-medium text-neutral-900 hover:underline" :title="f.file">{{ f.file.split("/").pop() }}</router-link>
                <span class="ui-tag ml-auto shrink-0">{{ f.count }} {{t('common.noun.import', { count: f.count })}}</span>
              </div>
              <span class="truncate font-mono text-[11px] text-neutral-500 [direction:rtl] [text-align:left]" :title="f.file">{{ f.file.split("/").slice(0, -1).join("/") }}/</span>
              <div v-if="f.ranges.length" class="flex flex-wrap items-center gap-1 font-mono text-[11.5px] text-neutral-500">
                <span>{{ t('pages.cyclesView.lines2') }}</span>
                <SnippetPopover v-for="range in f.ranges" :key="range" :file="f.file" :lines="range">
                  <router-link :to="fileSourcePath(f.file, Number(range.split('-')[0]))" class="text-neutral-800 underline decoration-dotted hover:text-neutral-950">{{ range }}</router-link>
                </SnippetPopover>
              </div>
            </li>
          </ul>
        </section>
      </template>

      <template v-else-if="selectedNode && nodeDetail">
        <section class="flex flex-col gap-2">
          <router-link :to="componentPath(selectedNode)" class="break-all font-mono text-[12.5px] font-medium text-neutral-900 hover:underline" :title="selectedNode">{{ shortName(selectedNode) }}</router-link>
          <p class="text-[12.5px] leading-5 text-neutral-700">
            {{ t('pages.cyclesView.level', { level: nodeDetail.level, layersLength: layout?.layers.length, value: after.freed.has(selectedNode) ? t('pages.cyclesView.cutsAppliedOutEvery') : t('pages.cyclesView.stillTangleCutsApplied') }) }}
          </p>
          <dl class="ui-kv">
            <dt>{{ t('pages.cyclesView.lines3') }}</dt><dd>{{ fmt(linesOf(selectedNode)) }}</dd>
            <dt>{{ t('pages.cyclesView.importsTangle') }}</dt><dd>{{ t('pages.cyclesView.components2', { out: nodeDetail.out }) }}</dd>
            <dt>{{ t('pages.cyclesView.imported') }}</dt><dd>{{ t('pages.cyclesView.them', { in: nodeDetail.in }) }}</dd>
            <dt>{{ t('pages.cyclesView.againstLevels') }}</dt><dd>{{ nodeDetail.against.length }}</dd>
            <dt>{{ t('pages.cyclesView.listedCycles2') }}</dt><dd>{{ fmt(nodeDetail.cycles) }}</dd>
          </dl>
        </section>
        <section v-if="nodeDetail.against.length" class="mt-4 flex flex-col gap-1 pt-3 hairline-t">
          <h3 class="ui-label">{{ t('pages.cyclesView.importsAgainstLevels') }}</h3>
          <button v-for="e in nodeDetail.against" :key="edgeId(e.from, e.to)" type="button" class="flex items-center gap-1 rounded px-1 py-1 text-left font-mono text-[12px] text-neutral-800 hover:bg-neutral-100" @click="selectEdge(e.from, e.to)">
            <span class="min-w-0 truncate">{{ shortName(e.from) }}</span><Icon icon="arrow-right" :size="11" class="shrink-0 text-accent-600"/><span class="min-w-0 truncate">{{ shortName(e.to) }}</span>
            <span class="ml-auto shrink-0 font-sans text-[11px] text-neutral-500">{{ e.imports }} {{t('common.noun.import', { count: e.imports })}}</span>
          </button>
        </section>
      </template>
      <p v-else class="text-sm leading-5 text-neutral-500">{{ t('pages.cyclesView.selectImportComponentDrawing') }}</p>
    </template>

    <!-- The engine's listed cycles in this tangle, and which the cuts break. -->
    <template #tab-cycles>
      <div v-if="tangle" class="flex flex-col gap-3">
        <p class="text-[12.5px] leading-5 text-neutral-700">
          {{ t('pages.cyclesView.listedCyclesRunInside', { tangleCyclesLength: fmt(tangleCycles.length) }) }}<template v-if="cut.size">{{ t('pages.cyclesView.cutsBreakThem', { brokenCount: fmt(brokenCount) }) }}</template>{{ t('pages.cyclesView.engineListsShortestCycle') }}
        </p>
        <ul class="-mx-1 flex flex-col">
          <li v-for="c in shownCycles" :key="c.id">
            <button type="button" class="flex w-full flex-col gap-0.5 rounded px-1.5 py-1.5 text-left" :class="litCycleId === c.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'" @click="litCycleId = litCycleId === c.id ? null : c.id">
              <span class="flex flex-wrap items-center gap-x-1 font-mono text-[11.5px]" :class="c.broken ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-900'">
                <template v-for="(n, i) in c.nodes" :key="i"><Icon v-if="i > 0" icon="arrow-right" :size="10" class="text-neutral-400"/><span :title="n">{{ shortName(n) }}</span></template>
                <Icon icon="arrow-right" :size="10" class="text-neutral-400"/><span class="text-neutral-400">{{ shortName(c.nodes[0]) }}</span>
              </span>
              <span class="text-[11px] text-neutral-500">{{ t('pages.cyclesView.components3', { nodesLength: c.nodes.length }) }}<template v-if="c.sharedCommits">{{ ' ' + t('pages.cyclesView.commitsTouchedThemAll', { sharedCommits: c.sharedCommits }) }}</template><template v-if="c.broken">{{ ' ' + t('pages.cyclesView.brokenCut', { brokenBy: c.brokenBy }) }}</template></span>
            </button>
          </li>
        </ul>
        <button v-if="tangleCycles.length > cycleLimit" type="button" class="ui-btn ui-btn-sm self-start" @click="cycleLimit += 60">{{ t('pages.cyclesView.showMore', { min: Math.min(60, tangleCycles.length - cycleLimit) }) }}</button>
      </div>
    </template>
  </ViewWorkspaceLayout>
  <GroupActionBar ref="trayRef" :selected-items="traySelection" kind="component" :show-in-except="['cycles']" @replace="traySelection = $event" @clear="traySelection = []"/>
</template>

<script setup lang="ts">
import ExhibitFrame from "~/features/export/components/ExhibitFrame.vue";
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TangleGraph from "~/features/cycles/components/TangleGraph.vue";
import TangleMatrix from "~/features/cycles/components/TangleMatrix.vue";
import PinButton from "~/features/reports/components/PinButton.vue";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import SnippetPopover from "~/features/cycles/components/SnippetPopover.vue";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useTable } from "~/features/export/useExportables";
import { useDataStore } from "~/features/snapshot/data.store";
import { useGroupsStore } from "~/features/groups/groups.store";
import { useLensStore } from "~/features/groups/lens.store";
import { useScopeStore } from "~/features/groups/scope.store";
import { TRUSTED_PAIR_SQL } from "~/features/git/cochange";
import { formatNumber } from "~/shared/format";
import { componentPath, filePath } from "~/features/navigation/routes";
import { sqlIn, sqlLiteral } from "~/shared/sql";
import { passesFacet } from "~/features/snapshot/fileRole";
import { scopeLabel } from "~/features/groups/scopeSql";
import { afterCuts, edgeId, foldEdges, layoutTangle, loopThrough, planCuts, tanglesOf, type CutStep, type TangleLayout, type WEdge } from "~/features/cycles/untangle";
import { t, listOf } from "~/shared/i18n"
import I18nT from "~/shared/ui/I18nT";

// Cycles, read as tangles: sets of components that all reach each other.
// Hundreds of listed cycles overlap on a few imports; laid out in levels,
// the imports that run back against them are what make every one, and a
// plan of cuts, most untangling first, shows what it takes to undo them.

const store = useDataStore();
const groupsStore = useGroupsStore();
const lens = useLensStore();
const scope = useScopeStore();
const route = useRoute();
const router = useRouter();
const fmt = (n: number) => formatNumber(n);

const searchQuery = ref("");
const isSidebarOpen = ref(true);
const activeTab = ref("guide");
const tabs = [{ id: "guide", label: t("pages.cyclesView.guide") }, { id: "plan", label: t("pages.cyclesView.allCuts") }, { id: "selection", label: t("pages.cyclesView.selection") }, { id: "cycles", label: t("pages.cyclesView.cycles") }];

// ── The graph and its tangles ───────────────────────────────────────────
// The Production/Tests switch changes the graph itself, not just which
// tangles show: an import counts only when a file on the facet's side makes
// it, so a loop closed by a test disappears under Production.
const facetRows = computed<any[]>(() => {
  const rows = store.componentConnections as any[];
  if (scope.facet === "all") return rows;
  const roles = store.fileRoleIndex;
  const keep = scope.facetComponents;
  return rows.filter(r =>
    (!r.file || passesFacet(roles.get(String(r.file)) ?? "production", scope.facet)) &&
    (!keep || (keep.has(String(r.from)) && keep.has(String(r.to)))));
});
const edges = computed<WEdge[]>(() => (store.hasData ? foldEdges(facetRows.value) : []));
const componentNames = computed(() => {
  if (!store.hasData) return [];
  const keep = scope.facetComponents;
  return (store.allComponents as any[]).map(c => String(c.name)).filter(n => n !== "." && (!keep || keep.has(n)));
});
const componentCount = computed(() => componentNames.value.length);
const lineIndex = computed(() => new Map((store.allComponents as any[]).map(c => [String(c.name), Number(c.complexity__lines) || 0])));
const linesOf = (n: string) => lineIndex.value.get(n) ?? 0;

interface ListedCycle { id: number; nodes: string[]; sharedCommits: number }
// The engine lists cycles over every import; under a facet keep only those
// whose every step is still an import on the facet's side.
const listedCycles = computed<ListedCycle[]>(() => {
  if (!store.hasData) return [];
  const all: ListedCycle[] = (store.allCyclesExpanded as any[]).map(c => ({ id: c.id, nodes: c.nodes, sharedCommits: Number(c.sharedCommits) || 0 }));
  if (scope.facet === "all") return all;
  const have = new Set(edges.value.map(e => edgeId(e.from, e.to)));
  return all.filter(c => c.nodes.every((n, i) => have.has(edgeId(n, c.nodes[(i + 1) % c.nodes.length]))));
});

interface Tangle { key: string; members: string[]; lines: number; cycles: number; matches: boolean }
const rawTangles = computed(() => tanglesOf(new Set([...componentNames.value, ...edges.value.flatMap(e => [e.from, e.to])]), edges.value));
const matches = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return new Set(q ? rawTangles.value.flat().filter(n => n.toLowerCase().includes(q)) : []);
});
const tangles = computed<Tangle[]>(() => rawTangles.value.map(members => {
  const set = new Set(members);
  return {
    key: members[0],
    members,
    lines: members.reduce((s, m) => s + linesOf(m), 0),
    cycles: listedCycles.value.filter(c => c.nodes.every(n => set.has(n))).length,
    matches: members.some(m => matches.value.has(m)),
  };
}));
const tangledCount = computed(() => rawTangles.value.reduce((s, t) => s + t.length, 0));
const scopedTangles = computed(() => (scope.isActive ? tangles.value.filter(t => t.members.some(m => scope.componentInScope(m))) : tangles.value));

// ── The open tangle ─────────────────────────────────────────────────────
const selectedKey = ref<string | null>(null);
const tangle = computed(() => scopedTangles.value.find(t => t.key === selectedKey.value) ?? scopedTangles.value[0] ?? null);
const tangleNumber = computed(() => (tangle.value ? scopedTangles.value.indexOf(tangle.value) + 1 : 0));
const layoutCache = new Map<string, { layout: TangleLayout; plan: CutStep[] }>();
watch(edges, () => layoutCache.clear());
function prepared(t: Tangle) {
  const k = t.members.join("\n");
  let hit = layoutCache.get(k);
  if (!hit) {
    const inside = new Set(t.members);
    const own = edges.value.filter(e => inside.has(e.from) && inside.has(e.to));
    const layout = layoutTangle(t.members, own);
    hit = { layout, plan: planCuts(t.members, layout) };
    layoutCache.set(k, hit);
  }
  return hit;
}
const layout = computed(() => (tangle.value ? prepared(tangle.value).layout : null));
const plan = computed(() => (tangle.value ? prepared(tangle.value).plan : []));
const planImports = computed(() => plan.value.reduce((s, x) => s + x.imports, 0));
const planFiles = computed(() => {
  const want = new Set(plan.value.map(s => edgeId(s.from, s.to)));
  const files = new Set<string>();
  for (const r of facetRows.value) if (r.file && want.has(edgeId(String(r.from), String(r.to)))) files.add(String(r.file));
  return files.size || plan.value.reduce((s, x) => s + x.files, 0);
});
const firstHalf = computed(() => (tangle.value ? plan.value.find(s => s.freed >= tangle.value!.members.length / 2 && s.step < plan.value.length) ?? null : null));
const gain = (s: CutStep) => s.freed - (plan.value[s.step - 2]?.freed ?? 0);
const stepOf = (from: string, to: string) => plan.value.find(s => s.from === from && s.to === to)?.step ?? null;
const figureTitle = computed(() => (tangle.value ? t("pages.cyclesView.tangleComponentsLevels", { tangleNumber: tangleNumber.value, membersLength: tangle.value.members.length, value: layout.value?.layers.length ?? 0 }) : t("pages.cyclesView.tangle2")));
// Drawn while it stays legible; past that, the matrix reads the whole of it.
const autoMode = computed<"graph" | "matrix">(() => ((tangle.value?.members.length ?? 0) > 60 || Math.max(0, ...(layout.value?.layers.map(l => l.length) ?? [0])) > 12 ? "matrix" : "graph"));
const chosenMode = ref<"graph" | "matrix" | null>(null);
const mode = computed<"graph" | "matrix">({ get: () => chosenMode.value ?? autoMode.value, set: v => { chosenMode.value = v; } });

// Totals across every tangle, planned once the page has drawn.
const totals = ref<{ cuts: number; imports: number } | null>(null);
watch(tangles, (list) => {
  totals.value = null;
  if (!list.length) return;
  setTimeout(() => {
    let cuts = 0, imports = 0;
    for (const t of list) { const p = prepared(t).plan; cuts += p.length; imports += p.reduce((s, x) => s + x.imports, 0); }
    totals.value = { cuts, imports };
  }, 120);
}, { immediate: true });

function selectTangle(key: string) {
  if (selectedKey.value === key) return;
  selectedKey.value = key;
}
watch(() => tangle.value?.key, () => {
  clearSelection();
  litCycleId.value = null;
  cycleLimit.value = 60;
});

// ── Cuts ────────────────────────────────────────────────────────────────
const cutsByTangle = ref<Record<string, string[]>>({});
const cut = computed<ReadonlySet<string>>(() => new Set(tangle.value ? cutsByTangle.value[tangle.value.key] ?? [] : []));
function setCuts(ids: string[]) {
  if (!tangle.value) return;
  cutsByTangle.value = { ...cutsByTangle.value, [tangle.value.key]: ids };
}
function toggleCut(from: string, to: string) {
  const id = edgeId(from, to);
  const now = [...cut.value];
  setCuts(now.includes(id) ? now.filter(x => x !== id) : [...now, id]);
}
function applyFirst(k: number) { setCuts(plan.value.slice(0, k).map(s => edgeId(s.from, s.to))); }
const prefixApplied = computed(() => {
  let k = 0;
  while (k < plan.value.length && cut.value.has(edgeId(plan.value[k].from, plan.value[k].to))) k++;
  return k === cut.value.size ? k : cut.value.size;
});
const after = computed(() => (tangle.value && layout.value ? afterCuts(tangle.value.members, layout.value.forward.concat(layout.value.against), cut.value) : { tangles: [], freed: new Set<string>() }));

// The curve: components still tangled after each cut of the plan.
const CW = 340, CH = 84, PADL = 26, PADB = 14;
const tangledAt = (k: number) => (k === 0 ? tangle.value?.members.length ?? 0 : plan.value[Math.min(k, plan.value.length) - 1]?.tangled ?? 0);
const curve = computed(() => {
  const n = Math.max(1, plan.value.length);
  const total = Math.max(1, tangle.value?.members.length ?? 1);
  const x = (k: number) => PADL + (k / n) * (CW - PADL - 4);
  const y = (v: number) => 6 + (1 - v / total) * (CH - PADB - 6);
  const pts: Array<[number, number]> = [[x(0), y(total)]];
  plan.value.forEach((s, i) => { pts.push([x(i + 1), y(plan.value[i - 1]?.tangled ?? total)]); pts.push([x(i + 1), y(s.tangled)]); });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return { x, y, line, area: `${line}L${x(n).toFixed(1)},${CH - PADB}L${x(0).toFixed(1)},${CH - PADB}Z` };
});
function onCurveClick(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * CW;
  const k = Math.round(((vx - PADL) / (CW - PADL - 4)) * plan.value.length);
  applyFirst(Math.max(0, Math.min(plan.value.length, k)));
}

// ── The guide ───────────────────────────────────────────────────────────
// Step 0 explains the drawing; step k is the plan's k-th cut. Each tangle keeps its own place.
const guideSteps = ref<Record<string, number>>({});
const guideStep = computed(() => (tangle.value ? guideSteps.value[tangle.value.key] ?? 0 : 0));
const guideCurrent = computed(() => (guideStep.value >= 1 ? plan.value[guideStep.value - 1] ?? null : null));
function goStep(k: number) {
  if (!tangle.value) return;
  guideSteps.value = { ...guideSteps.value, [tangle.value.key]: Math.max(0, Math.min(plan.value.length + 1, k)) };
  activeTab.value = "guide";
  isSidebarOpen.value = true;
}
const allEdges = computed(() => (layout.value ? layout.value.forward.concat(layout.value.against) : []));
/** The loop the current cut closes, over what the other cuts leave. */
const guideLoop = computed(() => {
  const s = guideCurrent.value;
  if (!s) return null;
  const others = new Set(cut.value);
  others.delete(edgeId(s.from, s.to));
  return loopThrough(allEdges.value, s.from, s.to, others);
});
const guideFocus = computed(() => (activeTab.value === "guide" && guideCurrent.value && after.value.tangles.length ? { from: guideCurrent.value.from, to: guideCurrent.value.to, loop: guideLoop.value ?? [guideCurrent.value.from, guideCurrent.value.to] } : null));
/** What cutting it does from where the cuts stand now, not from where the plan assumed. */
const guideEffect = computed(() => {
  const s = guideCurrent.value;
  const empty = { freed: [] as string[], split: false, after: [] as number[], already: false };
  if (!s || !tangle.value) return empty;
  const id = edgeId(s.from, s.to);
  if (cut.value.has(id)) return { ...empty, already: true };
  const next = afterCuts(tangle.value.members, allEdges.value, new Set([...cut.value, id]));
  const freed = [...next.freed].filter(n => !after.value.freed.has(n)).sort();
  return { freed, split: next.tangles.length > after.value.tangles.length, after: next.tangles.map(t => t.length), already: false };
});
const guideCallout = computed(() => {
  const e = guideEffect.value;
  if (!guideCurrent.value) return null;
  return e.already ? t("pages.cyclesView.cut5") : e.freed.length ? t("pages.cyclesView.cutHereFrees", { freedLength: e.freed.length }) : e.split ? t("pages.cyclesView.cutHereSplitsKnot") : t("pages.cyclesView.cutHere");
});
const flashed = ref<ReadonlySet<string>>(new Set());
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function cutAndNext() {
  const s = guideCurrent.value;
  if (!s) return;
  if (!cut.value.has(edgeId(s.from, s.to))) {
    const freed = guideEffect.value.freed;
    toggleCut(s.from, s.to);
    flashed.value = new Set(freed);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashed.value = new Set(); }, 1200);
  }
  // Past cuts the ones before already made unnecessary: straight to one that still closes a loop.
  let k = guideStep.value + 1;
  while (k <= plan.value.length && after.value.tangles.length) {
    const n = plan.value[k - 1];
    const w = afterCuts(tangle.value!.members, allEdges.value, cut.value).tangles;
    const where = new Map<string, number>();
    w.forEach((t, i) => t.forEach(m => where.set(m, i)));
    if (where.has(n.from) && where.get(n.from) === where.get(n.to)) break;
    k++;
  }
  goStep(k);
}
function onGuideKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === "INPUT") return;
  if (guideStep.value === 0 && (e.key === "Enter" || e.key === "ArrowRight")) { e.preventDefault(); goStep(1); }
  else if (guideCurrent.value && (e.key === "Enter" || e.key === "ArrowRight")) { e.preventDefault(); cutAndNext(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); goStep(guideStep.value - 1); }
  else if (e.key.toLowerCase() === "s" && guideCurrent.value) { e.preventDefault(); goStep(guideStep.value + 1); }
}
const cutImports = computed(() => plan.value.filter(s => cut.value.has(edgeId(s.from, s.to))).reduce((n, s) => n + s.imports, 0));
const nextTangle = computed(() => {
  const i = scopedTangles.value.findIndex(t => t.key === tangle.value?.key);
  return scopedTangles.value.slice(i + 1).find(t => t.members.length > 1) ?? null;
});

// The import lines of the current cut, read from the snapshot's copy of each file.
interface CodeLine { file: string; line: number; text: string }
const guideLines = ref<CodeLine[]>([]);
const guideMoreLines = ref(0);
const guideLinesLoading = ref(false);
watch(guideCurrent, async (s) => {
  guideLines.value = [];
  guideMoreLines.value = 0;
  if (!s) return;
  const files = [...new Set(facetRows.value.filter(r => r.from === s.from && r.to === s.to && r.file).map(r => String(r.file)))];
  if (!files.length || !store.hasView("snippets")) return;
  guideLinesLoading.value = true;
  try {
    const rows: Array<{ file: string; begin_position: string }> = await store.query(`
      SELECT file, begin_position FROM snippets
      WHERE snippet_type = ${sqlLiteral(store.statName("modularity__component__imports"))}
        AND file IN ${sqlIn(files)} AND content = ${sqlLiteral(s.to)}
      ORDER BY file, begin_position`);
    const sites = rows.map(r => ({ file: r.file, line: parseInt(String(r.begin_position).split(":")[0], 10) })).filter(x => !Number.isNaN(x.line));
    const shown = sites.slice(0, 5);
    guideMoreLines.value = Math.max(0, sites.length - shown.length);
    const texts = new Map<string, string[]>();
    if (store.hasView("file_contents")) {
      const want = [...new Set(shown.map(x => x.file))];
      const contents: Array<{ file: string; content: string }> = await store.query(`SELECT file, content FROM file_contents WHERE file IN ${sqlIn(want)}`).catch(() => []);
      for (const c of contents) texts.set(c.file, String(c.content ?? "").split("\n"));
    }
    if (guideCurrent.value !== s) return;
    guideLines.value = shown.map(x => ({ ...x, text: (texts.get(x.file)?.[x.line - 1] ?? "").trim() }));
  } finally {
    guideLinesLoading.value = false;
  }
}, { immediate: true });

// ── Selection ───────────────────────────────────────────────────────────
const selectedEdge = ref<{ from: string; to: string } | null>(null);
const selectedNode = ref<string | null>(null);
function selectEdge(from: string, to: string, reveal = true) {
  // Clicking a cut of the plan while the guide is open goes to that cut in the guide.
  if (reveal && activeTab.value === "guide") {
    const k = plan.value.findIndex(s => s.from === from && s.to === to);
    if (k >= 0) { goStep(k + 1); return; }
  }
  selectedEdge.value = { from, to };
  selectedNode.value = null;
  if (reveal) { activeTab.value = "selection"; isSidebarOpen.value = true; }
}
function selectNode(name: string) {
  selectedNode.value = name;
  selectedEdge.value = null;
  activeTab.value = "selection";
  isSidebarOpen.value = true;
}
function clearSelection() { selectedEdge.value = null; selectedNode.value = null; }
const isSelectedEdge = (e: { from: string; to: string }) => !!selectedEdge.value && selectedEdge.value.from === e.from && selectedEdge.value.to === e.to;
const selectedStep = computed(() => (selectedEdge.value ? plan.value.find(s => isSelectedEdge(s)) ?? null : null));
const isAgainst = computed(() => !!selectedEdge.value && !!layout.value?.against.some(e => isSelectedEdge(e)));

const planList = ref<HTMLElement | null>(null);
function onPlanKey(e: KeyboardEvent) {
  const i = plan.value.findIndex(s => isSelectedEdge(s));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const j = Math.max(0, Math.min(plan.value.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    const s = plan.value[j];
    if (!s) return;
    selectEdge(s.from, s.to, false);
    void nextTick(() => planList.value?.querySelector(`[data-step="${s.step}"]`)?.scrollIntoView({ block: "nearest" }));
  } else if (e.key === " " && i >= 0) {
    e.preventDefault();
    toggleCut(plan.value[i].from, plan.value[i].to);
  }
}

// A component named in the address (the component page links here) opens its tangle, selected.
watch([() => route.query.component, tangles], ([c]) => {
  const name = Array.isArray(c) ? c[0] : c;
  if (!name) return;
  const t = tangles.value.find(x => x.members.includes(String(name)));
  if (t) { selectedKey.value = t.key; void nextTick(() => selectNode(String(name))); }
  else searchQuery.value = String(name);
}, { immediate: true });
// Searching opens the first tangle that has a match.
watch(searchQuery, (q) => {
  if (!q.trim() || tangle.value?.matches) return;
  const t = scopedTangles.value.find(x => x.matches);
  if (t) selectedKey.value = t.key;
});

// ── Evidence ────────────────────────────────────────────────────────────
// Co-change for every cut of the plan, in one query.
const cochange = ref(new Map<string, number>());
watch(plan, async (steps) => {
  cochange.value = new Map();
  if (!steps.length || !store.hasView("git_component_shared_commits")) return;
  const names = [...new Set(steps.flatMap(s => [s.from, s.to]))];
  const rows: Array<{ pair_1: string; pair_2: string; shared_commits: number }> = await store.query(`
    SELECT pair_1, pair_2, shared_commits FROM git_component_shared_commits
    WHERE pair_1 IN ${sqlIn(names)} AND pair_2 IN ${sqlIn(names)} AND ${TRUSTED_PAIR_SQL}`).catch(() => []);
  const by = new Map<string, number>();
  for (const r of rows) { const n = Number(r.shared_commits) || 0; by.set(edgeId(r.pair_1, r.pair_2), n); by.set(edgeId(r.pair_2, r.pair_1), n); }
  const out = new Map<string, number>();
  for (const s of steps) { const n = by.get(edgeId(s.from, s.to)); if (n) out.set(edgeId(s.from, s.to), n); }
  cochange.value = out;
}, { immediate: true });

interface EdgeFile { file: string; count: number; ranges: string[]; first: number | null }
const edgeDetail = ref<{ imports: number; files: EdgeFile[] } | null>(null);
const linesLoading = ref(false);
watch(selectedEdge, async (sel) => {
  edgeDetail.value = null;
  if (!sel) return;
  const files = new Map<string, number>();
  let imports = 0;
  for (const r of facetRows.value) {
    if (r.from !== sel.from || r.to !== sel.to) continue;
    const n = Number(r.reference_count ?? r.count) || 1;
    imports += n;
    if (r.file) files.set(String(r.file), (files.get(String(r.file)) ?? 0) + n);
  }
  const list: EdgeFile[] = [...files].map(([file, count]) => ({ file, count, ranges: [], first: null })).sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  edgeDetail.value = { imports, files: list };
  if (!list.length || !store.hasView("snippets")) return;
  linesLoading.value = true;
  try {
    const rows: Array<{ file: string; begin_position: string }> = await store.query(`
      SELECT file, begin_position FROM snippets
      WHERE snippet_type = ${sqlLiteral(store.statName("modularity__component__imports"))}
        AND file IN ${sqlIn(list.map(f => f.file))} AND content = ${sqlLiteral(sel.to)}`);
    if (selectedEdge.value !== sel) return;
    const byFile = new Map<string, number[]>();
    for (const r of rows) { const line = parseInt(String(r.begin_position).split(":")[0], 10); if (!Number.isNaN(line)) (byFile.get(r.file) ?? byFile.set(r.file, []).get(r.file)!).push(line); }
    edgeDetail.value = { imports, files: list.map(f => { const lines = (byFile.get(f.file) ?? []).sort((a, b) => a - b); return { ...f, ranges: toRanges(lines), first: lines[0] ?? null }; }) };
  } finally {
    linesLoading.value = false;
  }
});
function toRanges(ns: number[]): string[] {
  const out: string[] = [];
  if (!ns.length) return out;
  let a = ns[0], b = ns[0];
  for (let i = 1; i <= ns.length; i++) {
    if (i < ns.length && ns[i] === b + 1) { b = ns[i]; continue; }
    out.push(a === b ? String(a) : `${a}-${b}`);
    a = ns[i]; b = ns[i];
  }
  return out;
}
const fileSourcePath = (file: string, line: number | null) => `${filePath(file, "source")}${line ? `#L${line}` : ""}`;

const cyclesThroughEdge = computed(() => {
  const e = selectedEdge.value;
  if (!e) return 0;
  return tangleCycles.value.filter(c => c.nodes.some((n, i) => n === e.from && c.nodes[(i + 1) % c.nodes.length] === e.to)).length;
});
const nodeDetail = computed(() => {
  const n = selectedNode.value, l = layout.value;
  if (!n || !l) return null;
  const all = l.forward.concat(l.against);
  return {
    level: (l.layerOf.get(n) ?? 0) + 1,
    out: all.filter(e => e.from === n).length,
    in: all.filter(e => e.to === n).length,
    against: l.against.filter(e => e.from === n || e.to === n),
    cycles: tangleCycles.value.filter(c => c.nodes.includes(n)).length,
  };
});

// ── Listed cycles ───────────────────────────────────────────────────────
const litCycleId = ref<number | null>(null);
const cycleLimit = ref(60);
const tangleCycles = computed(() => {
  if (!tangle.value) return [];
  const set = new Set(tangle.value.members);
  const stepByEdge = new Map(plan.value.map(s => [edgeId(s.from, s.to), s.step]));
  return listedCycles.value.filter(c => c.nodes.every(n => set.has(n))).map(c => {
    let brokenBy: number | null = null;
    c.nodes.forEach((n, i) => {
      const id = edgeId(n, c.nodes[(i + 1) % c.nodes.length]);
      if (cut.value.has(id)) { const s = stepByEdge.get(id) ?? 0; brokenBy = brokenBy === null ? s : Math.min(brokenBy, s); }
    });
    return { ...c, broken: brokenBy !== null, brokenBy };
  }).sort((a, b) => Number(a.broken) - Number(b.broken) || a.nodes.length - b.nodes.length || b.sharedCommits - a.sharedCommits);
});
const brokenCount = computed(() => tangleCycles.value.filter(c => c.broken).length);
const shownCycles = computed(() => tangleCycles.value.slice(0, cycleLimit.value));
const lit = computed<ReadonlySet<string>>(() => {
  const c = tangleCycles.value.find(x => x.id === litCycleId.value);
  return new Set(c ? c.nodes.map((n, i) => edgeId(n, c.nodes[(i + 1) % c.nodes.length])) : []);
});

// ── Names and groups ────────────────────────────────────────────────────
/** What every member of the open tangle's name starts with, to a separator: said once, left out below. */
const prefix = computed(() => {
  const m = tangle.value?.members ?? [];
  if (m.length < 2) return "";
  let p = m[0];
  for (const n of m) while (p && !n.startsWith(p)) p = p.slice(0, -1);
  const cut = Math.max(p.lastIndexOf("."), p.lastIndexOf("/"));
  const at = cut + 1;
  // Keep something of every name: a member equal to the prefix would vanish.
  return at > 0 && m.every(n => n.length > at) ? p.slice(0, at) : "";
});
const shortName = (n: string) => (prefix.value && n.startsWith(prefix.value) ? n.slice(prefix.value.length) : store.getComponentName(n) || n);
const lensGroupsOf = (n: string) => groupsStore.getGroupsForComponent(n).filter(g => !lens.active || g.dimension === lens.active);
const groupColor = (n: string) => lensGroupsOf(n)[0]?.color ?? null;
const crossed = computed(() => {
  if (!tangle.value) return [];
  const counts = new Map<string, number>();
  for (const m of tangle.value.members) for (const g of lensGroupsOf(m)) counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
});

// ── Actions ─────────────────────────────────────────────────────────────
const trayRef = ref<{ startCreate: (name?: string) => void } | null>(null);
const traySelection = ref<string[]>([]);
async function saveAsGroup() {
  if (!tangle.value) return;
  traySelection.value = [...tangle.value.members];
  await nextTick();
  trayRef.value?.startCreate(t("pages.cyclesView.tangle", { tangleNumber: tangleNumber.value }));
}
const planTable = useTable({
  get title() { return t("pages.cyclesView.cutPlanTangle", { tangleNumber: tangleNumber.value }); },
  rows: () => plan.value.map(s => ({ step: s.step, from: s.from, to: s.to, imports: s.imports, files: s.files, changed_together: cochange.value.get(edgeId(s.from, s.to)) ?? null, frees: gain(s), still_tangled: s.tangled })),
  columns: () => [
    { id: "step", label: t("pages.cyclesView.cut5") }, { id: "from", label: t("pages.cyclesView.from") }, { id: "to", label: t("pages.cyclesView.to") }, { id: "imports", label: t("pages.cyclesView.imports") }, { id: "files", label: t("pages.cyclesView.files") },
    { id: "changed_together", label: t("pages.cyclesView.changedTogether2") }, { id: "frees", label: t("pages.cyclesView.frees") }, { id: "still_tangled", label: t("pages.cyclesView.stillTangled") },
  ],
  disabledReason: () => (plan.value.length ? null : t("pages.cyclesView.noTangleOpen")),
});

onMounted(() => { if (route.query.component) isSidebarOpen.value = true; });
</script>

<style scoped>
.gd-name { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.88em; background: rgb(var(--c-neutral-100)); border-radius: 4px; padding: 0 4px; overflow-wrap: anywhere; }
.sq-range { accent-color: rgb(var(--c-accent-500)); height: 16px; }
</style>
