<template>
  <ViewWorkspaceLayout
    keep-into="draft"
    title="Build a lens"
    :nodes-count="studio.coverage.value.total"
    :connections-count="undefined"
    :stats-labels="{ nodes: 'Components' }"
    :tabs="TABS"
    active-tab="focus"
    v-model:is-sidebar-open="panelOpen"
    sidebar-width="380px"
  >
    <template #title>
      <span class="flex items-center gap-2">
        <span>Build a lens</span>
        <input
          :value="draft.dimension"
          type="text"
          class="ui-input ui-input-sm w-36 font-medium"
          aria-label="Lens name"
          placeholder="Domain"
          @change="draft.setDimension(($event.target as HTMLInputElement).value)"
        />
      </span>
    </template>

    <template #switches>
      <!-- What this lens is currently cut by, stated rather than offered:
           changing it is a proposal, and a proposal says what it would do
           before it does it. -->
      <span class="flex items-baseline gap-1.5 text-sm">
        <span class="text-neutral-500">Cut by</span>
        <span class="font-medium text-neutral-800">{{ studio.way.value.label }}</span>
      </span>
    </template>

    <template #actions>
      <button type="button" class="ui-btn ui-btn-sm" :disabled="busy" :title="firstPassTitle" @click="openPropose">
        <Icon icon="waypoints" :size="13" class="text-neutral-500"/>
        <span class="hidden min-[1440px]:inline">Propose a lens cut</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon" :disabled="!draft.canUndo" title="Undo (⌘Z)" aria-label="Undo" @click="draft.undo()">
        <Icon icon="rotate" :size="13"/>
      </button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="draft.groups.length === 0" :title="`Save ${draft.dimension || 'this lens'}`" @click="save">
        <Icon icon="check" :size="13"/><span>Save</span>
      </button>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Throw the draft away" @click="discard">Discard</button>
    </template>

    <template #visualizer>
      <div class="flex min-h-0 grow">
        <GroupsRail
          :groups="draft.groups"
          :active="activeKey"
          :color-of="studio.colorOf"
          :coverage="studio.coverage.value"
          :quality="studio.quality.value"
          :cut="draft.cut"
          @activate="activate"
          @new-group="newGroup()"
          :renaming="renaming"
          @rename="startRename"
          @rename-done="finishRename"
          @drop="dropGroup"
          @merge="mergeGroups"
        />
        <div class="relative min-w-0 grow">
          <LoadingState v-if="studio.loading.value" text="Reading the codebase"/>
          <EmptyState v-else-if="studio.coverage.value.total === 0" title="Nothing to sort" text="This snapshot has no components." icon="layers"/>
          <ConnectionsGraph
            v-else
            ref="graphRef"
            :nodes="studio.nodes.value"
            :edges="studio.edges.value"
            :directed="true"
            :selected-id="focusedId"
            :selected-pair="null"
            :multi="multi"
            :hovered="null"
            :suggestions="EMPTY_LIST"
            :hulls="studio.hulls.value"
            :cycle-keys="EMPTY_SET"
            :cycle-nodes="EMPTY_SET"
            :badges="EMPTY_MAP"
            :highlight="highlight"
            @select="onSelect"
            @lasso="onLasso"
            @drop-in-hull="onDropInHull"
          />

          <!-- How to pick by hand, said where the hand already is. -->
          <p v-if="!multi.size && !studio.loading.value && studio.coverage.value.total" class="pointer-events-none absolute right-3 top-3 rounded bg-surface/80 px-2 py-1 text-xs text-neutral-500 backdrop-blur-sm">
            Shift-drag to select an area · shift-click to add one · drag a node onto a group
          </p>
          <SelectionBar
            v-if="multi.size"
            :count="multi.size"
            :verb="movingHome ? 'Move to' : 'Put into'"
            :home="movingHome"
            :groups="railGroups"
            :selected="Array.from(multi)"
            @assign="assignSelection"
            @new-group="newGroupFromSelection"
            @new-query="newGroupFromQuery"
            @park="parkSelection"
            @clear="clearSelection"
          />
        </div>
      </div>
    </template>

    <!-- The panel follows what is in focus, and nothing else. It was tabbed
         by mode while its contents were decided by selection, which is the
         pair DESIGN.md forbids; the rail meanwhile had grown a second copy of
         this panel inside a list row. One question answered in one place. -->
    <template #tab-focus>
      <template v-if="activeGroup">
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 shrink-0 rounded-[3px]" :style="{ backgroundColor: studio.colorOf(activeGroup.key) }"></span>
          <h3 class="min-w-0 truncate text-base font-semibold text-neutral-900">{{ activeGroup.name }}</h3>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto shrink-0" title="Back to the queue (Esc)" @click="activeKey = null">
            <Icon icon="x" :size="12"/><span>Close</span>
          </button>
        </div>

        <GroupInside
          :group="activeGroup"
          :color="studio.colorOf(activeGroup.key)"
          :cohesion="studio.quality.value.groups.find(q => q.key === activeGroup!.key) ?? null"
          :others="draft.groups.filter(g => g.key !== activeGroup!.key).map(g => ({ key: g.key, name: g.name, color: studio.colorOf(g.key) }))"
          :sizes="groupSizes"
          :file-index="studio.filesOf"
          :lines="studio.linesOf"
          :quality="activeMembers"
          :claims="activeClaims"
          @reclaim="key => { const g = draft.groupByKey(key); if (g?.query) applyQuery(key, g.query, 'live'); }"
          :grain="draft.grain"
          :tears="namedTears"
          :describe="() => draft.describe(activeGroup!.key)"
          @query="setGroupQuery"
          @mode="setGroupMode"
          @refuse="id => activeGroup && draft.refuse([id], activeGroup.key)"
          @confirm="key => draft.confirmStanding(key)"
          @focus="focus"
          @move="(component, toKey) => { draft.assign([component], toKey); studio.noteTouched(toKey); }"
          @split="splitPart"
          @rejoin="component => activeGroup && draft.move(component, null, activeGroup.key)"
        />

        <!-- What would go with it, beside what is already in it: the same
             group, so the same panel. -->
        <NearbyPanel
          v-if="activeGroup.parts.length"
          :name="activeGroup.name"
          :bands="groupBands"
          @add="ids => { if (activeGroup) { draft.assign(ids, activeGroup.key); studio.noteTouched(activeGroup.key); } }"
          @refuse="id => activeGroup && draft.refuse([id], activeGroup.key)"
          @focus="focus"
        />
      </template>

      <PilePanel
        v-else-if="openPile"
        :title="openPile.title"
        :ids="openPile.ids"
        :empty="openPile.empty"
        @unpark="draft.unpark($event)"
        @focus="focus"
      />

      <QuestionCard
        v-else
        :hint="`Asking ${studio.way.value.question} of the biggest thing still unsorted, ${studio.fitness.value.why}.`"
        :loading="studio.loading.value || studio.coverage.value.total === 0"
        :bundle="currentQuestion"
        :guesses="questionGuesses"
        :later-count="draft.later.length"
        :queue-total="queueTotal"
        :round="draft.round"
        :up-next="studio.upNext.value"
        :can-split="studio.canSplit(currentQuestion)"
        :others="otherGroups"
        @assign="assignQuestion"
        @new-group="newGroupFromQuestion"
        @park="parkQuestion"
        @park-one="(id, p) => draft.park([id], p)"
        @focus="focus"
        @split="splitQuestion"
        @unpark-later="draft.unpark([...draft.later])"
      />
    </template>
  </ViewWorkspaceLayout>

  <ProposeSheet
    :open="proposing"
    :total="studio.coverage.value.total"
    :existing="draft.groups.length"
    :current="studio.way.value.id"
    :fitness-of="studio.fitnessFor"
    :struck="struck"
    :suggested="studio.suggestedNameReading.value"
    @strike="strikeSubject"
    @restore="restoreSubject"
    :previews="previews"
    :busy="busy"
    :repo-readings="repoReadings"
    @close="proposing = false"
    @propose="propose"
    @propose-repo="proposeRepo"
  />

