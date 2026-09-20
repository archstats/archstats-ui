<template>
  <div class="flex flex-col gap-3">
    <!-- The reading the rail row's bar is short for, spelled out once the
         group is open. Same three colours, same words, same number, so a
         group says one thing about itself wherever you meet it. -->
    <p v-if="standing" class="text-xs leading-4" :class="standing.text">
      {{ standing.word }}
      <span class="font-mono tabular-nums">{{ Math.round(standing.kept * 100) }}%</span>
      <span class="text-neutral-500">of its references stay home<template v-if="standing.leans">, and most of the rest is shared with {{ standing.leans }}</template>.</span>
    </p>

    <!-- What this group says it holds. One component, shared with the
         groups manager, so the same job looks the same in both places. -->
    <GroupDefinition
      :query="group.query"
      :mode="group.mode ?? 'fixed'"
      :size="group.parts.length"
      :describe="describe"
      :claims="claims"
      @reclaim="emit('reclaim', group.key)"
      by-hand="Or fill it by hand: draw a box on the map, drag a node onto its row, or answer a question."
      @query="q => emit('query', group.key, q)"
      @mode="m => emit('mode', group.key, m)"
    />

    <div v-if="group.parts.length" class="flex flex-col gap-1">
      <div class="flex items-baseline gap-2">
        <span class="ui-label">Inside</span>
        <span class="min-w-0 truncate font-mono text-xs tabular-nums text-neutral-500">
          {{ group.parts.length }}<template v-if="totalLines"> · {{ short(totalLines) }} lines</template>
        </span>
        <!-- A proposal fills a group without anyone standing behind it yet,
             so the act that ends that state is a button, not a hint. -->
        <button
          v-if="proposed"
          type="button"
          class="ui-btn ui-btn-sm ml-auto shrink-0"
          :title="`Stand behind the ${proposed} the engine proposed. Until you do, they are drawn unfilled.`"
          @click="emit('confirm', group.key)"
        >Confirm {{ proposed }}</button>
      </div>

      <!-- Said once, because it is the head of every name below and the rows
           have no width to spend repeating it. -->
      <p v-if="shared" class="truncate pl-1 text-2xs leading-4 text-neutral-550" :title="`Every name here begins ${shared}`">
        <span class="text-neutral-400">…</span> is <span class="font-mono">{{ shared }}</span>
      </p>
      <p v-if="pullingAway" class="pl-1 text-2xs leading-4 text-amber-700">
        {{ pullingAway }} {{ pullingAway === 1 ? "member exchanges" : "members exchange" }} more with another group than with this one.
      </p>

      <ul class="-mx-1 flex max-h-[60vh] flex-col overflow-y-auto">
        <li v-for="p in members" :key="p.component" class="group flex flex-col">
          <div class="relative flex h-7 items-center gap-2 rounded-md pl-1 pr-1.5 transition-colors hover:bg-neutral-100">
            <!-- A part of a component is never drawn as a whole one. -->
            <span v-if="p.files" class="flex h-3 w-3 shrink-0 items-center justify-center" :title="`Part of ${p.component}`">
              <svg width="11" height="11" viewBox="-6 -6 12 12" aria-hidden="true">
                <circle r="5" fill="none" :stroke="color" stroke-width="1.2" stroke-dasharray="2 2"/>
                <path :d="wedge(shareOf(p))" :fill="color"/>
              </svg>
            </span>
            <KindMark v-else kind="component" :color="p.standing === 'proposed' ? null : color"/>

            <button
              type="button"
              class="min-w-0 shrink truncate text-left font-mono text-sm hover:text-accent-700"
              :class="p.standing === 'proposed' ? 'text-neutral-500' : 'text-neutral-800'"
              :title="p.standing === 'proposed' ? `${p.component} · proposed, not yet confirmed` : `${p.component} — show it on the map`"
              @click="emit('focus', p.component)"
            ><span v-if="shared" class="text-neutral-400">…</span>{{ shorten(p.component) }}</button>

            <!-- The one fact about a member worth interrupting a name for:
                 it does more business somewhere else than here. -->
            <button
              v-if="p.rival"
              type="button"
              class="flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 text-2xs leading-4 text-amber-800 transition-colors hover:bg-amber-200"
              :title="`${p.component} exchanges more with ${p.rival} than with ${group.name}. Click to move it there.`"
              :aria-label="`Move ${p.component} to ${p.rival}, which it exchanges more with`"
              @click.stop="p.rivalKey && emit('move', p.component, p.rivalKey)"
            ><Icon icon="arrow-right" :size="9"/><span class="max-w-[7rem] truncate">{{ p.rival }}</span></button>

            <span v-if="p.files" class="shrink-0 rounded bg-neutral-100 px-1 font-mono text-2xs leading-4 text-neutral-600" :title="`${p.files.length} of its ${filesOf(p.component).length} files are here; the rest are in another group`">
              {{ p.files.length }}/{{ filesOf(p.component).length }}
            </span>
            <!-- The engine found a line through this one. The mark is the
                 offer: there is no second queue to work through, because the
                 component is already in front of you. -->
            <button
              v-else-if="p.tear"
              type="button"
              class="flex shrink-0 items-center gap-1 rounded bg-blue-50 px-1 text-2xs leading-4 text-blue-700 transition-colors hover:bg-blue-100"
              :aria-label="`${p.component} has files that disagree — see the split`"
              :title="`${p.tear.leaving.length} of its ${filesOf(p.component).length} files lean elsewhere. Click to see the line.`"
              @click.stop="splitting = splitting === p.component ? null : p.component"
            >
              <Icon icon="git-branch" :size="9"/>
              <span class="font-mono">{{ p.tear.leaving.length }}/{{ filesOf(p.component).length }}</span>
            </button>

            <!-- How much of this one's own work stays in this group: the
                 sentence at the top is an average, and an average hides the
                 member that is only filed here. -->
            <span
              v-if="p.measured"
              class="ml-auto h-1 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-200"
              role="img"
              :aria-label="`${Math.round(p.kept * 100)} percent of its references stay in this group`"
              :title="keptTitle(p)"
            ><span class="block h-full rounded-full" :class="BAR[p.tone]" :style="{ width: Math.max(2, Math.round(p.kept * 100)) + '%' }"></span></span>
            <span v-else class="ml-auto"></span>

            <span v-if="totalLines" class="w-9 shrink-0 text-right font-mono text-2xs tabular-nums text-neutral-550" :title="`${lines(p.component).toLocaleString()} lines`">{{ short(lines(p.component)) }}</span>

            <!-- Laid over the row rather than beside it. Sitting in the flow,
                 this cluster took every pixel the names needed and left them
                 truncated to nothing while it was still invisible. -->
            <span
              class="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-md bg-gradient-to-r from-transparent via-neutral-100 to-neutral-100 pl-8 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
              :class="{ 'opacity-100': menuFor === p.component }"
            >
              <MemberMoveMenu
                v-if="others?.length"
                :targets="others.map(o => ({ ...o, size: sizeOf(o.key) }))"
                :what="p.component"
                :keep-open="menuFor === p.component"
                @toggle="o => menuFor = o ? p.component : null"
                @move="to => emit('move', p.component, to)"
              />
              <!-- At component grain this is absent, not disabled: a dimension
                   made of whole components has no such act to offer, and a
                   greyed-out button would only raise the question again. -->
              <button v-if="divisible && !p.files && filesOf(p.component).length > 1" type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900" :aria-label="`Split ${p.component}`" title="Split it: send some of its files elsewhere" @click.stop="splitting = splitting === p.component ? null : p.component"><Icon icon="git-branch" :size="11"/></button>
              <button v-if="p.files" type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900" :aria-label="`Rejoin ${p.component}`" title="Rejoin: bring all of its files back here" @click.stop="emit('rejoin', p.component)"><Icon icon="recycle" :size="11"/></button>
              <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-red-100 hover:text-red-700" :aria-label="`Take ${p.component} out`" title="Take it out of this group" @click.stop="emit('refuse', p.component)"><Icon icon="x" :size="11"/></button>
            </span>
          </div>

          <SplitSheet
            v-if="divisible && splitting === p.component"
            :component="p.component"
            :files="filesOf(p.component)"
            :from="group.name"
            :targets="others"
            :proposed="p.tear"
            @split="(files, to) => { emit('split', p.component, files, to); splitting = null; }"
            @close="splitting = null"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import KindMark from "~/components/connections/KindMark.vue";
