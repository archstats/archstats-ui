<template>
  <!-- Reports, then the open report's outline: where you are in the file browser and in the file. -->
  <aside class="flex w-[232px] shrink-0 flex-col bg-ground hairline-r" aria-label="Reports">
    <div class="flex h-9 shrink-0 items-center gap-2 pl-3 pr-1.5">
      <h2 class="ui-label flex-1">Reports</h2>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="New report" title="New report" @click="$emit('create')"><Icon icon="plus" :size="13"/></button>
    </div>
    <ul class="shrink-0 px-1.5 pb-2" :class="reports.length > 8 ? 'max-h-[40%] overflow-y-auto' : ''">
      <li v-for="r in reports" :key="r.id" class="group/r relative" draggable="true" @dragstart="dragFrom = r.id" @dragover.prevent @drop.prevent="drop(r.id)">
        <form v-if="renaming === r.id" class="px-1 py-0.5" @submit.prevent="finishRename(r.id)">
          <input ref="renameEl" v-model="draft" class="ui-input ui-input-sm w-full" aria-label="Report name" @blur="finishRename(r.id)" @keydown.esc.prevent="renaming = null">
        </form>
        <button
          v-else
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
          :class="picked.has(r.id) ? 'bg-accent-100/70' : r.id === currentId ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-200/60'"
          :aria-current="r.id === currentId ? 'page' : undefined"
          :aria-selected="picked.has(r.id)"
          title="⌘-click or Shift-click to select several, to merge or delete them"
          @click="onClick($event, r.id)"
          @dblclick="startRename(r)"
        >
          <span
            class="flex h-[13px] w-[13px] shrink-0 items-center justify-center"
            role="checkbox"
            :aria-checked="picked.has(r.id)"
            :aria-label="`Select ${r.title || 'Untitled report'}`"
            @click.stop="toggle(r.id)"
            @dblclick.stop
          >
            <span v-if="picked.size || picked.has(r.id)" class="flex h-[13px] w-[13px] items-center justify-center rounded-[3px]" :class="picked.has(r.id) ? 'bg-accent-600 text-white' : 'bg-surface shadow-[inset_0_0_0_1px_rgb(var(--c-neutral-400))]'"><Icon v-if="picked.has(r.id)" icon="check" :size="10"/></span>
            <template v-else>
              <Icon icon="file-text" :size="13" class="group-hover/r:hidden" :class="r.id === currentId ? 'text-accent-600' : 'text-neutral-400'"/>
              <span class="hidden h-[13px] w-[13px] rounded-[3px] bg-surface shadow-[inset_0_0_0_1px_rgb(var(--c-neutral-400))] group-hover/r:block"></span>
            </template>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] text-neutral-900">{{ r.title || "Untitled report" }}</span>
            <span class="block truncate font-mono text-[10.5px] leading-4 text-neutral-500">{{ meta(r) }}</span>
          </span>
        </button>
        <button
          v-if="renaming !== r.id"
          type="button"
          class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet absolute right-1 top-1.5 h-6 w-6 focus-visible:opacity-100 group-hover/r:opacity-100"
          :class="menu === r.id ? 'opacity-100' : r.id === currentId ? 'opacity-60' : 'opacity-0'"
          :aria-label="`More for ${r.title}`"
          title="Rename, duplicate, save as template or delete"
          @click.stop="menu = menu === r.id ? null : r.id"
        ><Icon icon="more-horizontal" :size="13"/></button>
        <template v-if="menu === r.id">
          <div class="fixed inset-0 z-40" @click="menu = null"></div>
          <div class="ui-menu absolute right-0 top-8 z-50 w-44 animate-in" role="menu">
            <button type="button" class="ui-menu-item" role="menuitem" @click="menu = null; startRename(r)">Rename</button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menu = null; $emit('duplicate', r.id)">Duplicate</button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="menu = null; $emit('saveTemplate', r.id)">Save as template…</button>
            <div class="my-1 hairline-t"></div>
            <button type="button" class="ui-menu-item text-red-700" role="menuitem" @click="menu = null; confirming = r.id">Delete…</button>
          </div>
        </template>
        <div v-if="confirming === r.id" class="mx-1 mb-1 rounded bg-neutral-100 px-2 py-1.5">
          <p class="text-xs leading-4 text-neutral-800">Delete this report? The pins stay in the pool.</p>
          <div class="mt-1.5 flex gap-2">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="confirming = null; $emit('remove', r.id)">Delete</button>
            <button type="button" class="ui-btn ui-btn-sm" @click="confirming = null">Keep</button>
          </div>
        </div>
      </li>
      <li v-if="!reports.length" class="px-2 py-2 text-xs leading-5 text-neutral-500">No reports yet. Start one from a template or a blank page.</li>
    </ul>

    <!-- Several reports picked: what can be done with them together. -->
    <div v-if="picked.size" class="mx-1.5 mb-2 shrink-0 rounded-md bg-surface px-2.5 py-2 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))]" role="region" aria-label="Selected reports">
      <template v-if="asking === 'delete'">
        <p class="text-xs leading-4 text-neutral-800">Delete {{ picked.size }} {{ picked.size === 1 ? "report" : "reports" }}? The pins stay in the pool. This cannot be undone.</p>
        <div class="mt-2 flex gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" @click="removePicked">Delete {{ picked.size }}</button>
          <button type="button" class="ui-btn ui-btn-sm" @click="asking = null">Keep</button>
        </div>
      </template>
      <template v-else-if="asking === 'merge'">
        <p class="text-xs leading-4 text-neutral-800">One new report from these {{ picked.size }}, in the order of the list, each under its title.</p>
        <input v-model="mergeTitle" class="ui-input ui-input-sm mt-2 w-full" aria-label="Title of the merged report" @keydown.enter.prevent="mergePicked(false)">
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" @click="mergePicked(false)">Merge</button>
          <button type="button" class="ui-btn ui-btn-sm" title="Merge, then delete the reports it was made from" @click="mergePicked(true)">Merge and delete the {{ picked.size }}</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="asking = null">Cancel</button>
        </div>
      </template>
      <template v-else>
        <div class="flex items-center gap-1.5">
          <span class="flex-1 text-xs font-medium text-neutral-800">{{ picked.size }} selected</span>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Clear the selection" title="Clear the selection (Esc)" @click="clearPicked"><Icon icon="x" :size="12"/></button>
        </div>
        <div class="mt-1.5 flex gap-1.5">
          <button type="button" class="ui-btn ui-btn-sm flex-1" :disabled="picked.size < 2" :title="picked.size < 2 ? 'Select at least two reports to merge' : 'Merge them into one new report'" @click="askMerge"><Icon icon="merge" :size="12" class="text-neutral-500"/><span>Merge</span></button>
          <button type="button" class="ui-btn ui-btn-sm flex-1" @click="asking = 'delete'"><Icon icon="trash" :size="12" class="text-neutral-500"/><span>Delete</span></button>
        </div>
        <button type="button" class="mt-1.5 text-[11px] text-neutral-500 hover:text-neutral-800" @click="pickAll">Select all {{ reports.length }}</button>
      </template>
    </div>

    <div class="flex min-h-0 flex-1 flex-col hairline-t">
      <h2 class="ui-label px-3 pb-1 pt-3">Outline</h2>
      <ol class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <li v-for="o in outline" :key="o.id">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left transition-colors hover:bg-neutral-200/60"
            :class="o.id === selectedId ? 'text-neutral-950' : 'text-neutral-600'"
            :style="{ paddingLeft: `${8 + o.indent * 12}px` }"
            @click="$emit('jump', o.id)"
          >
            <Icon v-if="o.icon" :icon="o.icon" :size="12" class="shrink-0 text-neutral-400"/>
            <span class="truncate" :class="o.heading ? 'text-[12.5px] font-medium' : 'text-[12px]'">{{ o.label }}</span>
            <span v-if="o.stale" class="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" title="Ran on an older snapshot"></span>
          </button>
        </li>
        <li v-if="!outline.length" class="px-2 py-1 text-xs text-neutral-500">Headings and evidence appear here.</li>
      </ol>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import type { ReportRecord } from "~/features/reports/reports.store";
