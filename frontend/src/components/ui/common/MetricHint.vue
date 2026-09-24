<template>
  <span
    ref="trigger"
    class="inline-flex min-w-0 max-w-full cursor-help"
    :tabindex="focusable ? 0 : undefined"
    :aria-describedby="open ? panelId : undefined"
    @mouseenter="schedule"
    @mouseleave="leave"
    @focus="show"
    @blur="leave"
    @keydown.esc="hide"
  ><slot/></span>
  <Teleport to="body">
    <div
      v-if="open"
      :id="panelId"
      role="tooltip"
      class="ui-popover w-80 p-3 text-left normal-case tracking-normal animate-in"
      :style="style"
      @mouseenter="cancelHide"
      @mouseleave="leave"
    >
      <template v-if="entry">
        <p class="text-base font-semibold leading-5 text-neutral-900">{{ entry.name }}</p>
        <p class="mt-0.5 break-all font-mono text-xs text-neutral-500">{{ entry.id }}</p>
        <p v-if="entry.derived" class="mt-1"><span class="ui-tag">Computed by the app</span></p>
        <p class="mt-2 text-sm font-normal leading-5 text-neutral-700">{{ entry.short || "No short description." }}</p>
        <template v-if="entry.long && entry.long !== entry.short">
          <p v-if="expanded" class="mt-2 whitespace-pre-line text-sm font-normal leading-5 text-neutral-600">{{ entry.long }}</p>
          <button v-else type="button" class="mt-1 text-sm font-normal text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline" @click="expanded = true">More</button>
        </template>
      </template>
      <template v-else>
        <p class="break-all font-mono text-sm text-neutral-900">{{ id }}</p>
        <p class="mt-1 text-sm font-normal text-neutral-500">Not defined in this snapshot.</p>
      </template>
      <div class="mt-3 flex items-center gap-2 pt-2 hairline-t">
        <button v-if="entry" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="copy">
          <Icon :icon="copied ? 'check' : 'copy'" :size="12" class="text-neutral-500"/><span>{{ copied ? "Copied" : "Copy definition" }}</span>
        </button>
        <router-link :to="{ path: '/views/reference', query: { m: id } }" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="hide">
          <span>Open in reference</span><Icon icon="arrow-up-right" :size="12" class="text-neutral-500"/>
        </router-link>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import Icon from "~/components/ui/common/Icon.vue";
import { useAnchoredPanel } from "~/composables/useAnchoredPanel";
import { useDataStore } from "~/stores/data";
import { definitionMarkdown } from "~/utils/definition";
import { derivedMetric } from "~/utils/derivedMetrics";
import { copyText } from "~/utils/files";

// A metric's definition where its number is read: name, id, what it means,
// and a way to the full reference. It opens after a moment's hover or on
// focus, so passing the pointer over a table header does not flash it.

const props = withDefaults(defineProps<{ id: string; focusable?: boolean }>(), { focusable: true });

const data = useDataStore();
const trigger = ref<HTMLElement | null>(null);
const open = ref(false);
const expanded = ref(false);
const copied = ref(false);
const panelId = `metric-hint-${Math.random().toString(36).slice(2, 9)}`;
const { style } = useAnchoredPanel(trigger, open, "left");

const entry = computed(() => {
  const d = data.definitions.get(props.id);
  if (d) return { id: d.id, name: d.name || d.id, short: d.short, long: d.long, derived: undefined };
  const m = derivedMetric(props.id);
  if (m) return { id: m.id, name: m.name, short: m.short, long: m.long, derived: m };
  return null;
});

let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
function schedule() { cancelHide(); if (showTimer) clearTimeout(showTimer); showTimer = setTimeout(show, 500); }
function show() { cancelHide(); open.value = true; }
function hide() { if (showTimer) clearTimeout(showTimer); open.value = false; expanded.value = false; }
function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
// A short grace period lets the pointer travel from the label into the panel.
function leave() { if (showTimer) clearTimeout(showTimer); cancelHide(); hideTimer = setTimeout(hide, 180); }

async function copy() {
  if (!entry.value) return;
  try { await copyText(definitionMarkdown(entry.value)); copied.value = true; setTimeout(() => { copied.value = false; }, 1400); } catch { /* the button stays as it was */ }
}

onBeforeUnmount(() => { if (showTimer) clearTimeout(showTimer); cancelHide(); });
</script>
