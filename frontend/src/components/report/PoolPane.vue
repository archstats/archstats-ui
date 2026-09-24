<template>
  <!-- Everything pinned in this workspace, to drag into the report or insert at the caret. -->
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <label class="relative flex min-w-0 flex-1 items-center">
        <Icon icon="search" :size="12" class="pointer-events-none absolute left-2 text-neutral-400"/>
        <input v-model="q" class="ui-input ui-input-sm w-full pl-7" placeholder="Find a pin" aria-label="Find a pin">
      </label>
    </div>
    <div class="flex flex-wrap gap-1" role="group" aria-label="Kind">
      <button v-for="k in kinds" :key="k.id" type="button" class="ui-chip" :class="{ 'is-active': kind === k.id }" :aria-pressed="kind === k.id" @click="kind = k.id">{{ k.label }} <span class="font-mono text-neutral-400">{{ k.n }}</span></button>
    </div>

    <ul v-if="shown.length" class="-mx-1 flex flex-col">
      <li
        v-for="p in shown"
        :key="p.id"
        class="group/pin relative flex cursor-grab items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-neutral-200/60 active:cursor-grabbing"
        draggable="true"
        :title="`Drag into the report, or press Insert`"
        @dragstart="onDrag($event, p.id)"
        @dragend="$emit('dragend')"
      >
        <span class="mt-0.5 flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-surface hairline">
          <img v-if="p.figurePath && figures[p.figurePath]" :src="figures[p.figurePath]" alt="" class="h-full w-full object-cover">
          <Icon v-else :icon="ICONS[p.kind] ?? 'bookmark'" :size="13" class="text-neutral-400"/>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] leading-5 text-neutral-900">{{ p.title || "Untitled pin" }}</span>
          <span class="flex items-center gap-1.5 text-[11px] leading-4 text-neutral-500">
            <span>{{ p.kind }}</span>
            <template v-if="status[p.id]?.text"><span class="text-neutral-300">·</span><span class="truncate" :title="status[p.id].text">{{ status[p.id].text }}</span></template>
          </span>
          <span v-if="usage.get(p.id)?.length" class="block truncate text-[11px] leading-4 text-neutral-400" :title="usage.get(p.id)!.join(', ')">in {{ usage.get(p.id)!.join(", ") }}</span>
        </span>
        <span class="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/pin:opacity-100">
          <button type="button" class="ui-btn ui-btn-sm" :title="'Insert under the block you are on'" @click="$emit('insert', p.id)">Insert</button>
          <router-link v-if="p.route" :to="p.route" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-label="`Open where ${p.title} was pinned`" title="Open where it was pinned"><Icon icon="arrow-up-right" :size="12"/></router-link>
        </span>
      </li>
    </ul>
    <div v-else-if="!pins.length" class="rounded-md px-3 py-4 text-center hairline">
      <p class="text-sm text-neutral-700">Nothing pinned yet</p>
      <p class="mt-1 text-xs leading-5 text-neutral-500">Pin a component, file, cycle, rule finding or a whole view with the bookmark on its page, or use Add to report in any view's Export menu.</p>
    </div>
    <p v-else class="px-1 text-xs text-neutral-500">No pin matches.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";

interface PinLike { id: string; kind: string; title: string; note: string; route: string; figurePath: string }

const props = defineProps<{
  pins: PinLike[]
  usage: Map<string, string[]>
  status: Record<string, { text: string }>
  figures: Record<string, string>
}>();
const emit = defineEmits<{ (e: "insert", id: string): void; (e: "drag", id: string): void; (e: "dragend"): void }>();

const ICONS: Record<string, string> = { component: "component", file: "file-text", cycle: "refresh-cw", rule: "scale", pair: "arrow-right", view: "image" };
const q = ref("");
const kind = ref("all");
const kinds = computed(() => {
  const by = new Map<string, number>();
  for (const p of props.pins) by.set(p.kind, (by.get(p.kind) ?? 0) + 1);
  return [{ id: "all", label: "All", n: props.pins.length }, ...[...by].map(([id, n]) => ({ id, label: `${id[0].toUpperCase()}${id.slice(1)}s`, n }))];
});
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return props.pins.filter(p => (kind.value === "all" || p.kind === kind.value) && (!needle || `${p.title} ${p.note}`.toLowerCase().includes(needle)));
});
function onDrag(e: DragEvent, id: string) {
  e.dataTransfer?.setData("application/x-archstats-pin", id);
  e.dataTransfer?.setData("text/plain", id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
  emit("drag", id);
}
</script>
