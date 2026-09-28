<template>
  <ViewWorkspaceLayout title="Restructure planner" :queryable="false" :show-config="false">
    <template #stats>
      <span v-if="plan.modules.length">{{ plan.modules.length }} module{{ plan.modules.length === 1 ? "" : "s" }} · {{ fmt(placedCount) }} of {{ fmt(production.size) }} files placed</span>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading the import graph…"/>
      <EmptyState v-else-if="error" icon="alert" title="Could not read the snapshot" :text="error"/>
      <div v-else class="grid h-full min-h-0 w-full grid-cols-[380px_1fr]">
        <!-- ── The target: modules ── -->
        <aside class="min-h-0 overflow-y-auto border-r border-neutral-200 p-4" aria-label="Target modules">
          <div class="flex items-center gap-2">
            <h2 class="ui-section-title">Target modules</h2>
            <button type="button" class="ui-btn ui-btn-sm ml-auto" @click="addEmpty">Add module</button>
            <button v-if="plan.modules.length" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Start over" @click="confirmClear">Clear</button>
          </div>

          <div v-if="!plan.modules.length" class="mt-4 space-y-4 text-sm text-neutral-600">
            <p>Draw the structure you want: each module is a folder and the files that go in it, by glob or by hand. Every check on the right re-reads this snapshot's imports as you draw.</p>
            <div>
              <label class="ui-label" for="seed-root">Start from today's folders under</label>
              <div class="mt-1 flex gap-2">
                <input id="seed-root" v-model="seedRoot" list="seed-dirs" class="ui-input ui-input-sm min-w-0 flex-1 font-mono" placeholder="frontend/src" spellcheck="false" @keydown.enter="seedFolders">
                <datalist id="seed-dirs"><option v-for="d in dirOptions" :key="d" :value="d"/></datalist>
                <button type="button" class="ui-btn ui-btn-sm" :disabled="!seedRoot.trim()" @click="seedFolders">Start</button>
              </div>
            </div>
            <p>Or send files here from the <router-link to="/views/xray" class="underline">Folder X-ray</router-link> (a topic, or every topic), from <router-link to="/views/checks" class="underline">Structure checks</router-link>, or from any file selection (<b>To planner</b> in the selection tray).</p>
          </div>

          <label v-if="plan.modules.length > 1" class="mt-3 flex items-start gap-2 text-sm text-neutral-700">
            <Checkbox :model-value="plan.ordered" aria-label="Order matters" class="mt-0.5" @update:model-value="restructure.setOrdered(!plan.ordered)"/>
            <span>Order matters: a module may use the ones listed below it, never above</span>
          </label>

          <div v-for="(m, i) in plan.modules" :key="m.id" class="ui-panel mt-3 p-3" :class="{ 'ring-1 ring-accent-400': focus === m.id }" @click="focus = m.id">
            <div class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: colorOf(m.id) }"/>
              <input :value="m.name" class="ui-input ui-input-sm min-w-0 flex-1 font-medium" aria-label="Module name" @change="restructure.update(m.id, { name: ($event.target as HTMLInputElement).value.trim() || m.name })">
              <span class="ui-tag" :title="`${fmt(mod(m.id).files)} production files; ${fmt(handCount(m))} placed by hand`">{{ fmt(mod(m.id).files) }}</span>
              <template v-if="plan.ordered">
                <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="i === 0" aria-label="Move up" @click.stop="restructure.shift(m.id, -1)"><Icon icon="chevron-right" :size="12" class="-rotate-90"/></button>
                <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="i === plan.modules.length - 1" aria-label="Move down" @click.stop="restructure.shift(m.id, 1)"><Icon icon="chevron-right" :size="12" class="rotate-90"/></button>
              </template>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="`Remove ${m.name}`" @click.stop="restructure.remove(m.id)"><Icon icon="x" :size="12"/></button>
            </div>
            <p class="mt-1 text-xs text-neutral-500">
              <span :title="'Imports that stay inside this module, over all imports that touch it'">{{ Math.round(mod(m.id).cohesion * 100) }}% of its imports stay inside</span>
              <template v-if="handCount(m)"> · {{ fmt(handCount(m)) }} placed by hand <button type="button" class="underline" @click.stop="restructure.update(m.id, { files: [] })">clear</button></template>
            </p>
            <input :value="m.dir" class="ui-input ui-input-sm mt-2 w-full font-mono text-xs" placeholder="Target folder (empty: files stay put)" aria-label="Target folder" spellcheck="false" @change="restructure.update(m.id, { dir: ($event.target as HTMLInputElement).value.trim() })">
            <textarea :value="m.patterns" rows="2" class="ui-input mt-1.5 h-auto min-h-[44px] w-full py-1 font-mono text-xs" placeholder="frontend/src/**/report*&#10;!**/pages/**" aria-label="Patterns, one glob per line; ! excludes" spellcheck="false" @change="restructure.update(m.id, { patterns: ($event.target as HTMLTextAreaElement).value })"/>
          </div>
        </aside>

        <!-- ── What the plan does ── -->
        <main class="min-h-0 overflow-y-auto">
          <div class="mx-auto w-full max-w-[980px] px-8 py-6">
            <EmptyState v-if="!plan.modules.length" icon="folder" title="No plan yet" text="Start from today's folders, or send a folder's topics from the X-ray. The checks appear here as soon as a module holds files."/>
            <template v-else>
              <p v-if="blindExt.length" class="mb-4 rounded bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
                <Icon icon="alert" :size="13" class="-mt-0.5 mr-1 inline text-neutral-500"/>
                Imports of {{ blindExt.map(b => `${fmt(b.files)} .${b.ext}`).join(", ") }} files are read from their text (the engine did not parse them), so treat their counts as close, not exact.
              </p>

              <!-- Scorecard: today against the plan -->
              <div class="mb-2 flex items-center gap-2">
                <p class="text-sm text-neutral-600">Today is the components the scan found; Plan is the modules on the left.</p>
                <button type="button" class="ui-btn ui-btn-sm ml-auto" title="Replay the plan as what-if moves on the component graph: tangles, coupling and the weakest links, drawn" @click="toSandbox">Open in the Sandbox</button>
              </div>
              <table class="ui-table">
                <thead><tr><th>Check</th><th class="text-right" title="Components as the scan found them (a file with none counts in its folder)">Today</th><th class="text-right">Plan</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="r in scorecard" :key="r.label">
                    <td :title="r.why">{{ r.label }}</td>
                    <td class="is-num text-right text-neutral-500">{{ r.today == null ? "—" : fmt(r.today) }}</td>
                    <td class="is-num text-right font-medium" :class="r.bad ? 'text-red-600' : 'text-neutral-900'">{{ fmt(r.plan) }}</td>
                    <td class="w-24 text-right"><button v-if="r.tab" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="tab = r.tab">Show</button></td>
                  </tr>
                </tbody>
              </table>

              <div class="ui-segmented mt-6" role="group" aria-label="Detail">
                <button v-for="t in TABS" :key="t.id" type="button" :aria-pressed="tab === t.id" @click="tab = t.id">{{ t.label }}<span v-if="t.count() != null" class="ml-1.5 text-neutral-500">{{ fmt(t.count()!) }}</span></button>
              </div>

              <!-- Problems -->
              <section v-if="tab === 'problems'" class="mt-4">
                <EmptyState v-if="!ev.mutual.length && !ev.upward.length && !ev.tangles.length" icon="check" title="No mutual pairs, cycles or upward imports" text="Every module depends one way."/>
                <template v-if="ev.mutual.length">
                  <h3 class="ui-section-title">Modules that import each other</h3>
                  <p class="mt-1 text-sm text-neutral-600">Each pair is one module in two places. Open a pair to see which imports hold it together: move the file behind the thinner side, or split what it declares.</p>
                  <div v-for="p in ev.mutual" :key="p.a + p.b" class="mt-2 rounded border border-neutral-200">
                    <button type="button" class="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-neutral-50" :aria-expanded="openPair === p.a + p.b" @click="openPair = openPair === p.a + p.b ? null : p.a + p.b">
                      <span class="font-medium text-neutral-900">{{ restructure.name(p.a) }} ⇄ {{ restructure.name(p.b) }}</span>
                      <span class="text-sm text-neutral-500">{{ p.ab }} import{{ p.ab === 1 ? "" : "s" }} one way, {{ p.ba }} the other</span>
                    </button>
                    <div v-if="openPair === p.a + p.b" class="border-t border-neutral-200 px-3 pb-3">
                      <Why :edges="ev.pairs.get(`${p.a}>${p.b}`) ?? []" :title="`${restructure.name(p.a)} uses ${restructure.name(p.b)}`" @place="onPlace"/>
                      <Why :edges="ev.pairs.get(`${p.b}>${p.a}`) ?? []" :title="`${restructure.name(p.b)} uses ${restructure.name(p.a)}`" @place="onPlace"/>
                    </div>
                  </div>
                </template>
                <template v-if="ev.tangles.length">
                  <h3 class="ui-section-title mt-6">Cycles</h3>
                  <ul class="mt-1 text-sm text-neutral-700"><li v-for="t in ev.tangles" :key="t.join()">{{ t.map(restructure.name).join(" → ") }} → …</li></ul>
                </template>
                <template v-if="plan.ordered && ev.upward.length">
                  <h3 class="ui-section-title mt-6">Imports that point up the order</h3>
                  <Why :edges="ev.upward" title="" @place="onPlace"/>
                </template>
              </section>

              <!-- Unplaced -->
              <section v-if="tab === 'unplaced'" class="mt-4">
                <EmptyState v-if="!placement.unplaced.length" icon="check" title="Every file has a module"/>
                <template v-else>
                  <p class="text-sm text-neutral-600">Production files no module takes, with the module they are most tied to by imports. Place one, or tick several and place them together.</p>
                  <div class="mt-2 flex items-center gap-2">
                    <Checkbox :model-value="allPicked" aria-label="Select all" @update:model-value="pickAll"/>
                    <span class="text-sm text-neutral-600">{{ picked.size ? `${fmt(picked.size)} selected` : "Select all" }}</span>
                    <template v-if="picked.size">
                      <select class="ui-input ui-input-sm ml-2 w-48" aria-label="Module" :value="pickTarget" @change="pickTarget = ($event.target as HTMLSelectElement).value">
                        <option value="">Place in…</option>
                        <option v-for="m in plan.modules" :key="m.id" :value="m.id">{{ m.name }}</option>
                      </select>
                      <button type="button" class="ui-btn ui-btn-sm" :disabled="!pickTarget" @click="placePicked">Place</button>
                      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="newFromPicked">New module from these</button>
                    </template>
                  </div>
                  <table class="ui-table mt-2">
                    <thead><tr><th class="w-8"></th><th>File</th><th>Most tied to</th><th class="text-right">Lines</th><th></th></tr></thead>
                    <tbody>
                      <tr v-for="f in placement.unplaced.slice(0, unplacedLimit)" :key="f" :class="{ 'is-selected': picked.has(f) }">
                        <td><Checkbox :model-value="picked.has(f)" :aria-label="`Select ${f}`" @update:model-value="togglePick(f)"/></td>
                        <td class="max-w-[380px]"><router-link :to="filePath(f)" class="block truncate font-mono text-sm hover:underline" :title="f">{{ f }}</router-link></td>
                        <td class="text-sm text-neutral-700"><PullText :file="f"/></td>
                        <td class="is-num text-right">{{ fmt(data.lines.get(f) ?? 0) }}</td>
                        <td class="text-right"><button v-if="bestPull(f)" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="restructure.place([f], bestPull(f)!.module)">Place</button></td>
                      </tr>
                    </tbody>
                  </table>
                  <button v-if="placement.unplaced.length > unplacedLimit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="unplacedLimit += 100">Show 100 more of {{ fmt(placement.unplaced.length - unplacedLimit) }}</button>
                </template>
              </section>

              <!-- Misfits -->
              <section v-if="tab === 'misfits'" class="mt-4">
                <EmptyState v-if="!misfitList.length" icon="check" title="Every file is most tied to its own module"/>
                <template v-else>
                  <p class="text-sm text-neutral-600">Files with more imports to or from another module than their own: the next moves to try. A move re-checks everything above.</p>
                  <table class="ui-table mt-2">
                    <thead><tr><th>File</th><th>In</th><th>Pulled to</th><th class="text-right" title="Imports either way with its own module / with the other">Ties here / there</th><th></th></tr></thead>
                    <tbody>
                      <tr v-for="m in misfitList.slice(0, 200)" :key="m.file">
                        <td class="max-w-[360px]"><router-link :to="filePath(m.file)" class="block truncate font-mono text-sm hover:underline" :title="m.file">{{ m.file }}</router-link></td>
                        <td class="text-sm">{{ restructure.name(m.module) }}</td>
                        <td class="text-sm">{{ restructure.name(m.to) }}</td>
                        <td class="is-num text-right">{{ m.here }} / {{ m.there }}</td>
                        <td class="text-right"><button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="restructure.place([m.file], m.to)">Move</button></td>
                      </tr>
                    </tbody>
                  </table>
                </template>
              </section>

              <!-- Moves -->
              <section v-if="tab === 'moves'" class="mt-4">
                <p v-if="mv.collisions.length" class="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  {{ mv.collisions.length }} target path{{ mv.collisions.length === 1 ? " is" : "s are" }} taken twice: {{ mv.collisions.slice(0, 3).map(c => c.to).join(", ") }}{{ mv.collisions.length > 3 ? "…" : "" }}. Rename one file, or give the module sub-folders.
                </p>
                <EmptyState v-if="!mv.moves.length" icon="folder" title="Nothing moves yet" text="Give a module a target folder and its files move there."/>
                <table v-else class="ui-table">
                  <thead><tr><th>From</th><th>To</th><th>Module</th></tr></thead>
                  <tbody>
                    <tr v-for="m in mv.moves.slice(0, movesLimit)" :key="m.from">
                      <td class="max-w-[340px] truncate font-mono text-xs" :title="m.from">{{ m.from }}</td>
                      <td class="max-w-[340px] truncate font-mono text-xs" :class="{ 'text-red-700': collided.has(m.to) }" :title="m.to">{{ m.to }}</td>
                      <td class="text-sm">{{ restructure.name(m.module) }}</td>
                    </tr>
                  </tbody>
                </table>
                <button v-if="mv.moves.length > movesLimit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="movesLimit += 200">Show 200 more of {{ fmt(mv.moves.length - movesLimit) }}</button>
              </section>

              <!-- Export -->
              <section v-if="tab === 'export'" class="mt-4 max-w-[720px] text-sm text-neutral-700">
                <p>Carry the plan out of the app. The bundle holds the move map, a <code>git mv</code> script, a Node script that rewrites every JS, TS and Vue import naming a moved file and then moves the files, and the plan as Markdown for the decision record.</p>
                <div class="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                  <label class="ui-label" for="alias-tilde">~/ stands for</label>
                  <input id="alias-tilde" v-model="aliasTilde" class="ui-input ui-input-sm font-mono" placeholder="frontend/src" spellcheck="false">
                  <label class="ui-label" for="alias-at">@/ stands for</label>
                  <input id="alias-at" v-model="aliasAt" class="ui-input ui-input-sm font-mono" placeholder="frontend/src" spellcheck="false">
                </div>
                <p v-if="autoImportMoves" class="mt-3 text-neutral-700"><b>Nuxt auto-imports.</b> {{ fmt(autoImportMoves) }} moving files leave composables/, utils/ or components/, where Nuxt imports them without an import line. Add explicit imports or list the new folders under <code>imports.dirs</code> and <code>components.dirs</code> in nuxt.config.</p>
                <p class="mt-3 text-neutral-500">Paths built at run time (<code>readFileSync(join(__dirname, …))</code>, <code>new URL("./x", import.meta.url)</code>) are not imports; check those by hand. On this app's own hand refactor, the script rewrote 263 files for 196 moves and 769 of 770 tests passed; the one left read a file by such a path.</p>
                <p v-if="nonJs" class="mt-3 text-neutral-500">{{ fmt(nonJs) }} moving files are not JS, TS or Vue; the script moves them but their imports (packages, namespaces) need your IDE's refactoring.</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button type="button" class="ui-btn" :disabled="!mv.moves.length || mv.collisions.length > 0" :title="mv.collisions.length ? 'Resolve the path collisions first' : ''" @click="exportBundle">Save bundle…</button>
                  <button type="button" class="ui-btn ui-btn-quiet" :disabled="!mv.moves.length" @click="saveText('moves.json', moveMapJson(mv.moves, names), [FILTERS.json])">Move map (JSON)</button>
                  <button type="button" class="ui-btn ui-btn-quiet" @click="saveText('restructure-plan.md', markdown, [FILTERS.md])">Plan (Markdown)</button>
                </div>
                <p class="mt-4 text-neutral-500">Then: <code>node restructure.mjs --dry</code>, <code>node restructure.mjs</code>, run the tests, rescan. The plan stays in this workspace, so the rescan reads against it.</p>
              </section>
            </template>
          </div>
        </main>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useSandboxStore } from "~/features/sandbox/sandbox.store";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import Checkbox from "~/shared/ui/Checkbox.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import { useFileGraph } from "~/features/checks/useFileGraph";
