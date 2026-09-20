<template>
  <aside class="flex w-80 shrink-0 flex-col bg-ground hairline-r">
    <!-- Where this stands, said once.
         Coverage was being stated five ways at once — a fraction, a bar, a
         confirmed/proposed/left sentence, a split count and a percentage of
         the code — and quality three ways under it. Nine lines for two facts,
         before a single group appeared. What survives is the number, the
         shape of it, and the two readings a fraction of components hides:
         how much of the CODE is placed, and how much still sits outside. -->
    <div class="flex flex-col gap-2 px-3 pb-2.5 pt-3 hairline-b">
      <div class="flex items-baseline gap-2">
        <span class="ui-section-title">Coverage</span>
        <span class="ml-auto font-mono text-sm tabular-nums text-neutral-700">{{ coverage.placed }}<span class="text-neutral-400">/{{ coverage.total }}</span></span>
      </div>
      <span
        class="flex h-1.5 overflow-hidden rounded-full bg-neutral-200"
        :title="`${coverage.confirmed} confirmed · ${coverage.proposed} proposed · ${coverage.unplaced} left${coverage.split ? ` · ${coverage.split} divided between groups` : ''}`"
      >
        <span class="bg-green-500" :style="{ width: pct(coverage.confirmed) }"></span>
        <span class="bg-green-300" :style="{ width: pct(coverage.proposed) }"></span>
      </span>
      <div class="flex items-baseline gap-2 text-xs leading-4">
        <span v-if="coverage.linesTotal" class="text-neutral-500" title="Counting components alone flatters a cut: a third of them can be a twentieth of the code.">
          {{ linesPct }}% of the code
        </span>
        <span v-if="coverage.unplaced" class="ml-auto text-neutral-500">{{ coverage.unplaced }} left</span>
      </div>
    </div>

    <!-- Called Cohesion, not Quality, because that is the only thing it
         measures: how much of a group's referencing stays inside it. That is
         the test for a domain or a module and the wrong test for a layer,
         whose members deliberately do NOT reference each other — adjacency
         finds domains, equivalence finds layers. Calling it "quality" implied
         a verdict on lenses it cannot judge. -->
    <div v-if="quality.placed >= 2 && cut !== 'horizontal'" class="flex flex-col gap-1.5 px-3 py-2.5 hairline-b">
      <div class="flex items-baseline gap-2">
        <span class="ui-section-title">Cohesion</span>
        <span class="ml-auto flex items-baseline gap-1.5">
          <span
            class="font-mono text-sm tabular-nums"
            :class="TONE[quality.reading.tone]"
            :title="`${Math.round(quality.kept * 100)}% of references between grouped components stay inside one; ${Math.round(quality.crossing)} cross a boundary. Modularity ${quality.modularity.toFixed(2)}.`"
          >{{ Math.round(quality.kept * 100) }}%</span>
          <span class="text-xs leading-4" :class="TONE[quality.reading.tone]">{{ quality.reading.word }}</span>
        </span>
      </div>

      <!-- A warning you cannot act on is a complaint. Each one names the
           groups it is about and takes you straight to them. -->
      <button
        v-if="lonely.length"
        type="button"
        class="text-left text-xs leading-4 text-amber-700 hover:underline"
        :title="`Open ${lonely[0].name}${lonely.length > 1 ? ` — and ${lonely.length - 1} more holding one component` : ''}`"
        @click="emit('activate', lonely[0].key)"
      >
        {{ lonely.length }} {{ lonely.length === 1 ? 'group holds' : 'groups hold' }} one component
      </button>
      <span v-if="quality.biggest > 0.5" class="text-xs leading-4 text-amber-700">One group holds {{ Math.round(quality.biggest * 100) }}% of what is placed</span>
      <button
        v-if="weakest"
        type="button"
        class="text-left text-xs leading-4 text-neutral-500 hover:underline"
        :title="`Open ${weakest.name} — ${readingFor(weakest.key).word}`"
        @click="emit('activate', weakest.key)"
      >
        Weakest <span class="text-neutral-700">{{ weakest.name }}</span> at {{ Math.round(weakest.kept * 100) }}%
      </button>
    </div>

    <!-- A layer is not judged by what stays inside it, so it is not given a
         number that would read as a bad score for doing its job. -->
    <div v-else-if="quality.placed >= 2" class="px-3 py-2.5 hairline-b">
      <span class="text-xs leading-4 text-neutral-500">
        A layer's members play the same role rather than lean on each other, so how much
        referencing stays inside a band says nothing about whether the bands are right.
      </span>
    </div>

    <!-- Merging is the commonest edit after a first pass, so it lives where
         the groups are and asks only which name to keep. -->
    <div v-if="picked.size > 1" class="flex flex-col gap-1 bg-accent-50 px-3 py-2 hairline-b">
      <div class="flex items-baseline gap-2">
        <span class="ui-section-title text-accent-700">Merge {{ picked.size }}</span>
        <button type="button" class="ml-auto text-xs text-neutral-500 hover:text-neutral-900" @click="clearPicked()">Cancel</button>
      </div>
      <span class="text-xs leading-4 text-neutral-600">Keep which name?</span>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="g in pickedGroups"
          :key="g.key"
          type="button"
          class="flex h-6 items-center gap-1.5 rounded border border-neutral-200 bg-surface px-1.5 text-xs text-neutral-800 transition-colors hover:border-accent-500 hover:bg-accent-100"
          :title="`Merge the other ${picked.size - 1} into ${g.name}`"
          @click="mergePicked(g.key)"
        >
          <span class="h-2 w-2 shrink-0 rounded-[2px]" :style="{ backgroundColor: colorOf(g.key) }"></span>
          <span class="max-w-[7rem] truncate">{{ g.name }}</span>
        </button>
      </div>
    </div>

    <div class="min-h-0 grow overflow-y-auto py-1">
      <!-- What this room is for. The studio is where you come when you do not
           already know the shape; when you do, saying it on any view is
           faster than sorting your way to it, and it is worth saying so here
           rather than letting someone sort 611 components by hand first. -->
      <div v-if="!groups.length" class="flex flex-col gap-2 px-3 py-4">
        <span class="text-sm font-medium text-neutral-800">Nothing grouped yet</span>
        <span class="text-xs leading-4 text-neutral-500">
          Propose a first pass and edit what comes back, or sort by hand from the right.
        </span>
        <span class="text-xs leading-4 text-neutral-500">
          If you already know the shape, you do not need this room: type a pattern
          like <span class="font-mono text-neutral-700">**.controller</span> into the
          query box on any view and keep what it finds.
        </span>
      </div>
      <ul class="flex flex-col">
        <template v-for="(g, i) in groups" :key="g.key">
        <li
          class="group flex h-9 items-center gap-1 pr-2 transition-colors"
          :class="[
            picked.has(g.key) ? 'bg-accent-50' : 'hover:bg-neutral-100',
            active === g.key ? 'bg-neutral-100 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : '',
          ]"
          :draggable="true"
          @dragstart="onDragStart(g.key, $event)"
          @dragover.prevent="dragOver = g.key"
          @dragleave="dragOver === g.key && (dragOver = null)"
          @drop.prevent="onDrop(g.key)"
        >
          <button
            type="button"
            class="flex min-w-0 grow items-center gap-2 self-stretch pl-3 text-left"
            :title="`${g.name} — ${readingFor(g.key).word}. Click to open${i < 9 ? `, or press ${i + 1} to put the question here` : ''}. Shift-click to pick several, then merge.`"
            @click="onPick(g.key, $event)"
          >
            <span class="h-2.5 w-2.5 shrink-0 rounded-[3px] transition-shadow" :class="{ 'ring-2 ring-accent-500 ring-offset-1 ring-offset-ground': picked.has(g.key) }" :style="{ backgroundColor: colorOf(g.key) }"></span>
            <span class="flex min-w-0 grow flex-col">
              <input
                v-if="renaming === g.key"
                :ref="el => bindRename(el as HTMLInputElement | null)"
                :value="g.name"
                type="text"
                class="ui-input ui-input-sm w-full"
                :aria-label="`Rename ${g.name}`"
                @click.stop
                @keydown.enter="($event.target as HTMLInputElement).blur()"
                @keydown.esc="emit('rename-done', g.key, g.name)"
                @change="emit('rename-done', g.key, ($event.target as HTMLInputElement).value)"
                @blur="emit('rename-done', g.key, ($event.target as HTMLInputElement).value)"
              />
              <span v-else class="min-w-0 truncate text-sm leading-4" :class="dragOver === g.key ? 'text-accent-700' : 'text-neutral-900'">{{ g.name }}</span>
              <!-- Whether this group is a thing at all, on every row rather
                   than only in the one you happen to have open. A cut can read
                   "little better than arbitrary" at the top while giving you
                   no way to see which groups are dragging it down. -->
              <span class="flex items-center gap-1">
                <span v-if="cut !== 'horizontal'" class="h-1 w-10 overflow-hidden rounded-full bg-neutral-200">
                  <span class="block h-full rounded-full" :class="BAR[readingFor(g.key).tone]" :style="{ width: Math.round(keptFor(g.key) * 100) + '%' }"></span>
                </span>
                <span v-if="cut !== 'horizontal'" class="font-mono text-2xs leading-3 tabular-nums" :class="TONE[readingFor(g.key).tone]">{{ Math.round(keptFor(g.key) * 100) }}%</span>
                <span v-if="g.parts.length === 1" class="text-2xs leading-3 text-amber-700">alone</span>
              </span>
            </span>
          </button>
          <span class="flex shrink-0 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900" :aria-label="`Rename ${g.name}`" title="Rename" @click.stop="emit('rename', g.key)">
              <Icon icon="pencil" :size="11"/>
            </button>
            <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-red-100 hover:text-red-700" :aria-label="`Delete ${g.name}`" :title="`Delete — its ${g.parts.length} members go back to the pool`" @click.stop="emit('drop', g.key)">
              <Icon icon="trash" :size="11"/>
            </button>
          </span>
          <!-- The hotkey and the size were two bare numbers side by side at
               rest, with nothing saying which was which. The size is the one
               worth reading, so the hotkey only appears when the pointer is
               there to use it. -->
          <span
            v-if="i < 9"
            class="hidden shrink-0 rounded bg-neutral-200 px-1 font-mono text-2xs leading-4 text-neutral-600 group-hover:inline"
            :title="`Press ${i + 1} to put the open question here`"
          >{{ i + 1 }}</span>
          <span class="shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400" :title="`${partsOf(g).whole} whole${partsOf(g).parts ? ` and ${partsOf(g).parts} part${partsOf(g).parts === 1 ? '' : 's'} of one` : ''}`">
            {{ partsOf(g).whole }}<span v-if="partsOf(g).parts" class="text-neutral-500">+{{ partsOf(g).parts }}</span>
          </span>
        </li>
        </template>
      </ul>
      <button type="button" class="flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="New group (N)" @click="emit('new-group')">
        <Icon icon="plus" :size="13"/><span>New group</span>
        <span class="ml-auto rounded bg-neutral-200 px-1 font-mono text-2xs leading-4 text-neutral-600">N</span>
      </button>
    </div>

    <!-- The piles are two more places a component can be, so they sit with
         the groups; what is in them opens where a group opens. -->
    <div class="shrink-0 hairline-t">
      <div v-for="pile in piles" :key="pile.id" class="flex flex-col">
        <button type="button" class="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-neutral-100" :class="{ 'bg-neutral-100': active === pile.id }" :title="pile.hint" @click="emit('activate', pile.id)">
          <Icon :icon="pile.icon" :size="12" class="text-neutral-400"/>
          <span class="min-w-0 grow truncate text-sm text-neutral-600">{{ pile.label }}</span>
          <span class="shrink-0 rounded bg-neutral-200 px-1 font-mono text-2xs leading-4 text-neutral-600">{{ pile.hotkey }}</span>
          <span class="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400">{{ pile.count }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import type { DraftGroup } from "~/stores/draft";
import { OUT_PILE } from "~/utils/studio";

// The dimension so far: its groups with the number key that fills them, how
// much of the codebase is covered, and the two piles that keep you moving.

const props = defineProps<{
  groups: DraftGroup[]
  active: string | null
  /** The row whose name is being edited in place. */
  renaming?: string | null
  colorOf: (key: string) => string
  /** Horizontal cuts are not judged on cohesion; see above. */
  cut?: "vertical" | "horizontal" | "free"
  coverage: { total: number; placed: number; unplaced: number; later: number; out: number; confirmed: number; proposed: number; linesTotal: number; linesPlaced: number; split: number }
  quality: {
    modularity: number; kept: number; placed: number; crossing: number; singletons: number; biggest: number
    reading: { word: string; tone: string }
    /** Per group, how much of its own referencing it keeps inside. */
    groups: Array<{ key: string; name: string; size: number; kept: number }>
  }
}>();

const TONE: Record<string, string> = {
  good: "text-green-700",
  fair: "text-amber-700",
  poor: "text-red-700",
};
const BAR: Record<string, string> = {
  good: "bg-green-500",
  fair: "bg-amber-500",
  poor: "bg-red-500",
};
const emit = defineEmits<{
  (e: "activate", key: string): void
  (e: "new-group"): void
  (e: "rename", key: string): void
  (e: "drop", key: string): void
  (e: "merge", keys: string[], into: string): void
  (e: "rename-done", key: string, name: string): void
}>();

/** Which row is being renamed in place, and focusing its field when it opens. */
function bindRename(el: HTMLInputElement | null) {
  if (el && document.activeElement !== el) { el.focus(); el.select(); }
}

// ── Quality, per group ───────────────────────────────────────────────────
// The engine already measures every group; it was only ever drawn for the
// one you had open. The bar and the number read the same scale: the bar was
// normalised to a ceiling of half, which was not an observation about real
// codebases but the arithmetic of counting an internal reference from both of
// its ends. Fixed at the source, so a row cannot show 86% full beside "43%".
const keptByKey = computed(() => new Map(props.quality.groups.map(g => [g.key, g.kept])));
const keptFor = (key: string) => keptByKey.value.get(key) ?? 0;
function readingFor(key: string): { word: string; tone: string } {
  const g = props.groups.find(x => x.key === key);
  if (g && g.parts.length < 2) return { word: "a group of one is not a module", tone: "poor" };
  const k = keptFor(key);
  if (k >= 0.5) return { word: `keeps ${Math.round(k * 100)}% of its references inside — a real unit`, tone: "good" };
  if (k >= 0.25) return { word: `keeps ${Math.round(k * 100)}% inside — holds together, but reaches out a lot`, tone: "fair" };
  return { word: `keeps ${Math.round(k * 100)}% inside — barely a unit`, tone: "poor" };
}

// ── Picking several, so they can be merged ───────────────────────────────
// A first pass returns fragments: six of fifteen groups named "Group A" to
// "Group G", two or three components each. Folding them together is the
// commonest edit there is, so it costs a shift-click and one key.
const picked = ref(new Set<string>());
const dragOver = ref<string | null>(null);
const pickedGroups = computed(() => props.groups.filter(g => picked.value.has(g.key)));

/** The groups each warning is actually about, so it can take you there. */
const lonely = computed(() => props.groups.filter(g => g.parts.length === 1));
const weakest = computed(() => {
  const ranked = props.quality.groups
    .filter(g => g.size > 1 && props.groups.some(x => x.key === g.key))
    .slice()
    .sort((a, b) => a.kept - b.kept);
  return ranked.length > 1 ? ranked[0] : null;
});

function onPick(key: string, event: MouseEvent) {
  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    const next = new Set(picked.value);
    next.has(key) ? next.delete(key) : next.add(key);
    // One group picked is not a selection, it is the thing you clicked.
    picked.value = next;
    if (!picked.value.has(key) && picked.value.size === 0) return;
    return;
  }
  picked.value = new Set();
  emit("activate", key);
}

