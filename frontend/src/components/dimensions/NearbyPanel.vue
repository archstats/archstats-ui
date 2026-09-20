<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline gap-2">
      <span class="ui-label min-w-0 truncate">What leans towards {{ name }}</span>
      <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-500">{{ total }}</span>
    </div>
    <!-- Said once. The same instruction arrived twice in two wordings, from
         the caller and from here. -->
    <p v-if="total" class="text-2xs leading-4 text-neutral-550">The engine's offer, strongest first. Click to add · shift-click takes everything above it too.</p>
    <p v-else class="text-sm leading-4 text-neutral-500">Nothing outside this group leans towards it. Draw a box on the map to add by hand, or say what it holds with a query above.</p>

    <div class="flex flex-col gap-2">

      <div v-for="band in bands" :key="band.id" class="flex flex-col">
        <div class="flex h-7 items-center gap-2">
          <button type="button" class="flex min-w-0 items-center gap-1.5" :title="band.hint" @click="shut.has(band.id) ? shut.delete(band.id) : shut.add(band.id)">
            <Icon :icon="open(band) ? 'chevron-down' : 'chevron-right'" :size="11" class="shrink-0 text-neutral-400"/>
            <span class="text-xs font-medium" :class="BAND_TONE[band.id]">{{ band.label }}</span>
            <span class="font-mono text-xs text-neutral-400">{{ band.items.length }}</span>
          </button>
          <!-- The reason is the same for nearly every row, so it is said once
               here and only the exceptions are marked below. -->
          <span class="min-w-0 truncate text-xs text-neutral-400">{{ band.reason }}</span>
          <button type="button" class="ml-auto shrink-0 text-xs text-neutral-500 hover:text-neutral-900" @click="emit('add', band.items.map(i => i.id))">Add all {{ band.items.length }}</button>
        </div>
        <ul v-if="open(band)" class="flex flex-col">
          <li
            v-for="c in band.items"
            :key="c.id"
            class="group flex h-7 cursor-pointer items-center gap-2 rounded-md pl-1 pr-0.5 hover:bg-accent-50"
            :title="`${c.id} — ${c.detail}. Click to add to ${name}; shift-click to take everything down to here.`"
            @click="pick(c.id, $event)"
          >
            <!-- Strength as a mark, not a sentence. -->
            <span class="flex h-3 w-3 shrink-0 items-end gap-[1px]" aria-hidden="true">
              <span v-for="n in 3" :key="n" class="w-[3px] rounded-[1px]" :class="c.share >= n * 33 - 20 ? 'bg-blue-500' : 'bg-neutral-200'" :style="{ height: n * 33 + '%' }"></span>
            </span>
            <span class="min-w-0 truncate font-mono text-sm text-neutral-900" dir="rtl" :title="c.id">{{ c.label }}</span>
            <span v-if="c.rival || c.reason !== band.reason" class="shrink-0 rounded px-1 text-[10px] leading-4" :class="c.rival ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600'" :title="c.rival ? `It leans harder towards ${c.rival}` : c.reason">{{ c.tag }}</span>
            <span class="flex shrink-0 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900" :aria-label="`Show ${c.id} on the map`" title="Show it on the map" @click.stop="emit('focus', c.id)"><Icon icon="focus" :size="11"/></button>
              <button type="button" class="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-red-100 hover:text-red-700" :aria-label="`Never offer ${c.id}`" title="Never offer this one for this group again" @click.stop="emit('refuse', c.id)"><Icon icon="x" :size="11"/></button>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "~/components/ui/common/Icon.vue";

// What could come into the group you have open. This is intake — the same
// job Sort and Grab do, aimed at one group — so it sits beside them rather
// than inside the group, which is what made the sidebar read as a mode.

export interface CandidateBand {
  id: string
  label: string
  hint: string
  reason: string
  items: Array<{ id: string; label: string; share: number; reason: string; detail: string; rival: string | null; tag: string }>
}

const props = defineProps<{
  name: string
  bands: CandidateBand[]
}>();
const emit = defineEmits<{
  (e: "add", ids: string[]): void
  (e: "refuse", id: string): void
  (e: "focus", id: string): void
}>();

const BAND_TONE: Record<string, string> = {
  strong: "text-green-700",
  related: "text-blue-700",
  loose: "text-neutral-500",
};

const total = computed(() => props.bands.reduce((n, b) => n + b.items.length, 0));
const shut = ref(new Set<string>(["related", "loose"]));
const open = (band: CandidateBand) => !shut.value.has(band.id);
watch(() => props.name, () => { shut.value = new Set(["related", "loose"]); });

/**
 * Adding is a single click, because it is cheap and undo is one key. The list
 * is ranked, so a shift-click takes everything at least as related as the row
 * you shift-clicked — a cut line rather than a range, which is also the only
 * gesture that survives the list re-ranking after each add.
 */
function pick(id: string, event: MouseEvent) {
  const flat = props.bands.filter(open).flatMap(b => b.items.map(i => i.id));
  const at = flat.indexOf(id);
  emit("add", event.shiftKey && at > 0 ? flat.slice(0, at + 1) : [id]);
}
</script>
