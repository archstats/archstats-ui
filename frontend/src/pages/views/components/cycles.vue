<template>
  <ViewWorkspaceLayout
    title="Cycles"
    v-model:search-query="searchQuery"
    v-model:is-sidebar-open="isSidebarOpen"
    v-model:active-tab="activeTab"
    :tabs="tabs"
    sidebar-width="380px"
  >
    <template #stats>
      <span v-if="tangles.length">{{ tangles.length }} {{ tangles.length === 1 ? "tangle" : "tangles" }} · {{ fmt(tangledCount) }} of {{ fmt(componentCount) }} components · {{ fmt(listedCycles.length) }} listed cycles</span>
    </template>

    <template #switches>
      <div v-if="tangle" class="ui-segmented" role="group" aria-label="Draw the tangle as">
        <button type="button" :aria-pressed="mode === 'graph'" title="Levels, left to right: the imports back against them arc underneath" @click="mode = 'graph'">Levels</button>
        <button type="button" :aria-pressed="mode === 'matrix'" title="Row imports column, in the same order: below the diagonal runs against the levels" @click="mode = 'matrix'">Matrix</button>
      </div>
    </template>

    <template #visualizer>
      <EmptyState v-if="!store.hasData" icon="recycle" title="No snapshot open" text="Open a scan to look for dependency cycles."/>
      <div v-else-if="!tangles.length" class="flex h-full flex-col items-center justify-center px-8 text-center">
        <Icon icon="recycle" :size="22" class="text-neutral-300"/>
        <h2 class="mt-3 text-lg font-semibold text-neutral-900">No component is in a tangle</h2>
        <p class="mt-2 max-w-[460px] text-sm leading-6 text-neutral-600">Every import chain between the {{ fmt(componentCount) }} components runs one way, so there is no cycle to break. That holds for runtime imports; type-only imports are left out, as the engine leaves them out.</p>
      </div>
      <div v-else-if="!scopedTangles.length" class="flex h-full items-center justify-center">
        <EmptyState icon="recycle" title="No tangle in scope" :text="`No tangle has a component of ${scope.group?.name ?? 'the active scope'}.`">
          <button type="button" class="ui-btn ui-btn-sm" @click="scope.clear()">Clear scope</button>
        </EmptyState>
      </div>

      <template v-else-if="tangle && layout">
        <!-- Every tangle, to scale: the knot the snapshot has, and which one is open. -->
        <div class="flex shrink-0 items-center gap-3 px-4 py-2.5 hairline-b" role="tablist" aria-label="Tangles">
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
              :title="`Tangle ${i + 1}: ${tg.members.length} components, ${fmt(tg.lines)} lines, ${fmt(tg.cycles)} listed cycles`"
              @click="selectTangle(tg.key)"
            >
              <span v-if="tg.members.length >= 3 || scopedTangles.length <= 8">{{ tg.members.length }}</span>
            </button>
          </div>
          <span class="shrink-0 text-[12px] text-neutral-500">components per tangle</span>
        </div>

        <!-- What this one is, and what the cuts have done to it. -->
        <div class="flex h-11 shrink-0 items-center gap-3 px-4 hairline-b">
          <span class="shrink-0 whitespace-nowrap text-[13px] font-semibold text-neutral-900">Tangle {{ tangleNumber }}</span>
          <span v-if="prefix" class="min-w-0 max-w-[32%] shrink truncate font-mono text-[12px] text-neutral-500" :title="`Names below leave out ${prefix}`">in {{ prefix.replace(/[./]$/, "") }}</span>
          <span class="ui-toolbar-meta flex min-w-0 shrink items-center gap-1.5 truncate">
            <span class="whitespace-nowrap">{{ tangle.members.length }} components</span><span class="text-neutral-300">·</span>
            <span class="whitespace-nowrap">{{ fmt(tangle.lines) }} lines</span><span class="text-neutral-300">·</span>
            <span class="whitespace-nowrap">{{ layout.layers.length }} levels</span><span class="text-neutral-300">·</span>
            <span class="whitespace-nowrap">{{ fmt(tangle.cycles) }} listed cycles</span>
            <template v-if="crossed.length > 1"><span class="text-neutral-300">·</span><span class="whitespace-nowrap" :title="crossed.map(c => `${c.name}: ${c.count}`).join('\n')">{{ crossed.length }} groups</span></template>
          </span>
          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            <PinButton kind="cycle" :entity-key="[...tangle.members].sort().join('\n')" :title="`Tangle of ${tangle.members.length} components`" :values="{ size: tangle.members.length }"/>
            <button type="button" class="ui-btn ui-btn-sm" title="Its components become a group" @click="saveAsGroup"><Icon icon="bookmark" :size="13" class="text-neutral-500"/><span>Save as group</span></button>
          </div>
        </div>

        <!-- The cuts, as they stand: always here, so cutting never moves the drawing. -->
        <div class="flex h-9 shrink-0 items-center gap-3 px-4 text-[12.5px] hairline-b" role="status">
          <template v-if="cut.size">
            <span class="text-neutral-900"><span class="font-semibold tabular-nums">{{ cut.size }}</span> {{ cut.size === 1 ? "cut" : "cuts" }}: <span class="font-semibold tabular-nums">{{ after.freed.size }}</span> of {{ tangle.members.length }} components out of any tangle</span>
            <span class="text-neutral-500">{{ after.tangles.length ? `${after.tangles.length} ${after.tangles.length === 1 ? "tangle" : "tangles"} left (${after.tangles.map(t => t.length).join(", ")})` : "no cycle left" }}</span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="setCuts([])">Undo cuts</button>
          </template>
          <span v-else class="text-neutral-500">Nothing cut yet. The plan lists {{ plan.length }} {{ plan.length === 1 ? "cut" : "cuts" }} that undo this tangle; apply them one by one, or drag through them.</span>
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
      </template>
    </template>

    <!-- The plan: what to cut, in the order that untangles most. -->
    <template #tab-plan>
      <div v-if="tangle && layout" class="flex flex-col gap-4">
        <section>
          <p class="text-[13px] leading-5 text-neutral-900">
            <span class="font-semibold">{{ plan.length }} {{ plan.length === 1 ? "cut" : "cuts" }}</span>, {{ fmt(planImports) }} {{ planImports === 1 ? "import" : "imports" }} in {{ fmt(planFiles) }} {{ planFiles === 1 ? "file" : "files" }}, leave no cycle in this tangle.
            <template v-if="firstHalf"> The first {{ firstHalf.step }} free half of it.</template>
          </p>
          <p class="mt-1 text-[11.5px] leading-4 text-neutral-500">A plan, not the only one: each step takes the cut that untangles most, then the fewest imports. {{ totals ? `Across all ${tangles.length} tangles: ${fmt(totals.cuts)} cuts, ${fmt(totals.imports)} imports.` : "" }}</p>
        </section>

        <!-- How fast it comes apart. -->
        <section aria-label="Components still tangled, cut by cut">
          <svg :viewBox="`0 0 ${CW} ${CH}`" class="block w-full cursor-pointer" role="img" :aria-label="`${tangle.members.length} components tangled before any cut, none after ${plan.length}`" @click="onCurveClick">
            <line :x1="PADL" :y1="CH - PADB" :x2="CW - 4" :y2="CH - PADB" stroke="rgb(var(--c-neutral-200))"/>
            <path :d="curve.area" fill="rgb(var(--c-accent-200) / 0.45)"/>
            <path :d="curve.line" fill="none" stroke="rgb(var(--c-accent-500))" stroke-width="1.75"/>
            <line :x1="curve.x(cut.size)" :y1="6" :x2="curve.x(cut.size)" :y2="CH - PADB" stroke="rgb(var(--c-neutral-900))" stroke-width="1" stroke-dasharray="2 3"/>
            <circle :cx="curve.x(cut.size)" :cy="curve.y(tangledAt(cut.size))" r="3.5" fill="rgb(var(--c-neutral-900))"/>
            <text :x="PADL - 6" y="12" text-anchor="end" font-size="10" fill="rgb(var(--c-neutral-500))" font-family="JetBrains Mono, monospace">{{ tangle.members.length }}</text>
            <text :x="PADL - 6" :y="CH - PADB" text-anchor="end" font-size="10" fill="rgb(var(--c-neutral-500))" font-family="JetBrains Mono, monospace">0</text>
            <text :x="PADL" :y="CH - 2" font-size="10" fill="rgb(var(--c-neutral-500))">no cut</text>
            <text :x="CW - 4" :y="CH - 2" text-anchor="end" font-size="10" fill="rgb(var(--c-neutral-500))">{{ plan.length }} cuts</text>
          </svg>
          <label class="mt-1 flex items-center gap-3 text-[12px] text-neutral-600">
            <span class="w-[92px] shrink-0">Apply the first</span>
            <input type="range" min="0" :max="plan.length" :value="prefixApplied" class="sq-range min-w-0 flex-1" aria-label="Cuts applied" @input="applyFirst(Number(($event.target as HTMLInputElement).value))">
            <span class="w-14 shrink-0 text-right font-mono tabular-nums text-neutral-900">{{ cut.size }} / {{ plan.length }}</span>
          </label>
        </section>

        <section>
          <div class="mb-1 flex items-baseline">
            <h3 class="ui-label flex-1">Cuts</h3>
            <span class="text-[11px] text-neutral-500">↑↓ to move · Space to cut</span>
          </div>
          <ol ref="planList" class="-mx-1 flex flex-col outline-none" tabindex="0" aria-label="Cut plan" @keydown="onPlanKey">
            <li
              v-for="s in plan"
              :key="s.step"
              :data-step="s.step"
              class="group/cut flex cursor-default items-start gap-2 rounded px-1 py-1.5"
              :class="isSelectedEdge(s) ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'"
              @click="selectEdge(s.from, s.to, false)"
            >
              <Checkbox :model-value="cut.has(edgeId(s.from, s.to))" :aria-label="`Cut ${shortName(s.from)} to ${shortName(s.to)}`" class="mt-[3px]" @click.stop @update:model-value="toggleCut(s.from, s.to)"/>
              <span class="w-5 shrink-0 pt-px text-right font-mono text-[11px] tabular-nums text-neutral-400">{{ s.step }}</span>
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-1 font-mono text-[12px] text-neutral-900">
                  <span class="min-w-0 truncate" :title="s.from">{{ shortName(s.from) }}</span>
                  <Icon icon="arrow-right" :size="11" class="shrink-0 text-accent-600"/>
                  <span class="min-w-0 truncate" :title="s.to">{{ shortName(s.to) }}</span>
                </span>
                <span class="block text-[11.5px] leading-4 text-neutral-500">
                  {{ s.imports }} {{ s.imports === 1 ? "import" : "imports" }} · {{ s.files }} {{ s.files === 1 ? "file" : "files" }}<template v-if="cochange.get(edgeId(s.from, s.to))"> · changed together {{ cochange.get(edgeId(s.from, s.to)) }}×</template>
                </span>
              </span>
              <span class="shrink-0 pt-px text-right text-[11.5px] tabular-nums" :class="gain(s) > 0 ? 'font-medium text-accent-700' : 'text-neutral-400'" :title="`${s.tangled} components still tangled after this cut${s.left.length ? ` (${s.left.join(', ')})` : ''}`">{{ gain(s) > 0 ? `frees ${gain(s)}` : s.splits ? "splits" : "narrows" }}</span>
            </li>
          </ol>
        </section>

        <section class="flex flex-col gap-2 pt-3 hairline-t">
          <button type="button" class="ui-btn ui-btn-sm self-start" :disabled="!cut.size" :title="cut.size ? 'Opens Connections in the sandbox with these imports cut: the coupling and tangles they leave' : 'Cut something first'" @click="openInSandbox">
            <Icon icon="flask" :size="13" class="text-neutral-500"/><span>Try {{ cut.size || "" }} {{ cut.size === 1 ? "cut" : "cuts" }} in the sandbox</span>
          </button>
          <p class="text-[11px] leading-4 text-neutral-500">The sandbox shows what the cuts do to coupling and the rest of the graph; nothing is changed in the snapshot.</p>
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
            <template v-if="selectedStep">Cut {{ selectedStep.step }} of the plan. It runs back against the levels; {{ gain(selectedStep) > 0 ? `taken in order, it frees ${gain(selectedStep)} ${gain(selectedStep) === 1 ? "component" : "components"}` : selectedStep.splits ? "taken in order, it splits the tangle" : "taken in order, it narrows the loops that remain" }}.</template>
            <template v-else-if="isAgainst">It runs back against the levels, but the cuts before it already undo what it closes.</template>
            <template v-else>It runs with the levels: cutting it alone breaks no cycle.</template>
          </p>
          <dl class="ui-kv">
            <dt>Imports</dt><dd>{{ fmt(edgeDetail.imports) }}</dd>
            <dt>Files</dt><dd>{{ fmt(edgeDetail.files.length) }}</dd>
            <template v-if="cochange.get(edgeId(selectedEdge.from, selectedEdge.to))"><dt>Changed together</dt><dd>{{ cochange.get(edgeId(selectedEdge.from, selectedEdge.to)) }} commits</dd></template>
            <dt>Listed cycles</dt><dd>{{ fmt(cyclesThroughEdge) }}</dd>
          </dl>
          <div v-if="selectedStep" class="flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm" :class="cut.has(edgeId(selectedEdge.from, selectedEdge.to)) ? '' : 'ui-btn-primary'" @click="toggleCut(selectedEdge.from, selectedEdge.to)">{{ cut.has(edgeId(selectedEdge.from, selectedEdge.to)) ? "Undo this cut" : "Cut it" }}</button>
          </div>
        </section>
        <section class="mt-4 flex flex-col gap-1 pt-3 hairline-t">
          <h3 class="ui-label">Where the imports are</h3>
          <LoadingState v-if="linesLoading" text="Reading import lines…"/>
          <p v-else-if="!edgeDetail.files.length" class="text-xs text-neutral-500">The snapshot records no file for these imports.</p>
          <ul v-else class="flex flex-col">
            <li v-for="f in edgeDetail.files" :key="f.file" class="flex flex-col py-1.5 hairline-b last:shadow-none">
              <div class="flex items-center gap-1.5">
                <router-link :to="fileSourcePath(f.file, f.first)" class="min-w-0 truncate font-mono text-[12px] font-medium text-neutral-900 hover:underline" :title="f.file">{{ f.file.split("/").pop() }}</router-link>
                <span class="ui-tag ml-auto shrink-0">{{ f.count }} {{ f.count === 1 ? "import" : "imports" }}</span>
              </div>
              <span class="truncate font-mono text-[11px] text-neutral-500 [direction:rtl] [text-align:left]" :title="f.file">{{ f.file.split("/").slice(0, -1).join("/") }}/</span>
              <div v-if="f.ranges.length" class="flex flex-wrap items-center gap-1 font-mono text-[11.5px] text-neutral-500">
                <span>lines</span>
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
            Level {{ nodeDetail.level }} of {{ layout?.layers.length }}. {{ after.freed.has(selectedNode) ? "With the cuts applied it is out of every tangle." : "It is still in a tangle with the cuts applied." }}
          </p>
          <dl class="ui-kv">
            <dt>Lines</dt><dd>{{ fmt(linesOf(selectedNode)) }}</dd>
            <dt>Imports in the tangle</dt><dd>{{ nodeDetail.out }} components</dd>
            <dt>Imported by</dt><dd>{{ nodeDetail.in }} of them</dd>
            <dt>Against the levels</dt><dd>{{ nodeDetail.against.length }}</dd>
            <dt>Listed cycles</dt><dd>{{ fmt(nodeDetail.cycles) }}</dd>
          </dl>
        </section>
        <section v-if="nodeDetail.against.length" class="mt-4 flex flex-col gap-1 pt-3 hairline-t">
          <h3 class="ui-label">Its imports against the levels</h3>
          <button v-for="e in nodeDetail.against" :key="edgeId(e.from, e.to)" type="button" class="flex items-center gap-1 rounded px-1 py-1 text-left font-mono text-[12px] text-neutral-800 hover:bg-neutral-100" @click="selectEdge(e.from, e.to)">
            <span class="min-w-0 truncate">{{ shortName(e.from) }}</span><Icon icon="arrow-right" :size="11" class="shrink-0 text-accent-600"/><span class="min-w-0 truncate">{{ shortName(e.to) }}</span>
            <span class="ml-auto shrink-0 font-sans text-[11px] text-neutral-500">{{ e.imports }} {{ e.imports === 1 ? "import" : "imports" }}</span>
          </button>
        </section>
      </template>
      <p v-else class="text-sm leading-5 text-neutral-500">Select an import or a component in the drawing or the plan to see where it is and what cutting it does.</p>
    </template>

    <!-- The engine's listed cycles in this tangle, and which the cuts break. -->
    <template #tab-cycles>
      <div v-if="tangle" class="flex flex-col gap-3">
        <p class="text-[12.5px] leading-5 text-neutral-700">
          {{ fmt(tangleCycles.length) }} listed cycles run inside this tangle<template v-if="cut.size">; the cuts break {{ fmt(brokenCount) }} of them</template>. The engine lists the shortest cycle through each component, so a tangle holds more loops than these; the plan breaks them all.
        </p>
        <ul class="-mx-1 flex flex-col">
          <li v-for="c in shownCycles" :key="c.id">
            <button type="button" class="flex w-full flex-col gap-0.5 rounded px-1.5 py-1.5 text-left" :class="litCycleId === c.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-100'" @click="litCycleId = litCycleId === c.id ? null : c.id">
              <span class="flex flex-wrap items-center gap-x-1 font-mono text-[11.5px]" :class="c.broken ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-900'">
                <template v-for="(n, i) in c.nodes" :key="i"><Icon v-if="i > 0" icon="arrow-right" :size="10" class="text-neutral-400"/><span :title="n">{{ shortName(n) }}</span></template>
                <Icon icon="arrow-right" :size="10" class="text-neutral-400"/><span class="text-neutral-400">{{ shortName(c.nodes[0]) }}</span>
              </span>
              <span class="text-[11px] text-neutral-500">{{ c.nodes.length }} components<template v-if="c.sharedCommits"> · {{ c.sharedCommits }} commits touched them all</template><template v-if="c.broken"> · broken by cut {{ c.brokenBy }}</template></span>
            </button>
          </li>
        </ul>
        <button v-if="tangleCycles.length > cycleLimit" type="button" class="ui-btn ui-btn-sm self-start" @click="cycleLimit += 60">Show {{ Math.min(60, tangleCycles.length - cycleLimit) }} more</button>
      </div>
    </template>
  </ViewWorkspaceLayout>
  <GroupActionBar ref="trayRef" :selected-items="traySelection" kind="component" @clear="traySelection = []"/>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TangleGraph from "~/components/cycles/TangleGraph.vue";