</template>

<script setup lang="ts">
import { readDurable, writeDurable } from "~/utils/durable";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewWorkspaceLayout from "~/components/ViewWorkspaceLayout.vue";
import ConnectionsGraph from "~/components/connections/ConnectionsGraph.vue";
import EmptyState from "~/components/ui/common/EmptyState.vue";
import LoadingState from "~/components/ui/common/LoadingState.vue";
import Icon from "~/components/ui/common/Icon.vue";
import GroupsRail from "~/components/dimensions/GroupsRail.vue";
import QuestionCard, { type Guess } from "~/components/dimensions/QuestionCard.vue";
import GroupInside from "~/components/dimensions/GroupInside.vue";
import PilePanel from "~/components/dimensions/PilePanel.vue";
import NearbyPanel, { type CandidateBand } from "~/components/dimensions/NearbyPanel.vue";
import ProposeSheet, { type CutPreview, type RepoReading } from "~/components/dimensions/ProposeSheet.vue";
import { useCodeowners } from "~/composables/useCodeowners";
import SelectionBar from "~/components/dimensions/SelectionBar.vue";
import { useDimensionStudio } from "~/composables/useDimensionStudio";
import { useQueryWorld } from "~/composables/useQueryWorld";
import { useSuggestModel } from "~/composables/useSuggestModel";
import { isPlaceholderName, useDraftStore } from "~/stores/draft";
import { useDataStore } from "~/stores/data";
import { useGroupsStore, type GroupMode } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";
import { useScopeStore } from "~/stores/scope";
import { useWorkspacesStore } from "~/stores/workspaces";
import { presetById, type SuggestSettings } from "~/utils/suggest";
import { measureCut, measureMembers, readModularity } from "~/utils/cutQuality";
import { parseQuery, runQuery } from "~/utils/query";
import { commonName, nameForQuery, OUT_PILE, reasonFor, subjectOf, WAYS, type Bundle, type Grain, type WayId } from "~/utils/studio";
import { bondBreakdown, channelWords, type Channel } from "~/utils/bond";

