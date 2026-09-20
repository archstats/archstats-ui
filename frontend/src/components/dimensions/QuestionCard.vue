<template>
  <div v-if="!bundle" class="flex flex-col gap-2">
    <template v-if="laterCount">
      <span class="text-base font-medium text-neutral-900">Everything else is placed</span>
      <p class="text-sm leading-4 text-neutral-500">{{ laterCount }} {{ laterCount === 1 ? 'is' : 'are' }} still set aside. Nothing new has landed since, so they are waiting rather than coming round again.</p>
      <button type="button" class="ui-btn ui-btn-sm self-start" @click="emit('unpark-later')">
        <Icon icon="history" :size="13" class="text-neutral-500"/><span>Bring {{ laterCount === 1 ? 'it' : 'them' }} back</span>
      </button>
    </template>
    <template v-else>
      <span class="text-base font-medium text-neutral-900">Everything is sorted</span>
      <p class="text-sm leading-4 text-neutral-500">Every component is in a group or out of this cut. Save the lens, or open a group to keep shaping it.</p>
    </template>
  </div>
  <div v-else class="flex flex-col gap-3">
    <!-- The standing line lives with the thing it describes. It used to be
         printed above whatever the sidebar happened to be showing, so it
         explained the sort queue while you were editing a group. -->
    <p v-if="hint" class="text-xs leading-4 text-neutral-500">{{ hint }}</p>
    <div class="flex flex-col gap-1">
      <div class="flex items-baseline gap-2">
        <span class="ui-label">Where does this belong?</span>
        <span class="ml-auto flex shrink-0 items-baseline gap-1 font-mono text-xs tabular-nums text-neutral-400">
          <span v-if="round > 1" class="rounded bg-neutral-100 px-1 text-neutral-500" :title="`Everything you set aside came round again; this is lap ${round}`">Lap {{ round }}</span>
          <span :title="`${queueTotal} questions left in this lap`">{{ queueTotal }} left</span>
          <template v-if="laterCount"><span aria-hidden="true">·</span><span :title="`${laterCount} set aside; they come round again once the rest is placed`">{{ laterCount }} later</span></template>
        </span>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="min-w-0 truncate text-base font-medium text-neutral-900" :title="bundle.prefix || bundle.name">{{ bundle.name }}</span>
        <span class="shrink-0 font-mono text-xs text-neutral-400">{{ bundle.members.length }}</span>
      </div>
      <p class="text-xs leading-4 text-neutral-500">{{ bundle.reason }}<template v-if="bundle.lines"> · {{ formatNumber(bundle.lines, 0) }} lines</template></p>
    </div>

    <!-- What is actually being asked about, above the places it could go:
         you cannot answer "where does this belong" until you know what THIS
         is. The heading is a title made from a shared prefix — "Annotations"
         — so it names the components too, and it no longer hides itself when
         there is only one, which was the single case where the card asked
         about something it never named. -->
    <div class="flex flex-col gap-1">
      <!-- The count is already on the title above; saying it twice is noise. -->
      <span class="ui-label">{{ bundle.members.length > 1 ? 'What you are placing' : 'The component' }}</span>
      <ul class="flex max-h-40 flex-col overflow-y-auto">
        <li v-for="id in bundle.members" :key="id" class="group flex h-6 items-center gap-2">
          <KindMark kind="component"/>
          <button type="button" class="min-w-0 truncate text-left font-mono text-sm text-neutral-800 hover:text-accent-700" dir="rtl" :title="`${id} · show it in the map`" @click="emit('focus', id)">{{ id }}</button>
          <span class="ml-auto flex shrink-0 items-center gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="`Park ${id} for later`" title="Park this one for later" @click="emit('park-one', id, 'later')"><Icon icon="history" :size="11"/></button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="`Drop ${id}`" title="Not in this lens" @click="emit('park-one', id, 'out')"><Icon icon="x" :size="11"/></button>
          </span>
        </li>
      </ul>
    </div>

    <!-- Placing it comes first and reads as one set: the engine's guesses,
         every other group, and a new one. Deferring is a separate, quieter
         act below, so the two are never mistaken for each other. -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline gap-2">
        <span class="ui-label">Put <span class="text-neutral-700">{{ bundle.name }}</span> in</span>
        <span v-if="sharedReason" class="min-w-0 truncate text-xs text-neutral-400">closest by {{ sharedReason }}</span>
      </div>
      <div v-if="guesses.length" class="flex flex-col gap-1">
        <button
          v-for="(g, i) in guesses"
          :key="g.key"
          type="button"
          class="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors"
          :class="i === 0 ? 'bg-accent-600 text-white hover:bg-accent-700' : 'text-neutral-800 hover:bg-neutral-100'"
          :title="`Put it in ${g.name} — closest by ${g.reason}${g.detail ? ' · ' + g.detail : ''}`"
          @click="emit('assign', g.key)"
        >
          <Icon icon="arrow-right" :size="12" class="shrink-0" :class="i === 0 ? 'text-white/70' : 'text-neutral-400'"/>
          <span class="h-2 w-2 shrink-0 rounded-[2px]" :style="{ backgroundColor: g.color }"></span>
          <span class="min-w-0 shrink-0 truncate font-medium">{{ g.name }}</span>
          <span v-if="g.reason !== sharedReason" class="min-w-0 truncate text-xs" :class="i === 0 ? 'text-white/70' : 'text-neutral-500'">{{ g.reason }}</span>
          <span class="ml-auto flex shrink-0 items-center gap-1.5">
            <span class="h-1 w-8 overflow-hidden rounded-full" :class="i === 0 ? 'bg-white/25' : 'bg-neutral-100'">
              <span class="block h-full rounded-full" :class="i === 0 ? 'bg-white' : 'bg-blue-500'" :style="{ width: share(g) + '%' }"></span>
            </span>
            <span v-if="i === 0 || g.hotkey" class="rounded px-1 font-mono text-[10px] leading-4" :class="i === 0 ? 'bg-white/20' : 'bg-neutral-200 text-neutral-600'">{{ i === 0 ? 'Enter' : g.hotkey }}</span>
          </span>
        </button>
      </div>

      <!-- Every other group, one click away rather than only on a number key. -->
      <div v-if="others.length" class="flex flex-col gap-1">
        <button v-if="!open" type="button" class="self-start text-xs text-neutral-500 hover:text-neutral-900" @click="showAll = true">
          Show {{ others.length }} more {{ others.length === 1 ? 'group' : 'groups' }}
        </button>
        <template v-else>
          <input v-if="others.length > 8" v-model="filter" type="search" class="ui-input ui-input-sm w-full" placeholder="Find a group" aria-label="Find a group"/>
          <ul class="flex max-h-44 flex-col overflow-y-auto">
            <li v-for="g in filtered" :key="g.key">
              <button type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-neutral-800 hover:bg-neutral-100" :title="`Put ${bundle.name} in ${g.name}`" @click="emit('assign', g.key)">
                <Icon icon="arrow-right" :size="12" class="shrink-0 text-neutral-400"/>
                <span class="h-2 w-2 shrink-0 rounded-[2px]" :style="{ backgroundColor: g.color }"></span>
                <span class="min-w-0 truncate">{{ g.name }}</span>
                <span v-if="g.hotkey" class="ml-auto shrink-0 rounded bg-neutral-200 px-1 font-mono text-[10px] leading-4 text-neutral-600">{{ g.hotkey }}</span>
              </button>
            </li>
          </ul>
        </template>
      </div>

      <button type="button" class="ui-btn ui-btn-sm justify-start" title="Start a group from this (N)" @click="emit('new-group')">
        <Icon icon="plus" :size="13" class="text-neutral-500"/>
        <span class="min-w-0 truncate">New group “{{ bundle.name }}”</span>
        <span class="ml-auto shrink-0 rounded bg-neutral-200 px-1 font-mono text-[10px] leading-4 text-neutral-600">N</span>
      </button>
      <p v-if="!guesses.length" class="text-xs leading-4 text-neutral-500">Nothing it clearly belongs to yet. Start a group from it, or set it aside.</p>

      <!-- Two ways not to answer, and they mean different things. -->
      <div class="flex flex-col gap-1 hairline-t pt-2">
        <div class="flex flex-wrap items-center gap-1.5">
          <button v-if="canSplit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Too coarse to answer? Ask about its branches instead (S)" @click="emit('split')">
            <Icon icon="git-branch" :size="13" class="text-neutral-500"/><span>Split the question</span>
          </button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Set it aside; it comes round again once the rest is placed (L)" @click="emit('park', 'later')">Later</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="It has no place in this lens at all (X)" @click="emit('park', 'out')">Not in this cut</button>
        </div>
        <p class="text-xs leading-4 text-neutral-400">
          <span class="text-neutral-500">Later</span> comes round again once everything else is placed. <span class="text-neutral-500">Not in this cut</span> means it has no place in this lens at all.
        </p>
      </div>
    </div>

    <!-- The queue is finite, and showing the next few proves it. -->
    <p v-if="upNext.length" class="truncate text-xs leading-4 text-neutral-400">
      Up next: <template v-for="(b, i) in upNext" :key="b.key"><span class="text-neutral-500">{{ b.name }}</span> {{ b.members.length }}<template v-if="i < upNext.length - 1"> · </template></template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import KindMark from "~/components/connections/KindMark.vue";