import MemberMoveMenu from "~/components/dimensions/MemberMoveMenu.vue";
import SplitSheet from "~/components/dimensions/SplitSheet.vue";
import GroupDefinition from "~/components/groups/GroupDefinition.vue";
import type { DraftGroup } from "~/stores/draft";
import type { GroupMode } from "~/stores/groups";
import type { MemberQuality } from "~/utils/cutQuality";
import { detectSeparator, type Grain } from "~/utils/studio";

// What a group is made of, opened in place under its row in the rail. It
// carries no name field and no delete: the row above it is the group's
// identity and already offers both. This is only the contents.
//
// The contents are an argument, not a directory. Every row says how much of
// its own work stays in this group and names the group it would rather be in,
// because "15 components" and "15 components, two of which belong elsewhere"
// are the same list and different facts.

const BAR: Record<string, string> = { good: "bg-green-500", fair: "bg-amber-500", poor: "bg-red-500" };

const props = defineProps<{
  group: DraftGroup
  color: string
  cohesion?: { kept: number; leans: Array<{ name: string; weight: number }> } | null
  /** The other groups a member could be moved to, in rail order. */
  others?: Array<{ key: string; name: string; color: string }>
  /** How many each of those holds, so the move menu can say. */
  sizes?: Map<string, number>
  /** Every file of a component, for deciding how to divide it. */
  fileIndex?: (id: string) => string[]
  /** How big each member is, which is what "what is in here" mostly means. */
  lines?: (id: string) => number
  /** What this dimension is made of; dividing exists only at file grain. */
  grain?: Grain
  /** The shortest patterns describing what this group already holds. */
  describe?: () => string | null
  /** What its query names that another group is holding. */
  claims?: number | null
  /** Components the engine found a line through, by name. */
  tears?: Map<string, { leaving: string[]; rival: string; moved: number }>
  /** Each member measured against this group, from the same graph the
   *  standing sentence is measured on. */
  quality?: MemberQuality[]
}>();
const emit = defineEmits<{
  (e: "query", key: string, query: string): void
  (e: "mode", key: string, mode: GroupMode): void
  (e: "refuse", id: string): void
  (e: "confirm", key: string): void
  (e: "focus", id: string): void
  (e: "move", component: string, toKey: string): void
  (e: "split", component: string, files: string[], toKey: string | null): void
  (e: "rejoin", component: string): void
  (e: "reclaim", key: string): void
}>();