import { relativeAge } from "~/shared/time";

export interface OutlineItem { id: string; label: string; indent: number; heading: boolean; icon?: string; stale?: boolean }

const props = defineProps<{
  reports: ReportRecord[]
  currentId: string | null
  outline: OutlineItem[]
  selectedId: string | null
  counts: Record<string, number>
}>();
const emit = defineEmits<{
  (e: "open", id: string): void
  (e: "create"): void
  (e: "rename", id: string, title: string): void
  (e: "duplicate", id: string): void
  (e: "saveTemplate", id: string): void
  (e: "remove", id: string): void
  (e: "removeMany", ids: string[]): void
  (e: "merge", ids: string[], title: string, removeOriginals: boolean): void
  (e: "reorder", ids: string[]): void
  (e: "jump", id: string): void
}>();

const menu = ref<string | null>(null);
const confirming = ref<string | null>(null);
const renaming = ref<string | null>(null);
const draft = ref("");
const renameEl = ref<HTMLInputElement[] | null>(null);
const dragFrom = ref<string | null>(null);

// ── Picking several ─────────────────────────────────────────────────────
const picked = ref(new Set<string>());
const lastPicked = ref<string | null>(null);
const asking = ref<"delete" | "merge" | null>(null);
const mergeTitle = ref("");
function toggle(id: string) {
  const next = new Set(picked.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  picked.value = next;
  lastPicked.value = id;
  asking.value = null;
}
function onClick(e: MouseEvent, id: string) {
  if (e.metaKey || e.ctrlKey) { toggle(id); return; }
  if (e.shiftKey) {
    const ids = props.reports.map(r => r.id);
    const from = lastPicked.value ?? props.currentId ?? id;
    const [a, b] = [ids.indexOf(from), ids.indexOf(id)].sort((x, y) => x - y);
    picked.value = new Set(ids.slice(Math.max(0, a), b + 1));
    asking.value = null;
    return;
  }
  clearPicked();
  emit("open", id);
}
function clearPicked() { picked.value = new Set(); asking.value = null; lastPicked.value = null; }
function pickAll() { picked.value = new Set(props.reports.map(r => r.id)); asking.value = null; }
/** The picked reports, in the list's order. */
const pickedInOrder = () => props.reports.filter(r => picked.value.has(r.id));
function askMerge() {
  const first = pickedInOrder()[0];
  mergeTitle.value = `${first?.title || "Untitled report"} and ${picked.value.size - 1} more`;
  asking.value = "merge";
}
function mergePicked(removeOriginals: boolean) {
  emit("merge", pickedInOrder().map(r => r.id), mergeTitle.value, removeOriginals);
  clearPicked();
}
function removePicked() {
  emit("removeMany", pickedInOrder().map(r => r.id));
  clearPicked();
}
// Reports that went away leave the selection.
watch(() => props.reports.map(r => r.id).join(), () => {
  const ids = new Set(props.reports.map(r => r.id));
  if ([...picked.value].some(id => !ids.has(id))) picked.value = new Set([...picked.value].filter(id => ids.has(id)));
});
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && picked.value.size && !(e.target as HTMLElement)?.closest?.("input, textarea")) clearPicked();
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

const meta = (r: ReportRecord) => {
  const n = props.counts[r.id] ?? 0;
  return `${n} ${n === 1 ? "cell" : "cells"} · ${relativeAge(r.updatedAt, new Date())}`;
};
function startRename(r: ReportRecord) {
  renaming.value = r.id;
  draft.value = r.title;
  void nextTick(() => { const el = renameEl.value?.[0]; el?.focus(); el?.select(); });
}
function finishRename(id: string) {
  if (renaming.value !== id) return;
  renaming.value = null;
  emit("rename", id, draft.value);
}
function drop(target: string) {
  const from = dragFrom.value;
  dragFrom.value = null;
  if (!from || from === target) return;
  const ids = props.reports.map(r => r.id).filter(id => id !== from);
  ids.splice(ids.indexOf(target), 0, from);
  emit("reorder", ids);
}
</script>