/** A word, not a sentence, for the row that does not match its band. */
const CHANNEL_TAG: Record<Channel, string> = { static: "references", cochange: "co-change", kinship: "names" };

// The dimension studio. Sort asks one question at a time about the biggest
// thing still unsorted; Grow pulls one group outward; Grab takes what you
// already know. The map is the fourth way in: draw a box around anything.

const route = useRoute();
const router = useRouter();
const draft = useDraftStore();
const store = useDataStore();
const groupsStore = useGroupsStore();
const lens = useLensStore();
const scope = useScopeStore();
const workspaces = useWorkspacesStore();
const studio = useDimensionStudio();
const suggest = useSuggestModel();

// The sidebar is intake: three ways of getting components INTO groups, and
// never a group itself. A group is a place in the rail, not a mode over here,
// which is what made a tab marked "Sort" show a group editor.
// One tab means no tab bar: the panel is titled by what it is showing.
const TABS = [{ id: "focus", label: "Focus" }];

const EMPTY_SET = new Set<string>();
const EMPTY_LIST: never[] = [];
const EMPTY_MAP = new Map<string, number>();

const panelOpen = ref(true);
const activeKey = ref<string | null>(null);
const focusedId = ref<string | null>(null);
const pinned = ref<string | null>(null);
const multi = ref(new Set<string>());
const busy = ref(false);
const graphRef = ref<{ focusNode?: (id: string) => void } | null>(null);

const workspaceKey = computed(() => workspaces.active?.id ?? store.datasetKey ?? "default");
watch(workspaceKey, k => draft.load(k), { immediate: true });

onMounted(async () => {
  const build = typeof route.query.build === "string" ? route.query.build : "";
  if (build && build !== "new") draft.fromDimension(build);
  else if (!draft.isOpen) draft.startNew("Domain");
  await studio.load();
  studio.setWay(rememberedWay());
  // A dimension opened for editing has already said what it is made of; a new
  // one takes it from the way it is being cut by.
  draft.followWay(studio.way.value);
  if (!activeKey.value && draft.groups.length) activeKey.value = draft.groups[0].key;
  // Sent here by a view too big to draw ungrouped: open on the proposal, so
  // the first cut is one choice away rather than a room to learn.
  if (route.query.propose && draft.groups.length === 0) openPropose();
});

// A group kept from the query bar opens straight away: the bar lives in the
// toolbar and cannot reach this page's state, so it leaves the key behind and
// this takes you there.
watch(() => draft.justMade, key => {
  if (!key) return;
  activeKey.value = key;
  studio.noteTouched(key);
  draft.justMade = null;
});

/** The way this dimension was last built by, or the one its cut implies. */
const wayKey = () => `archstats.studio.way.${workspaceKey.value}.${draft.dimension}`;
function rememberedWay(): WayId {
  try {
    const saved = readDurable(workspaceKey.value, `studio.way.${draft.dimension}`, wayKey());
    if (saved && WAYS.some(w => w.id === saved)) return saved as WayId;
  } catch {}
  // A cut across the codebase is a job-shaped question and a cut down it is
  // a subject-shaped one; which of the two name readings suits this codebase
  // is a fact about it, so the detector still offers the opening position.
  if (draft.cut === "horizontal") return "role";
  if (draft.cut === "vertical") return studio.suggestedNameReading.value;
  return "blend";
}
watch(() => store.datasetKey, () => studio.load());