function mergePicked(into: string) {
  const keys = Array.from(picked.value);
  picked.value = new Set();
  if (keys.length > 1) emit("merge", keys, into);
}
function clearPicked() { picked.value = new Set(); }

function onDragStart(key: string, event: DragEvent) {
  // Dragging a row that is not in the selection drags just that row.
  if (!picked.value.has(key)) picked.value = new Set([key]);
  event.dataTransfer?.setData("text/plain", key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function onDrop(into: string) {
  dragOver.value = null;
  const keys = Array.from(picked.value).filter(k => k !== into);
  picked.value = new Set();
  if (keys.length) emit("merge", [...keys, into], into);
}

// Later is a lap, not a place: it comes back on its own, so it has no row
// here. Only a real destination does.
const piles = computed(() => [
  { id: OUT_PILE, label: "Not in this cut", count: props.coverage.out, icon: "eye-off", hotkey: "X", hint: "Outside this lens altogether" },
]);

/** Whole components against shares of one: never added together. */
function partsOf(g: DraftGroup) {
  let whole = 0, parts = 0;
  for (const p of g.parts) { if (p.files === null) whole++; else parts++; }
  return { whole, parts };
}

const linesPct = computed(() => {
  const total = Math.max(1, props.coverage.linesTotal);
  return Math.round((props.coverage.linesPlaced / total) * 100);
});

function pct(n: number): string {
  const total = Math.max(1, props.coverage.total);
  return (n / total) * 100 + "%";
}
</script>