import TangleMatrix from "~/components/cycles/TangleMatrix.vue";
import PinButton from "~/components/evidence/PinButton.vue";
import GroupActionBar from "~/components/groups/GroupActionBar.vue";
import SnippetPopover from "~/components/SnippetPopover.vue";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import Checkbox from "~/components/ui/common/Checkbox.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import { useExportables } from "~/composables/useExportables";
import { useDataStore } from "~/stores/data";
import { useGroupsStore } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";
import { useSandboxStore } from "~/stores/sandbox";
import { useScopeStore } from "~/stores/scope";
import { TRUSTED_PAIR_SQL } from "~/utils/cochange";
import { formatNumber } from "~/utils/format";
import { componentPath } from "~/utils/routes";
import { sqlIn, sqlLiteral } from "~/utils/sql";
import { afterCuts, edgeId, foldEdges, layoutTangle, planCuts, tanglesOf, type CutStep, type TangleLayout, type WEdge } from "~/utils/untangle";

// Cycles, read as tangles: sets of components that all reach each other.
// Hundreds of listed cycles overlap on a few imports; laid out in levels,
// the imports that run back against them are what make every one, and a
// plan of cuts, most untangling first, shows what it takes to undo them.

const store = useDataStore();
const groupsStore = useGroupsStore();
const lens = useLensStore();
const scope = useScopeStore();
const sandbox = useSandboxStore();
const route = useRoute();
const router = useRouter();
const fmt = (n: number) => formatNumber(n);