// ── What is being asked ────────────────────────────────────────────────
const currentQuestion = computed<Bundle | null>(() => {
  const id = pinned.value;
  if (id) {
    const style = studio.style.value;
    const segs = style.split(id);
    return { key: "pinned:" + id, members: [id], prefix: style.join(segs.slice(0, -1)), name: segs.at(-1) ?? id, reason: "you picked it on the map", lines: studio.linesOf(id), sep: style.sep, depth: Math.max(0, segs.length - 1) };
  }
  return studio.question.value;
});
const queueTotal = computed(() => studio.bundles.value.length + (pinned.value ? 1 : 0));

/** Where the question could go: the guess, then the runners-up. */
const questionGuesses = computed<Guess[]>(() => {
  const q = currentQuestion.value;
  if (!q) return [];
  return studio.guessesFor(q.members).map(g => ({
    key: g.group.key,
    name: g.group.name,
    color: studio.colorOf(g.group.key),
    reason: channelWords(g.channel),
    detail: g.detail,
    score: g.score,
    hotkey: hotkeyFor(g.group.key),
  }));
});
function hotkeyFor(key: string): string {
  const i = draft.groups.findIndex(g => g.key === key);
  return i >= 0 && i < 9 ? String(i + 1) : "";
}

const activeGroup = computed(() => (activeKey.value ? draft.groupByKey(activeKey.value) ?? null : null));
/** When everything picked already sits in one group, this is a move. */
const movingHome = computed(() => {
  const homes = new Set(Array.from(multi.value).map(id => draft.groups.find(g => g.parts.some(p => p.component === id))?.name).filter(Boolean));
  return homes.size === 1 ? (Array.from(homes)[0] as string) : null;
});
const railGroups = computed(() => draft.groups.map(g => ({ key: g.key, name: g.name, color: studio.colorOf(g.key), hotkey: hotkeyFor(g.key) || null })));
/** Everything that leans towards the open group, banded by how hard. */
const groupBands = computed<CandidateBand[]>(() => {
  const group = activeGroup.value;
  if (!group) return [];
  const leaning = studio.leaningFor(group.key);
  return studio.bandsFor(group.key).map(b => {
    // Whatever most of the band is held by gets said once in its header; a row
    // that differs is the only one that needs a word of its own.
    const tally = new Map<string, number>();
    for (const bond of b.items) tally.set(bond.channel, (tally.get(bond.channel) ?? 0) + 1);
    const common = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "kinship";
    return {
      id: b.id,
      label: b.label,
      hint: b.hint,
      reason: channelWords(common as Channel),
      items: b.items.map(bond => ({
        id: bond.id,
        label: bond.id,
        reason: channelWords(bond.channel),
        tag: leaning.get(bond.id) ? `wants ${leaning.get(bond.id)!.name}` : CHANNEL_TAG[bond.channel],
        rival: leaning.get(bond.id)?.name ?? null,
        detail: bondBreakdown(bond),
        share: Math.max(6, bond.score),
        via: bond.via,
      })),
    };
  });
});

/**
 * Every member of the open group measured against it, on the same graph the
 * group's own standing is measured on. The sentence at the top is an average
 * and averages hide the member that is only filed here.
 */
const activeMembers = computed(() => {
  if (!activeGroup.value) return [];
  const groups = draft.groups.map(g => ({ key: g.key, name: g.name, members: g.parts.map(p => p.component) }));
  return measureMembers(activeGroup.value.key, groups, studio.qualityEdges.value);
});

/** How many each group holds, so a move menu can say where things are going. */
const groupSizes = computed(() => new Map(draft.groups.map(g => [g.key, g.parts.length])));

/**
 * What the engine found in the open group, with the rival named rather than
 * keyed: a group key is an internal handle and has no business in a sentence.
 */
const namedTears = computed(() => {
  const found = studio.tearsFor(activeGroup.value?.parts.map(p => p.component) ?? []);
  const named = new Map<string, { leaving: string[]; rival: string; moved: number }>();
  for (const [id, t] of found) named.set(id, { leaving: t.leaving, rival: draft.names.get(t.rival) ?? t.rival, moved: t.moved });
  return named;
});

/**
 * Part of a component leaves; the rest stays where it was. The last piece of
 * the old group panel's plumbing that is still a page-level act, because it
 * can create a group.
 */