import type { FileEdge } from "~/features/checks/checks";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useRestructureStore } from "~/features/restructure/restructure.store";
import { adjacency, evaluate, fromFolders, importSites, misfits, moves, place, pulls, type PlanModule } from "~/features/restructure/plan";
import { gitMvScript, guessAliases, moveMapJson, planMarkdown, restructureScript } from "~/features/restructure/rewrite";
import { filePath } from "~/features/navigation/routes";
import { FILTERS, saveBundle, saveText } from "~/platform/files";
import { useStateStore } from "~/platform/state.store";

// Draw the target structure and read, as it is drawn, what it would do to
// this snapshot's imports: the design step of a restructure, which by hand
// means a spreadsheet of moves and a script run on faith.

const { data, loading, error, codeFiles, production, blindExt, edges } = useFileGraph();
const workspaces = useWorkspacesStore();
const restructure = useRestructureStore();
const stateStore = useStateStore();
watch([() => workspaces.active?.id, () => stateStore.hydrated], ([id]) => { if (id) restructure.load(id); }, { immediate: true });
const plan = computed(() => restructure.plan);
const focus = ref<string | null>(null);

// Where every file goes, and what that does.
const placement = computed(() => place(plan.value, codeFiles.value, data.value.tests));
const order = computed(() => (plan.value.ordered ? plan.value.modules.map(m => m.id) : undefined));
const ev = computed(() => evaluate(placement.value.of, edges.value, production.value, order.value));
const today = computed(() => {
  const of = new Map<string, string>();
  // A file the scan gave no component (an unparsed type) counts in its folder.
  for (const f of production.value) of.set(f, data.value.component.get(f) || f.slice(0, f.lastIndexOf("/")));
  return evaluate(of, edges.value, production.value);
});
const adj = computed(() => adjacency(edges.value.filter(e => production.value.has(e.from) && production.value.has(e.to))));
const misfitList = computed(() => misfits(placement.value.of, production.value, adj.value.out, adj.value.into));
const mv = computed(() => moves(plan.value, placement.value.of));
const collided = computed(() => new Set(mv.value.collisions.map(c => c.to)));
const sites = computed(() => importSites(mv.value.moves, edges.value));
const placedCount = computed(() => [...production.value].filter(f => placement.value.of.has(f)).length);
const names = computed(() => new Map(plan.value.modules.map(m => [m.id, m.name])));
const mod = (id: string) => ev.value.modules.get(id) ?? { files: 0, internal: 0, external: 0, cohesion: 1 };
const handCount = (m: PlanModule) => m.files.filter(f => production.value.has(f)).length;
const inTangles = (t: string[][]) => t.reduce((n, x) => n + x.length, 0);

