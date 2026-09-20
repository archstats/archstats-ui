<template>
  <div class="ui-popover pointer-events-auto absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 py-1.5 pl-3 pr-1.5">
    <span class="shrink-0 text-sm font-medium text-neutral-900">{{ count }} selected</span>
    <span class="shrink-0 text-xs text-neutral-500">
      {{ verb }}<template v-if="home"> <span class="text-neutral-400">(now in {{ home }})</span></template>
    </span>

    <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
      <button
        v-for="g in groups"
        :key="g.key"
        type="button"
        class="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-neutral-800 transition-colors hover:bg-neutral-100"
        :title="g.hotkey ? `${g.name} · press ${g.hotkey}` : g.name"
        @click="emit('assign', g.key)"
      >
        <span class="h-2 w-2 shrink-0 rounded-[2px]" :style="{ backgroundColor: g.color }"></span>
        <span class="max-w-[9rem] truncate">{{ g.name }}</span>
        <span v-if="g.hotkey" class="rounded bg-neutral-200 px-1 font-mono text-[10px] leading-4 text-neutral-600">{{ g.hotkey }}</span>
      </button>
    </div>

    <span class="h-5 w-px shrink-0 bg-neutral-200"></span>
    <button type="button" class="ui-btn ui-btn-sm shrink-0" title="Start a group from this selection (N)" @click="emit('new-group')">
      <Icon icon="plus" :size="13" class="text-neutral-500"/><span>New group</span>
    </button>
    <!-- The same thing, said rather than listed. A group written as a pattern
         survives the rename that would have emptied the list in silence, so
         it is offered right where the list would otherwise be made. -->
    <button
      v-if="pattern"
      type="button"
      class="ui-btn ui-btn-sm min-w-0 shrink"
      :title="pattern.title"
      @click="emit('new-query', pattern.text)"
    >
      <Icon icon="braces" :size="13" class="shrink-0 text-neutral-500"/>
      <span class="min-w-0 truncate font-mono text-xs">{{ pattern.lead }}</span>
      <span v-if="pattern.extra" class="shrink-0 text-xs text-neutral-400">+{{ pattern.extra }}</span>
    </button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" title="Decide these later (L)" @click="emit('park', 'later')">Later</button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet shrink-0" title="Not in this lens (X)" @click="emit('park', 'out')">Out</button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet shrink-0" aria-label="Clear the selection" title="Clear the selection (Esc)" @click="emit('clear')">
      <Icon icon="x" :size="13"/>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { usePatternOffer } from "~/composables/usePatternOffer";

// What you picked on the map, and every answer it can be given. It appears
// only while something is selected, over the map rather than beside it, so
// the hand that drew the box does not have to travel.

const props = withDefaults(defineProps<{
  count: number
  groups: Array<{ key: string; name: string; color: string; hotkey: string | null }>
  /** What is selected, so it can be offered back as a pattern. */
  selected?: string[]
  /** "Put into" for something unplaced, "Move to" for something already home. */
  verb?: string
  home?: string | null
}>(), { verb: "put into", home: null, selected: () => [] });
const emit = defineEmits<{
  (e: "assign", key: string): void
  (e: "new-group"): void
  (e: "new-query", query: string): void
  (e: "park", pile: "later" | "out"): void
  (e: "clear"): void
}>();

const pattern = usePatternOffer(computed(() => props.selected));
</script>