function splitPart(component: string, files: string[], toKey: string | null) {
  const to = toKey ?? draft.addGroup(commonName(files, studio.style.value));
  draft.move(component, files, to);
  studio.noteTouched(to);
}

/** Every group that is not already one of the shown guesses. */
const otherGroups = computed<Guess[]>(() => {
  const shown = new Set(questionGuesses.value.map(g => g.key));
  return draft.groups
    .filter(g => !shown.has(g.key))
    .map(g => ({ key: g.key, name: g.name, color: studio.colorOf(g.key), reason: "", detail: "", score: 0, hotkey: hotkeyFor(g.key) }));
});

/**
 * Saying what a group holds, and then making it hold that.
 *
 * A live group is its query, so the text and the membership are one act.
 */
const { world: queryWorld, ready: loadQueryNumbers } = useQueryWorld();

function setGroupQuery(key: string, query: string) {
  const mode = draft.groupByKey(key)?.mode ?? "live";
  draft.setQuery(key, query, mode);
  applyQuery(key, query, mode);
}

function setGroupMode(key: string, mode: GroupMode) {
  const g = draft.groupByKey(key);
  if (!g?.query) return;
  draft.setQuery(key, g.query, mode);
  // Switching to Members freezes what it holds now; switching to Query hands
  // the membership back to the pattern.
  applyQuery(key, g.query, mode);
}

function applyQuery(key: string, query: string, mode: GroupMode) {
  if (mode !== "live" || !query.trim()) return;
  loadQueryNumbers();
  const found = runQuery(parseQuery(query), queryWorld.value);
  draft.setQueryMembers(key, found.components);
  studio.noteTouched(key);
}

/**
 * What the open group's query names that something else is holding.
 *
 * A cut gives each component one home, so the group saved last wins an
 * overlap and the other is emptied without a word. The number is the word.
 */
const activeClaims = computed(() => {
  const g = activeGroup.value;
  if (!g?.query || g.mode === "fixed") return 0;
  const held = new Set(g.parts.map(p => p.component));
  return runQuery(parseQuery(g.query), queryWorld.value).components.filter(c => !held.has(c)).length;
});

/** What an opened pile holds, shown in the rail where the pile lives. */
const openPile = computed(() =>
  activeKey.value === OUT_PILE
    ? { title: "Not in this cut", ids: draft.out, empty: "Nothing dropped. Press X on a question with no place in this dimension." }
    : null,
);

/** What the map lights: a query being typed, an open group, or the question. */
const highlight = computed(() => {
  if (multi.value.size) return null;
  // A query said "35 components" and lit none of them, so the only way to
  // see what you were about to keep was to keep it. While one is being
  // asked it outranks everything else: it is the question in play.
  const asked = scope.queryMatches;
  if (asked) return { key: "query", members: Array.from(asked.components) };
  // An open group lights its own gravity field: itself and everything that
  // leans its way, so relevance is read on the map, not just in a list.
  const group = activeGroup.value;
  if (group) {
    return {
      key: group.key,
      members: [...group.parts.map(p => p.component), ...groupBands.value.flatMap(b => b.items.map(i => i.id))],
    };
  }
  const q = currentQuestion.value;
  return q ? { key: q.key, members: q.members } : null;
});

// ── Answering ──────────────────────────────────────────────────────────
function activate(key: string) {
  activeKey.value = activeKey.value === key ? null : key;
  renaming.value = null;
  if (activeKey.value && activeKey.value !== OUT_PILE) studio.noteTouched(activeKey.value);
}
const renaming = ref<string | null>(null);
function startRename(key: string) {
  renaming.value = key;
}
/** The row's own field committed or gave up; either way it stops being one. */
function finishRename(key: string, name: string) {
  renaming.value = null;
  draft.rename(key, name);
}
function dropGroup(key: string) {
  draft.dropGroup(key);
  if (activeKey.value === key) activeKey.value = null;
}
function assignQuestion(key: string) {
  const q = currentQuestion.value;
  if (!q) return;
  draft.assign(q.members, key);
  studio.noteTouched(key);
  pinned.value = null;
}
/** An empty group, from nothing. The question stays where it is. */
function newGroup(name?: string) {
  const key = draft.addGroup(name || "New group");
  activeKey.value = key;
  renaming.value = key;
  studio.noteTouched(key);
  return key;
}
/** A group made out of the question: the bundle goes straight into it. */
function newGroupFromQuestion() {
  const q = currentQuestion.value;
  const key = draft.addGroup(q?.name || "New group");
  activeKey.value = null;
  studio.noteTouched(key);
  if (q) { draft.assign(q.members, key); pinned.value = null; }
}
function parkQuestion(pile: "later" | "out") {
  const q = currentQuestion.value;
  if (!q) return;
  draft.park(q.members, pile);
  pinned.value = null;
}
/** Taking always lands somewhere: the open group, or a new one named for it. */
/**
 * The tree fills the same basket the lasso does. One selection, two ways to
 * build it, and one bar that acts on it — so a set assembled across several
 * searches can start a group exactly like a box drawn on the map.
 */