type Tab = "problems" | "unplaced" | "misfits" | "moves" | "export";
const tab = ref<Tab>("problems");
const openPair = ref<string | null>(null);
const TABS: Array<{ id: Tab; label: string; count: () => number | null }> = [
  { id: "problems", label: "Problems", count: () => ev.value.mutual.length + ev.value.tangles.length + (plan.value.ordered ? ev.value.upward.length : 0) },
  { id: "unplaced", label: "Unplaced", count: () => placement.value.unplaced.length },
  { id: "misfits", label: "Misfits", count: () => misfitList.value.length },
  { id: "moves", label: "Moves", count: () => mv.value.moves.length },
  { id: "export", label: "Export", count: () => null },
];

const scorecard = computed(() => [
  { label: "Imports crossing a module edge", why: "File imports whose two ends sit in different modules", today: today.value.crossing, plan: ev.value.crossing, bad: false },
  { label: "Module pairs that import each other", why: "Two modules each importing the other: one module in two places", today: today.value.mutual.length, plan: ev.value.mutual.length, bad: ev.value.mutual.length > 0, tab: "problems" as Tab },
  { label: "Modules caught in cycles", why: "Modules in a strongly connected set", today: inTangles(today.value.tangles), plan: inTangles(ev.value.tangles), bad: ev.value.tangles.length > 0, tab: "problems" as Tab },
  ...(plan.value.ordered ? [{ label: "Imports pointing up the order", why: "Imports from a module into one listed above it", today: null, plan: ev.value.upward.length, bad: ev.value.upward.length > 0, tab: "problems" as Tab }] : []),
  { label: "Files no module takes", why: "Production code files outside every module", today: null, plan: placement.value.unplaced.length, bad: placement.value.unplaced.length > 0, tab: "unplaced" as Tab },
  { label: "Files two modules claim", why: "Matched by more than one module's patterns; the first module in the list wins", today: null, plan: placement.value.overlaps.length, bad: false },
  { label: "Files more tied to another module", why: "More imports either way with another module than with their own", today: null, plan: misfitList.value.length, bad: false, tab: "misfits" as Tab },
  { label: "Files that move", why: "Files whose module has a target folder they are not already in", today: null, plan: mv.value.moves.length, bad: false, tab: "moves" as Tab },
  { label: "Import lines to rewrite", why: `Import statements naming a moved file, across ${sites.value.files} files (including moved files' own relative imports)`, today: null, plan: sites.value.sites, bad: false, tab: "export" as Tab },
  { label: "Target paths taken twice", why: "Two files that would land on the same path", today: null, plan: mv.value.collisions.length, bad: mv.value.collisions.length > 0, tab: "moves" as Tab },
]);