const searchQuery = ref("");
const isSidebarOpen = ref(true);
const activeTab = ref("plan");
const tabs = [{ id: "plan", label: "Plan" }, { id: "selection", label: "Selection" }, { id: "cycles", label: "Cycles" }];

// ── The graph and its tangles ───────────────────────────────────────────
const edges = computed<WEdge[]>(() => (store.hasData ? foldEdges(store.componentConnections as any[]) : []));
const componentNames = computed(() => (store.hasData ? (store.allComponents as any[]).map(c => String(c.name)).filter(n => n !== ".") : []));
const componentCount = computed(() => componentNames.value.length);
const lineIndex = computed(() => new Map((store.allComponents as any[]).map(c => [String(c.name), Number(c.complexity__lines) || 0])));
const linesOf = (n: string) => lineIndex.value.get(n) ?? 0;

interface ListedCycle { id: number; nodes: string[]; sharedCommits: number }
const listedCycles = computed<ListedCycle[]>(() => (store.hasData ? (store.allCyclesExpanded as any[]).map(c => ({ id: c.id, nodes: c.nodes, sharedCommits: Number(c.sharedCommits) || 0 })) : []));

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
  for (const r of store.componentConnections as any[]) if (r.file && want.has(edgeId(String(r.from), String(r.to)))) files.add(String(r.file));
  return files.size || plan.value.reduce((s, x) => s + x.files, 0);
});
const firstHalf = computed(() => (tangle.value ? plan.value.find(s => s.freed >= tangle.value!.members.length / 2 && s.step < plan.value.length) ?? null : null));
const gain = (s: CutStep) => s.freed - (plan.value[s.step - 2]?.freed ?? 0);
const stepOf = (from: string, to: string) => plan.value.find(s => s.from === from && s.to === to)?.step ?? null;
const figureTitle = computed(() => (tangle.value ? `Tangle ${tangleNumber.value}: ${tangle.value.members.length} components in ${layout.value?.layers.length ?? 0} levels` : "Tangle"));
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