function splitQuestion() {
  const q = currentQuestion.value;
  if (q && !pinned.value) studio.splitHere(q);
}
/**
 * Choosing the grain by hand overrules the way, and choosing what the way
 * already wants hands it back: an override you cannot release is a setting
 * that silently outlives the reason for it.
 */
/**
 * Fold several groups into one. Undoable in a step like every other edit,
 * and the merged group becomes the open one, because it is what you were
 * just working on.
 */
function mergeGroups(keys: string[], into: string) {
  draft.merge(keys, into);
  activeKey.value = into;
  studio.noteTouched(into);
}

function pickGrain(grain: Grain) {
  draft.setGrain(grain, grain !== studio.way.value.grain);
}

/**
 * Changing the way re-cuts the queue at once. The dimension's name follows
 * too, but only while it is still the one the studio proposed: a name you
 * typed is yours.
 */
function pickWay(id: WayId) {
  const offered = studio.way.value.dimension;
  studio.setWay(id);
  if (!draft.dimension || draft.dimension === offered) draft.setDimension(studio.way.value.dimension);
  // The saved dimension records the cut, and the studio remembers the way, so
  // reopening this dimension asks the same question it was built with.
  draft.cut = studio.way.value.cut;
  // A layer is the one question a package can answer two ways at once, so it
  // arrives able to divide one — unless work or an explicit choice says not.
  draft.followWay(studio.way.value);
  writeDurable(workspaceKey.value, `studio.way.${draft.dimension}`, wayKey(), id);
  pinned.value = null;
  clearSelection();
}
function focus(id: string) {
  focusedId.value = id;
  nextTick(() => graphRef.value?.focusNode?.(id));
}