/**
 * What the members of this group do NOT have in common.
 *
 * Every component here shares a long prefix, so a name truncated from either
 * end reads as `…r.strategy` and identifies nothing. The prefix is said once
 * by the group itself; the rows say the part that differs.
 */
const shared = computed(() => {
  const names = props.group.parts.map(p => p.component);
  if (names.length < 2) return "";
  const sep = detectSeparator(names);
  const segs = names.map(n => n.split(sep));
  let i = 0;
  while (segs.every(s => s.length > i + 1 && s[i] === segs[0][i])) i++;
  return i ? segs[0].slice(0, i).join(sep) + sep : "";
});

/** A member's name with the group's shared prefix taken off. */
function shorten(name: string): string {
  return shared.value && name.startsWith(shared.value) ? name.slice(shared.value.length) : name;
}

const keyOfName = computed(() => new Map((props.others ?? []).map(o => [o.name, o.key])));
const qualityOf = computed(() => new Map((props.quality ?? []).map(q => [q.id, q])));
const sizeOf = (key: string) => props.sizes?.get(key) ?? 0;

/**
 * The members, biggest first, each carrying what is known about it.
 *
 * Size is the order because it is the order a group is understood in: the
 * pieces that make it what it is come first, and the two-line straggler that
 * happens to sort early by name does not.
 */