// Starting points.
const seedRoot = ref("");
const dirOptions = computed(() => {
  const dirs = new Set<string>();
  for (const f of codeFiles.value) { const p = f.split("/"); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join("/")); }
  return [...dirs].sort();
});
function seedFolders() {
  const ms = fromFolders(seedRoot.value.trim(), codeFiles.value);
  if (ms.length) restructure.set(ms);
}
function addEmpty() { focus.value = restructure.add({ name: `Module ${plan.value.modules.length + 1}` }); }
function confirmClear() { if (window.confirm("Clear the whole plan? This cannot be undone.")) restructure.clear(); }

// Placement.
const bestPull = (f: string) => pulls(f, placement.value.of, adj.value.out, adj.value.into)[0];
function onPlace(file: string, module: string) { restructure.place([file], module); }
const picked = ref(new Set<string>());
const pickTarget = ref("");
const unplacedLimit = ref(100);
const movesLimit = ref(200);
const allPicked = computed(() => placement.value.unplaced.length > 0 && placement.value.unplaced.every(f => picked.value.has(f)));
function pickAll() { picked.value = allPicked.value ? new Set() : new Set(placement.value.unplaced); }
function togglePick(f: string) { const s = new Set(picked.value); s.has(f) ? s.delete(f) : s.add(f); picked.value = s; }
function placePicked() { restructure.place([...picked.value], pickTarget.value); picked.value = new Set(); }
function newFromPicked() { focus.value = restructure.add({ name: `Module ${plan.value.modules.length + 1}`, files: [...picked.value] }); picked.value = new Set(); }