// ── Picking by hand ────────────────────────────────────────────────────
function onSelect(id: string | null, mods: { shift: boolean; meta: boolean }) {
  if (id && (mods.shift || mods.meta)) {
    const next = new Set(multi.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    multi.value = next;
    return;
  }
  focusedId.value = id;
  if (!id) { multi.value = new Set(); pinned.value = null; return; }
  // An unplaced component clicked on the map becomes the question; one that is
  // already placed becomes a selection of one, so the bar can move it.
  const free = studio.unplaced.value.includes(id);
  pinned.value = free ? id : null;
  multi.value = free ? new Set() : new Set([id]);
}
function onLasso(ids: string[]) {
  if (!ids.length) return;
  multi.value = new Set([...multi.value, ...ids]);
  pinned.value = null;
}
function onDropInHull(payload: { id: string; key: string | null }) {
  if (!payload.key) return;
  const ids = multi.value.has(payload.id) ? Array.from(multi.value) : [payload.id];
  draft.assign(ids, payload.key);
  studio.noteTouched(payload.key);
  clearSelection();
}
function clearSelection() { multi.value = new Set(); }
function assignSelection(key: string) {
  draft.assign(Array.from(multi.value), key);
  studio.noteTouched(key);
  activeKey.value = key;
  clearSelection();
}
/**
 * A group that says what it holds, from the same selection.
 *
 * The members go in as picked so the map shows the result immediately; the
 * query rides along as what was meant, and the group editor decides which of
 * the two the saved group will be.
 */
function newGroupFromQuery(query: string) {
  const ids = Array.from(multi.value);
  const key = draft.addGroup(nameForQuery(query, ids, studio.style.value));
  draft.assign(ids, key);
  draft.setQuery(key, query, "live");
  studio.noteTouched(key);
  activeKey.value = key;
  clearSelection();
}
function newGroupFromSelection() {
  const ids = Array.from(multi.value);
  const key = draft.addGroup(commonName(ids, studio.style.value));
  draft.assign(ids, key);
  studio.noteTouched(key);
  activeKey.value = key;
  clearSelection();
}
function parkSelection(pile: "later" | "out") {
  draft.park(Array.from(multi.value), pile);
  clearSelection();
}

// ── The optional first pass ────────────────────────────────────────────
const firstPassTitle = "Measure every way of cutting this codebase, then take one. It only proposes a group it can stand behind, so expect it to leave a good deal for you.";
const presetLabel = computed(() => presetById(studio.way.value.preset).label);
/**
 * A first pass runs the preset that matches the way, not a remembered one —
 * but it is made of whatever the draft is made of. The grain control is the
 * architect's answer to "may a component be divided", and a pass that ignores
 * it answers a question nobody asked.
 */
function passSettings(): SuggestSettings {
  return {
    ...presetById(studio.way.value.preset).settings,
    splitFiles: draft.grain === "file",
    dimension: draft.dimension || studio.way.value.dimension,
  };
}
// ── Proposing a cut ────────────────────────────────────────────────────
//
// Every way is run before any is chosen, so the choice is made against what
// each would actually produce rather than against its name. The engine costs
// tens of milliseconds per way on 454 components; the round trip of applying
// one, reading the rail and undoing it costs a great deal more.

const proposing = ref(false);
const previews = ref(new Map<WayId, CutPreview>());

/** The readings that go on a vocabulary, and so can have words taken out. */
const READS_NAMES = new Set<WayId>(["subject", "role"]);

/** Words taken out of that vocabulary by hand, newest last. */
const struck = ref<string[]>([]);

function settingsFor(way: (typeof WAYS)[number]): SuggestSettings {
  return {
    ...presetById(way.preset).settings,
    dimension: draft.dimension || way.dimension,
    // Both name-readings offer a vocabulary, so both can have a word taken
    // out of it; nothing else reads names at all.
    ...(READS_NAMES.has(way.id) ? { struckSubjects: struck.value } : {}),
  };
}

async function measureWay(way: (typeof WAYS)[number]) {
  const taken = new Set(groupsStore.groups.filter(g => g.dimension !== draft.dimension).map(g => g.name));
  const out = await suggest.run(settingsFor(way), () => true, taken, "");
  const groups = out.map(x => ({ key: x.key, name: x.name, members: x.components }));
  const measured = measureCut(groups, studio.qualityEdges.value, studio.coverage.value.total);
  const reading = readModularity(measured.modularity, groups.length);
  previews.value = new Map(previews.value).set(way.id, {
    groups: groups.length,
    placed: measured.placed,
    kept: measured.kept,
    modularity: measured.modularity,
    biggest: measured.biggest,
    // Largest first, so the bar reads as a shape rather than as noise.
    sizes: groups
      .map(g => ({ name: g.name, size: g.members.length, named: !isPlaceholderName(g.name), word: subjectOf(g.key) ?? undefined }))
      .sort((a, b) => b.size - a.size),
    tone: reading.tone,
  });
}

/** The component count the previews were measured on; a different one measures again. */
let measuredOn = -1;
async function measureAll() {
  measuredOn = studio.coverage.value.total;
  previews.value = new Map();
  for (const way of WAYS) {
    if (!studio.fitnessFor(way).ok) continue;
    await measureWay(way);
  }
}
async function openPropose() {
  proposing.value = true;
  if (previews.value.size && measuredOn === studio.coverage.value.total) return;
  await measureAll();
}
// Opened from a link on a cold start, the sheet can be up before the snapshot
// is: measured on nothing, every reading said "0 groups" and kept saying it.
watch(() => studio.coverage.value.total, total => { if (proposing.value && total !== measuredOn) void measureAll(); });

/** Taking a word out re-measures the domain cut, and only that one. */
async function remeasureNameReadings() {
  for (const way of WAYS.filter(w => READS_NAMES.has(w.id))) {
    if (studio.fitnessFor(way).ok) await measureWay(way);
  }
}
async function strikeSubject(word: string) {
  if (struck.value.includes(word)) return;
  struck.value = [...struck.value, word];
  await remeasureNameReadings();
}
async function restoreSubject(word: string) {
  struck.value = struck.value.filter(w => w !== word);
  await remeasureNameReadings();
}

/** Take one: it sets the way, the cut and the grain, then fills the draft. */
async function propose(id: WayId, grain: Grain) {
  busy.value = true;
  try {
    pickWay(id);
    pickGrain(grain);
    await nextTick();
    const settings = { ...passSettings(), ...(READS_NAMES.has(id) ? { struckSubjects: struck.value } : {}) };
    const taken = new Set(groupsStore.groups.filter(g => g.dimension !== draft.dimension).map(g => g.name));
    const out = await suggest.run(settings, () => true, taken, "");
    draft.fromSuggestions(draft.dimension || settings.dimension, out, settings.cut);
    activeKey.value = null;
    proposing.value = false;
  } finally {
    busy.value = false;
  }
}

// ── From the repository ────────────────────────────────────────────────
// What the repository declares about itself, read as it stands: no measuring
// of the code decides these groups, so they arrive proposed, never decided.
const codeowners = useCodeowners();
function previewOf(suggestions: Array<{ key: string; name: string; components: string[] }>): CutPreview {
  const groups = suggestions.map(x => ({ key: x.key, name: x.name, members: x.components }));
  const measured = measureCut(groups, studio.qualityEdges.value, studio.coverage.value.total);
  return {
    groups: groups.length, placed: measured.placed, kept: measured.kept, modularity: measured.modularity, biggest: measured.biggest,
    sizes: groups.map(g => ({ name: g.name, size: g.members.length, named: true })).sort((a, b) => b.size - a.size),
    tone: readModularity(measured.modularity, groups.length).tone,
  };
}
const repoReadings = computed<RepoReading[]>(() => {
  const why = codeowners.reason.value;
  const sug = codeowners.suggestions.value;
  const unowned = codeowners.owned.value?.unowned.length ?? 0;
  const path = codeowners.found.value?.path ?? "CODEOWNERS";
  const notes = [
    codeowners.singleRule.value ? `One rule (${codeowners.parsed.value?.rules[0].pattern}) owns every file: one group at 100%, which says who reviews, not how the code divides.` : "",
    unowned ? `${unowned.toLocaleString("en-US")} files match no rule and stay unplaced; About this snapshot lists them.` : "",
  ].filter(Boolean).join(" ");
  return [{
    id: "codeowners",
    label: "Declared owners",
    hint: `${path}: one group per owner set, divided by files where owners share a component`,
    icon: "users",
    ok: !why && sug.length > 0,
    why: why ?? (sug.length ? undefined : `${path} owns no file in this snapshot.`),
    preview: !why && sug.length ? previewOf(sug) : null,
    note: notes || undefined,
  }];
});
async function proposeRepo(id: string) {
  if (id !== "codeowners") return;
  busy.value = true;
  try {
    // Owners divide components by file, so the lens is made of files.
    draft.setGrain("file", true);
    if (!draft.dimension || draft.dimension === studio.way.value.dimension) draft.setDimension("Owners");
    draft.fromSuggestions(draft.dimension || "Owners", codeowners.suggestions.value, "free");
    activeKey.value = null;
    proposing.value = false;
  } finally {
    busy.value = false;
  }
}

function save() {
  const name = draft.dimension;
  draft.commit();
  lens.set(name);
  router.push("/views/connections");
}
function discard() {
  draft.clear();
  draft.startNew("Domain");
  activeKey.value = null;
  clearSelection();
}

// ── One hand on the keyboard ───────────────────────────────────────────
function onKey(event: KeyboardEvent) {
  const el = event.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); draft.undo(); return; }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  const selecting = multi.value.size > 0;

  // Escape leaves the open group and hands the panel back to the queue,
  // which is the only place a mode switch still exists.
  if (key === "Escape" && activeKey.value && !selecting) {
    event.preventDefault();
    activeKey.value = null;
    return;
  }
  if (key >= "1" && key <= "9") {
    const group = draft.groups[Number(key) - 1];
    if (!group) return;
    if (selecting) { event.preventDefault(); assignSelection(group.key); }
    else if (currentQuestion.value) { event.preventDefault(); assignQuestion(group.key); }
    return;
  }
  switch (key.toLowerCase()) {
    case "escape":
      event.preventDefault();
      if (selecting) clearSelection();
      else if (activeKey.value) activeKey.value = null;
      break;
    case "enter": if (!selecting && questionGuesses.value.length) { event.preventDefault(); assignQuestion(questionGuesses.value[0].key); } break;
    case "n": event.preventDefault(); if (selecting) newGroupFromSelection(); else newGroup(); break;
    case "s": if (!selecting) { event.preventDefault(); splitQuestion(); } break;
    case "l": event.preventDefault(); if (selecting) parkSelection("later"); else parkQuestion("later"); break;
    case "x": event.preventDefault(); if (selecting) parkSelection("out"); else parkQuestion("out"); break;
    case "u": event.preventDefault(); draft.undo(); break;
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>