import { formatNumber } from "~/utils/format";
import type { Bundle } from "~/utils/studio";

// One question at a time, always the biggest one left, with the engine's
// guess under the Enter key and every other answer one keystroke away.

export interface Guess { key: string; name: string; color: string; reason: string; detail: string; score: number; hotkey: string }

const props = defineProps<{
  bundle: Bundle | null
  guesses: Guess[]
  laterCount: number
  queueTotal: number
  round: number
  upNext: Bundle[]
  canSplit: boolean
  /** Every group not already among the guesses. */
  others: Guess[]
  /** What this mode is for, said once, above the question it belongs to. */
  hint?: string
}>();

/**
 * The reason nearly every guess gives. When they all say "references between
 * them", saying it three times tells you nothing and hides the one row that
 * says something else.
 */
const sharedReason = computed(() => {
  const counts = new Map<string, number>();
  for (const g of props.guesses) counts.set(g.reason, (counts.get(g.reason) ?? 0) + 1);
  const [reason, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return n > 1 && n >= props.guesses.length - 1 ? reason : "";
});
const emit = defineEmits<{
  (e: "assign", key: string): void
  (e: "new-group"): void
  (e: "park", pile: "later" | "out"): void
  (e: "park-one", id: string, pile: "later" | "out"): void
  (e: "focus", id: string): void
  (e: "split"): void
  (e: "unpark-later"): void
}>();

const showAll = ref(false);
const filter = ref("");
// A handful of destinations are all worth showing; only a crowd needs a door.
const open = computed(() => showAll.value || props.others.length <= 4);
watch(() => props.bundle?.key, () => { showAll.value = false; filter.value = ""; });
const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return q ? props.others.filter(g => g.name.toLowerCase().includes(q)) : props.others;
});

/** A bundle's members share their prefix, so only the tail tells them apart. */
function short(id: string): string {
  const prefix = props.bundle?.prefix;
  const sep = props.bundle?.sep ?? ".";
  return prefix && id.startsWith(prefix + sep) ? id.slice(prefix.length + sep.length) : id;
}
function share(g: Guess): number {
  const top = Math.max(...props.guesses.map(x => x.score), 1);
  return Math.max(8, Math.round((g.score / top) * 100));
}
</script>