// ── Selection ───────────────────────────────────────────────────────────
const selectedEdge = ref<{ from: string; to: string } | null>(null);
const selectedNode = ref<string | null>(null);
function selectEdge(from: string, to: string, reveal = true) {
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
  for (const r of store.componentConnections as any[]) {
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
const fileSourcePath = (file: string, line: number | null) => `/views/files/${file}/source${line ? `#L${line}` : ""}`;

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
  trayRef.value?.startCreate(`Tangle ${tangleNumber.value}`);
}
async function openInSandbox() {
  const edits = plan.value.filter(s => cut.value.has(edgeId(s.from, s.to))).map(s => ({ kind: "cut" as const, from: s.from, to: s.to }));
  if (!edits.length) return;
  await sandbox.load();
  const keep = sandbox.edits.filter(e => !(e.kind === "cut" && edits.some(x => x.from === e.from && x.to === e.to)));
  sandbox.apply([...keep, ...edits]);
  void router.push("/views/connections?level=components&sandbox=1");
}

useExportables().register({
  kind: "table",
  get title() { return `Cut plan, tangle ${tangleNumber.value}`; },
  rows: () => plan.value.map(s => ({ step: s.step, from: s.from, to: s.to, imports: s.imports, files: s.files, changed_together: cochange.value.get(edgeId(s.from, s.to)) ?? null, frees: gain(s), still_tangled: s.tangled })),
  columns: () => [
    { id: "step", label: "Cut" }, { id: "from", label: "From" }, { id: "to", label: "To" }, { id: "imports", label: "Imports" }, { id: "files", label: "Files" },
    { id: "changed_together", label: "Changed together" }, { id: "frees", label: "Frees" }, { id: "still_tangled", label: "Still tangled" },
  ],
  disabledReason: () => (plan.value.length ? null : "No tangle is open."),
});

onMounted(() => { if (route.query.component) isSidebarOpen.value = true; });
</script>

<style scoped>
.sq-range { accent-color: rgb(var(--c-accent-500)); height: 16px; }
</style>