const members = computed(() => {
  const rows = props.group.parts.map(p => {
    const q = qualityOf.value.get(p.component);
    const rival = q?.pullsAway ? q.leans?.name ?? null : null;
    return {
      ...p,
      kept: q?.kept ?? 0,
      measured: !!q && q.degree > 0,
      tone: q ? tone(q.kept) : "poor",
      degree: q?.degree ?? 0,
      leans: q?.leans ?? null,
      rival,
      rivalKey: rival ? keyOfName.value.get(rival) ?? null : null,
      tear: tearOf(p.component),
      weight: props.lines?.(p.component) ?? 0,
    };
  });
  return rows.sort((a, b) => b.weight - a.weight || a.component.localeCompare(b.component));
});

const totalLines = computed(() => members.value.reduce((n, p) => n + p.weight, 0));
const pullingAway = computed(() => members.value.filter(p => p.rival).length);

function tone(kept: number): "good" | "fair" | "poor" {
  return kept >= 0.5 ? "good" : kept >= 0.25 ? "fair" : "poor";
}

function keptTitle(p: { component: string; kept: number; degree: number; leans: { name: string } | null }): string {
  const pct = Math.round(p.kept * 100);
  const rest = p.leans ? ` Most of the rest is shared with ${p.leans.name}.` : "";
  return `${pct}% of the ${Math.round(p.degree)} references ${p.component} shares with grouped components stay in ${props.group.name}.${rest}`;
}

/** A size you can read at a glance rather than count digits in. */
function short(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

const standing = computed(() => {
  const c = props.cohesion;
  if (!c || props.group.parts.length < 2) return null;
  const leans = c.leans[0]?.name ?? null;
  if (c.kept >= 0.5) return { kept: c.kept, leans, word: "A real unit —", text: "text-green-700" };
  if (c.kept >= 0.25) return { kept: c.kept, leans, word: "Holds together, but reaches out a lot —", text: "text-amber-700" };
  return { kept: c.kept, leans, word: "Barely a unit —", text: "text-red-700" };
});
const proposed = computed(() => props.group.parts.filter(p => p.standing === "proposed").length);

// ── Splitting ────────────────────────────────────────────────────────────
const divisible = computed(() => props.grain === "file");
const tearOf = (id: string) => (divisible.value ? props.tears?.get(id) ?? null : null);
const splitting = ref<string | null>(null);
const menuFor = ref<string | null>(null);
watch(() => props.group.key, () => { splitting.value = null; menuFor.value = null; });
const filesOf = (id: string) => props.fileIndex?.(id) ?? [];

/** The share of a component this group holds, as a fraction of its files. */
function shareOf(part: { component: string; files: string[] | null }): number {
  const all = filesOf(part.component).length || 1;
  return Math.max(0.08, Math.min(1, (part.files?.length ?? all) / all));
}
/** That share drawn as a filled wedge inside a dashed ring. */
function wedge(share: number): string {
  const to = -Math.PI / 2 + share * Math.PI * 2;
  const x = Math.cos(to) * 5, y = Math.sin(to) * 5;
  return `M 0,0 L 0,-5 A 5,5 0 ${share > 0.5 ? 1 : 0} 1 ${x},${y} Z`;
}
</script>