// The plan as Sandbox moves: every placed file whose module is not its
// component moves into a component named for the module.
const sandbox = useSandboxStore();
const router = useRouter();
async function toSandbox() {
  await sandbox.load();
  const edits = [...placement.value.of]
    .filter(([f]) => production.value.has(f) && sandbox.base?.compOf.has(f))
    .map(([file, id]) => ({ kind: "move" as const, file, to: restructure.name(id) }))
    .filter(e => sandbox.base!.compOf.get(e.file) !== e.to);
  sandbox.clear();
  sandbox.addMany(edits);
  void router.push("/views/connections?sandbox=1");
}

// Export.
const guessed = computed(() => guessAliases(codeFiles.value));
const aliasTilde = ref(""), aliasAt = ref("");
watch(guessed, g => { if (!aliasTilde.value) aliasTilde.value = g["~/"] ?? ""; if (!aliasAt.value) aliasAt.value = g["@/"] ?? ""; }, { immediate: true });
const aliases = computed(() => ({ ...(aliasTilde.value.trim() ? { "~/": aliasTilde.value.trim() } : {}), ...(aliasAt.value.trim() ? { "@/": aliasAt.value.trim() } : {}) }));
const isNuxt = computed(() => data.value.files.some(f => /(^|\/)nuxt\.config\.[jt]s$/.test(f)));
const autoImportMoves = computed(() => (isNuxt.value ? mv.value.moves.filter(m => /\/(composables|utils|components)\//.test(m.from) && !/\/(composables|utils|components)\//.test(m.to)).length : 0));
const nonJs = computed(() => mv.value.moves.filter(m => !/\.(m?[jt]sx?|cjs|vue|svelte)$/.test(m.from)).length);
const markdown = computed(() => planMarkdown(plan.value, placement.value, ev.value, today.value, mv.value.moves, names.value));
async function exportBundle() {
  await saveBundle("Save the restructure bundle", [
    { name: "moves.json", text: moveMapJson(mv.value.moves, names.value) },
    { name: "git-mv.sh", text: gitMvScript(mv.value.moves) },
    { name: "restructure.mjs", text: restructureScript(mv.value.moves, aliases.value) },
    { name: "restructure-plan.md", text: markdown.value },
  ]);
}

const PALETTE = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f59f00", "#0ca678", "#d6336c", "#5c7cfa", "#74b816", "#868e96"];
const colorOf = (id: string) => PALETTE[Math.max(0, plan.value.modules.findIndex(m => m.id === id)) % PALETTE.length];
const fmt = (n: number) => n.toLocaleString("en-US");

// "Report (3 uses, 1 used by)" for a file's strongest tie.
const PullText = defineComponent({
  props: { file: { type: String, required: true } },
  setup(props) {
    return () => {
      const p = pulls(props.file, placement.value.of, adj.value.out, adj.value.into).slice(0, 2);
      if (!p.length) return h("span", { class: "text-neutral-400" }, "no imports either way");
      return h("span", {}, p.map((x, i) => [i ? h("span", { class: "text-neutral-400" }, " · ") : null, h("span", { class: i ? "text-neutral-500" : "" }, `${restructure.name(x.module)} (${[x.uses ? `uses ${x.uses}` : "", x.usedBy ? `used by ${x.usedBy}` : ""].filter(Boolean).join(", ")})`)]));
    };
  },
});

// The imports behind a dependency, with a one-click move for either end.
const Why = defineComponent({
  props: { edges: { type: Array as () => FileEdge[], required: true }, title: { type: String, required: true } },
  emits: ["place"],
  setup(props, { emit }) {
    const all = ref(false);
    return () => h("div", { class: "mt-3" }, [
      props.title ? h("div", { class: "text-sm font-medium text-neutral-800" }, `${props.title} (${props.edges.length})`) : null,
      h("table", { class: "ui-table mt-1" }, [h("tbody", {}, (all.value ? props.edges : props.edges.slice(0, 8)).map(e => {
        const from = placement.value.of.get(e.from), to = placement.value.of.get(e.to);
        return h("tr", { key: e.from + e.to }, [
          h("td", { class: "max-w-[300px]" }, h(RouterLink, { to: filePath(e.from), class: "block truncate font-mono text-xs hover:underline", title: e.from }, () => e.from)),
          h("td", { class: "max-w-[300px]" }, h(RouterLink, { to: filePath(e.to), class: "block truncate font-mono text-xs hover:underline", title: e.to }, () => e.to)),
          h("td", { class: "max-w-[200px] truncate font-mono text-xs text-neutral-600", title: e.names.join(", ") }, [e.inferred ? h("span", { class: "ui-tag mr-1 font-sans", title: "Read from the file's text" }, "text") : null, e.names.join(", ") || "—"]),
          h("td", { class: "whitespace-nowrap text-right" }, [
            to ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet", title: `Move ${e.from} into ${restructure.name(to)}`, onClick: () => emit("place", e.from, to) }, "Importer →") : null,
            from ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet", title: `Move ${e.to} into ${restructure.name(from)}`, onClick: () => emit("place", e.to, from) }, "← Imported") : null,
          ]),
        ]);
      }))]),
      props.edges.length > 8 ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1", onClick: () => { all.value = !all.value; } }, all.value ? "Show fewer" : `Show all ${props.edges.length}`) : null,
    ]);
  },
});
</script>
